// 追悼館の API と、本番用に dist/ を配る小さなサーバ。依存なし (node:sqlite)。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { extname, join, normalize } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

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
  lang TEXT NOT NULL DEFAULT 'ja',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
// 英語版より前に作った DB には lang 列がない。ある人生はすべて日本語のもの
if (!db.prepare('PRAGMA table_info(memorial)').all().some((c) => c.name === 'lang')) {
  db.exec("ALTER TABLE memorial ADD COLUMN lang TEXT NOT NULL DEFAULT 'ja'");
}
const langOf = (v) => (v === 'en' ? 'en' : 'ja');

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
  if (!/^[A-Z]{3}$/.test(country) || !['F', 'M', 'X'].includes(b.sex) || !Number.isInteger(age) || age < 0 || age > 120) return null;
  const cause = str(b.cause, 40);
  if (!cause) return null;
  if (b.lang !== undefined && !['ja', 'en'].includes(b.lang)) return null;
  const birthYear = Number(b.birthYear);
  return {
    rural: b.rural ? 1 : 0, name: str(b.name, 60), birthYear: Number.isInteger(birthYear) ? birthYear : 0, job: str(b.job, 40),
    country, sex: b.sex, age, cause, line: str(b.line, 400), message: str(b.message, 200), lang: langOf(b.lang),
  };
}

// ---- AI の中継 ---------------------------------------------------------------
// 何でも中継する踏み台にならないよう、宛先は既知の API (完全一致) か、
// 名前を引いた結果がすべて手元・LAN・Tailscale の住所になる LLM だけにする。
// 私的な住所への中継はサーバの設定で止められる (AI_PRIVATE_RELAY=off)。クライアントからは変えられない。
const AI_HOSTS = new Set(['openrouter.ai', 'api.openai.com']);
const PRIVATE_RELAY = process.env.AI_PRIVATE_RELAY !== 'off';
const AI_TIMEOUT_MS = 90_000;
const AI_MAX_RESPONSE = 256 * 1024;
const aiHits = new Map();

function v4(ip) {
  const p = ip.split('.').map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

// 中継してよい私的な住所か。リンクローカル (169.254/16, fe80::/10) と 0.0.0.0 は常に拒む
function allowedPrivate(addr) {
  const ip = addr.toLowerCase().replace(/^::ffff:/, '');
  const p = v4(ip);
  if (p) {
    const [a, b] = p;
    if (a === 0 || (a === 169 && b === 254)) return false;
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
  }
  if (ip === '::1') return true;
  if (/^fe[89ab]/.test(ip) || ip === '::') return false;
  return /^f[cd]/.test(ip); // ULA fc00::/7
}

// 宛先を確かめ、接続に使う URL と Host を返す。だめなら null
async function aiTarget(baseUrl) {
  let u;
  try { u = new URL(String(baseUrl)); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
  const path = `${u.pathname.replace(/\/$/, '')}/chat/completions`;
  if (AI_HOSTS.has(u.hostname)) return u.protocol === 'https:' ? { url: `https://${u.host}${path}`, host: null } : null;
  if (!PRIVATE_RELAY) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  try { addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }); } catch { return null; }
  if (!addrs.length || !addrs.every((a) => allowedPrivate(a.address))) return null;
  // http は確かめた住所へ直接つなぐ (名前の引き直しで別の住所に向けられるのを防ぐ)
  if (u.protocol === 'http:') {
    const a = addrs[0].address;
    const ipHost = a.includes(':') ? `[${a}]` : a;
    return { url: `http://${ipHost}${u.port ? `:${u.port}` : ''}${path}`, host: u.host };
  }
  return { url: `https://${u.host}${path}`, host: null };
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
  const target = await aiTarget(b?.baseUrl);
  if (!target) return send(res, 400, { success: false, error: T(b, 'この接続先は中継できません (OpenRouter・OpenAI か、手元/LAN/Tailscale の LLM だけ)', 'This endpoint cannot be relayed (only OpenRouter, OpenAI, or a local/LAN/Tailscale LLM)') });
  const body = b.body && typeof b.body === 'object' ? b.body : null;
  if (!body || typeof body.model !== 'string' || !Array.isArray(body.messages)) return send(res, 400, { success: false, error: 'invalid body' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const r = await fetch(target.url, {
      method: 'POST',
      redirect: 'manual', // 転送先は確かめていないので、追いかけない
      headers: {
        'Content-Type': 'application/json',
        ...(target.host ? { Host: target.host } : {}),
        ...(typeof b.apiKey === 'string' && b.apiKey ? { Authorization: `Bearer ${b.apiKey}` } : {}),
        'X-Title': 'Unchosen',
      },
      body: JSON.stringify({ model: body.model, messages: body.messages, max_tokens: Math.min(2000, Number(body.max_tokens) || 800), temperature: Number(body.temperature) || 1 }),
      signal: ctrl.signal,
    });
    if (r.status >= 300 && r.status < 400) return send(res, 502, { success: false, error: T(b, 'LLM が転送を返したので中継しなかった', 'The LLM returned a redirect, so it was not followed') });
    const text = (await r.text()).slice(0, AI_MAX_RESPONSE);
    if (!r.ok) return send(res, 502, { success: false, error: T(b, `LLM が ${r.status} を返した: `, `The LLM returned ${r.status}: `) + text.slice(0, 200) });
    const j = JSON.parse(text);
    return send(res, 200, { success: true, data: { content: j.choices?.[0]?.message?.content ?? '' } });
  } catch (err) {
    return send(res, 502, { success: false, error: relayError(err, target.url, b) });
  } finally {
    clearTimeout(timer);
  }
}

// 画面の言語でエラーを返す (クライアントが body に lang を付ける)
const T = (b, ja, en) => (b?.lang === 'en' ? en : ja);

// つながらなかった理由を、直し方が分かる言葉で返す (サーバのログにも残す。キーは書かない)
function relayError(err, url, b) {
  const code = err.cause?.code ?? err.code ?? '';
  const where = new URL(url).host;
  console.error('[ai relay]', where, err.name, code || err.message);
  if (err.name === 'AbortError') return T(b, 'LLM の応答が時間内に返らなかった(モデルの読み込み中かもしれない)', 'The LLM did not answer in time (the model may still be loading)');
  if (code === 'ECONNREFUSED') return T(b, `${where} に接続を拒否された。そのポートで LLM が動いていない(サーバの機械から見た住所です)`, `${where} refused the connection. No LLM is running on that port (the address is as seen from the server)`);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return T(b, `${where} の名前が引けなかった`, `Could not resolve ${where}`);
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return T(b, `${where} に届かなかった(住所かファイアウォールを確かめて)`, `Could not reach ${where} (check the address or the firewall)`);
  return T(b, `LLM に接続できなかった(${code || err.message})`, `Could not connect to the LLM (${code || err.message})`);
}

// モデル一覧: 設定画面で接続を確かめ、モデル名を選ぶのに使う
async function aiModels(req, res) {
  let b;
  try { b = await readJson(req, 8192); } catch { return send(res, 400, { success: false, error: 'bad json' }); }
  const target = await aiTarget(b?.baseUrl);
  if (!target) return send(res, 400, { success: false, error: T(b, 'この接続先は中継できません (OpenRouter・OpenAI か、手元/LAN/Tailscale の LLM だけ)', 'This endpoint cannot be relayed (only OpenRouter, OpenAI, or a local/LAN/Tailscale LLM)') });
  const url = target.url.replace(/\/chat\/completions$/, '/models');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { ...(target.host ? { Host: target.host } : {}), ...(typeof b.apiKey === 'string' && b.apiKey ? { Authorization: `Bearer ${b.apiKey}` } : {}) },
      signal: ctrl.signal,
    });
    if (!r.ok) return send(res, 502, { success: false, error: T(b, `モデル一覧が ${r.status} を返した`, `The model list returned ${r.status}`) });
    const j = JSON.parse((await r.text()).slice(0, 2 * 1024 * 1024));
    const ids = (Array.isArray(j.data) ? j.data : []).map((m) => String(m.id)).slice(0, 500);
    return send(res, 200, { success: true, data: { models: ids } });
  } catch (err) {
    return send(res, 502, { success: false, error: relayError(err, url) });
  } finally {
    clearTimeout(timer);
  }
}

async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/ai/chat') return aiRelay(req, res);
  if (req.method === 'POST' && url.pathname === '/api/ai/models') return aiModels(req, res);
  const ip = req.socket.remoteAddress ?? '';
  if (req.method === 'GET' && url.pathname === '/api/memorial') {
    const rows = db.prepare(`SELECT id, name, rural, birth_year AS birthYear, job, country, sex, age, cause, line, message, candles, created_at AS createdAt
      FROM memorial WHERE lang = ? ORDER BY id DESC LIMIT 100`).all(langOf(url.searchParams.get('lang')));
    return send(res, 200, { success: true, data: rows });
  }
  if (req.method === 'POST' && url.pathname === '/api/memorial') {
    if (limited(ip)) return send(res, 429, { success: false, error: 'too many requests' });
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { success: false, error: 'bad json' }); }
    const e = validEntry(body);
    if (!e) return send(res, 400, { success: false, error: 'invalid entry' });
    const r = db.prepare('INSERT INTO memorial (name, rural, birth_year, job, country, sex, age, cause, line, message, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.name, e.rural, e.birthYear, e.job, e.country, e.sex, e.age, e.cause, e.line, e.message, e.lang);
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

// 文字のファイルは gzip で送る (国連の生命表は 9MB → 2.6MB)。圧縮したものは、ファイルの更新時刻ごとにメモリに置く
const gzCache = new Map();
async function gzipped(file) {
  const { mtimeMs } = await stat(file);
  const hit = gzCache.get(file);
  if (hit?.mtimeMs === mtimeMs) return hit.data;
  const data = gzipSync(await readFile(file));
  gzCache.set(file, { mtimeMs, data });
  return data;
}

async function staticFile(req, res, pathname) {
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(DIST)) return send(res, 403, { success: false, error: 'forbidden' });
  try {
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    // assets/ の下はファイル名にハッシュが付くので、長く持たせてよい
    const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (/^(text|application\/json)/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      const data = await gzipped(file);
      res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Cache-Control': cache });
      return res.end(data);
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
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
    return await staticFile(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, 500, { success: false, error: 'server error' });
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
