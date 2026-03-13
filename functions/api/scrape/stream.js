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

      await writer.write(encoder.encode(`data: ${JSON.stringify({ status: `Fetching tax records for ${address}...` })}\n\n`));
      const taxBill = await scrapeTaxBill(pin);

      await writer.write(encoder.encode(`data: ${JSON.stringify({ status: `Geocoding address...` })}\n\n`));
      
      // Check if we already have coordinates in DB so we don't overwrite manual/fallback ones
      let existingCoords = null;
      try {
        const existing = await env.DB.prepare('SELECT data FROM properties WHERE pin = ?').bind(pin).first();
        if (existing && existing.data) {
          const parsed = JSON.parse(existing.data);
          if (parsed.coordinates) existingCoords = parsed.coordinates;
        }
      } catch (e) {
        console.warn('Failed to check existing coords', e);
      }

      let coordinates = existingCoords;

      if (!coordinates) {
        try {
          const geoUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address + ', KS')}&benchmark=2020&format=json`;
          const geoRes = await fetch(geoUrl);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.result && geoData.result.addressMatches && geoData.result.addressMatches.length > 0) {
              const coords = geoData.result.addressMatches[0].coordinates;
              const lat = coords.y;
              const lng = coords.x;
              if (lat > 37.4 && lat < 38.0 && lng > -97.9 && lng < -97.1) {
                coordinates = { lat, lng };
              } else {
                console.warn(`Census API returned coordinates outside Sedgwick County: ${lat}, ${lng}`);
              }
            }
          }
        } catch (e) {
          console.warn('US Census Geocoding failed for', address, e);
        }
      }

      // Fallback to OpenStreetMap if Census fails
      if (!coordinates) {
        try {
          // Strip city name from the main address string but keep it for the query
          const parts = address.split(' ');
          let searchAddress = address;
          let city = '';
          if (parts.length > 2 && ['MULVANE', 'WICHITA', 'DERBY', 'HAYSVILLE', 'GODDARD', 'MAIZE', 'ANDALE', 'CHENEY', 'CLEARWATER', 'COLWICH', 'GARDEN', 'PLAIN', 'MOUNT', 'HOPE', 'PARK', 'VALLEY', 'CENTER', 'BEL', 'AIRE'].includes(parts[parts.length - 1].toUpperCase())) {
            city = parts[parts.length - 1];
            searchAddress = parts.slice(0, -1).join(' ');
          }

          const citySuffix = city ? `, ${city}, Sedgwick County, KS` : `, Sedgwick County, KS`;
          let osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress + citySuffix)}`;
          let osmRes = await fetch(osmUrl, {
            headers: { 'User-Agent': 'SedgwickCountyTaxScraper/1.0' }
          });
          
          let osmData = [];
          if (osmRes.ok) {
            const rawData = await osmRes.json();
            // Force filter to Kansas to prevent OSM returning weird matches from other states
            osmData = rawData.filter(d => d.display_name && d.display_name.includes('Kansas'));
          }

          // Secondary Fallback: Strip house number and search just the street and city
          if ((!osmData || osmData.length === 0) && parts.length > 2) {
            // Remove the first part (the house number)
            const streetOnlyParts = searchAddress.split(' ').slice(1);
            const streetOnly = streetOnlyParts.join(' ');
            osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(streetOnly + citySuffix)}`;
            osmRes = await fetch(osmUrl, {
              headers: { 'User-Agent': 'SedgwickCountyTaxScraper/1.0' }
            });
            if (osmRes.ok) {
              const rawData = await osmRes.json();
              osmData = rawData.filter(d => d.display_name && d.display_name.includes('Kansas'));
            }
          }

          if (osmData && osmData.length > 0) {
            const lat = parseFloat(osmData[0].lat);
            const lng = parseFloat(osmData[0].lon);
            if (lat > 37.4 && lat < 38.0 && lng > -97.9 && lng < -97.1) {
              coordinates = { lat, lng };
            } else {
              console.warn(`OSM API returned coordinates outside Sedgwick County: ${lat}, ${lng}`);
            }
          }
        } catch (e) {
          console.warn('OSM Geocoding fallback failed for', address, e);
        }
      }

      const property = {
        pin,
        address,
        owner,
        appraisals: values.appraisals,
        assessments: values.assessments,
        taxBill,
        comparableSales,
        coordinates
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
