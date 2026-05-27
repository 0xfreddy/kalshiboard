import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 4173);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function safeStaticPath(pathname) {
  const normalized = normalize(pathname === '/' ? '/index.html' : pathname);
  if (normalized.includes('..')) return null;
  return join(ROOT, normalized);
}

async function proxyKalshi(request, response, url) {
  const kalshiPath = url.pathname.replace('/api/kalshi', '') || '/';

  if (!/^\/(markets|events)(\/|$)/.test(kalshiPath)) {
    send(response, 404, JSON.stringify({ error: 'Unsupported Kalshi endpoint' }), {
      'content-type': 'application/json; charset=utf-8'
    });
    return;
  }

  const kalshiUrl = `${KALSHI_BASE}${kalshiPath}${url.search}`;
  const kalshiResponse = await fetch(kalshiUrl, {
    headers: {
      accept: 'application/json'
    }
  });

  const body = await kalshiResponse.text();
  send(response, kalshiResponse.status, body, {
    'cache-control': 'no-store',
    'content-type': kalshiResponse.headers.get('content-type') || 'application/json; charset=utf-8'
  });
}

async function serveStatic(response, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath) {
    send(response, 403, 'Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    send(response, 200, body, {
      'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream'
    });
  } catch {
    send(response, 404, 'Not found');
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith('/api/kalshi/')) {
      await proxyKalshi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    send(response, 500, JSON.stringify({ error: 'Internal server error' }), {
      'content-type': 'application/json; charset=utf-8'
    });
  }
}).listen(PORT, () => {
  console.log(`KalshiBoard running at http://127.0.0.1:${PORT}/`);
});
