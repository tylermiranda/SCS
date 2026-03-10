export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Allow same-origin requests
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'same-origin') {
    return context.next();
  }

  // Allow requests where Referer or Origin matches the host
  const referer = request.headers.get('referer');
  const origin = request.headers.get('origin');
  
  try {
    if (referer) {
      const refererUrl = new URL(referer);
      if (refererUrl.host === url.host) {
        return context.next();
      }
    }
    
    if (origin) {
      const originUrl = new URL(origin);
      if (originUrl.host === url.host) {
        return context.next();
      }
    }
  } catch (err) {
    // Ignore invalid URLs in headers
  }

  // Reject all other requests
  return new Response(JSON.stringify({ error: 'Direct API access is not allowed.' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}
