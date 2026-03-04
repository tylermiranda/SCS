import { acceptDisclaimer, scrapePropertyValues, scrapeComparableSales, scrapeTaxBill } from '../../../scraper/scrape.mjs';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pin = url.searchParams.get('pin');
  const address = url.searchParams.get('address');
  const owner = url.searchParams.get('owner');

  if (!pin) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'PIN is required' })}

`));
        controller.close();
      }
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }

  let { readable, writable } = new TransformStream();
  let writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process the request asynchronously while returning the stream
  context.waitUntil((async () => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ status: 'Accepting disclaimer...' })}

`));
      await acceptDisclaimer();
      
      await writer.write(encoder.encode(`data: ${JSON.stringify({ status: `Fetching details for ${address}...` })}

`));
      const values = await scrapePropertyValues(pin);

      await writer.write(encoder.encode(`data: ${JSON.stringify({ status: `Fetching comparable sales for ${address}...` })}

`));
      const comparableSales = await scrapeComparableSales(pin);

      await writer.write(encoder.encode(`data: ${JSON.stringify({ status: `Fetching tax records for ${address}...` })}

`));
      const taxBill = await scrapeTaxBill(pin);

      const property = {
        pin,
        address,
        owner,
        appraisals: values.appraisals,
        assessments: values.assessments,
        taxBill,
        comparableSales
      };
      
      // Save to KV
      try {
        let dataStr = await env.SCS_DATA.get('data.json');
        let data = { properties: [] };
        if (dataStr) {
          data = JSON.parse(dataStr);
        }
        
        const existingIndex = data.properties.findIndex(p => p.pin === pin);
        if (existingIndex !== -1) {
          data.properties[existingIndex] = property;
        } else {
          data.properties.push(property);
        }
        data.totalProperties = data.properties.length;
        
        await env.SCS_DATA.put('data.json', JSON.stringify(data));
      } catch (saveError) {
        console.error('Error saving to KV:', saveError);
      }

      await writer.write(encoder.encode(`data: ${JSON.stringify({ complete: true, property })}

`));
    } catch (error) {
      try {
        let logsStr = await env.SCS_DATA.get('logs.json');
        let logs = logsStr ? JSON.parse(logsStr) : [];
        logs.push({
          timestamp: new Date().toISOString(),
          action: 'Stream API Failed',
          query: `PIN: ${pin}, Address: ${address}`,
          error: error.message || String(error)
        });
        if (logs.length > 500) logs = logs.slice(-500);
        await env.SCS_DATA.put('logs.json', JSON.stringify(logs));
      } catch (logErr) {
        console.error('Failed to write log to KV', logErr);
      }

      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
