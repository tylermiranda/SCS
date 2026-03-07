export async function onRequest(context) {
  const { env } = context;

  try {
    const { results } = await env.DB.prepare('SELECT data FROM properties').all();
    
    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ properties: [], totalProperties: 0 }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    let properties = results.map(row => JSON.parse(row.data));

    // ALWAYS REDACT on this public endpoint
    properties = properties.map(p => ({
      ...p,
      address: 'Redacted',
      owner: 'Redacted',
      comparableSales: p.comparableSales ? {
        ...p.comparableSales,
        comps: (p.comparableSales.comps || []).map(c => ({...c, address: 'Redacted'}))
      } : null
    }));

    const data = {
      properties,
      totalProperties: properties.length
    };

    return new Response(JSON.stringify(data), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, properties: [], totalProperties: 0 }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
