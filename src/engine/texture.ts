// この人生の手ざわり: 大人になってからの1年ずつが、4つの組のどちらへ傾いたか。
// 0 そば(-)・仕事(+) / 1 根(-)・風(+) / 2 凪(-)・波(+) / 3 今日(-)・明日(+)。どちらがよいということはない
import { autoHook, type Decision, type Focus, type Person } from './person';
import { fromSaved, toSaved } from './life';

export type Vec = [number, number, number, number];
// y: 年齢ごとの生の値 (18歳から)。job・w・c は前の年の仕事・財産・国 (変わった年を数えるため)
export interface TexAcc { y: (Vec | null)[]; job?: string; w?: number; c?: string }
// 前世の記録に残す分。z は組ごとの傾き (0 を挟んで、絶対値が大きいほどはっきり)。early/late は前半と後半
export interface Texture { z: Vec; early?: Vec; late?: Vec; displaced?: boolean; want?: Vec }

export const ADULT = 18;
const HARD = new Set(['hard', 'ill', 'loss']);

// その年の生の値。acc は前の年の状態 (選択肢を試すときは同じ acc で前と後を比べる)
export function yearVec(p: Person, acc: TexAcc): Vec {
  const now = p.log.filter((e) => e.age === p.age);
  const n = (f: (k: string, big?: boolean) => boolean) => now.filter((e) => f(e.kind, e.big)).length;
  const kids = p.children.filter((k) => k.alive && k.age < 18).length;
  const studying = p.school.enrolled || p.school.uni === 'studying' || p.school.grad === 'studying';
  const atWork = p.working && !p.retired && !p.homemaker;
  const work = (atWork ? 1 : 0) + (p.business ? 0.3 : 0) + (p.focus === 'work' ? 0.15 : p.focus === 'family' ? -0.15 : 0)
    - (p.spouse?.alive ? 0.4 : 0) - (p.dating ? 0.2 : 0) - Math.min(3, kids) * 0.25 - (p.homemaker || p.retired ? 0.6 : 0)
    + 0.15 * n((k) => k === 'work') - 0.15 * n((k) => k === 'family' || k === 'love');
  const wind = 2 * n((k, big) => k === 'move' && !!big) + (p.country !== p.birthCountry ? 0.4 : 0)
    + (acc.job && p.job && p.job !== acc.job ? 0.8 : 0) + (studying && p.school.abroad ? 0.5 : 0)
    - (p.house || p.mortgage ? 0.3 : 0) - (p.jobYears >= 10 ? 0.3 : 0);
  const kind = p.kinds[p.age];
  const wave = (kind && HARD.has(kind) ? 1 : 0) + 0.4 * n((k) => HARD.has(k)) + 0.5 * n((k, big) => k === 'move' && !!big)
    + (p.unemployed > 0 && !p.retired ? 0.5 : 0) + (p.illness ? 0.5 : 0) + (p.strain && p.age < p.strain.until ? 0.5 : 0)
    + (p.jailed || (p.record && p.age < p.record.until) ? 0.5 : 0) + (p.wealth < 0 ? 0.3 : 0)
    + Math.abs((p.happyByAge[p.age] ?? 0) - (p.happyByAge[p.age - 1] ?? p.happyByAge[p.age] ?? 0)) / 20;
  const tomorrow = (studying ? 1 : 0) + (p.invest ? 0.4 : 0) + (p.insured ? 0.2 : 0) + (p.business ? 0.2 : 0)
    + (acc.w === undefined ? 0 : p.wealth > acc.w ? 0.3 : p.wealth < acc.w ? -0.3 : 0)
    - (p.smoker ? 0.3 : 0) - (p.drinker ? 0.3 : 0) - (p.pet ? 0.1 : 0) - 0.15 * p.hobbies.length
    + (p.focus === 'learn' ? 0.15 : p.focus === 'rest' ? -0.15 : 0);
  return [work, wind, wave, tomorrow];
}

// 毎年の終わりに (life.ts の advanceYear)
export function texYear(p: Person): void {
  if (p.tilt && p.auto && p.age >= 6) tiltFocus(p, p.tilt);
  if (p.age < ADULT || p.anchor) return;
  const acc = (p.tex ??= { y: [] });
  acc.y[p.age] = yearVec(p, acc).map((v) => Math.round(v * 100) / 100) as Vec;
  acc.job = p.job;
  acc.w = p.wealth;
  acc.c = p.country;
}

// 生の値の真ん中 (中央値) と広がり (四分位範囲 / 1.35)。実測 (2026-10-27, くじで生まれた3000人のうち18歳を越えた2782人) から。
// 焦点の重みを 0.5 から 0.15 に下げたので、そば・仕事の真ん中は +0.35 (おまかせの人生の焦点はずっと「家族」)。
// 前半・後半は20年以上の記録がある2700人の、それぞれの中央値 (そば・仕事は引退で後半に大きく動くので、半分ごとに真ん中を置く)
export const MID: Vec = [-0.432, -0.286, 1.232, 0.04];
const MID_EARLY: Vec = [-0.062, -0.2, 1.185, -0.038];
const MID_LATE: Vec = [-0.862, -0.324, 1.278, 0.108];
export const SPREAD: Vec = [0.308, 0.195, 0.261, 0.27];
// 同じ実測で、半々は組ごとに22〜24%、大きくは13〜28%。名前のない人生は23%、名前のある人生のうち一番多い名前は13%、一番少ない名前は2.2%
export const EVEN = 0.3;   // |z| がこれ未満なら半々
export const STRONG = 1.2; // これ以上なら大きく

const mean = (ys: Vec[]): Vec => [0, 1, 2, 3].map((k) => ys.reduce((s, y) => s + y[k], 0) / ys.length) as Vec;
const zOf = (ys: Vec[], mid = MID): Vec => mean(ys).map((m, k) => Math.round(((m - mid[k]) / SPREAD[k]) * 100) / 100) as Vec;

// 強いられた移住 (亡命・分離独立・追放): 名前をつけない
export const displaced = (p: Person): boolean => !!p.refugee || Object.keys(p.recent).some((k) => k === 'hist:exile' || (k.startsWith('hist:move:') && k !== 'hist:move:emigrate'));

export function textureOf(p: Person): Texture | undefined {
  if (p.age < ADULT || !p.tex) return undefined;
  const ys = p.tex.y.filter((y): y is Vec => !!y);
  if (!ys.length) return undefined;
  const t: Texture = { z: zOf(ys) };
  if (ys.length >= 20) { const h = ys.length >> 1; t.early = zOf(ys.slice(0, h), MID_EARLY); t.late = zOf(ys.slice(h), MID_LATE); }
  if (displaced(p)) t.displaced = true;
  if (p.tilt) t.want = p.tilt;
  return t;
}

// 度合い: 0 半々 / 1 少し / 2 大きく。符号は向き
export const degree = (z: number): number => Math.sign(z) * (Math.abs(z) < EVEN ? 0 : Math.abs(z) < STRONG ? 1 : 2);

// 16の名前の番号 (組ごとに + なら1)。二組以上が半々なら名前はない
export function nameIndex(z: Vec): number | undefined {
  if (z.filter((v) => degree(v) === 0).length >= 2) return undefined;
  return z.reduce((s, v, k) => s + (v > 0 ? 1 << k : 0), 0);
}

// 前半と後半で向きが変わった組 (どちらも半々でなく、どちらかは大きく)。実測で20年以上の記録がある人生の31%
export const turned = (t: Texture): number[] => (t.early && t.late ? [0, 1, 2, 3].filter((k) => {
  const a = degree(t.early![k]), b = degree(t.late![k]);
  return a * b < 0 && Math.max(Math.abs(a), Math.abs(b)) === 2;
}) : []);

// 手ざわりを決めたときの、おまかせの選び方。ふだんの選び方 (d.auto) に BONUS を足し、
// 各選択肢をこの人の写しで試して、その年の値がどれだけ傾きの向きへ動くかで比べる
const BONUS = 1;

// おまかせの人生の「今年の焦点」も傾ける。いちばん強く決めた組から: そば→家族・仕事→仕事・明日→学ぶ・今日→休む・凪→健康。
// 少しなら1年おき (ほかの年はふだんの「家族」)
const FOCUS: [number, Focus, Focus | undefined][] = [[0, 'family', 'work'], [3, 'rest', 'learn'], [2, 'health', undefined]];
function tiltFocus(p: Person, t: Vec): void {
  const [k, neg, pos] = FOCUS.reduce((a, b) => (Math.abs(t[b[0]]) > Math.abs(t[a[0]]) ? b : a));
  const w = t[k];
  const f = w < 0 ? neg : w > 0 ? pos : undefined;
  p.focus = f && (Math.abs(w) >= 2 || p.age % 2 === 0) ? f : 'family';
}
export function tiltedPick(p: Person, d: Decision): number {
  const base = d.auto(p);
  const tilt = p.tilt;
  if (!tilt || d.options.length < 2 || p.age < 12) return base; // 進学の分かれ道 (12歳ごろから) も明日のほうへ
  const acc: TexAcc = { ...(p.tex ?? { y: [] }), y: [] };
  const before = yearVec(p, acc);
  let best = base, top = -Infinity;
  d.options.forEach((o, i) => {
    let s = i === base ? BONUS : 0;
    if (i !== base) {
      const q = fromSaved(toSaved(p));
      q.tilt = undefined;
      q.auto = true;
      try { o.apply(q); } catch { return; }
      const after = yearVec(q, acc);
      s += tilt.reduce((t, w, k) => t + w * (after[k] - before[k]), 0);
    }
    if (s > top) { top = s; best = i; }
  });
  return best;
}
autoHook.pick = tiltedPick;
