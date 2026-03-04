export async function onRequest(context) {
  const { env, request } = context;

  // Optional: We can add an additional check here for the Cloudflare Access header, 
  // but if the route itself is protected in the Cloudflare Zero Trust dashboard, 
  // this function will not be reached without valid authentication anyway.
  // Example: 
  // const userEmail = request.headers.get('cf-access-authenticated-user-email');
  // if (!userEmail) return new Response('Unauthorized', { status: 401 });

  let dataStr = await env.SCS_DATA.get('data.json');
  if (!dataStr) {
    return new Response(JSON.stringify({ properties: [], totalProperties: 0 }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  // Return full, unredacted data
  return new Response(dataStr, { 
    headers: { 'Content-Type': 'application/json' } 
  });
}
