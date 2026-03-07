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
      
      // Save to D1
      try {
        await env.DB.prepare('INSERT OR REPLACE INTO properties (pin, address, owner, data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
          .bind(property.pin, property.address, property.owner, JSON.stringify(property))
          .run();
      } catch (saveError) {
        console.error('Error saving to D1:', saveError);
      }

      await writer.write(encoder.encode(`data: ${JSON.stringify({ complete: true, property })}

`));
    } catch (error) {
      try {
        await env.DB.prepare('INSERT INTO logs (action, query, error) VALUES (?, ?, ?)')
          .bind('Stream API Failed', `PIN: ${pin}, Address: ${address}`, error.message || String(error))
          .run();
      } catch (logErr) {
        console.error('Failed to write log to D1', logErr);
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
