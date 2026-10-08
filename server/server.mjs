// 追悼館の API と、本番用に dist/ を配る小さなサーバ。依存なし (node:sqlite)。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

mkdirSync(join(ROOT, 'data'), { recursive: true });
const db = new DatabaseSync(join(ROOT, 'data', 'memorial.db'));
db.exec(`CREATE TABLE IF NOT EXISTS memorial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  sex TEXT NOT NULL,
  age INTEGER NOT NULL,
  cause TEXT NOT NULL,
  line TEXT NOT NULL,
  message TEXT NOT NULL,
  candles INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// 1つの IP からの書き込みは 1分に10回まで
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 4096) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validEntry(b) {
  if (!b || typeof b !== 'object') return null;
  const country = str(b.country, 3);
  const age = Number(b.age);
  if (!/^[A-Z]{3}$/.test(country) || !['F', 'M'].includes(b.sex) || !Number.isInteger(age) || age < 0 || age > 120) return null;
  const cause = str(b.cause, 40);
  if (!cause) return null;
  return { country, sex: b.sex, age, cause, line: str(b.line, 120), message: str(b.message, 200) };
}

async function api(req, res, url) {
  const ip = req.socket.remoteAddress ?? '';
  if (req.method === 'GET' && url.pathname === '/api/memorial') {
    const rows = db.prepare(`SELECT id, country, sex, age, cause, line, message, candles, created_at AS createdAt
      FROM memorial ORDER BY id DESC LIMIT 100`).all();
    return send(res, 200, { success: true, data: rows });
  }
  if (req.method === 'POST' && url.pathname === '/api/memorial') {
    if (limited(ip)) return send(res, 429, { success: false, error: 'too many requests' });
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { success: false, error: 'bad json' }); }
    const e = validEntry(body);
    if (!e) return send(res, 400, { success: false, error: 'invalid entry' });
    const r = db.prepare('INSERT INTO memorial (country, sex, age, cause, line, message) VALUES (?, ?, ?, ?, ?, ?)')
      .run(e.country, e.sex, e.age, e.cause, e.line, e.message);
    return send(res, 201, { success: true, data: { id: Number(r.lastInsertRowid) } });
  }
  const m = url.pathname.match(/^\/api\/memorial\/(\d+)\/candle$/);
  if (req.method === 'POST' && m) {
    if (limited(ip)) return send(res, 429, { success: false, error: 'too many requests' });
    const id = Number(m[1]);
    db.prepare('UPDATE memorial SET candles = candles + 1 WHERE id = ?').run(id);
    const row = db.prepare('SELECT candles FROM memorial WHERE id = ?').get(id);
    if (!row) return send(res, 404, { success: false, error: 'not found' });
    return send(res, 200, { success: true, data: { candles: row.candles } });
  }
  return send(res, 404, { success: false, error: 'not found' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function staticFile(res, pathname) {
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(DIST)) return send(res, 403, { success: false, error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    try {
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      res.end(await readFile(join(DIST, 'index.html')));
    } catch {
      send(res, 404, { success: false, error: 'build first: npm run build' });
    }
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await staticFile(res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, 500, { success: false, error: 'server error' });
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
