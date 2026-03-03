# Project Roadmap

## Phases

- [ ] **Phase 1: Scraper Setup & Data Pipeline** - The system can reliably extract and store clean property data as a static JSON file.
- [ ] **Phase 2: Dashboard Foundation & Visualization** - Users can view their historical tax data in a responsive web dashboard.
- [ ] **Phase 3: Interactivity & Automation** - Users can easily explore the data, and the system stays up-to-date automatically.

## Phase Details

### Phase 1: Scraper Setup & Data Pipeline
**Goal**: The system can reliably extract and store clean property data as a static JSON file.
**Depends on**: None
**Requirements**: EXTR-01, EXTR-02, EXTR-03, PROC-01, PROC-02, PROC-03, AUTO-02
**Success Criteria**:
1. Running the scraper fetches current data from the county website for targeted properties.
2. Scraper gracefully handles network issues or layout changes without crashing the entire run.
3. Extracted data is normalized and appended to a static JSON file without losing previous history.
4. CLI output clearly indicates the progress and status of the scraping run.
**Plans**: TBD

### Phase 2: Dashboard Foundation & Visualization
**Goal**: Users can view their historical tax data in a responsive web dashboard.
**Depends on**: Phase 1
**Requirements**: VISU-01, VISU-02, VISU-03
**Success Criteria**:
1. Opening the dashboard displays time-series charts of historical property values.
2. High-level KPIs (like total current tax or appraisal change) are visible at a glance.
3. Users can view a clean grid/table containing the raw data values that power the charts.
**Plans**: TBD

### Phase 3: Interactivity & Automation
**Goal**: Users can easily explore the data, and the system stays up-to-date automatically.
**Depends on**: Phase 2
**Requirements**: INTR-01, INTR-02, AUTO-01
**Success Criteria**:
1. Users can click table headers to sort the data by different columns.
2. Users can type in a search box to instantly filter the dashboard for specific properties or addresses.
3. The scraper runs automatically on a predefined schedule without manual intervention.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scraper Setup & Data Pipeline | 0/0 | Not started | - |
| 2. Dashboard Foundation & Visualization | 0/0 | Not started | - |
| 3. Interactivity & Automation | 0/0 | Not started | - |