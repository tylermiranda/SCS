export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    let logsStr = await env.SCS_DATA.get('logs.json');
    let logs = [];
    if (logsStr) {
      logs = JSON.parse(logsStr);
    }
    return new Response(JSON.stringify({ logs }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'DELETE') {
    await env.SCS_DATA.put('logs.json', JSON.stringify([]));
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
