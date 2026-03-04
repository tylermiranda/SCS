import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
});
const page = await ctx.newPage();

// Accept disclaimer 
await page.goto('https://ssc.sedgwickcounty.org/propertytax/', { waitUntil: 'networkidle', timeout: 30000 });
const btn = await page.$('#mainContentPlaceHolder_acceptButton');
if (btn) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), btn.click()]);
  console.log('Disclaimer accepted');
}

// Go to appraisal values page
await page.goto('https://ssc.sedgwickcounty.org/propertytax/realpropertyvalues.aspx?pin=00308309', {
  waitUntil: 'networkidle',
  timeout: 30000,
});

const result = await page.evaluate(() => {
  const tables = document.querySelectorAll('table.table-striped');
  const output = [];
  
  tables.forEach((table, tIdx) => {
    const tableInfo = {
      index: tIdx,
      rowCount: 0,
      rows: [],
    };
    
    // Check all rows directly - don't restrict to tbody
    const allRows = table.querySelectorAll('tr');
    tableInfo.rowCount = allRows.length;
    
    allRows.forEach((row, rIdx) => {
      if (rIdx > 2) return; // Only first 3 rows for debug
      const cells = row.querySelectorAll('td, th');
      const rowInfo = {
        rowIdx: rIdx,
        cellCount: cells.length,
        cells: [],
      };
      
      cells.forEach((cell, cIdx) => {
        rowInfo.cells.push({
          tag: cell.tagName,
          text: cell.textContent.trim().substring(0, 100),
          hasNestedTable: !!cell.querySelector('table'),
          nestedTableRows: cell.querySelector('table')?.querySelectorAll('tr')?.length || 0,
        });
      });
      
      tableInfo.rows.push(rowInfo);
    });
    
    output.push(tableInfo);
  });
  
  return output;
});

console.log(JSON.stringify(result, null, 2));

await browser.close();
