/**
 * Supplier Database Enrichment Example
 *
 * Simplified, synthetic Google Apps Script example inspired by the
 * supplier-data workflow I built during my internship.
 *
 * This is NOT Tricolage production code. It contains no company data,
 * credentials, internal prompts, or proprietary business logic.
 *
 * Example sheet columns:
 * Supplier Name | Category | Location | Description | Website |
 * Pricing Type | Price JPY | Status | Last Checked
 */

const CONFIG = {
  SUPPLIER_SHEET: "Supplier Database",
  LOG_SHEET: "Enrichment Log",
  MAX_ROWS_PER_RUN: 5,

  FILLABLE_FIELDS: [
    "Location",
    "Description",
    "Website",
    "Pricing Type"
  ]
};


/**
 * Scan the supplier sheet for incomplete records and process a small
 * batch at a time.
 */
function enrichMissingSupplierData() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(CONFIG.SUPPLIER_SHEET);

  if (!sheet) {
    throw new Error(`Missing sheet: ${CONFIG.SUPPLIER_SHEET}`);
  }

  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return;
  }

  const headers = data[0];
  const headerMap = buildHeaderMap_(headers);

  validateRequiredHeaders_(headerMap, [
    "Supplier Name",
    "Category",
    "Location",
    "Description",
    "Website",
    "Pricing Type",
    "Status",
    "Last Checked"
  ]);

  let processed = 0;

  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    if (processed >= CONFIG.MAX_ROWS_PER_RUN) {
      break;
    }

    const row = data[rowIndex];
    const supplier = rowToObject_(headers, row);

    if (!supplier["Supplier Name"]) {
      continue;
    }

    const missingFields = CONFIG.FILLABLE_FIELDS.filter(field => {
      return isBlank_(supplier[field]);
    });

    if (missingFields.length === 0) {
      continue;
    }

    try {
      const enriched = findMissingSupplierInfo_(supplier, missingFields);

      // Only write into cells that were empty before enrichment.
      missingFields.forEach(field => {
        const value = enriched[field];

        if (!isBlank_(value)) {
          const column = headerMap[field] + 1;
          sheet.getRange(rowIndex + 1, column).setValue(value);
        }
      });

      sheet
        .getRange(rowIndex + 1, headerMap["Status"] + 1)
        .setValue("Needs Review");

      sheet
        .getRange(rowIndex + 1, headerMap["Last Checked"] + 1)
        .setValue(new Date());

      logUpdate_(
        spreadsheet,
        supplier["Supplier Name"],
        missingFields.join(", "),
        "Completed"
      );

    } catch (error) {
      sheet
        .getRange(rowIndex + 1, headerMap["Status"] + 1)
        .setValue("Enrichment Failed");

      logUpdate_(
        spreadsheet,
        supplier["Supplier Name"],
        missingFields.join(", "),
        `Failed: ${error.message}`
      );
    }

    processed++;
  }
}


/**
 * Build a structured prompt using the information already present
 * in the supplier row.
 */
function findMissingSupplierInfo_(supplier, missingFields) {
  const prompt = `
You are helping maintain a structured supplier database for a travel company.

Use the supplier information already provided below as the starting point.
Research publicly available information only when needed to complete the
requested missing fields.

KNOWN SUPPLIER DATA
Supplier Name: ${supplier["Supplier Name"] || "N/A"}
Category: ${supplier["Category"] || "N/A"}
Location: ${supplier["Location"] || "N/A"}
Description: ${supplier["Description"] || "N/A"}
Website: ${supplier["Website"] || "N/A"}
Pricing Type: ${supplier["Pricing Type"] || "N/A"}

FIELDS TO FIND
${missingFields.join(", ")}

RULES
- Do not change information that is already present.
- Do not guess. If a value cannot be verified from public information,
  return "N/A".
- Location should be concise, for example "Shinjuku, Tokyo".
- Description should be 1-2 factual sentences suitable for an internal
  supplier database. Avoid marketing language.
- Website should be the supplier's official website when one can be verified.
- Pricing Type must be one of:
  "Per Person", "Per Group", "Per Night", or "N/A".
- Return only the requested fields.
- Return valid JSON only. Do not include Markdown or explanation.

Example output:
{
  "Location": "Shinjuku, Tokyo",
  "Description": "Small boutique hotel located near Shinjuku Station.",
  "Website": "https://example.com",
  "Pricing Type": "Per Night"
}
`;

  return callGemini_(prompt);
}


/**
 * Example Gemini API integration.
 *
 * No API key is included. In a real Apps Script project the key would
 * be stored in Script Properties rather than hard-coded in the script.
 */
function callGemini_(prompt) {
  const apiKey =
    PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured in Script Properties."
    );
  }

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    "gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],

    // Example grounding configuration for public web research.
    tools: [
      {
        google_search: {}
      }
    ],

    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const responseText = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(`Gemini request failed (${status}): ${responseText}`);
  }

  const result = JSON.parse(responseText);

  if (
    !result.candidates ||
    !result.candidates[0] ||
    !result.candidates[0].content ||
    !result.candidates[0].content.parts
  ) {
    throw new Error("Gemini returned no usable response.");
  }

  const text = result.candidates[0].content.parts
    .map(part => part.text || "")
    .join("")
    .trim();

  return JSON.parse(stripCodeFences_(text));
}


function buildHeaderMap_(headers) {
  const map = {};

  headers.forEach((header, index) => {
    map[String(header).trim()] = index;
  });

  return map;
}


function rowToObject_(headers, row) {
  const object = {};

  headers.forEach((header, index) => {
    object[String(header).trim()] = row[index];
  });

  return object;
}


function validateRequiredHeaders_(headerMap, requiredHeaders) {
  const missing = requiredHeaders.filter(header => {
    return headerMap[header] === undefined;
  });

  if (missing.length > 0) {
    throw new Error(
      "Missing required columns: " + missing.join(", ")
    );
  }
}


function isBlank_(value) {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  );
}


function stripCodeFences_(text) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}


/**
 * Keep a small audit log of completed and failed enrichment attempts.
 */
function logUpdate_(spreadsheet, supplierName, fields, result) {
  let logSheet = spreadsheet.getSheetByName(CONFIG.LOG_SHEET);

  if (!logSheet) {
    logSheet = spreadsheet.insertSheet(CONFIG.LOG_SHEET);
    logSheet.appendRow([
      "Timestamp",
      "Supplier",
      "Fields Requested",
      "Result"
    ]);
  }

  logSheet.appendRow([
    new Date(),
    supplierName,
    fields,
    result
  ]);
}
