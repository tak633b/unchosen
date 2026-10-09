// 九死に一生: その年の死の抽選が、死ぬ側のすぐ手前で止まった年。
// 人生の乱数 (p.rng) には触らない。死因は seed と年齢から作る見せ方用の乱数で選ぶので、
// 九死に一生を足しても、その人の一生の出来事・数字・乱数の並びは変わらない (crisis.test.ts)
import { causeName, causeShares } from './causes';
import { countryOf, log, type Person } from './person';
import { makeRng, pickWeighted } from './rng';
import { isEn, L } from '../i18n';

// 抽選 r が q ≤ r < q×NEAR に入った年を「もう少しで死ぬところだった」年とみなす
export const NEAR = 2;
export const MAX_PER_LIFE = 3;

// 急に命が危うくなる死因と、その時の言い方 (「〜て、生死の境をさまよった」)
const ACUTE: Record<string, [ja: string, en: string]> = {
  交通事故: ['交通事故にあい', 'was badly hurt in a road accident'],
  溺水: ['溺れかけ', 'nearly drowned'],
  '転落などの事故': ['高い所から落ち', 'fell from a height'],
  転倒: ['転んで頭を強く打ち', 'fell and hit their head hard'],
  他殺: ['人に襲われて大けがをし', 'was attacked and badly hurt'],
  心臓病: ['心臓の発作で倒れ', 'collapsed with a heart attack'],
  脳卒中: ['脳卒中で倒れ', 'collapsed with a stroke'],
  肺炎: ['重い肺炎にかかり', 'came down with severe pneumonia'],
  髄膜炎: ['髄膜炎にかかり', 'came down with meningitis'],
  マラリア: ['重いマラリアにかかり', 'came down with severe malaria'],
  '下痢による脱水': ['ひどい下痢で体の水が抜け', 'became dangerously dehydrated from diarrhea'],
  はしか: ['重いはしかにかかり', 'came down with severe measles'],
  '生まれてすぐの重い感染症': ['重い感染症にかかり', 'caught a severe infection'],
  'お産のときの酸素不足': ['生まれるときに息ができず', 'could not breathe at birth'],
  出産時の合併症: ['お産のあとに大量に出血し', 'bled heavily after giving birth'],
};
// 死因の表示名 (今の言語) から日本語の名前に戻す
const JA_OF = new Map(Object.keys(ACUTE).map((k) => [causeName(k), k]));
export const acuteKey = (cause: string): string | undefined => (ACUTE[cause] ? cause : JA_OF.get(cause));
export const isAcute = (cause: string | undefined): boolean => !!cause && acuteKey(cause) !== undefined;

// 見せ方用の乱数。seed と年齢だけで決まる
export const showRng = (seed: number, age: number, salt = 0) => makeRng((Math.imul(seed ^ 0x5bd1e995, 31) + age * 7919 + salt * 104729) >>> 0);

const pct = (x: number) => (x >= 0.01 ? (x * 100).toFixed(1) : (x * 100).toFixed(2));

// 年の初めの死の抽選のあとに呼ぶ。r は抽選の値、q はその年に亡くなる確率。起きたら死因の日本語の名前を返す
export function nearMiss(p: Person, r: number, q: number): string | undefined {
  if (p.anchor || r < q || r >= q * NEAR) return undefined;
  if (p.log.filter((e) => e.crisis).length >= MAX_PER_LIFE) return undefined;
  const c = countryOf(p);
  const shares = causeShares(c, p.sex, p.age, q, !!p.smoker);
  const [cause] = pickWeighted(showRng(p.seed, p.age), shares, ([, w]) => w);
  return ACUTE[cause] ? cause : undefined;
}

// 九死に一生を記す。年の終わりに置くので、その年のほかの出来事の色や順は変えない
export function logNearMiss(p: Person, cause: string, q: number): void {
  const c = countryOf(p);
  const share = causeShares(c, p.sex, p.age - 1, q, !!p.smoker).find(([n]) => n === cause)?.[1] ?? 0;
  const [ja, en] = ACUTE[cause];
  log(p, L(`${ja}、生死の境をさまよった。助かった。`, `${p.given} ${en}, and hovered between life and death. Pulled through.`), 'ill', true);
  const e = p.log[p.log.length - 1];
  e.crisis = cause;
  e.why = isEn
    ? `At ${p.age - 1}, the chance of dying of ${causeName(cause)} within a year was about ${pct(q * share)}%`
    : `${p.age - 1}歳の1年で${cause}で亡くなる確率は約${pct(q * share)}%`;
}
