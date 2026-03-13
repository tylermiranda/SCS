import fetch from 'node-fetch';

const API_URL = process.argv[2] || 'http://localhost:8788';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfill() {
  console.log(`Fetching properties from ${API_URL}/api/admin/data...`);
  
  const res = await fetch(`${API_URL}/api/admin/data`);
  if (!res.ok) {
    console.error('Failed to fetch properties:', await res.text());
    return;
  }
  
  const data = await res.json();
  const properties = data.properties || [];
  
  console.log(`Total properties found: ${properties.length}`);
  
  const needsGeocode = properties.filter(p => !p.coordinates || !p.coordinates.lat);
  console.log(`Properties needing geocoding: ${needsGeocode.length}`);
  
  if (needsGeocode.length === 0) {
    console.log('All properties are geocoded. Exiting.');
    return;
  }
  
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < needsGeocode.length; i++) {
    const p = needsGeocode[i];
    console.log(`[${i+1}/${needsGeocode.length}] Geocoding ${p.address}...`);
    
    try {
      const geoUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(p.address + ', KS')}&benchmark=2020&format=json`;
      const geoRes = await fetch(geoUrl);
      
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.result && geoData.result.addressMatches && geoData.result.addressMatches.length > 0) {
          const coords = geoData.result.addressMatches[0].coordinates;
          const lat = coords.y;
          const lng = coords.x;
          
          // Sedgwick County bounding box check
          const inSedgwick = lat > 37.4 && lat < 38.0 && lng > -97.9 && lng < -97.1;
          
          if (inSedgwick) {
            p.coordinates = { lat, lng };
            
            // Save back to DB
            const saveRes = await fetch(`${API_URL}/api/admin/data`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ property: p })
            });
            
            if (saveRes.ok) {
              console.log(`  -> Success! [${lat}, ${lng}]`);
              successCount++;
            } else {
              console.error(`  -> Failed to save to DB: ${saveRes.statusText}`);
              failCount++;
            }
          } else {
            console.log(`  -> Geocoded outside Sedgwick County [${lat}, ${lng}]. Ignoring.`);
            failCount++;
          }
        } else {
          console.log(`  -> No match found from Census API.`);
          failCount++;
        }
      } else {
        console.error(`  -> Geocoding API HTTP Error: ${geoRes.status}`);
        failCount++;
      }
    } catch (e) {
      console.error(`  -> Exception: ${e.message}`);
      failCount++;
    }
    
    // Census API is generous but let's pause to avoid connection resets
    await sleep(200);
  }
  
  console.log(`\nBackfill Complete. Success: ${successCount}, Failed: ${failCount}`);
}

backfill().catch(console.error);