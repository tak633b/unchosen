// AI の返事を検める。形が違うもの・長すぎるもの・範囲外の数字は捨てるか丸めてから、人生に反映する。
import { scaleOf } from '../engine/events/common';
import { bump, decide, log, type Person, type Stats } from '../engine/person';
import { clamp } from '../engine/rng';

const MAX_TEXT = 160;
const EFFECT = 10;
const MONEY_MIN = -0.5;
const MONEY_MAX = 0.3;
// 生死や人生の骨格を勝手に変える言葉が入った文は使わない (シミュレーションが決めることなので)
const FORBIDDEN = /亡くな|死ん|死亡|自殺|自死|離婚|結婚し|妊娠|出産|生まれた|移住|引っ越|転勤|転居|がんと|診断され/;

export interface AiEffects { health?: number; happy?: number; bond?: number; learn?: number }
export interface AiOption { label: string; hint?: string; result: string; effects: AiEffects; money: number }
export interface AiYear {
  moments: string[];
  event?: { text: string; effects: AiEffects; money: number };
  decision?: { title: string; text: string; options: AiOption[] };
}

const str = (v: unknown, max = MAX_TEXT): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f]/g, ' ').trim();
  return t && t.length <= max * 1.5 ? t.slice(0, max) : null;
};
const safe = (t: string | null) => (t && !FORBIDDEN.test(t) ? t : null);

function effects(v: unknown): AiEffects {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: AiEffects = {};
  for (const k of ['health', 'happy', 'bond', 'learn'] as const) {
    const n = Number(o[k]);
    if (Number.isFinite(n) && n !== 0) out[k] = Math.round(clamp(n, -EFFECT, EFFECT));
  }
  return out;
}
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, MONEY_MIN, MONEY_MAX) : 0; };

// 頼んでいないもの (決断・予想外の出来事) が返ってきても使わない
export function sanitizeYear(raw: unknown, ask: { event: boolean; decision: boolean } = { event: true, decision: true }): AiYear {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const moments = (Array.isArray(o.moments) ? o.moments : [])
    .map((m) => safe(str(typeof m === 'string' ? m : (m as { text?: unknown })?.text)))
    .filter((t): t is string => !!t)
    .slice(0, 3);
  const out: AiYear = { moments };
  const ev = o.event as Record<string, unknown> | undefined;
  const evText = ev && safe(str(ev.text));
  if (evText && ask.event) out.event = { text: evText, effects: effects(ev!.effects), money: money(ev!.money) };
  const d = o.decision as Record<string, unknown> | undefined;
  if (d && ask.decision) {
    const title = safe(str(d.title, 30));
    const text = safe(str(d.text));
    const options = (Array.isArray(d.options) ? d.options : []).map((x): AiOption | null => {
      const op = (x ?? {}) as Record<string, unknown>;
      const label = safe(str(op.label, 30));
      const result = safe(str(op.result));
      if (!label || !result) return null;
      return { label, hint: safe(str(op.hint, 40)) ?? undefined, result, effects: effects(op.effects), money: money(op.money) };
    }).filter((x): x is AiOption => !!x).slice(0, 3);
    if (title && text && options.length >= 2) out.decision = { title, text, options };
  }
  return out;
}

const applyEffects = (p: Person, e: AiEffects, m: number) => {
  bump(p, e as Partial<Stats>);
  // 子どものうちのお金の出来事は親の家計の話なので、本人の財布は動かさない
  if (m && (p.working || p.retired)) p.wealth += scaleOf(p) * m;
};

// AI が作ったものだと分かるよう、記録には印を付ける
export function applyYear(p: Person, y: AiYear): void {
  for (const t of y.moments) p.log.push({ age: p.age, text: t, kind: p.kinds[p.age] ?? 'family', ai: true });
  if (y.event) {
    applyEffects(p, y.event.effects, y.event.money);
    const bad = (y.event.effects.health ?? 0) + (y.event.effects.happy ?? 0) < -6 || y.event.money < -0.1;
    log(p, y.event.text, bad ? 'hard' : p.kinds[p.age] ?? 'family');
    p.log[p.log.length - 1].ai = true;
  }
  if (y.decision) {
    const d = y.decision;
    decide(p, {
      title: d.title,
      text: d.text,
      options: d.options.map((o) => ({
        label: o.label,
        hint: o.hint,
        apply: (q: Person) => {
          applyEffects(q, o.effects, o.money);
          q.log.push({ age: q.age, text: o.result, kind: q.kinds[q.age] ?? 'family', ai: true });
        },
      })),
      auto: (q) => Math.floor(q.rng() * d.options.length),
    });
  }
}
