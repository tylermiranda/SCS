# Feature Landscape

**Domain:** Web Scraping and Visualization Tool (Sedgwick County Property Taxes)
**Researched:** 2024-05-24

## Data Extraction (Scraping)
**Table stakes:** (users will think it's broken without these)
- Resilient HTML Parsing & Navigation - Target sites (especially ASP.NET) often change layouts; failing gracefully on single properties instead of crashing the entire run is required.
- Configurable Targeting - Hardcoding specific parcel IDs or neighborhood boundaries limits usability; users expect to be able to modify target properties easily.
- Error Handling & Retries - The scraper must handle network timeouts, site maintenance, or transient failures automatically.

**Differentiators:** (nice-to-haves, often v2+)
- Visual Selector Configuration - Allowing users to click elements to build extraction logic rather than writing XPath/CSS selectors.
- Proxy Rotation / Rate Limiting - Essential if scaling up beyond a small neighborhood to avoid IP bans from Sedgwick County.
- Headless vs. Headed Toggle - A configuration switch to show the browser for easier visual debugging when scraping fails.

## Data Processing & Storage
**Table stakes:** (users will think it's broken without these)
- Incremental Data Updates - Scraper must append new records (e.g., the current tax year) without overwriting or destroying historical data necessary for trends.
- Data Normalization - Scraping raw text means standardizing inconsistent formats (stripping '$', ',' from currency, fixing dates) before writing to JSON.
- Static JSON Export - Essential for the decoupled architecture; data must be cleanly serialized to a file the dashboard can ingest without a live backend.

**Differentiators:** (nice-to-haves, often v2+)
- Automated Data Backups - Creating a timestamped copy of the JSON payload before each scrape run to prevent accidental data loss.
- SQLite Export Option - Providing the data in a relational format for users who want to query the dataset beyond what the dashboard offers.
- Schema Validation - Warning the user if scraped data doesn't match expected types before overwriting the production data file.

## Data Visualization (Dashboard)
**Table stakes:** (users will think it's broken without these)
- Time-series Trend Charts - Line or bar charts showing historical tax and appraisal values over time are the core value proposition.
- Aggregate KPI Cards - High-level summary metrics (e.g., "Average Tax Increase", "Total Assessed Value") at the top of the dashboard.
- Responsive Data Table - A clean grid view of the raw data, as users will inevitably want to verify the numbers behind the charts.

**Differentiators:** (nice-to-haves, often v2+)
- Geospatial Mapping (Choropleth/Pins) - Visualizing property values geographically adds spatial context to tax assessments.
- Export to CSV/Excel - Allowing users to download the filtered dataset directly from the dashboard for custom spreadsheet analysis.

## User Interaction & Exploration
**Table stakes:** (users will think it's broken without these)
- Multi-column Sorting - Clicking table headers to sort by address, highest tax, or percentage increase is required for basic data discovery.
- Global Text Search & Filtering - A search bar to quickly find a specific address or property owner within the dataset.

**Differentiators:** (nice-to-haves, often v2+)
- Property Comparison View - Selecting two or more specific properties to plot their tax trends side-by-side on the same chart.
- Deep Linking (URL State) - Storing filter, search, and chart parameters in the URL so users can bookmark or share specific views.

## Automation & Operational
**Table stakes:** (users will think it's broken without these)
- Scheduled Execution (Cron) - A reliable mechanism to run the scraper periodically (e.g., weekly or monthly) to ensure the dashboard data isn't stale.
- Clear CLI Output - Console logging that clearly indicates scraping progress, success, or the exact point of failure for operational transparency.

**Differentiators:** (nice-to-haves, often v2+)
- CI/CD Automated Scraping (GitHub Actions) - Running the scraping cron job in the cloud for free, automatically updating the JSON data and deploying the static dashboard.
- Dockerization - Bundling the scraper, cron scheduler, and static web server into a single container for effortless local self-hosting.