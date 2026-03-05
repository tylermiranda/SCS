# Sedgwick County Tax Scraper (SCS)

A web scraping and visualization tool designed to collect property tax appraisal data from the Sedgwick County website and display it in an interactive dashboard. By default, it targets the Cedar Brook neighborhood.

## Features

- **Data Scraper:** An efficient Node.js script utilizing `cheerio` and `node-fetch` to extract property details and historical appraisal/assessment data from the county website.
- **Interactive Dashboard:** A fast, vanilla HTML/CSS/JS frontend bundled with Vite. It features summary statistics, trend charts (Chart.js), and a searchable, sortable data table.
- **Serverless Backend:** Powered by Cloudflare Pages Functions and Cloudflare KV storage.
- **Live Ad-hoc Search:** Real-time live-search capabilities implemented using Server-Sent Events (SSE) to look up specific properties on demand.
- **Secure:** Project is configured for Cloudflare Zero Trust authentication.

## Tech Stack

- **Frontend:** Vanilla JavaScript, HTML, CSS, Chart.js, Vite
- **Backend:** Cloudflare Pages Functions, Cloudflare KV
- **Scraper:** Node.js, `cheerio`, `node-fetch`

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended, as specified in `.node-version`)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/tylermiranda/SCS.git
   cd SCS
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

To start the local development environment (runs both the Vite server and Cloudflare Wrangler concurrently):
```bash
npm run dev
```

To run the local scraper manually:
```bash
npm run scrape
```

### Build & Deploy

The project is configured for automatic Git-based deployments via Cloudflare Pages.

To build the project locally:
```bash
npm run build
```
This command compiles the frontend assets into the `dist/` directory.

## Repository Structure

- `scraper/`: Standalone Node.js scripts for fetching and parsing property data.
- `dashboard/`: Frontend source files, including `index.html`, styles, and client-side logic.
- `functions/`: Cloudflare Pages API routes, including data retrieval and live scraping (SSE).
- `dist/`: Generated output directory containing the production build.

## Data Source

All data presented in this project is sourced from public records provided by Sedgwick County.
