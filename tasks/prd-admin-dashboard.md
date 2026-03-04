# PRD: Admin Dashboard & Tools

## Self-Clarification

1. **Problem/Goal:** The user needs visibility into application errors (such as failed ad-hoc property searches) and a way to manually manage the scraped property data stored in Cloudflare KV. They also want to consolidate the current restricted "All Properties" page into a unified admin-only section.
2. **Core Functionality:**
   - Consolidate existing `/properties.html` to an `/admin/properties` route (or an overarching Admin layout).
   - Implement a Log Viewer to capture and display backend scrape failures (e.g., search term used, error message, timestamp).
   - Implement a Database Viewer/Editor to load `data.json` from KV, allow raw or structured editing, and save it back to KV.
3. **Scope/Boundaries:**
   - **Authentication:** Handled externally by Cloudflare Zero Trust Access. We will shift the protection boundary to the `/admin/*` path in Cloudflare, so no new in-app auth logic is needed.
   - **Logs Storage:** Logs will be stored in Cloudflare KV (under a key like `logs.json`) to keep the stack simple and $0/month. We will limit the log array to the last 100-500 entries to prevent memory limits.
   - **DB Editor:** We will use a simple JSON editor component (like `jsoneditor` or a simple `<textarea>`) to allow editing the raw `data.json` state, rather than building a complex relational table editor.
4. **Success Criteria:**
   - The properties page is successfully moved to an admin route.
   - Backend errors in `/api/scrape/search` and `/api/scrape/stream` are successfully written to the KV logs key.
   - The Log Viewer UI displays these errors clearly.
   - The Database Editor UI fetches `data.json`, allows modifications, and saves them back to KV without exceeding Cloudflare worker limits.
5. **Constraints:**
   - Cloudflare Workers have a 10ms CPU limit (free tier). We must ensure parsing and stringifying the JSON arrays (for logs and data) is efficient.

---

## Introduction

Create a unified Admin Dashboard for the Sedgwick County Squeeze application. This dashboard will house the existing scraped properties table, a new system log viewer for tracking failed searches/scrapes, and a database editor for manually correcting or updating the underlying JSON data.

## Goals

- Create a cohesive `/admin` routing structure.
- Provide visibility into user search failures to improve the scraper's robustness over time.
- Provide a manual override mechanism for the database to fix corrupted data or remove test entries.

## Tasks

### T-001: Admin Layout & Routing Migration
**Description:** Move the existing `properties.html` page into an `admin/` folder and create a shared admin navigation layout.
**Acceptance Criteria:**
- [ ] Move `properties.html` to `dashboard/admin/properties.html`.
- [ ] Create `dashboard/admin/index.html` as the admin landing page.
- [ ] Add a sidebar or top navigation linking to "Properties", "Logs", and "Database".
- [ ] Update Vite configuration to output the admin pages correctly.
- [ ] Quality checks pass.
- [ ] Verify in browser.

### T-002: Implement Backend Logging System
**Description:** Update the Cloudflare Pages Functions to catch and log errors to a new KV key (`logs.json`).
**Acceptance Criteria:**
- [ ] Create a utility function `logError(env, contextData)` that reads the current `logs.json` array, appends the new error (with timestamp and search query), limits the array to 500 items, and writes it back to KV.
- [ ] Integrate `logError` into `functions/api/scrape/search.js` catch blocks.
- [ ] Integrate `logError` into `functions/api/scrape/stream.js` catch blocks.
- [ ] Add an endpoint `GET /api/admin/logs` to retrieve the logs.
- [ ] Quality checks pass.

### T-003: Log Viewer UI
**Description:** Build the frontend page to display system logs.
**Acceptance Criteria:**
- [ ] Create `dashboard/admin/logs.html` and corresponding JS.
- [ ] Fetch logs from `GET /api/admin/logs`.
- [ ] Display logs in a readable table or list format (Timestamp, Action/Search Query, Error Message).
- [ ] Add a "Clear Logs" button and `DELETE /api/admin/logs` endpoint to empty the array.
- [ ] Quality checks pass.
- [ ] Verify in browser.

### T-004: Database Editor Backend
**Description:** Create the API endpoints to support retrieving and updating the raw database.
**Acceptance Criteria:**
- [ ] Use existing `GET /api/data-secure` for retrieval (ensure it's moved to `/api/admin/data` for consistency if desired).
- [ ] Create `POST /api/admin/data` endpoint.
- [ ] Endpoint must accept JSON, validate that it contains the `properties` array, and overwrite `data.json` in KV.
- [ ] Quality checks pass.

### T-005: Database Editor UI
**Description:** Build the frontend page to view and edit the raw database.
**Acceptance Criteria:**
- [ ] Create `dashboard/admin/database.html`.
- [ ] Fetch data from the API and display it in a large `<textarea>` or a dedicated JSON editor library (e.g., using a lightweight CDN import).
- [ ] Include a "Save Changes" button that sends the `POST` request.
- [ ] Show success/error toast notifications on save.
- [ ] Quality checks pass.
- [ ] Verify in browser.

## Functional Requirements

- **FR-1:** The system must capture the user's search query and the specific error message when an ad-hoc scrape fails.
- **FR-2:** The log array must strictly limit itself to 500 entries to avoid bloating KV storage and exceeding Worker CPU time during read/write.
- **FR-3:** The database editor must perform basic validation (checking for valid JSON and expected root keys) before saving to prevent destroying the database.

## Non-Goals (Out of Scope)

- No complex relational table editing UI (raw JSON editing is sufficient).
- No new authentication logic in the application code (Cloudflare Access will protect `/admin/*`).
- No long-term historical log storage (rolling 500 limit is fine).

## Technical Considerations

- **KV Consistency:** Cloudflare KV is eventually consistent. Edits to the database or logs might take up to 60 seconds to propagate globally, so the UI should optimistically update or warn the user.
- **Worker CPU Limits:** Parsing a massive JSON file inside the edge worker counts towards the 10ms limit. The `data.json` is currently small, but if it grows to thousands of properties, raw JSON string replacement or D1 migration might be needed.

## Success Metrics

- Admin can successfully see what property addresses are causing the scraper to fail.
- Admin can manually delete a property from the database via the editor UI and see the change reflected on the live site.