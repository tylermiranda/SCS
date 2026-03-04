import { scrapeSearchResults, acceptDisclaimer } from '../../../scraper/scrape.mjs';

export async function onRequest(context) {
  const { request } = context;
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
    return new Response(JSON.stringify({ properties }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
