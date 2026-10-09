// 死因の割り振り。年齢帯ごとの構成は WHO/GBD の大まかな形に、
// 感染症は国の豊かさ、マラリアはアフリカ、肺の病気は喫煙で重みを変える。
import type { Country } from './countries';
import { isEn } from '../i18n';
import { pickWeighted, type Rng } from './rng';
import type { Sex } from './lifetable';

type Tag = 'inf' | 'mal' | 'smoke' | 'old' | 'road';
type Row = [name: string, weight: number, tag?: Tag];

const BANDS: [maxAge: number, rows: Row[]][] = [
  [0, [
    ['早く小さく生まれたこと', 30], ['お産のときの酸素不足', 20], ['生まれてすぐの重い感染症', 12, 'inf'], ['肺炎', 12, 'inf'],
    ['生まれつきの病気', 12], ['下痢による脱水', 6, 'inf'], ['マラリア', 4, 'mal'],
  ]],
  [4, [
    ['肺炎', 25, 'inf'], ['下痢による脱水', 20, 'inf'], ['マラリア', 18, 'mal'], ['栄養失調', 8, 'inf'],
    ['溺水', 8], ['生まれつきの病気', 8], ['はしか', 5, 'inf'], ['交通事故', 5, 'road'],
  ]],
  [14, [
    ['交通事故', 15, 'road'], ['溺水', 10], ['マラリア', 10, 'mal'], ['下痢による脱水', 8, 'inf'], ['肺炎', 8, 'inf'],
    ['白血病などのがん', 12], ['結核', 5, 'inf'], ['髄膜炎', 5, 'inf'],
  ]],
  [49, [
    ['交通事故', 14, 'road'], ['心臓病', 12], ['がん', 12], ['結核', 8, 'inf'], ['肝臓の病気', 6], ['脳卒中', 6],
    ['転落などの事故', 5], ['肺炎', 4, 'inf'], ['下痢による脱水', 3, 'inf'], ['腎臓病', 4], ['糖尿病', 3],
  ]],
  [69, [
    ['心臓病', 26], ['脳卒中', 16], ['がん', 22], ['肺がん', 6, 'smoke'], ['肺の慢性の病気 (COPD)', 6, 'smoke'],
    ['糖尿病', 6], ['肝硬変', 4], ['腎臓病', 4], ['結核', 3, 'inf'], ['肺炎', 3, 'inf'],
  ]],
  [999, [
    ['心臓病', 26], ['脳卒中', 16], ['がん', 14], ['肺がん', 3, 'smoke'], ['認知症', 10, 'old'],
    ['肺の慢性の病気 (COPD)', 7, 'smoke'], ['肺炎', 8], ['腎臓病', 4], ['糖尿病', 4], ['老衰', 8, 'old'], ['転倒', 2],
  ]],
];

export const HOMICIDE = '他殺';

// 死因は内部では日本語で持ち、決まった時に今の言語の名前にする
const CAUSE_EN: Record<string, string> = {
  '早く小さく生まれたこと': 'being born too early or too small', 'お産のときの酸素不足': 'lack of oxygen during birth', '生まれてすぐの重い感染症': 'severe infection after birth',
  肺炎: 'pneumonia', '生まれつきの病気': 'a condition from birth', '下痢による脱水': 'diarrhea and dehydration', マラリア: 'malaria',
  栄養失調: 'malnutrition', 溺水: 'drowning', はしか: 'measles', 交通事故: 'road accident',
  白血病などのがん: 'childhood cancer', 結核: 'tuberculosis', 髄膜炎: 'meningitis', 心臓病: 'heart disease',
  がん: 'cancer', 肝臓の病気: 'liver disease', 脳卒中: 'stroke', 転落などの事故: 'fall or other accident',
  腎臓病: 'kidney disease', 糖尿病: 'diabetes', 肺がん: 'lung cancer', '肺の慢性の病気 (COPD)': 'chronic lung disease (COPD)',
  肝硬変: 'cirrhosis', 認知症: 'dementia', 老衰: 'old age', 転倒: 'fall', [HOMICIDE]: 'homicide',
  エイズ関連の病気: 'AIDS-related illness', 出産時の合併症: 'complications of childbirth',
};
export const causeName = (n: string): string => (isEn ? CAUSE_EN[n] ?? n : n);

function tagWeight(tag: Tag | undefined, c: Country, smoker: boolean): number {
  switch (tag) {
    case 'inf': return c.gdp < 3000 ? 3 : c.gdp < 10000 ? 1.6 : c.gdp < 30000 ? 0.7 : 0.3;
    case 'mal': return c.region === 'アフリカ' ? (c.gdp < 10000 ? 2 : 0.5) : 0.02;
    case 'smoke': return smoker ? 3 : 0.7;
    case 'old': return c.gdp > 20000 ? 1.5 : 0.6;
    // 推計: 交通事故死亡率は中所得国で最も高い
    case 'road': return c.gdp < 3000 ? 1.2 : c.gdp < 25000 ? 1.5 : 0.6;
    default: return 1;
  }
}

// 1年あたりの他殺の確率。統計は人口全体の率なので、若い男性に寄せて配る
export function homicideHazard(c: Country, sex: Sex, age: number): number {
  const ageK = age < 15 ? 0.2 : age < 45 ? 1.8 : age < 65 ? 0.7 : 0.4;
  const sexK = sex === 'M' ? 1.6 : 0.4;
  return (c.homicide / 1e5) * ageK * sexK;
}

export function pickCause(rng: Rng, c: Country, sex: Sex, age: number, q: number, smoker: boolean): string {
  if (rng() < Math.min(0.9, homicideHazard(c, sex, age) / q)) return causeName(HOMICIDE);
  const rows = BANDS.find(([max]) => age <= max)![1];
  return causeName(pickWeighted(rng, rows, ([, w, tag]) => w * tagWeight(tag, c, smoker))[0]);
}

// 死因の内訳 (日本語の名前と割合)。pickCause と同じ重みで、乱数は使わない
export function causeShares(c: Country, sex: Sex, age: number, q: number, smoker: boolean): [string, number][] {
  const h = Math.min(0.9, homicideHazard(c, sex, age) / q);
  const rows = BANDS.find(([max]) => age <= max)![1];
  const total = rows.reduce((t, [, w, tag]) => t + w * tagWeight(tag, c, smoker), 0);
  return [[HOMICIDE, h], ...rows.map(([n, w, tag]) => [n, (1 - h) * (w * tagWeight(tag, c, smoker)) / total] as [string, number])];
}
