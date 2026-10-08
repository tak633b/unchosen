// ゲームの進行に AI を差し込む。翌年の分を先に頼んでおき、間に合った年だけ使う。
import { callName, closest, people } from '../engine/bonds';
import { byCode } from '../engine/countries';
import type { Person, Role, Tie } from '../engine/person';
import { applyYear, deadNames, household, sanitizeWords, sanitizeYear, type AiYear, type BondAsk } from './apply';
import { chat, parseJson } from './client';
import { othersPrompt, storyPrompt, wordsPrompt, yearPrompt } from './prompts';
import { aiOn } from './settings';
import { lastWords, type LastWord } from './words';
export { lastWords, type LastWord };
import { isEn, L } from '../i18n';

const EVENT_RATE = 0.25;    // 予想外の出来事を頼む年の割合
const DECISION_RATE = 0.3;  // その場かぎりの決断を頼む年の割合
const OTHERS_EVERY = 5;     // 同じ1秒の人たちの近況を書き直す間隔 (年)
const MAX_INFLIGHT = 2;
const SCENE_RATE = 0.35;         // 人との場面を頼む年の割合
const BOND_DECISION_SHARE = 0.5; // 決断を頼む年のうち、人が関わる決断にする割合     // 同時に待つ問い合わせの上限。速く進めている時は間に合わない年を飛ばす

const ready = new Map<number, AiYear>();  // 年齢 → 届いた1年分
const asked = new Set<number>();
let othersLines: string[] = [];
let othersAt = -99;
let lastError = '';
let inflight = 0;

async function call<T>(f: () => Promise<T>): Promise<T> {
  inflight++;
  try { return await f(); } finally { inflight--; }
}

export const aiStatus = () => ({ waiting: inflight, error: lastError });
export const aiOthersLines = () => othersLines;

export function resetAi(): void {
  ready.clear();
  asked.clear();
  othersLines = [];
  othersAt = -99;
  lastError = '';
}

// 新しい年を迎えたら呼ぶ。この年に届いている分を反映し、来年の分を頼んでおく
export function onYear(p: Person, others: Person[]): boolean {
  let used = false;
  const y = ready.get(p.age);
  if (y) {
    applyYear(p, y);
    ready.delete(p.age);
    used = true;
  }
  if (p.alive && p.age >= 1 && aiOn('events')) prefetch(p);
  if (aiOn('others') && p.age - othersAt >= OTHERS_EVERY && inflight < MAX_INFLIGHT) {
    othersAt = p.age;
    void call(() => chat(othersPrompt(others), { maxTokens: 400 }))
      .then((t) => {
        const j = parseJson(t) as { lines?: unknown[] };
        if (Array.isArray(j.lines)) othersLines = j.lines.map((l) => String(l).slice(0, isEn ? 80 : 40));
      })
      .catch((e: unknown) => { lastError = String(e); });
  }
  return used;
}

// 1年後のその人はまだ分からないので、今の姿をもとに「来年」を頼む
function prefetch(p: Person): void {
  const next = p.age + 1;
  if (asked.has(next) || inflight >= MAX_INFLIGHT) return;
  asked.add(next);
  const ask = {
    moments: 1 + (p.rng() < 0.5 ? 1 : 0),
    event: p.rng() < EVENT_RATE,
    decision: aiOn('decisions') && p.age >= 6 && p.rng() < DECISION_RATE,
    bond: undefined as BondAsk | undefined,
  };
  // 人選びは Math.random で。p.rng を余計に引くと、同じ seed の人生が AI の有無で変わる
  const pick = p.age >= 4 ? pickBond(p) : null;
  if (pick) {
    const decision = ask.decision && p.age >= 12 && Math.random() < BOND_DECISION_SHARE;
    const scene = pick.why !== 'lost' && Math.random() < SCENE_RATE;
    if (decision || scene) {
      ask.decision &&= !decision;
      ask.bond = { ...pick, scene, decision, household: household(p, pick.t), dead: deadNames(p) };
    }
  }
  const snapshot = { ...p, age: next };
  void call(() => chat(yearPrompt(snapshot, ask)))
    .then((t) => { ready.set(next, sanitizeYear(parseJson(t), ask)); lastError = ''; })
    .catch((e: unknown) => { lastError = String(e); asked.delete(next); });
}

// その年に場面を頼む相手: この1年で近さが大きく動いた人、久しく過ごしていない人、年老いた親、疎遠の友人、近い人
export function pickBond(p: Person): { t: Tie; why: BondAsk['why'] } | null {
  const scored = people(p).filter((t) => t.alive && t.age >= 0 && t.role !== 'ex' && t.name).map((t) => {
    const mem = t.mem ?? [];
    const moved = mem.filter((m) => m.age >= p.age - 1).reduce((s, m) => s + Math.abs(m.d), 0);
    const last = mem.length ? mem[mem.length - 1].age : t.since;
    const [why, score]: [BondAsk['why'], number] =
      t.until !== undefined ? (t.role === 'friend' ? ['lost', 3] : ['lost', -1])
      : moved >= 5 ? ['moved', 4 + moved / 3]
      : (t.role === 'mother' || t.role === 'father') && t.age >= 70 ? ['old', 5 + (t.age - 70) / 3]
      : p.age - last >= 6 ? ['long', 4]
      : ['close', (t.bond ?? 0) / 25];
    return { t, why, score: score + Math.random() * 3 };
  }).filter((x) => x.score > 0);
  if (!scored.length) return null;
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  return { t: best.t, why: best.why };
}

// AI の最後の言葉。書けなかった人、mem に無い話を作った人の分は lastWords の言葉で埋める
export async function lastWordsAi(p: Person): Promise<LastWord[]> {
  const base = lastWords(p);
  if (!aiOn('story') || !base.length) return base;
  const ts = closest(p, 3);
  const c = byCode(p.country);
  const known = [p.name, p.given, p.city ?? '', c.name, byCode(p.birthCountry).name, String(p.age),
    ...people(p).flatMap((t) => [t.name ?? '', callName(t, t.role)]),
    ...ts.flatMap((t) => [String(t.age), String(t.since), ...(t.mem ?? []).flatMap((m) => [String(m.age), m.text])])].join('\n');
  try {
    const got = sanitizeWords(parseJson(await chat(wordsPrompt(p, ts), { maxTokens: 900, temperature: 0.8 })), ts.map((t) => t.id!), known);
    return base.map((w) => (got.has(w.id) ? { ...w, text: got.get(w.id)!, ai: true } : w));
  } catch (e) {
    lastError = String(e);
    return base;
  }
}

export async function lifeStoryAi(p: Person): Promise<{ title: string; story: string } | null> {
  if (!aiOn('story')) return null;
  try {
    const j = parseJson(await chat(storyPrompt(p), { maxTokens: 1500, temperature: 0.9 })) as { title?: unknown; story?: unknown };
    const story = typeof j.story === 'string' ? j.story.slice(0, isEn ? 4000 : 2400) : '';
    return story ? { title: typeof j.title === 'string' ? j.title.slice(0, isEn ? 60 : 30) : '', story } : null;
  } catch (e) {
    lastError = String(e);
    return null;
  }
}
