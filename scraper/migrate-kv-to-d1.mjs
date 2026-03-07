import fs from 'fs';
import { execSync } from 'child_process';

// Read the JSON file
console.log('Reading kv_data_test.json...');
const dataStr = fs.readFileSync('kv_data_test.json', 'utf8');
const data = JSON.parse(dataStr);

if (!data.properties || !Array.isArray(data.properties)) {
  console.error('Invalid data format. Expected an object with a "properties" array.');
  process.exit(1);
}

// Generate a SQL file
const sqlFile = 'migrate.sql';
console.log(`Generating ${sqlFile}...`);

const statements = ['DELETE FROM properties;'];

for (const prop of data.properties) {
  if (!prop.pin) continue;
  const pin = prop.pin.replace(/'/g, "''");
  const address = (prop.address || '').replace(/'/g, "''");
  const owner = (prop.owner || '').replace(/'/g, "''");
  const jsonData = JSON.stringify(prop).replace(/'/g, "''");

  statements.push(`INSERT INTO properties (pin, address, owner, data, updated_at) VALUES ('${pin}', '${address}', '${owner}', '${jsonData}', CURRENT_TIMESTAMP);`);
}

fs.writeFileSync(sqlFile, statements.join('\n'));

console.log(`Generated ${statements.length - 1} insert statements.`);

// Execute via Wrangler
console.log('Executing SQL against local D1 database...');
try {
  execSync(`npx wrangler d1 execute scs-db --local --file=./${sqlFile}`, { stdio: 'inherit' });
  console.log('Migration successful!');
} catch (err) {
  console.error('Migration failed:', err.message);
} finally {
  // Cleanup
  fs.unlinkSync(sqlFile);
}
