const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed.entries) ? parsed : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function saveEntry(entry) {
  const store = readStore();
  const record = { ...entry, id: entry.id || randomUUID(), receivedAt: new Date().toISOString() };
  if (!store.entries.some(item => item.id === record.id)) store.entries.push(record);
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return record;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Payload quá lớn.'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    response.end();
    return;
  }

  if (requestUrl.pathname === '/api/responses') {
    if (request.method === 'GET') return sendJson(response, 200, readStore());
    if (request.method === 'POST') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        if (!body || typeof body !== 'object') throw new Error('Dữ liệu không hợp lệ.');
        return sendJson(response, 201, { ok: true, entry: saveEntry(body) });
      } catch (error) {
        return sendJson(response, 400, { ok: false, error: error.message });
      }
    }
    return sendJson(response, 405, { ok: false, error: 'Method not allowed.' });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405);
    response.end();
    return;
  }

  const relativePath = requestUrl.pathname === '/' ? '/index.html' : decodeURIComponent(requestUrl.pathname);
  const filePath = path.resolve(ROOT, `.${relativePath}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    if (request.method === 'HEAD') response.end();
    else response.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Web đang chạy tại http://localhost:${PORT}`);
});
