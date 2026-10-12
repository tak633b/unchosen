// Cloudflare 版の API (server/cf-api.mjs) を、node:sqlite で作った D1 の代わりの上で確かめる
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { aiTarget, handle, LIMITS } from './cf-api.mjs';
import { blocked } from './moderation.mjs';

const ROOT = join(import.meta.dirname, '..');

// D1 の使っている所だけを node:sqlite で
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(ROOT, 'migrations')).sort()) db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return { raw: db, prepare: (sql) => stmt(sql) };
}

const ADMIN = 'test-admin-token-0123456789';
function api(env = { ADMIN_TOKEN: ADMIN }) {
  env = { DB: fakeD1(), ...env };
  const call = async (method, path, { body, ip = '203.0.113.1', auth, now } = {}) => {
    const headers = { 'CF-Connecting-IP': ip };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = `Bearer ${auth}`;
    const r = await handle(new Request(`https://x.test${path}`, { method, headers, body: typeof body === 'string' ? body : body && JSON.stringify(body) }), env, now);
    return { status: r.status, j: await r.json() };
  };
  return { env, call };
}

const entry = (over = {}) => ({
  gen: 1, family: '', rural: true, name: '山田 花子', country: 'JPN', sex: 'F', age: 82, cause: '老衰',
  line: '静かな町で生まれ、静かに暮らした。', message: '', birthYear: 1940, job: '教師', lang: 'ja', ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('追悼館 (Cloudflare 版)', () => {
  it('health が返る', async () => {
    const { call } = api();
    expect(await call('GET', '/api/health')).toEqual({ status: 200, j: { success: true, data: { ok: true } } });
  });

  it('残して、言語ごとに新しい順で読め、ろうそくが灯る', async () => {
    const { call, env } = api();
    const a = await call('POST', '/api/memorial', { body: entry() });
    const b = await call('POST', '/api/memorial', { body: entry({ name: 'Ann', lang: 'en', gen: 3, family: 'A → B' }) });
    expect(a.status).toBe(201);
    expect(b.j.data.id).toBe(a.j.data.id + 1);
    const ja = await call('GET', '/api/memorial?lang=ja');
    expect(ja.j.data.map((r) => r.id)).toEqual([a.j.data.id]);
    // 列の名前は Node 版と同じ (クライアントはそのまま読む)
    expect(Object.keys(ja.j.data[0]).sort()).toEqual(['age', 'birthYear', 'candles', 'cause', 'country', 'createdAt', 'family', 'gen', 'id', 'job', 'line', 'message', 'name', 'rural', 'sex'].sort());
    expect(ja.j.data[0]).toMatchObject({ name: '山田 花子', rural: 1, birthYear: 1940, gen: 1 });
    expect((await call('GET', '/api/memorial?lang=en')).j.data[0]).toMatchObject({ name: 'Ann', gen: 3, family: 'A → B' });
    expect((await call('POST', `/api/memorial/${a.j.data.id}/candle`)).j).toEqual({ success: true, data: { candles: 1 } });
    expect((await call('POST', `/api/memorial/${a.j.data.id}/candle`)).j.data.candles).toBe(2);
    expect((await call('POST', '/api/memorial/999/candle')).status).toBe(404);
    // IP はそのまま残さない
    const keys = env.DB.raw.prepare('SELECT k FROM rate').all().map((r) => r.k).join(' ');
    expect(keys).not.toContain('203.0.113.1');
  });

  it('形の悪いもの・載せられない言葉は断る', async () => {
    const { call } = api();
    for (const bad of [entry({ country: 'jp' }), entry({ sex: 'Q' }), entry({ age: 121 }), entry({ cause: '' }), entry({ lang: 'fr' })]) {
      expect((await call('POST', '/api/memorial', { body: bad })).j).toEqual({ success: false, error: 'invalid entry' });
    }
    expect((await call('POST', '/api/memorial', { body: '{' })).status).toBe(400);
    expect((await call('POST', '/api/memorial', { body: entry({ line: 'x'.repeat(9000) }) })).status).toBe(413);
    for (const over of [{ message: '死ねよ' }, { name: 'fuck' }, { line: '見て https://spam.example' }]) {
      expect((await call('POST', '/api/memorial', { body: entry(over), ip: '203.0.113.9' })).j.error).toBe('blocked');
    }
    expect((await call('GET', '/api/memorial?lang=ja')).j.data).toEqual([]);
  });

  it('名前の表にある実在の名と、死を語る文は網に掛からない', () => {
    for (const s of ['Dick', 'Nazi', 'カーシーで死ねば生まれ変わりから解かれる', '死ねなかった']) expect(blocked(s)).toBe(false);
  });

  it('1つの IP から1分に送れる数には限りがある', async () => {
    const { call } = api();
    const [limit] = LIMITS.postMin;
    for (let i = 0; i < limit; i++) expect((await call('POST', '/api/memorial', { body: entry(), now: 1e12 })).status).toBe(201);
    expect((await call('POST', '/api/memorial', { body: entry(), now: 1e12 })).status).toBe(429);
    expect((await call('POST', '/api/memorial', { body: entry(), now: 1e12, ip: '198.51.100.7' })).status).toBe(201);
    expect((await call('POST', '/api/memorial', { body: entry(), now: 1e12 + 60_000 })).status).toBe(201);
  });

  it('管理者は非表示にでき、戻せる。合言葉が無い・違うときは道が無い', async () => {
    const { call } = api();
    const id = (await call('POST', '/api/memorial', { body: entry() })).j.data.id;
    expect((await call('POST', `/api/admin/memorial/${id}/hide`, { body: { hidden: true }, auth: 'wrong-token-xxxxxxxx' })).status).toBe(401);
    expect((await call('POST', `/api/admin/memorial/${id}/hide`, { body: { hidden: true }, auth: ADMIN })).j).toEqual({ success: true, data: { id, hidden: true } });
    expect((await call('GET', '/api/memorial?lang=ja')).j.data).toEqual([]);
    expect((await call('POST', `/api/memorial/${id}/candle`)).status).toBe(404);
    const all = await call('GET', '/api/admin/memorial', { auth: ADMIN });
    expect(all.j.data[0]).toMatchObject({ id, hidden: 1, lang: 'ja' });
    await call('POST', `/api/admin/memorial/${id}/hide`, { body: { hidden: false }, auth: ADMIN });
    expect((await call('GET', '/api/memorial?lang=ja')).j.data).toHaveLength(1);

    const none = api({});
    expect((await none.call('GET', '/api/admin/memorial', { auth: ADMIN })).status).toBe(404);
    const short = api({ ADMIN_TOKEN: 'short' });
    expect((await short.call('GET', '/api/admin/memorial', { auth: 'short' })).status).toBe(404);
  });
});

describe('AI の中継 (Cloudflare 版)', () => {
  it('既知の API の https だけ。手元・LAN・http・別のポートは断る', () => {
    expect(aiTarget('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(aiTarget('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions');
    for (const u of ['http://openrouter.ai/api/v1', 'http://127.0.0.1:1234/v1', 'https://192.168.1.2/v1', 'https://openrouter.ai.evil.example/v1',
      'https://user:pw@openrouter.ai/v1', 'https://openrouter.ai:8443/v1', 'not a url']) expect(aiTarget(u)).toBeNull();
  });

  it('断るときはブラウザから直接つなぐよう案内し、外へは出ない', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { call } = api();
    const body = { model: 'm', messages: [{ role: 'user', content: 'hi' }] };
    const r = await call('POST', '/api/ai/chat', { body: { baseUrl: 'http://127.0.0.1:1234/v1', body, lang: 'en' } });
    expect(r.status).toBe(400);
    expect(r.j.success).toBe(false);
    expect(r.j.error).toMatch(/directly from the browser/);
    expect((await call('POST', '/api/ai/models', { body: { baseUrl: 'http://10.0.0.5:11434/v1' } })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('OpenRouter へは中継して、中身だけを返す', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'やあ' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const { call } = api();
    const r = await call('POST', '/api/ai/chat', { body: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-test', body: { model: 'm', messages: [], max_tokens: 99999 } } });
    expect(r.j).toEqual({ success: true, data: { content: 'やあ' } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.redirect).toBe('manual');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body).max_tokens).toBe(2000);
  });
});

describe('いま遊ばれている人生 (Cloudflare 版)', () => {
  const T0 = 1.7e12;
  const life = (over = {}) => ({ id: crypto.randomUUID(), country: 'JPN', birthYear: 2026, sex: 'F', age: 0, ...over });

  it('start → beat → end。生きている数・国の数・流れ・合計・国の平均が出る', async () => {
    const { call, env } = api();
    const a = life(), b = life({ country: 'NGA', sex: 'M' }), c = life({ country: 'JPN', age: 30, birthYear: 1990 });
    expect((await call('POST', '/api/life/start', { body: a, now: T0 })).status).toBe(201);
    expect((await call('POST', '/api/life/start', { body: b, now: T0 + 1000 })).status).toBe(201);
    expect((await call('POST', '/api/life/start', { body: c, now: T0 + 2000 })).status).toBe(201);
    // 保存から続けた同じ人生の start は増やさない
    expect((await call('POST', '/api/life/start', { body: a, now: T0 + 3000 })).j).toEqual({ success: true, data: { created: false } });

    const now = await call('GET', '/api/life/now?country=JPN', { now: T0 + 5000 });
    expect(now.j.data).toMatchObject({ alive: 3, inCountry: 2, born: 2, finished: 0 });
    // 続きから始めた人生 (c, 30歳から) は「生まれた」に出ない
    expect(now.j.data.feed.map((e) => [e.kind, e.country])).toEqual([['born', 'NGA'], ['born', 'JPN']]);

    expect((await call('POST', '/api/life/beat', { body: { id: a.id, age: 3 }, now: T0 + 60_000 })).j.data.ok).toBe(true);
    expect((await call('POST', '/api/life/end', { body: { id: b.id, age: 0 }, now: T0 + 70_000 })).j.data.ok).toBe(true);
    // 2度目の end は数えない
    expect((await call('POST', '/api/life/end', { body: { id: b.id, age: 9 }, now: T0 + 71_000 })).j.data.ok).toBe(false);
    expect((await call('POST', '/api/life/end', { body: { id: a.id, age: 71 }, now: T0 + 80_000 })).status).toBe(200);
    const after = await call('GET', '/api/life/now', { now: T0 + 90_000 });
    expect(after.j.data).toMatchObject({ alive: 1, inCountry: null, born: 2, finished: 2 });
    expect(after.j.data.feed.slice(0, 2)).toEqual([{ kind: 'died', country: 'JPN', age: 71, at: T0 + 80_000 }, { kind: 'died', country: 'NGA', age: 0, at: T0 + 70_000 }]);
    expect((await call('GET', '/api/life/stats?country=JPN')).j.data).toEqual({ n: 1, avgAge: 71 });
    expect((await call('GET', '/api/life/stats?country=FRA')).j.data).toEqual({ n: 0, avgAge: null });
    // 残すのは人生のことだけ
    const cols = env.DB.raw.prepare('PRAGMA table_info(life)').all().map((r) => r.name);
    expect(cols).toEqual(['id', 'country', 'birth_year', 'sex', 'age', 'start_age', 'started_at', 'last_seen', 'ended_at', 'death_age']);
  });

  it('便りが15分ない人生は「いま」から外れ、beat で戻る', async () => {
    const { call } = api();
    const a = life();
    await call('POST', '/api/life/start', { body: a, now: T0 });
    expect((await call('GET', '/api/life/now', { now: T0 + 14 * 60_000 })).j.data.alive).toBe(1);
    expect((await call('GET', '/api/life/now', { now: T0 + 16 * 60_000 })).j.data.alive).toBe(0);
    await call('POST', '/api/life/beat', { body: { id: a.id, age: 1 }, now: T0 + 17 * 60_000 });
    expect((await call('GET', '/api/life/now', { now: T0 + 18 * 60_000 })).j.data.alive).toBe(1);
  });

  it('詰めて来た beat は書かず、知らない id は 404。now は短く貯めてよい', async () => {
    const { call, env } = api();
    const a = life();
    await call('POST', '/api/life/start', { body: a, now: T0 });
    expect((await call('POST', '/api/life/beat', { body: { id: a.id, age: 5 }, now: T0 + 10_000 })).j.data.ok).toBe(false);
    expect(env.DB.raw.prepare('SELECT age, last_seen FROM life').get()).toEqual({ age: 0, last_seen: T0 });
    expect((await call('POST', '/api/life/beat', { body: { id: crypto.randomUUID(), age: 5 } })).status).toBe(404);
    expect((await call('POST', '/api/life/end', { body: { id: crypto.randomUUID(), age: 5 } })).status).toBe(404);
    const r = await handle(new Request('https://x.test/api/life/now'), env, T0);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=15');
  });

  it('形の悪いものは断る', async () => {
    const { call } = api();
    for (const bad of [life({ id: 'abc' }), life({ country: 'jp' }), life({ sex: 'Q' }), life({ age: -1 }), life({ age: 131 }), life({ age: 1.5 }), life({ birthYear: '2000' }), life({ birthYear: 1700 })]) {
      expect((await call('POST', '/api/life/start', { body: bad })).j).toEqual({ success: false, error: 'invalid life' });
    }
    expect((await call('POST', '/api/life/beat', { body: { id: crypto.randomUUID(), age: 'x' } })).status).toBe(400);
    expect((await call('POST', '/api/life/start', { body: '{' })).status).toBe(400);
    expect((await call('POST', '/api/life/start', { body: { ...life(), pad: 'x'.repeat(2000) } })).status).toBe(413);
    expect((await call('GET', '/api/life/stats?country=jp')).status).toBe(400);
    expect((await call('GET', '/api/life/nope')).status).toBe(404);
  });

  it('1つの IP から1分に始められる人生には限りがある', async () => {
    const { call } = api();
    const [limit] = LIMITS.lifeMin;
    for (let i = 0; i < limit; i++) expect((await call('POST', '/api/life/start', { body: life(), now: 1e12 })).status).toBe(201);
    expect((await call('POST', '/api/life/start', { body: life(), now: 1e12 })).status).toBe(429);
    expect((await call('POST', '/api/life/start', { body: life(), now: 1e12, ip: '198.51.100.7' })).status).toBe(201);
  });
});
