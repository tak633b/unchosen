// いま、ほかの本物のプレイヤーが生きている人生 (/api/life/*)。送るのは遊んでいる人生の国・生まれた年・性別・年齢だけ。
// 同じ1秒の4人や家族は送らない。API が無い所 (GitHub Pages・オフライン・404) では黙って何も出さない。
import { COUNTRIES } from '../engine/countries';
import { genderOf, type Person } from '../engine/person';
import { isEn, L } from '../i18n';
import { esc } from './dom';

interface FeedItem { kind: 'born' | 'died'; country: string; age: number; at: number }
export interface LifeNow { alive: number; inCountry: number | null; feed: FeedItem[]; born: number; finished: number; now: number }

const BEAT_MS = 60_000;      // 便りは1分に1度まで
const KEEP_MS = 5 * 60_000;  // 年が変わらなくても (止めている間も)、この間隔で生きていると伝える
const MIN_STATS = 5;         // 国の平均は、これだけ人生が終わってから出す

let off = false; // API が無いと分かったら、読み込み直すまで呼ばない

async function call<T>(path: string, body?: unknown): Promise<{ status: number; data?: T } | null> {
  if (off) return null;
  try {
    const r = await fetch(path, body === undefined ? undefined
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
    const j = await r.json(); // 静的なホストの 404 は HTML なので、ここで落ちる
    return { status: r.status, data: j.success ? (j.data as T) : undefined };
  } catch {
    off = true;
    return null;
  }
}

export const newLifeId = (): string => (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : '');

const lifeOf = (id: string, p: Person) => ({ id, country: p.birthCountry, birthYear: p.birthYear, sex: genderOf(p), age: p.age });

/** この人生の便り。id は保存データと一緒に持つ。last は前に送った時刻と年齢 */
export interface Beat { id: string; at: number; age: number }

export function lifeStart(b: Beat, p: Person, resumed: boolean): void {
  if (!b.id) return;
  b.at = Date.now();
  b.age = p.age;
  // 保存から続けるときは同じ id。サーバが知らなければ (404) 始めから届け直す
  if (resumed) void call('/api/life/beat', { id: b.id, age: p.age }).then((r) => { if (r?.status === 404) void call('/api/life/start', lifeOf(b.id, p)); });
  else void call('/api/life/start', lifeOf(b.id, p));
}

export function lifeBeat(b: Beat, p: Person): void {
  const now = Date.now();
  if (!b.id || now - b.at < BEAT_MS || (p.age === b.age && now - b.at < KEEP_MS)) return;
  b.at = now;
  b.age = p.age;
  void call('/api/life/beat', { id: b.id, age: p.age }).then((r) => { if (r?.status === 404) void call('/api/life/start', lifeOf(b.id, p)); });
}

export function lifeEnd(b: Beat, p: Person): void {
  if (b.id) void call('/api/life/end', { id: b.id, age: p.age });
}

export const lifeNow = async (country?: string): Promise<LifeNow | null> =>
  (await call<LifeNow>(`/api/life/now${country ? `?country=${country}` : ''}`))?.data ?? null;

const nameOf = (code: string) => COUNTRIES.find((c) => c.code === code)?.name;
const num = (n: number) => n.toLocaleString(isEn ? 'en-US' : 'ja-JP');

// 人生の画面の1行。自分も数に入っているので、ほかの人は1を引く
export function presenceLine(d: LifeNow, country: string): string {
  const others = Math.max(0, d.alive - 1);
  const here = Math.max(0, (d.inCountry ?? 1) - 1);
  const c = esc(nameOf(country) ?? country);
  if (!others) return L('いま、このシミュレーションの中で生きているのは、あなただけだ。', 'Right now, you are the only one alive in this simulation.');
  return L(`いま、このシミュレーションの中で、あなたのほかに${num(others)}人が生きている。`, `Right now, ${num(others)} other ${others === 1 ? 'person is' : 'people are'} alive in this simulation. `)
    + (here
      ? L(`${c}に生まれたのは、あなたのほかに${num(here)}人。`, `${num(here)} of them ${here === 1 ? 'was' : 'were'} born in ${c}.`)
      : L(`${c}に生まれたのは、あなただけ。`, `You are the only one born in ${c}.`));
}

function ago(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return L('たった今', 'just now');
  if (m < 60) return L(`${m}分前`, `${m} min ago`);
  const h = Math.floor(m / 60);
  return h < 24 ? L(`${h}時間前`, `${h} h ago`) : L(`${Math.floor(h / 24)}日前`, `${Math.floor(h / 24)} d ago`);
}

function feedLine(e: FeedItem): string {
  const c = esc(nameOf(e.country) ?? e.country);
  if (e.kind === 'born') return L(`${c}で、誰かが生まれた`, `Someone was born in ${c}`);
  if (e.age === 0) return L(`${c}で、誰かが1歳の誕生日を迎えずに亡くなった`, `In ${c}, someone died before their first birthday`);
  return L(`${c}で、誰かが${e.age}歳で一生を終えた`, `In ${c}, someone’s life ended at ${e.age}`);
}

// トップの「いま、この中で」
export function presenceHome(d: LifeNow): string {
  const head = d.alive
    ? L(`いま、このシミュレーションの中で${num(d.alive)}人が生きている。`, `Right now, ${num(d.alive)} ${d.alive === 1 ? 'person is' : 'people are'} alive in this simulation.`)
    : L('いまは静かだ。今日ここで次に生まれるのは、あなたかもしれない。', 'It is quiet right now. The next one born here could be you.');
  const feed = d.feed.filter((e) => nameOf(e.country));
  return `<p class="lead presencehead">${head}</p>
    ${feed.length ? `<ul class="lifefeed">${feed.map((e) => `<li><span>${feedLine(e)}</span><small>${ago(d.now - e.at)}</small></li>`).join('')}</ul>` : ''}
    ${d.born || d.finished ? `<p class="note">${L(`ここではこれまでに${num(d.born)}人が生まれ、${num(d.finished)}人が一生を最後まで生きた。`, `So far, ${num(d.born)} ${d.born === 1 ? 'life has' : 'lives have'} begun here, and ${num(d.finished)} ${d.finished === 1 ? 'has' : 'have'} been lived to the end.`)}</p>` : ''}`;
}

// 死亡記録の1行: この中でその国に生まれて一生を終えた人の平均。少なければ出さない
export async function countryAverage(country: string): Promise<string> {
  const d = (await call<{ n: number; avgAge: number | null }>(`/api/life/stats?country=${country}`))?.data;
  const c = COUNTRIES.find((x) => x.code === country);
  if (!d || !c || d.n < MIN_STATS || d.avgAge === null) return '';
  const real = ((c.leF + c.leM) / 2).toFixed(1);
  return L(`このシミュレーションで${esc(c.name)}に生まれ、一生を終えた${num(d.n)}人は、平均${d.avgAge.toFixed(1)}歳まで生きた(実際の平均寿命は${real}歳)。`,
    `The ${num(d.n)} people who were born in ${esc(c.name)} in this simulation and have finished their lives lived to ${d.avgAge.toFixed(1)} on average (real life expectancy: ${real}).`);
}
