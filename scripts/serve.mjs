// 本機開發伺服器：提供 public/ 靜態檔；加上 --api 時同時模擬 Netlify Function 與 Netlify Blobs。
// 用法：
//   npm run serve                      只有前端（本機模式）
//   node scripts/serve.mjs --api       前端 + 後端（雲端模式，資料存在暫存資料夾）
//   ADMIN_PASSWORD=xxx ANTHROPIC_API_KEY=sk-... node scripts/serve.mjs --api --port 8888
import http from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
const port = Number(argVal('--port', process.env.PORT || 8080));
const withApi = args.includes('--api');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};
const NO_EXT_JSON = new Set(['health']);

export async function startServer({ port: p = port, api = withApi, blobsDir } = {}) {
  let apiHandler = null;
  let blobs = null;
  if (api) {
    const { BlobsServer } = await import('@netlify/blobs/server');
    const dir = blobsDir || (await mkdtemp(path.join(tmpdir(), 'yindong-blobs-')));
    const token = 'local-dev-token';
    blobs = new BlobsServer({ directory: dir, token });
    const { port: bport } = await blobs.start();
    process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
      JSON.stringify({ edgeURL: `http://127.0.0.1:${bport}`, uncachedEdgeURL: `http://127.0.0.1:${bport}`, token, siteID: 'local-site' })
    ).toString('base64');
    if (!process.env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = 'yindong-local-admin';
    apiHandler = (await import('../netlify/functions/api.mjs')).default;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/') && apiHandler) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
        });
        const response = await apiHandler(request, { ip: req.socket.remoteAddress });
        const headers = Object.fromEntries(response.headers.entries());
        res.writeHead(response.status, headers);
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(publicDir, '.' + rel);
      if (!file.startsWith(publicDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || (NO_EXT_JSON.has(path.basename(file)) ? 'application/json; charset=utf-8' : 'application/octet-stream'),
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(String(e && e.stack ? e.stack : e));
      }
    }
  });
  await new Promise((r) => server.listen(p, '127.0.0.1', r));
  const actual = server.address().port;
  return {
    url: `http://127.0.0.1:${actual}`,
    close: async () => {
      await new Promise((r) => server.close(r));
      if (blobs) await blobs.stop();
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startServer();
  console.log(`銀動方程式 開發伺服器：${s.url}${withApi ? '（含 API，後台密碼：' + process.env.ADMIN_PASSWORD + '）' : '（本機模式）'}`);
}
