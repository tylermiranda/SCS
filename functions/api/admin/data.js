export async function onRequest(context) {
  const { env, request } = context;

  if (request.method === 'GET') {
    let dataStr = await env.SCS_DATA.get('data.json');
    if (!dataStr) {
      return new Response(JSON.stringify({ properties: [], totalProperties: 0 }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    return new Response(dataStr, { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (!body || !Array.isArray(body.properties)) {
        return new Response(JSON.stringify({ error: 'Invalid JSON structure: Must contain a properties array.' }), { status: 400 });
      }

      await env.SCS_DATA.put('data.json', JSON.stringify(body));
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
