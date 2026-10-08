// ゲームの進行に AI を差し込む。翌年の分を先に頼んでおき、間に合った年だけ使う。
import type { Person } from '../engine/person';
import { applyYear, sanitizeYear, type AiYear } from './apply';
import { chat, parseJson } from './client';
import { othersPrompt, storyPrompt, yearPrompt } from './prompts';
import { aiOn } from './settings';
import { isEn } from '../i18n';

const EVENT_RATE = 0.25;    // 予想外の出来事を頼む年の割合
const DECISION_RATE = 0.3;  // その場かぎりの決断を頼む年の割合
const OTHERS_EVERY = 5;     // 同じ1秒の人たちの近況を書き直す間隔 (年)
const MAX_INFLIGHT = 2;     // 同時に待つ問い合わせの上限。速く進めている時は間に合わない年を飛ばす

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
  };
  const snapshot = { ...p, age: next };
  void call(() => chat(yearPrompt(snapshot, ask)))
    .then((t) => { ready.set(next, sanitizeYear(parseJson(t), ask)); lastError = ''; })
    .catch((e: unknown) => { lastError = String(e); asked.delete(next); });
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
