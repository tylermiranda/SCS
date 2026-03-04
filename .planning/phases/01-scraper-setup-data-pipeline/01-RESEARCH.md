# Phase 1: Scraper Setup & Data Pipeline - Research

**Researched:** 2026-03-03
**Domain:** Node.js Web Scraping & Data Pipeline
**Confidence:** HIGH

## Summary

This phase solidifies the existing scraping scripts into a robust, resilient data pipeline. The current prototype (`scraper/scrape.mjs`) successfully authenticates with the ASP.NET site, parses HTML with Cheerio, and extracts PDF data. To meet production requirements, the code must be refactored to support configurable targets, automated retries for network resilience, and incremental JSON updates (appending new data rather than overwriting).

**Primary recommendation:** Use the existing stack (`node-fetch` + `cheerio`) but refactor the monolithic script into modular components with explicit retry logic, configuration files, and atomic JSON file writes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXTR-01 | Resilient HTML Parsing & Navigation | Use Cheerio for parsing; maintain state extraction logic (`__VIEWSTATE`) for ASP.NET navigation. |
| EXTR-02 | Configurable Targeting | Move hardcoded targets (e.g., `DEFAULT_SEARCH_QUERY`) to an external `config.json` or CLI arguments. |
| EXTR-03 | Error Handling & Retries | Implement a wrapper around `fetch` with exponential backoff for network timeouts. |
| PROC-01 | Incremental Data Updates | Read existing `data.json`, merge new scraped records (keyed by `pin`), and save. |
| PROC-02 | Data Normalization | Standardize currency values, address strings, and date formats before storage. |
| PROC-03 | Static JSON Export | Serialize data reliably using atomic file writes to prevent data corruption. |
| AUTO-02 | Clear CLI Output | Implement structured console logging with progress indicators. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | v18+ | Runtime environment | Standard for JS tooling; excellent native fetch/fs support |
| cheerio | ^1.2.0 | HTML parsing | Fast, jQuery-like API; industry standard for server-side DOM |
| node-fetch | ^3.3.2 | HTTP client | Reliable fetch API polyfill/wrapper with manual redirect support |
| pdf-parse | ^1.1.4 | PDF text extraction | Proven library for raw text extraction from PDF streams |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| p-retry (optional) | ^6.2.0 | Request retries | Use if hand-rolled retry logic becomes too complex |
| picocolors (optional) | ^1.0.0 | CLI colors | For `AUTO-02` to make CLI output readable and clear |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node-fetch` | `axios` + `axios-retry` | `axios` has built-in retry plugins, but `fetch` is already in the codebase and closer to the web standard. |
| `cheerio` | `puppeteer` / `playwright` | Headless browsers are much heavier, slower, and overkill since the site doesn't require JS execution. |

**Installation:**
```bash
# Core dependencies already installed. For tests:
npm install -D vitest
```

## Architecture Patterns

### Recommended Project Structure
```
scraper/
├── index.mjs           # CLI entry point, orchestrates the flow
├── config.mjs          # Configuration loading (EXTR-02)
├── http.mjs            # Fetch wrapper with retries & cookies (EXTR-01, EXTR-03)
├── parsers/            # Cheerio HTML & PDF parsing functions (PROC-02)
│   ├── property.mjs    # Normalizes property details
│   └── tax.mjs         # Normalizes tax/appraisal records
└── storage.mjs         # Incremental JSON merge and atomic write (PROC-01, PROC-03)
```

### Pattern 1: Incremental JSON Updates
**What:** Reading existing state, merging new records, and saving safely.
**When to use:** When fulfilling `PROC-01` to ensure historical data isn't lost.
**Example:**
```javascript
import fs from 'fs/promises';

export async function saveIncremental(filepath, newRecords) {
  let existingData = { properties: [] };
  try {
    const raw = await fs.readFile(filepath, 'utf8');
    existingData = JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  // Merge logic (keyed by unique ID, e.g., PIN)
  const dataMap = new Map(existingData.properties.map(p => [p.pin, p]));
  for (const record of newRecords) {
    dataMap.set(record.pin, { ...dataMap.get(record.pin), ...record });
  }

  existingData.properties = Array.from(dataMap.values());
  existingData.lastUpdated = new Date().toISOString();

  // Atomic write
  const tempFile = `${filepath}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(existingData, null, 2));
  await fs.rename(tempFile, filepath);
}
```

### Anti-Patterns to Avoid
- **In-place file overwriting:** Never use `writeFileSync` directly over the target JSON file without a `.tmp` file swap, as a crash midway will corrupt the entire dataset.
- **Regex on HTML:** Do not parse ASP.NET form variables (`__VIEWSTATE`) using regular expressions; always use `cheerio`.
- **Failing fast on single property:** Do not crash the entire scraping run if one property fails to load (`EXTR-03`). Log the error and continue to the next item.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML Parsing | Regex matchers | `cheerio` | HTML is irregular; regex will break on minor layout changes. |
| PDF Parsing | Custom binary decoders | `pdf-parse` | PDFs are complex binary formats; existing libraries handle the nuances of text streams. |

**Key insight:** The ASP.NET WebForms architecture relies heavily on hidden fields (`__VIEWSTATE`, `__EVENTVALIDATION`). These must be captured explicitly from every response and passed to subsequent requests.

## Common Pitfalls

### Pitfall 1: ASP.NET Session State Loss
**What goes wrong:** The scraper gets a 302 redirect or 500 error when trying to fetch property details.
**Why it happens:** ASP.NET requires the exact `__VIEWSTATE` and session cookies from the *immediately preceding* response.
**How to avoid:** Maintain a robust cookie jar and ensure the disclaimer is accepted properly before initiating any deep-link navigation.

### Pitfall 2: County Server Rate Limiting
**What goes wrong:** Connections timeout or return `ECONNRESET`.
**Why it happens:** Local government servers often struggle with concurrent requests or throttle aggressive scrapers.
**How to avoid:** Implement sequential processing (no `Promise.all` for bulk fetching), a polite delay between requests (e.g., 400-1000ms), and an exponential backoff retry mechanism.

### Pitfall 3: Data Corruption Mid-Write
**What goes wrong:** The `data.json` file ends up empty or partially written.
**Why it happens:** The script crashes or the process is killed while `fs.writeFileSync` is executing.
**How to avoid:** Write to a `.tmp` file first, then use `fs.renameSync` (which is atomic on POSIX systems).

## Code Examples

### HTTP Client with Automatic Retries
```javascript
export async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      const delay = Math.pow(2, i) * 1000;
      console.warn(`[WARN] Fetch failed for ${url}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.js` |
| Quick run command | `npm run test` |
| Full suite command | `npx vitest run` |
| Estimated runtime | ~5 seconds |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXTR-01 | Parse ASP.NET form fields correctly | unit | `npx vitest run test/parse.test.js` | ❌ Wave 0 gap |
| EXTR-03 | Retry failed network requests | unit | `npx vitest run test/http.test.js` | ❌ Wave 0 gap |
| PROC-01 | Merge new JSON into existing state | unit | `npx vitest run test/storage.test.js` | ❌ Wave 0 gap |
| PROC-02 | Normalize currency & date strings | unit | `npx vitest run test/normalize.test.js`| ❌ Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `npx vitest run`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before `/gsd:verify-work` runs
- **Estimated feedback latency per task:** ~2 seconds

### Wave 0 Gaps (must be created before implementation)
- [ ] `test/parse.test.js` — covers EXTR-01 & PROC-02
- [ ] `test/storage.test.js` — covers PROC-01 & PROC-03
- [ ] `test/http.test.js` — covers EXTR-03
- [ ] Framework install: `npm install -D vitest` and update `package.json` scripts.

## Sources

### Primary (HIGH confidence)
- Existing workspace source code (`scraper/scrape.mjs`, `package.json`) - confirms current baseline, libraries, and node-fetch strategy.
- Node.js Documentation (`fs/promises`) - for atomic file write patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries are already in the project and represent standard Node.js practices.
- Architecture: HIGH - Modularizing monolithic scripts is standard for long-term maintainability.
- Pitfalls: HIGH - ASP.NET idiosyncrasies and atomic writes are well-understood domains.

**Research date:** 2026-03-03
**Valid until:** 2026-04-03
