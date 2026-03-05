import { scrapeComparableSales, acceptDisclaimer, scrapeSearchResults } from '../../scraper/scrape.mjs';

export async function onRequest(context) {
  try {
    await acceptDisclaimer();
    const search = await scrapeSearchResults('00308309');
    const res = await scrapeComparableSales('00308309');
    return new Response(JSON.stringify({
      searchResultLength: search.length,
      compsResult: res || { null_response: true }
    }), { headers: { 'Content-Type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { headers: { 'Content-Type': 'application/json' }});
  }
}