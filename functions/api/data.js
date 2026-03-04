export async function onRequest(context) {
  const { env } = context;

  let dataStr = await env.SCS_DATA.get('data.json');
  if (!dataStr) {
    return new Response(JSON.stringify({ properties: [], totalProperties: 0 }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  let data = JSON.parse(dataStr);

  // ALWAYS REDACT on this public endpoint
  data.properties = data.properties.map(p => ({
    ...p,
    address: 'Redacted',
    owner: 'Redacted',
    comparableSales: p.comparableSales ? {
      ...p.comparableSales,
      comps: (p.comparableSales.comps || []).map(c => ({...c, address: 'Redacted'}))
    } : null
  }));

  return new Response(JSON.stringify(data), { 
    headers: { 'Content-Type': 'application/json' } 
  });
}
