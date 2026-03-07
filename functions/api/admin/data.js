export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  if (request.method === 'GET') {
    try {
      const pin = url.searchParams.get('pin');
      if (pin) {
        // Fetch single property for the DB editor
        const row = await env.DB.prepare('SELECT data FROM properties WHERE pin = ?').bind(pin).first();
        if (!row) {
          return new Response(JSON.stringify({ error: 'Property not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ property: JSON.parse(row.data) }), { headers: { 'Content-Type': 'application/json' } });
      }

      // Fetch all properties for the admin table
      const { results } = await env.DB.prepare('SELECT data FROM properties').all();
      let properties = results ? results.map(row => JSON.parse(row.data)) : [];
      
      return new Response(JSON.stringify({ properties, totalProperties: properties.length }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (request.method === 'PUT') {
    try {
      const body = await request.json();
      if (!body || !body.property || !body.property.pin) {
        return new Response(JSON.stringify({ error: 'Invalid JSON structure: Must contain a "property" object with a "pin".' }), { status: 400 });
      }

      const prop = body.property;
      await env.DB.prepare('INSERT OR REPLACE INTO properties (pin, address, owner, data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
        .bind(prop.pin, prop.address || '', prop.owner || '', JSON.stringify(prop))
        .run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Keep POST for legacy massive bulk overwrite if needed, or remove it. We'll leave it for now but deprecate it in the UI.
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (!body || !Array.isArray(body.properties)) {
        return new Response(JSON.stringify({ error: 'Invalid JSON structure: Must contain a properties array.' }), { status: 400 });
      }

      const statements = [];
      statements.push(env.DB.prepare('DELETE FROM properties'));
      
      for (const prop of body.properties) {
        if (!prop.pin) continue;
        statements.push(
          env.DB.prepare('INSERT INTO properties (pin, address, owner, data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
          .bind(prop.pin, prop.address || '', prop.owner || '', JSON.stringify(prop))
        );
      }

      const CHUNK_SIZE = 99;
      if (statements.length <= 100) {
        await env.DB.batch(statements);
      } else {
        await env.DB.batch([statements[0]]);
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
