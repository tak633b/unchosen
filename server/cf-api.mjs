// 追悼館と AI 中継の API の Cloudflare 版 (Pages Functions + D1)。入口は functions/api/[[path]].js。
// 道と返す形は server/server.mjs と同じ。足したのは 言葉の網・管理者の非表示・/api/health。
// IP はそのまま残さず、ADMIN_TOKEN を鍵にした HMAC にして制限の数えに使う。
import { countryCode, langOf, lifeAge, lifeId, validEntry, validLife } from './validate.mjs';
import { blocked } from './moderation.mjs';

// 制限: [回数, 窓の長さ]。固定の時間窓を D1 の1行で数える
export const LIMITS = {
  postMin: [10, 60_000],
  postDay: [50, 86_400_000],
  candleMin: [20, 60_000],
  aiMin: [120, 60_000],
  adminFail: [10, 600_000],
  lifeMin: [10, 60_000],
};

// いま生きている = 終わっておらず、この時間のうちに便りがあった
export const ALIVE_MS = 15 * 60_000;
// 1つの人生の便りは、この間隔より詰めて書かない (書き込みの制限を表を使わずに)
export const BEAT_MS = 50_000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const ng = (status, error) => json(status, { success: false, error });

const COLS = `id, name, rural, birth_year AS birthYear, job, country, sex, age, cause, line, message, candles, gen, family, created_at AS createdAt`;

const enc = new TextEncoder();
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key || 'local-dev'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
  return btoa(String.fromCharCode(...sig.slice(0, 16))).replace(/=+$/, '');
}
// 長さ以外の情報を時間で漏らさない比べ方
function sameSecret(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ (y[i % (y.length || 1)] ?? 0);
  return d === 0;
}

/** 窓の中で limit 回までなら true */
export async function allow(db, kind, who, now = Date.now()) {
  const [limit, win] = LIMITS[kind];
  const w = Math.floor(now / win);
  const row = await db.prepare('INSERT INTO rate (k, n, exp) VALUES (?, 1, ?) ON CONFLICT (k) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(`${kind}:${who}:${w}`, (w + 1) * win).first();
  // 期限切れの行はときどきまとめて消す
  if (Math.random() < 0.02) await db.prepare('DELETE FROM rate WHERE exp < ?').bind(now).run();
  return row.n <= limit;
}

class TooLarge extends Error {}
async function readJson(request, max) {
  if (Number(request.headers.get('Content-Length') ?? 0) > max) throw new TooLarge();
  const t = await request.text();
  if (enc.encode(t).length > max) throw new TooLarge();
  return JSON.parse(t);
}

/** Request と env ({ DB, ADMIN_TOKEN? }) から Response を返す */
export async function handle(request, env, now = Date.now()) {
  try {
    return await route(request, env, now);
  } catch (err) {
    // 中身 (本文・キー・IP) は出さない
    console.error('[api]', err instanceof Error ? err.message : 'error');
    return ng(500, 'server error');
  }
}

async function route(request, env, now) {
  const db = env.DB;
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const who = () => hmac(env.ADMIN_TOKEN, ip);

  if (m === 'GET' && p === '/api/health') return json(200, { success: true, data: { ok: true } });

  if (m === 'POST' && (p === '/api/ai/chat' || p === '/api/ai/models')) {
    if (!(await allow(db, 'aiMin', await who(), now))) return ng(429, 'too many requests');
    return p === '/api/ai/chat' ? aiChat(request) : aiModels(request);
  }

  if (m === 'GET' && p === '/api/memorial') {
    const r = await db.prepare(`SELECT ${COLS} FROM memorial WHERE hidden = 0 AND lang = ? ORDER BY id DESC LIMIT 100`)
      .bind(langOf(url.searchParams.get('lang'))).all();
    return json(200, { success: true, data: r.results });
  }

  if (m === 'POST' && p === '/api/memorial') {
    const w = await who();
    if (!(await allow(db, 'postMin', w, now)) || !(await allow(db, 'postDay', w, now))) return ng(429, 'too many requests');
    let body;
    try { body = await readJson(request, 8192); } catch (err) {
      return err instanceof TooLarge ? ng(413, 'too large') : ng(400, 'bad json');
    }
    const e = validEntry(body);
    if (!e) return ng(400, 'invalid entry');
    if (blocked(e.name) || blocked(e.message) || blocked(e.line)) return ng(400, 'blocked');
    const r = await db.prepare('INSERT INTO memorial (name, rural, birth_year, job, country, sex, age, cause, line, message, lang, gen, family) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(e.name, e.rural, e.birthYear, e.job, e.country, e.sex, e.age, e.cause, e.line, e.message, e.lang, e.gen, e.family).run();
    return json(201, { success: true, data: { id: Number(r.meta.last_row_id) } });
  }

  const c = p.match(/^\/api\/memorial\/(\d{1,15})\/candle$/);
  if (m === 'POST' && c) {
    if (!(await allow(db, 'candleMin', await who(), now))) return ng(429, 'too many requests');
    const row = await db.prepare('UPDATE memorial SET candles = candles + 1 WHERE id = ? AND hidden = 0 RETURNING candles').bind(Number(c[1])).first();
    return row ? json(200, { success: true, data: { candles: row.candles } }) : ng(404, 'not found');
  }

  if (p.startsWith('/api/life/')) return life(request, db, url, m, now, who);
  if (p.startsWith('/api/admin/')) return admin(request, env, db, url, m, now, who);
  return ng(404, 'not found');
}

// ---- いま遊ばれている人生 ----------------------------------------------------
// 読むのは索引の範囲と LIMIT だけ。合計は life_agg の国ごとの1行から
const cached = (body, secs) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${secs}` },
});
const AGG = 'INSERT INTO life_agg (country, born, finished, age_sum) VALUES (?, ?, ?, ?) ON CONFLICT (country) DO UPDATE SET born = born + excluded.born, finished = finished + excluded.finished, age_sum = age_sum + excluded.age_sum';
const known = async (db, id) => !!(await db.prepare('SELECT 1 AS x FROM life WHERE id = ?').bind(id).first());

async function life(request, db, url, m, now, who) {
  const p = url.pathname;
  if (m === 'GET' && p === '/api/life/now') {
    const c = countryCode(url.searchParams.get('country'));
    const cut = now - ALIVE_MS;
    const [alive, inC, born, died, tot] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM life WHERE ended_at IS NULL AND last_seen > ?').bind(cut).first(),
      c ? db.prepare('SELECT COUNT(*) AS n FROM life WHERE ended_at IS NULL AND last_seen > ? AND country = ?').bind(cut, c).first() : null,
      db.prepare('SELECT country, started_at AS at FROM life WHERE start_age = 0 ORDER BY started_at DESC LIMIT 10').all(),
      db.prepare('SELECT country, death_age AS age, ended_at AS at FROM life WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 10').all(),
      db.prepare('SELECT COALESCE(SUM(born), 0) AS born, COALESCE(SUM(finished), 0) AS finished FROM life_agg').first(),
    ]);
    const feed = [
      ...born.results.map((r) => ({ kind: 'born', country: r.country, age: 0, at: r.at })),
      ...died.results.map((r) => ({ kind: 'died', country: r.country, age: r.age, at: r.at })),
    ].sort((a, b) => b.at - a.at).slice(0, 10);
    return cached({ success: true, data: { alive: alive.n, inCountry: inC ? inC.n : null, feed, born: tot.born, finished: tot.finished, now } }, 15);
  }
  if (m === 'GET' && p === '/api/life/stats') {
    const c = countryCode(url.searchParams.get('country'));
    if (!c) return ng(400, 'invalid country');
    const r = await db.prepare('SELECT finished AS n, age_sum AS s FROM life_agg WHERE country = ?').bind(c).first();
    const n = r?.n ?? 0;
    return cached({ success: true, data: { n, avgAge: n ? r.s / n : null } }, 60);
  }
  if (m !== 'POST' || !['/api/life/start', '/api/life/beat', '/api/life/end'].includes(p)) return ng(404, 'not found');
  let b;
  try { b = await readJson(request, 1024); } catch (err) {
    return err instanceof TooLarge ? ng(413, 'too large') : ng(400, 'bad json');
  }
  if (p === '/api/life/start') {
    const e = validLife(b);
    if (!e) return ng(400, 'invalid life');
    if (!(await allow(db, 'lifeMin', await who(), now))) return ng(429, 'too many requests');
    // 保存から続ける人生は同じ id のまま。2度目の start は何もしない
    const row = await db.prepare('INSERT INTO life (id, country, birth_year, sex, age, start_age, started_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING id')
      .bind(e.id, e.country, e.birthYear, e.sex, e.age, e.age, now, now).first();
    if (row && e.age === 0) await db.prepare(AGG).bind(e.country, 1, 0, 0).run();
    return json(row ? 201 : 200, { success: true, data: { created: !!row } });
  }
  const id = lifeId(b?.id), age = lifeAge(b?.age);
  if (!id || age === null) return ng(400, 'invalid life');
  if (p === '/api/life/beat') {
    // 同じ人生からは BEAT_MS に1度だけ書く。詰めて来たものは書かずに受け取る
    const r = await db.prepare('UPDATE life SET age = ?, last_seen = ? WHERE id = ? AND ended_at IS NULL AND last_seen <= ?').bind(age, now, id, now - BEAT_MS).run();
    if (r.meta.changes) return json(200, { success: true, data: { ok: true } });
    return (await known(db, id)) ? json(200, { success: true, data: { ok: false } }) : ng(404, 'not found');
  }
  const row = await db.prepare('UPDATE life SET age = ?, death_age = ?, ended_at = ?, last_seen = ? WHERE id = ? AND ended_at IS NULL RETURNING country')
    .bind(age, age, now, now, id).first();
  if (row) {
    await db.prepare(AGG).bind(row.country, 0, 1, age).run();
    return json(200, { success: true, data: { ok: true } });
  }
  return (await known(db, id)) ? json(200, { success: true, data: { ok: false } }) : ng(404, 'not found');
}

// 管理者: Authorization: Bearer <ADMIN_TOKEN>。ADMIN_TOKEN が無ければ管理の道は無いものとする
async function admin(request, env, db, url, m, now, who) {
  const token = env.ADMIN_TOKEN;
  if (!token || token.length < 16) return ng(404, 'not found');
  const got = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(got, token)) {
    if (!(await allow(db, 'adminFail', await who(), now))) return ng(429, 'too many requests');
    return ng(401, 'unauthorized');
  }
  // 新しい順に100件 (非表示のものも、言語を問わず)
  if (m === 'GET' && url.pathname === '/api/admin/memorial') {
    const r = await db.prepare(`SELECT ${COLS}, lang, hidden FROM memorial ORDER BY id DESC LIMIT 100`).all();
    return json(200, { success: true, data: r.results });
  }
  // 非表示にする / 戻す: 本文 {"hidden": true|false}
  const h = url.pathname.match(/^\/api\/admin\/memorial\/(\d{1,15})\/hide$/);
  if (m === 'POST' && h) {
    let b;
    try { b = await readJson(request, 1024); } catch { return ng(400, 'bad json'); }
    if (typeof b?.hidden !== 'boolean') return ng(400, 'invalid: hidden');
    const row = await db.prepare('UPDATE memorial SET hidden = ? WHERE id = ? RETURNING id, hidden').bind(b.hidden ? 1 : 0, Number(h[1])).first();
    return row ? json(200, { success: true, data: { id: row.id, hidden: row.hidden === 1 } }) : ng(404, 'not found');
  }
  return ng(404, 'not found');
}

// ---- AI の中継 ---------------------------------------------------------------
// 公開版は既知の API (https・ホスト名の完全一致) だけ。手元・LAN の LLM はブラウザから直接つないでもらう
export const AI_HOSTS = new Set(['openrouter.ai', 'api.openai.com']);
const AI_TIMEOUT_MS = 90_000;
const AI_MAX_RESPONSE = 256 * 1024;

// 画面の言語でエラーを返す (クライアントが body に lang を付ける)
const T = (b, ja, en) => (b?.lang === 'en' ? en : ja);
const NOT_RELAYED = (b) => T(b,
  'この接続先は中継できません。公開版のサーバが中継するのは OpenRouter と OpenAI だけです。手元の LLM は AI 設定で「ブラウザから直接つなぐ」を選んでください',
  'This endpoint cannot be relayed. The hosted server only relays OpenRouter and OpenAI. For a local LLM, choose “Connect directly from the browser” in the AI settings');

/** 中継してよい宛先なら chat/completions の URL、だめなら null */
export function aiTarget(baseUrl) {
  let u;
  try { u = new URL(String(baseUrl)); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !AI_HOSTS.has(u.hostname)) return null;
  return `https://${u.hostname}${u.pathname.replace(/\/$/, '')}/chat/completions`;
}

const auth = (b) => (typeof b.apiKey === 'string' && b.apiKey ? { Authorization: `Bearer ${b.apiKey}` } : {});

async function relayFetch(b, url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // 転送先は確かめていないので、追いかけない
    const r = await fetch(url, { ...init, redirect: 'manual', signal: ctrl.signal });
    if (r.status >= 300 && r.status < 400) return { error: T(b, 'LLM が転送を返したので中継しなかった', 'The LLM returned a redirect, so it was not followed') };
    return { r };
  } catch (err) {
    if (err?.name === 'AbortError') return { error: T(b, 'LLM の応答が時間内に返らなかった', 'The LLM did not answer in time') };
    return { error: T(b, 'LLM に接続できなかった', 'Could not connect to the LLM') };
  } finally {
    clearTimeout(timer);
  }
}

async function aiChat(request) {
  let b;
  try { b = await readJson(request, 64 * 1024); } catch { return ng(400, 'bad json'); }
  const target = aiTarget(b?.baseUrl);
  if (!target) return ng(400, NOT_RELAYED(b));
  const body = b.body && typeof b.body === 'object' ? b.body : null;
  if (!body || typeof body.model !== 'string' || !Array.isArray(body.messages)) return ng(400, 'invalid body');
  const { r, error } = await relayFetch(b, target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(b), 'X-Title': 'Unchosen' },
    body: JSON.stringify({ model: body.model, messages: body.messages, max_tokens: Math.min(2000, Number(body.max_tokens) || 800), temperature: Number(body.temperature) || 1 }),
  }, AI_TIMEOUT_MS);
  if (error) return ng(502, error);
  const text = (await r.text()).slice(0, AI_MAX_RESPONSE);
  if (!r.ok) return ng(502, T(b, `LLM が ${r.status} を返した: `, `The LLM returned ${r.status}: `) + text.slice(0, 200));
  let j;
  try { j = JSON.parse(text); } catch { return ng(502, T(b, 'LLM の返事が読めなかった', 'Could not read the LLM response')); }
  return json(200, { success: true, data: { content: j.choices?.[0]?.message?.content ?? '' } });
}

// モデル一覧: 設定画面で接続を確かめ、モデル名を選ぶのに使う
async function aiModels(request) {
  let b;
  try { b = await readJson(request, 8192); } catch { return ng(400, 'bad json'); }
  const target = aiTarget(b?.baseUrl);
  if (!target) return ng(400, NOT_RELAYED(b));
  const { r, error } = await relayFetch(b, target.replace(/\/chat\/completions$/, '/models'), { headers: auth(b) }, 15_000);
  if (error) return ng(502, error);
  if (!r.ok) return ng(502, T(b, `モデル一覧が ${r.status} を返した`, `The model list returned ${r.status}`));
  let j;
  try { j = JSON.parse((await r.text()).slice(0, 2 * 1024 * 1024)); } catch { return ng(502, T(b, 'モデル一覧が読めなかった', 'Could not read the model list')); }
  const ids = (Array.isArray(j.data) ? j.data : []).map((x) => String(x.id)).slice(0, 500);
  return json(200, { success: true, data: { models: ids } });
}
