export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT timestamp, action, query, error FROM logs ORDER BY timestamp DESC LIMIT 500').all();
      return new Response(JSON.stringify({ logs: results || [] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, logs: [] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (request.method === 'DELETE') {
    try {
      await env.DB.prepare('DELETE FROM logs').run();
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
