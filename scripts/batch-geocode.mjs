import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const API_URL = process.argv[2] || 'http://localhost:8788';

function splitAddress(fullAddress) {
  const twoWordCities = ['VALLEY CENTER', 'BEL AIRE', 'PARK CITY', 'CLEARWATER', 'GARDEN PLAIN', 'MOUNT HOPE'];
  let city = '';
  let street = fullAddress;

  for (const twCity of twoWordCities) {
    if (fullAddress.endsWith(' ' + twCity)) {
      city = twCity;
      street = fullAddress.substring(0, fullAddress.length - twCity.length - 1);
      return { street, city };
    }
  }

  // Fallback to one-word city
  const parts = fullAddress.trim().split(' ');
  if (parts.length > 2) {
    city = parts.pop();
    street = parts.join(' ');
  }
  return { street, city };
}

async function run() {
  console.log(`Fetching properties from ${API_URL}/api/admin/data...`);
  const res = await fetch(`${API_URL}/api/admin/data`);
  if (!res.ok) throw new Error('Failed to fetch from API');
  const data = await res.json();
  const properties = data.properties || [];
  
  // Get ALL properties without coordinates
  const needsGeocode = properties.filter(p => !p.coordinates || !p.coordinates.lat);
  console.log(`Found ${needsGeocode.length} properties to geocode.`);
  
  if (needsGeocode.length === 0) {
    console.log('All properties are geocoded. Exiting.');
    return;
  }

  // Prepare CSV
  // The Census Batch API expects: ID, Street address, City, State, ZIP
  let csvContent = '';
  for (const p of needsGeocode) {
    const { street, city } = splitAddress(p.address);
    csvContent += `${p.pin},"${street}","${city}",KS,\n`;
  }
  
  fs.writeFileSync('batch_input.csv', csvContent);
  console.log('Saved batch_input.csv. Submitting to US Census API...');

  const form = new FormData();
  form.append('addressFile', fs.createReadStream('batch_input.csv'));
  form.append('benchmark', '2020');
  
  const geoRes = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', {
    method: 'POST',
    body: form
  });

  if (!geoRes.ok) {
    throw new Error(`Census API returned ${geoRes.status} ${geoRes.statusText}`);
  }

  const resultCsv = await geoRes.text();
  fs.writeFileSync('batch_result.csv', resultCsv);
  console.log('Received response from Census API. Saved to batch_result.csv.');

  // Parse results
  // CSV Format returned:
  // "ID", "Input Address", "Match Status", "Match Type", "Matched Address", "Coordinates", "TIGER Line ID", "Side"
  const records = parse(resultCsv, { relax_column_count: true });
  
  let success = 0;
  for (const row of records) {
    const pin = row[0];
    const status = row[2]; // e.g. "Match", "Tie", "No_Match"
    const coordsStr = row[5];
    
    if (status === 'Match' || status === 'Tie') {
      if (coordsStr) {
        const [lngStr, latStr] = coordsStr.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        // Sedgwick County bounding box check
        const inSedgwick = lat > 37.4 && lat < 38.0 && lng > -97.9 && lng < -97.1;
        
        if (inSedgwick) {
          // Find property and update
          const prop = properties.find(p => p.pin === pin);
          if (prop) {
            prop.coordinates = { lat, lng };
            const putRes = await fetch(`${API_URL}/api/admin/data`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ property: prop })
            });
            
            if (putRes.ok) {
              success++;
            } else {
              console.error(`Failed to update PIN ${pin} in local DB`);
            }
          }
        } else {
          console.warn(`PIN ${pin} geocoded outside Sedgwick County (${lat}, ${lng}). Ignoring.`);
        }
      }
    }
  }
  
  console.log(`\nBatch Job Complete!`);
  console.log(`Successfully matched and updated ${success} out of ${needsGeocode.length} properties.`);
  console.log(`Success rate: ${((success / needsGeocode.length) * 100).toFixed(1)}%`);
}

run().catch(console.error);
