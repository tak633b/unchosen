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
  name TEXT NOT NULL DEFAULT '',
  rural INTEGER NOT NULL DEFAULT 0,
  birth_year INTEGER NOT NULL DEFAULT 0,
  job TEXT NOT NULL DEFAULT '',
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

async function readJson(req, limit = 8192) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('too large');
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
  const birthYear = Number(b.birthYear);
  return {
    rural: b.rural ? 1 : 0, name: str(b.name, 60), birthYear: Number.isInteger(birthYear) ? birthYear : 0, job: str(b.job, 40),
    country, sex: b.sex, age, cause, line: str(b.line, 400), message: str(b.message, 200),
  };
}

// ---- AI の中継 ---------------------------------------------------------------
// 何でも中継する踏み台にならないよう、宛先は既知の API か、手元・社内の LLM だけにする
const AI_HOSTS = new Set(['openrouter.ai', 'api.openai.com']);
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^\[?::1\]?$/, /^localhost$/, /\.local$/, /\.ts\.net$/];
const AI_TIMEOUT_MS = 90_000;
const AI_MAX_RESPONSE = 256 * 1024;
const aiHits = new Map();

function aiTarget(baseUrl) {
  let u;
  try { u = new URL(String(baseUrl)); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const known = AI_HOSTS.has(u.hostname) && u.protocol === 'https:';
  if (!known && !PRIVATE.some((re) => re.test(u.hostname))) return null;
  return `${u.origin}${u.pathname.replace(/\/$/, '')}/chat/completions`;
}

async function aiRelay(req, res) {
  const ip = req.socket.remoteAddress ?? '';
  const now = Date.now();
  const recent = (aiHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  aiHits.set(ip, recent);
  if (recent.length > 120) return send(res, 429, { success: false, error: 'too many requests' });
  let b;
  try { b = await readJson(req, 64 * 1024); } catch { return send(res, 400, { success: false, error: 'bad json' }); }
  const target = aiTarget(b?.baseUrl);
  if (!target) return send(res, 400, { success: false, error: 'この接続先は中継できません (OpenRouter・OpenAI か、手元/LAN/Tailscale の LLM だけ)' });
  const body = b.body && typeof b.body === 'object' ? b.body : null;
  if (!body || typeof body.model !== 'string' || !Array.isArray(body.messages)) return send(res, 400, { success: false, error: 'invalid body' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof b.apiKey === 'string' && b.apiKey ? { Authorization: `Bearer ${b.apiKey}` } : {}),
        'X-Title': 'Unchosen',
      },
      body: JSON.stringify({ model: body.model, messages: body.messages, max_tokens: Math.min(2000, Number(body.max_tokens) || 800), temperature: Number(body.temperature) || 1 }),
      signal: ctrl.signal,
    });
    const text = (await r.text()).slice(0, AI_MAX_RESPONSE);
    if (!r.ok) return send(res, 502, { success: false, error: `LLM が ${r.status} を返した: ${text.slice(0, 200)}` });
    const j = JSON.parse(text);
    return send(res, 200, { success: true, data: { content: j.choices?.[0]?.message?.content ?? '' } });
  } catch (err) {
    return send(res, 502, { success: false, error: err.name === 'AbortError' ? 'LLM の応答が時間内に返らなかった' : 'LLM に接続できなかった' });
  } finally {
    clearTimeout(timer);
  }
}

async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/ai/chat') return aiRelay(req, res);
  const ip = req.socket.remoteAddress ?? '';
  if (req.method === 'GET' && url.pathname === '/api/memorial') {
    const rows = db.prepare(`SELECT id, name, rural, birth_year AS birthYear, job, country, sex, age, cause, line, message, candles, created_at AS createdAt
      FROM memorial ORDER BY id DESC LIMIT 100`).all();
    return send(res, 200, { success: true, data: rows });
  }
  if (req.method === 'POST' && url.pathname === '/api/memorial') {
    if (limited(ip)) return send(res, 429, { success: false, error: 'too many requests' });
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { success: false, error: 'bad json' }); }
    const e = validEntry(body);
    if (!e) return send(res, 400, { success: false, error: 'invalid entry' });
    const r = db.prepare('INSERT INTO memorial (name, rural, birth_year, job, country, sex, age, cause, line, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.name, e.rural, e.birthYear, e.job, e.country, e.sex, e.age, e.cause, e.line, e.message);
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
