// AI の返事を検める。形が違うもの・長すぎるもの・範囲外の数字は捨てるか丸めてから、人生に反映する。
import { scaleOf } from '../engine/events/common';
import { circle, people, shared } from '../engine/bonds';
import { bump, decide, log, type Person, type Relative, type Stats, type Tie } from '../engine/person';
import { clamp } from '../engine/rng';
import { isEn } from '../i18n';

// 英語は同じ内容でも日本語の2倍ほどの文字数になる
const WIDE = isEn ? 2 : 1;
const MAX_TEXT = 160 * WIDE;
const EFFECT = 10;
const MONEY_MIN = -0.5;
const MONEY_MAX = 0.3;
// 生死や人生の骨格を勝手に変える言葉が入った文は使わない (シミュレーションが決めることなので)
const FORBIDDEN = /亡くな|死ん|死亡|自殺|自死|離婚|結婚し|妊娠|出産|生まれた|移住|引っ越|転勤|転居|がんと|診断され|\b(?:died|dies|dead|death|passed away|killed|suicide|marri(?:ed|age)|wedding|divorc\w*|pregnan\w*|gave birth|was born|(?:e|im)migrat\w*|moved (?:to|away|out|house|in)|relocat\w*|transferred|diagnos\w*)\b/i;

// 人との場面の種類と、その人との近さの変化。数値は AI に決めさせず、種類だけ選ばせてこの表で決める
export const TONES = { warm: 3, help: 4, reunion: 5, reconcile: 6, worry: 1, distant: -3, quarrel: -5, hurt: -6 } as const;
export type Tone = keyof typeof TONES;
const tone = (v: unknown): Tone | null => (typeof v === 'string' && Object.hasOwn(TONES, v) ? (v as Tone) : null);
// 一緒に暮らしていない人との同居の書き方
const LIVE_WITH = /一緒に暮ら|同居|住み込|\b(?:liv(?:e|es|ed|ing) (?:together|with)|moved in)\b/i;

// その年に場面を頼む相手。dead は亡くなった人の呼び名 (生きているように書かせない)
export interface BondAsk { t: Tie; why: 'moved' | 'long' | 'old' | 'lost' | 'close'; scene: boolean; decision: boolean; household: boolean; dead: string[] }

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 英字の名前は単語として、それ以外は文字列として探す
const mentions = (t: string, n: string) => (/^[\x20-\x7e]+$/.test(n) ? new RegExp(`\\b${escRe(n)}\\b`, 'i').test(t) : t.includes(n));
const fits = (t: string | null, b: Pick<BondAsk, 'dead' | 'household'>, scene = false): string | null =>
  t && !b.dead.some((n) => n && mentions(t, n)) && !(scene && !b.household && LIVE_WITH.test(t)) ? t : null;

export function deadNames(p: Person): string[] {
  const ts = people(p).filter((t) => !t.alive);
  return [...ts.map((t) => t.name ?? ''), ...ts.filter((t) => t.role === 'mother' || t.role === 'father').flatMap((t) => (t.role === 'mother' ? ['母', 'mother'] : ['父', 'father']))].filter(Boolean);
}
// 主人公と同じ家にいると考えてよい人
export const household = (p: Person, t: Tie) =>
  t.role === 'spouse' || (t.role === 'child' && t.age < 18) || ((t.role === 'mother' || t.role === 'father' || t.role === 'sibling') && p.age < 18);

export interface AiEffects { health?: number; happy?: number; bond?: number; learn?: number }
export interface AiOption { label: string; hint?: string; result: string; effects: AiEffects; money: number; d?: number }
export interface AiYear {
  moments: string[];
  event?: { text: string; effects: AiEffects; money: number };
  decision?: { title: string; text: string; options: AiOption[]; who?: number };
  scene?: { who: number; text: string; tone: Tone; d: number };
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
export function sanitizeYear(raw: unknown, ask: { event: boolean; decision: boolean; bond?: BondAsk } = { event: true, decision: true }): AiYear {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const moments = (Array.isArray(o.moments) ? o.moments : [])
    .map((m) => safe(str(typeof m === 'string' ? m : (m as { text?: unknown })?.text)))
    .filter((t): t is string => !!t)
    .slice(0, 3);
  const out: AiYear = { moments };
  const ev = o.event as Record<string, unknown> | undefined;
  const evText = ev && safe(str(ev.text));
  if (evText && ask.event) out.event = { text: evText, effects: effects(ev!.effects), money: money(ev!.money) };
  const b = ask.bond;
  const sc = o.scene as Record<string, unknown> | undefined;
  const scText = b?.scene && sc ? fits(safe(str(sc.text)), b, true) : null;
  const scTone = sc && tone(sc.tone);
  if (b && scText && scTone) out.scene = { who: b.t.id!, text: scText, tone: scTone, d: TONES[scTone] };
  const d = o.decision as Record<string, unknown> | undefined;
  const bondDecision = !ask.decision && !!b?.decision;
  // 人が関わる決断では、その人との近さを表の値で、ほかは幸福とお金だけを動かす
  const ok = (t: string | null) => (bondDecision ? fits(t, b!) : t);
  if (d && (ask.decision || bondDecision)) {
    const title = ok(safe(str(d.title, 30 * WIDE)));
    const text = ok(safe(str(d.text)));
    const options = (Array.isArray(d.options) ? d.options : []).map((x): AiOption | null => {
      const op = (x ?? {}) as Record<string, unknown>;
      const label = ok(safe(str(op.label, 30 * WIDE)));
      const result = ok(safe(str(op.result)));
      if (!label || !result) return null;
      const hint = ok(safe(str(op.hint, 40 * WIDE))) ?? undefined;
      if (!bondDecision) return { label, hint, result, effects: effects(op.effects), money: money(op.money) };
      const tn = tone(op.tone);
      const happy = effects(op.effects).happy;
      // money を effects の中に入れてくるモデルがある
      const m = op.money ?? (op.effects as Record<string, unknown> | undefined)?.money;
      return tn ? { label, hint, result, effects: happy ? { happy } : {}, money: money(m), d: TONES[tn] } : null;
    }).filter((x): x is AiOption => !!x).slice(0, 3);
    if (title && text && options.length >= 2) out.decision = { title, text, options, ...(bondDecision ? { who: b!.t.id! } : {}) };
  }
  return out;
}

const applyEffects = (p: Person, e: AiEffects, m: number) => {
  bump(p, e as Partial<Stats>);
  // 子どものうちのお金の出来事は親の家計の話なので、本人の財布は動かさない
  if (m && (p.working || p.retired)) p.wealth += scaleOf(p) * m;
};

const markAi = (p: Person) => { p.log[p.log.length - 1].ai = true; };
// 場面の相手を本物の参照で引く。届くまでの1年で亡くなった・離れた人なら使わない
function partner(p: Person, id: number, lost = false): [Relative | Tie, Tie] | null {
  const hit = circle(p).find(([r]) => r.id === id);
  const t = people(p).find((x) => x.id === id);
  return hit && t && hit[0].alive && (lost || (hit[0] as Tie).until === undefined) ? [hit[0], t] : null;
}

// AI が作ったものだと分かるよう、記録には印を付ける
export function applyYear(p: Person, y: AiYear): void {
  const dead = deadNames(p);
  const sp = y.scene && partner(p, y.scene.who);
  if (y.scene && sp && fits(y.scene.text, { dead, household: household(p, sp[1]) }, true)) {
    shared(p, [sp[0]], y.scene.text, p.kinds[p.age] ?? 'family', y.scene.d);
    markAi(p);
  }
  for (const t of y.moments) p.log.push({ age: p.age, text: t, kind: p.kinds[p.age] ?? 'family', ai: true });
  if (y.event) {
    applyEffects(p, y.event.effects, y.event.money);
    const bad = (y.event.effects.health ?? 0) + (y.event.effects.happy ?? 0) < -6 || y.event.money < -0.1;
    log(p, y.event.text, bad ? 'hard' : p.kinds[p.age] ?? 'family');
    markAi(p);
  }
  const dp = y.decision?.who !== undefined ? partner(p, y.decision.who, true) : null;
  if (y.decision && (y.decision.who === undefined || (dp && fits(y.decision.text, { dead, household: true })))) {
    const d = y.decision;
    decide(p, {
      title: d.title,
      text: d.text,
      options: d.options.map((o) => ({
        label: o.label,
        hint: o.hint,
        apply: (q: Person) => {
          applyEffects(q, o.effects, o.money);
          const r = dp && circle(q).find(([x]) => x.id === dp[1].id)?.[0];
          if (!r) { q.log.push({ age: q.age, text: o.result, kind: q.kinds[q.age] ?? 'family', ai: true }); return; }
          shared(q, [r], o.result, q.kinds[q.age] ?? 'family', o.d ?? 0);
          markAi(q);
          // 疎遠だった人とまた行き来するようになった
          if ((o.d ?? 0) > 0) (r as Tie).until = undefined;
        },
      })),
      auto: (q) => Math.floor(q.rng() * d.options.length),
    });
  }
}

// 名前の子音の骨組み。Ahmad とアハマドはどちらも HMT になる (カタカナに直しただけの名前を許すため)
const KANA_ROWS: [string, string][] = [['K', 'カキクケコガギグゲゴ'], ['S', 'サシスセソザジズゼゾチツヂヅ'], ['T', 'タテトダデド'], ['N', 'ナニヌネノン'], ['H', 'ハヒフヘホ'], ['B', 'バビブベボパピプペポヴ'], ['M', 'マミムメモ'], ['R', 'ラリルレロ']];
const LATIN: Record<string, string> = { k: 'K', g: 'K', q: 'K', x: 'K', s: 'S', z: 'S', j: 'S', t: 'T', d: 'T', n: 'N', m: 'M', h: 'H', f: 'H', b: 'B', v: 'B', p: 'B', r: 'R', l: 'R' };
const squeeze = (cs: string[]) => cs.filter((c, i) => c && c !== cs[i - 1]).join('');
const kanaBones = (w: string) => squeeze([...w].map((ch) => KANA_ROWS.find(([, row]) => row.includes(ch))?.[0] ?? ''));
const latinBones = (w: string) =>
  squeeze([...w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ch|sh|ts/g, 's').replace(/ph/g, 'f').replace(/th/g, 't').replace(/([^aeiouh])h/g, '$1').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k')].map((ch) => LATIN[ch] ?? ''));

// 最後の言葉に、渡した出来事 (known) に無い数字・カタカナ語・英語の固有名詞が出てきたら作り話とみなす
function invented(t: string, known: string): boolean {
  const k = known.toLowerCase();
  const names = new Set((known.match(/[A-Za-zÀ-ÿ]{2,}/g) ?? []).map(latinBones).filter((b) => b.length >= 2));
  const nums = t.match(/\d+/g) ?? [];
  const kana = t.match(/[ァ-ヴ][ァ-ヴー]+/g) ?? [];
  // 文頭以外の大文字で始まる語 (I は除く)
  const caps = t.split(/(?<=[.!?])\s+/).flatMap((s) => s.split(/\s+/).slice(1)).map((w) => w.replace(/[^A-Za-z'-]/g, '')).filter((w) => /^[A-Z][a-z]/.test(w));
  return [...nums, ...kana.filter((w) => !names.has(kanaBones(w))), ...caps].some((w) => !k.includes(w.toLowerCase()));
}

export function sanitizeWords(raw: unknown, ids: number[], known: string): Map<number, string> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = new Map<number, string>();
  for (const w of Array.isArray(o.words) ? o.words : []) {
    const x = (w ?? {}) as Record<string, unknown>;
    const id = Number(x.id);
    const t = str(x.text, 120 * WIDE);
    if (ids.includes(id) && !out.has(id) && t && !invented(t, known)) out.set(id, t);
  }
  return out;
}
