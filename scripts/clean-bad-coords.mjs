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
      
      // Kansas is roughly Lat: 37 to 40, Lng: -102 to -94
      // Sedgwick County is specifically Lat: ~37.5 to 37.9, Lng: ~-97.8 to -97.2
      // Let's use a generous Kansas bounding box
      const inKansas = lat > 36.5 && lat < 40.5 && lng > -103.0 && lng < -94.0;
      
      if (!inKansas) {
        console.log(`[${p.pin}] ${p.address} is outside KS (${lat}, ${lng}). Deleting coordinates...`);
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