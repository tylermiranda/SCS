import fetch from 'node-fetch';

const API_URL = process.argv[2] || 'http://localhost:8788';

async function run() {
  console.log(`Fetching properties from ${API_URL}/api/admin/data...`);
  const res = await fetch(`${API_URL}/api/admin/data`, {
    headers: { 'Referer': API_URL + '/' }
  });
  if (!res.ok) throw new Error('Failed to fetch from API');
  const data = await res.json();
  const properties = data.properties || [];
  
  let cleanedCount = 0;

  for (const p of properties) {
    if (p.coordinates && p.coordinates.lat) {
      const lat = p.coordinates.lat;
      const lng = p.coordinates.lng;
      
      // Sedgwick County is specifically Lat: ~37.4 to 38.0, Lng: ~-97.9 to -97.1
      // We only want properties in Sedgwick County
      const inSedgwick = lat > 37.4 && lat < 38.0 && lng > -97.9 && lng < -97.1;
      
      if (!inSedgwick) {
        console.log(`[${p.pin}] ${p.address} is outside Sedgwick County (${lat}, ${lng}). Deleting coordinates...`);
        delete p.coordinates;
        
        const putRes = await fetch(`${API_URL}/api/admin/data`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Referer': API_URL + '/' 
          },
          body: JSON.stringify({ property: p })
        });
        
        if (putRes.ok) {
          cleanedCount++;
        } else {
          console.error(`Failed to update ${p.pin}`);
        }
      }
    }
  }
  
  console.log(`\nCleaned up ${cleanedCount} properties with bad coordinates.`);
}

run().catch(console.error);