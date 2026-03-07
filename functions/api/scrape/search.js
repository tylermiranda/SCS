import { scrapeSearchResults, acceptDisclaimer } from '../../../scraper/scrape.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  
  if (!address) {
    return new Response(JSON.stringify({ error: 'Address is required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (address.includes('-')) {
    return new Response(JSON.stringify({ error: 'Range addresses are not supported.' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await acceptDisclaimer();
    const properties = await scrapeSearchResults(address);
    
    if (!properties || properties.length === 0) {
      try {
        await env.DB.prepare('INSERT INTO logs (action, query, error) VALUES (?, ?, ?)')
          .bind('Search API - No Results', address, 'No properties found for this address.')
          .run();
      } catch (logErr) {
        console.error('Failed to write log to D1', logErr);
      }
    }

    return new Response(JSON.stringify({ properties }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    try {
      await env.DB.prepare('INSERT INTO logs (action, query, error) VALUES (?, ?, ?)')
        .bind('Search API Failed', address, error.message || String(error))
        .run();
    } catch (logErr) {
      console.error('Failed to write log to D1', logErr);
    }

    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
