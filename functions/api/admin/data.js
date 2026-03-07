export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT data FROM properties').all();
      let properties = results ? results.map(row => JSON.parse(row.data)) : [];
      
      return new Response(JSON.stringify({ properties, totalProperties: properties.length }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (!body || !Array.isArray(body.properties)) {
        return new Response(JSON.stringify({ error: 'Invalid JSON structure: Must contain a properties array.' }), { status: 400 });
      }

      // We need to overwrite the database
      const statements = [];
      statements.push(env.DB.prepare('DELETE FROM properties'));
      
      for (const prop of body.properties) {
        if (!prop.pin) continue;
        statements.push(
          env.DB.prepare('INSERT INTO properties (pin, address, owner, data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
          .bind(prop.pin, prop.address || '', prop.owner || '', JSON.stringify(prop))
        );
      }

      // Cloudflare D1 batch limit is 100 statements. We may need to chunk this if the array is very large.
      // But for < 100 properties it's fine. If there are more, we need to batch it in chunks.
      const CHUNK_SIZE = 99; // 1 for DELETE, leaves 99 for inserts
      if (statements.length <= 100) {
        await env.DB.batch(statements);
      } else {
        await env.DB.batch([statements[0]]); // execute DELETE
        const insertStatements = statements.slice(1);
        for (let i = 0; i < insertStatements.length; i += CHUNK_SIZE) {
          const chunk = insertStatements.slice(i, i + CHUNK_SIZE);
          await env.DB.batch(chunk);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
