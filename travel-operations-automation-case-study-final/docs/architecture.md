# Architecture Notes

This document gives a little more detail on how I approached the system without reproducing the company's internal implementation.

## 1. Supplier data layer

The first step was consolidating supplier information into a consistent structure.

Typical supplier categories included accommodation, experiences, transportation, and agents / partners. Different supplier types required different fields, so the system needed to support both shared fields and category-specific information.

The main goal was to combine this scattered to create one dependable source that the itinerary and quotation workflow could pull from.

## 2. User-facing workflow

Staff worked primarily in Google Sheets, so I kept that as the main interface instead of introducing a completely separate application.

The Sheets workflow included:

- Dynamic dropdowns
- Automatic supplier lookups
- Autofill of descriptions and pricing fields
- Quotation calculations
- Visual QA flags
- Manual overrides where needed

This made adoption far easier because the new workflow was still based around a tool the team already used every day. The team and I decided on this approach rather than a standalone app after I initially presented multiple possible solutions to the company's data problem.

## 3. Automation layer

Google Apps Script (essentially JavaScript packaged into google workspace) handled most of the workflow logic.

Examples included reacting to user edits, updating dependent dropdowns, looking up supplier data, populating itinerary fields, applying pricing rules, running validation checks, and clearing or updating QA flags after review.

## 4. AI-assisted supplier maintenance

The Gemini AI API was used as an assistant for maintaining supplier information rather than as the main source of truth.

The workflow was designed around existing internal data first, public information where appropriate, consistent output formats, staff review, and logging failures instead of hiding them or guessing.

I also used smaller processing queues so updates could be handled in batches and reviewed more easily without overspending token limits.

## 5. Design choices

### Keep manual overrides

Travel pricing and supplier arrangements are not always perfectly standardized and can change often. The system needed to automate without preventing staff from handling exceptions.

### Make errors visible

Missing or inconsistent information was highlighted so staff could review and edit it instead of allowing incomplete records to quietly flow into a quotation or larger database. My solution for this was relatively "low-tech", however it worked well given the smaller team and smaller volume of information. Essentially, errors or missing information put into the sheets database was simply highlighted in red, allowing staff to quickly see and update them.

### Build around the existing workflow

The goal was to make the team's current process faster and more reliable, not force them into a completely new way of working.

### Separate data from presentation

Supplier information was stored separately from the itinerary and quotation views, which made it easier to update records once and reuse them throughout the workflow.
