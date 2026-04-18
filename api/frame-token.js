/**
 * Proxy for the Frame.io OAuth token endpoint.
 * Needed because Frame.io does not send CORS headers,
 * so browsers block direct token exchange requests.
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Vercel parses application/x-www-form-urlencoded into req.body as an object
  const body = typeof req.body === 'string'
    ? req.body
    : new URLSearchParams(req.body).toString();

  const upstream = await fetch('https://applications.frame.io/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await upstream.json();
  res.status(upstream.status).json(data);
};
