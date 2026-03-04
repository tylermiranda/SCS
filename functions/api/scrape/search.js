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
        let logsStr = await env.SCS_DATA.get('logs.json');
        let logs = logsStr ? JSON.parse(logsStr) : [];
        logs.push({
          timestamp: new Date().toISOString(),
          action: 'Search API - No Results',
          query: address,
          error: 'No properties found for this address.'
        });
        if (logs.length > 500) logs = logs.slice(-500);
        await env.SCS_DATA.put('logs.json', JSON.stringify(logs));
      } catch (logErr) {
        console.error('Failed to write log to KV', logErr);
      }
    }

    return new Response(JSON.stringify({ properties }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    try {
      let logsStr = await env.SCS_DATA.get('logs.json');
      let logs = logsStr ? JSON.parse(logsStr) : [];
      logs.push({
        timestamp: new Date().toISOString(),
        action: 'Search API Failed',
        query: address,
        error: error.message || String(error)
      });
      if (logs.length > 500) logs = logs.slice(-500);
      await env.SCS_DATA.put('logs.json', JSON.stringify(logs));
    } catch (logErr) {
      console.error('Failed to write log to KV', logErr);
    }

    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
