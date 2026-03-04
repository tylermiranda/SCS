import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeQuery } from './scrape.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEARCH_QUERY = '800-1100 N Cedar Brook';

console.log('=== Sedgwick County Tax Appraisal Scraper (HTTP) ===
');
console.log(`Searching for: "${DEFAULT_SEARCH_QUERY}"
`);

try {
  const results = await scrapeQuery(DEFAULT_SEARCH_QUERY, (msg) => console.log(`  ${msg}`));

  const output = {
    scrapedAt: new Date().toISOString(),
    neighborhood: 'Cedar Brook, Mulvane KS',
    searchQuery: DEFAULT_SEARCH_QUERY,
    totalProperties: results.length,
    properties: results,
  };

  const outDir = join(__dirname, '..', 'dashboard', 'public');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'data.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`
Done! Data written to ${outPath}`);
  console.log(`Total properties: ${results.length}`);

  const withErrors = results.filter(r => r.error);
  if (withErrors.length > 0) {
    console.log(`Properties with errors: ${withErrors.length}`);
  }
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}
