# Domain Pitfalls

**Domain:** Web Scraping & Data Visualization (Static JSON Architecture)
**Researched:** 2024
**Overall confidence:** HIGH

## Critical Pitfalls

Mistakes that cause rewrites, broken pipelines, or unusable applications.

### Pitfall 1: ASP.NET ViewState & Postback Desync
**What goes wrong:** The scraper gets blocked or receives server errors when trying to navigate to data tables or submit forms.
**Why it happens:** ASP.NET WebForms use hidden fields (`__VIEWSTATE`, `__EVENTVALIDATION`) to maintain strict server-side state. Forging POST requests or skipping navigation steps causes a mismatch, leading the server to reject the request for security reasons.
**Consequences:** "Validation of viewstate MAC failed" errors; unable to bypass search forms; total scraper failure.
**Prevention:** Do not attempt to reverse-engineer API calls or manually construct POST payloads. Use Playwright to genuinely interact with the page (`locator.click()`, `locator.selectOption()`) so the browser handles the hidden ViewState fields naturally.
**Detection:** HTTP 500 errors on form submissions; Playwright trace shows "Invalid postback or callback argument" in the response HTML.
**Phase Mapping:** Phase 1 (Scraper Core Implementation)

### Pitfall 2: Static JSON Payload Bloat
**What goes wrong:** The dashboard becomes progressively slower over time, eventually crashing the browser or causing unacceptable load times.
**Why it happens:** Appending every raw scrape result to a single `data.json` file as an array of deep objects (e.g., `[{"date": "...", "val1": 1, "val2": 2}, ...]`).
**Consequences:** The JSON file grows into the megabytes. Downloading, parsing, and holding this in client-side memory causes severe UI thread blocking.
**Prevention:** 
1. Use columnar JSON structures (`{"dates": [...], "val1": [...], "val2": [...]}`) to reduce key duplication.
2. Pre-process and downsample data during the scrape pipeline (e.g., calculate monthly averages rather than sending thousands of daily points).
3. Ensure Gzip/Brotli compression is enabled on the static file server.
**Detection:** `data.json` file size exceeds 2MB; Chrome DevTools Performance tab shows long "Compile Script" or "Evaluate Script" times during JSON parsing.
**Phase Mapping:** Phase 2 (Data Pipeline & Dashboard Integration)

## Moderate Pitfalls

### Pitfall 3: Chart.js Rendering Jank on Large Datasets
**What goes wrong:** The dashboard freezes when rendering charts with thousands of data points.
**Why it happens:** Chart.js animations, point-drawing, and internal data parsing block the main thread.
**Prevention:**
- Disable animations (`animation: false`).
- Disable individual point rendering on line charts (`elements.point.radius: 0`).
- Pre-sort the data in the JSON payload and instruct Chart.js to skip parsing (`parsing: false, normalized: true`).
- For datasets >5000 points, enable the Chart.js Decimation plugin (LTTB algorithm).
**Phase Mapping:** Phase 3 (Dashboard UI / Visualization)

### Pitfall 4: Flaky Scraping via Brittle Selectors & Hard Sleeps
**What goes wrong:** The scraper works locally but fails intermittently in production or breaks on minor site updates.
**Why it happens:** Using hardcoded waits (`page.waitForTimeout(5000)`) and heavily nested DOM selectors (`div > table > tr:nth-child(3)`). ASP.NET `UpdatePanels` (partial page reloads) often trick scrapers into thinking a page has fully loaded.
**Prevention:** 
- Strictly use Playwright's auto-waiting user-facing locators (`getByRole`, `getByLabel`).
- Never use hard sleeps.
- When triggering an ASP.NET postback, explicitly wait for the specific target data container's state to change, not just `networkidle`.
**Phase Mapping:** Phase 1 (Scraper Core Implementation)

### Pitfall 5: Silent Failures in Cron Execution
**What goes wrong:** The scraper breaks, but the dashboard continues to serve old data, making the system appear functional when it is not.
**Why it happens:** A static architecture serves the last successfully written `data.json` file. If the cron job fails silently, there is no dynamic backend to report the outage to the user.
**Prevention:** 
- Implement a "Last Updated" timestamp in the dashboard UI directly parsed from the JSON.
- The scraper must validate its output against a schema before overwriting `data.json`. If 0 records are found, it should fail loudly (e.g., exit code 1) and trigger an alert, rather than writing an empty file.
**Phase Mapping:** Phase 4 (Deployment & Automation)

## Sources
- HIGH: Playwright Official Documentation (Locators, Auto-waiting)
- HIGH: Chart.js Official Documentation (Performance, Decimation, Data structures)
- MEDIUM: WebSearch on ASP.NET ViewState scraping pitfalls and Playwright best practices
- MEDIUM: WebSearch on Chart.js rendering optimizations for large JSON payloads