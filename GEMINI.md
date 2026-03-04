# Sedgwick County Tax Scraper

## Project Overview

This project is a web scraping and visualization tool designed to collect property tax appraisal data from the Sedgwick County website and display it in an interactive dashboard. The scraper specifically targets the Cedar Brook neighborhood by default but can be configured. 

The project consists of two main components:
1.  **Scraper (`scraper/scrape.mjs`)**: A Node.js script using Playwright to navigate the county website, extract property details, and download historical appraisal and assessment data. The scraped data is saved as a JSON file (`data.json`) in the dashboard's public directory.
2.  **Dashboard (`dashboard/`)**: A frontend web application built with vanilla HTML/CSS/JavaScript and bundled with Vite. It consumes the `data.json` file and provides a user interface with summary statistics, trend charts (using Chart.js), and a searchable, sortable data table.

## Technologies Used

*   **Node.js**: The runtime environment.
*   **Playwright**: Used for headless browser automation to scrape data from the county's ASP.NET web application.
*   **Vite**: The frontend build tool and development server.
*   **Chart.js**: (Inferred from frontend code) Used for rendering data visualizations in the dashboard.
*   **Vanilla JS/CSS**: Frontend logic and styling.

## Building and Running

### Prerequisites
*   Node.js (Ensure you have a recent version installed)
*   NPM (Node Package Manager)

### Commands

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run the Scraper:**
    This command executes the Playwright script to fetch the latest data from the county website. It will output the results to `dashboard/public/data.json`.
    ```bash
    npm run scrape
    ```

3.  **Start the Dashboard (Development Mode):**
    This starts a local Vite development server.
    ```bash
    npm run dev
    ```

4.  **Build the Dashboard (Production):**
    This compiles the frontend assets into the `dist` directory.
    ```bash
    npm run build
    ```

5.  **Preview the Production Build:**
    ```bash
    npm run preview
    ```

## Architecture & Directory Structure

*   `package.json` / `package-lock.json`: Node.js dependencies and project scripts.
*   `vite.config.js`: Configuration for the Vite build tool. Sets the root directory to `./dashboard` and the output directory to `../dist`.
*   `scraper/`:
    *   `scrape.mjs`: The main Playwright scraping script. It handles searching, pagination, extracting property data, parsing tables, and handling the site's disclaimer redirect.
*   `dashboard/`:
    *   `index.html`: The main HTML structure for the dashboard.
    *   `public/`: Static assets. `data.json` is generated here by the scraper.
    *   `src/`:
        *   `main.js`: Frontend logic for fetching data, rendering charts, populating tables, and handling UI interactions (modals, sorting, filtering).
        *   `style.css`: Styling for the dashboard.

## Development Conventions

*   **ES Modules**: The project uses ECMAScript modules (`type: "module"` in `package.json`), allowing the use of `import` and `export` statements in Node.js scripts.
*   **Vanilla Frontend**: The dashboard relies on vanilla DOM manipulation rather than a framework like React or Vue, keeping the dependencies light.
*   **Data Flow**: The scraper acts as a cron job/ETL process that drops a static JSON payload, which the frontend then consumes statically. There is no active backend API server besides the static file hosting provided by Vite.
