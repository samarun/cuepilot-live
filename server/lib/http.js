export function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

export async function readJsonBody(request, maxBytes = 2_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body is too large');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function allowCors(request, response, allowlist) {
  const origin = request.headers.origin;
  if (origin && allowlist.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-File-Name');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
}

export function isLoopbackAddress(address = '') {
  const normalized = String(address).replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

export function verifyToken(request, configuredToken, { requireRemoteToken = false } = {}) {
  if (isLoopbackAddress(request.socket?.remoteAddress)) return true;
  if (!configuredToken) return !requireRemoteToken;
  const authorization = request.headers.authorization || '';
  return authorization === `Bearer ${configuredToken}`;
}
