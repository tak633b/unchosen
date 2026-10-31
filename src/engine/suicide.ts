// 自死の統計と、相談先。
// 扱いは WHO・厚労省の自殺報道ガイドラインに沿う: 方法・場所・理由は書かない。死亡記録・共有・追悼館には死因として出さない (causes.ts の causeLabel)。
// 生命表の死亡率はもともと自死を含むので、ここでの率は死因の内訳を分けるのに使い、全体の死亡率は変えない
import type { Country } from './countries';
import type { Sex } from './lifetable';
import { L } from '../i18n';

// 国別・男女別の自殺死亡率 (人口10万人あたり、粗死亡率)。WHO Global Health Estimates 2021
// (世界銀行 SH.STA.SUIC.MA.P5 / SH.STA.SUIC.FE.P5、2026-10 取得)。[男性, 女性]
// ponytail: どの暦年にも2021年の値を使う。1990年代の日本・韓国のように時代で大きく動いた国は、時代ごとの表にすると近づく
const RATES: Record<string, [number, number]> = {
  IND: [13.8, 11.2], CHN: [10.3, 7.5], NGA: [8.4, 1.5], PAK: [8, 3.2], IDN: [1.5, 0.9], COD: [13.7, 3.9],
  ETH: [9.1, 3.1], USA: [24.7, 6.5], BGD: [3.6, 2], BRA: [11.4, 3.9], EGY: [0.9, 0.3], TZA: [7.5, 2.7], MEX: [11.6, 2.6],
  PHL: [5.2, 1.8], UGA: [8.8, 2.3], SDN: [3.9, 2.4], KEN: [6.7, 2.5], AFG: [4.8, 2.4], VNM: [10.4, 4.3],
  AGO: [12.5, 3.9], RUS: [36.7, 8.1], MOZ: [15.6, 6], ZAF: [35.4, 9.9], IRN: [5.8, 2.3], IRQ: [4.4, 1.5], NER: [6, 3],
  TUR: [4.3, 1.1], MDG: [8.7, 3.5], CIV: [12, 2.6], CMR: [13.5, 3.5], MLI: [5.5, 2.8], UZB: [10.6, 6.1], DZA: [3, 1.3],
  MMR: [4.8, 1], GHA: [8.3, 2.3], TCD: [7.4, 3], SOM: [9.8, 6.1], JPN: [23.6, 11.5], BFA: [13, 4], DEU: [18.4, 7.6],
  COL: [7.9, 2.1], GBR: [14.7, 4.6], ZMB: [11.2, 3.1], MWI: [12.5, 2.9], FRA: [24.1, 9.5], MAR: [3.4, 2.4],
  THA: [28.2, 5.5], NPL: [13.3, 7.2], SAU: [1.1, 0.7], PER: [2.3, 0.8], SEN: [10.4, 3], SYR: [0.9, 0.3],
  ARG: [12.6, 3.4], ZWE: [23.6, 11.7], GIN: [6.1, 3.5], BEN: [11.1, 3.1], BDI: [11.5, 3.9], MYS: [8.8, 2.2],
  KAZ: [24.4, 5.3], RWA: [12.8, 4.8], ITA: [10.5, 3.6], GTM: [7.1, 2.8], KHM: [6.3, 2.7], CAN: [14.2, 4.8],
  ESP: [13.1, 4.5], LKA: [24.2, 5.8], POL: [24.1, 3.8], AUS: [19.5, 6.7], TJK: [3.6, 1.3], ECU: [12.5, 2.6],
  TGO: [14.7, 4], BOL: [6, 2.4], SLE: [7.8, 4.5], HTI: [10.6, 5.1], PNG: [2.2, 1.4], CAF: [14.7, 4], KOR: [38.2, 16.9],
  JOR: [0.9, 0.3], HND: [5, 0.9], UKR: [37.6, 6.9], DOM: [6.9, 1.5], COG: [10.1, 3.3], ROU: [16.4, 3.3],
  CHL: [12.3, 3.1], MRT: [3.7, 1.7], ISR: [6.3, 2.5], LBR: [8, 3.9], NLD: [15.4, 7.6], TUN: [2.5, 1.2], LAO: [6.5, 2.6],
  TKM: [10.3, 3.5], KGZ: [10.5, 3.1], PSE: [1.1, 0.2], PRY: [8, 4.7], NIC: [6.9, 1.7], AZE: [2.3, 0.8], LBY: [7.2, 2.7],
  ARE: [2.5, 0.4], BEL: [26.2, 10.7], SLV: [12.6, 3.1], SWE: [18.9, 8.7], LBN: [0.9, 0.6], CZE: [21.2, 5.7],
  PRT: [17.7, 5.9], HUN: [26.2, 7.5], OMN: [1.4, 0.2], CHE: [18.9, 9.2], GMB: [6.5, 3.1], AUT: [23.6, 5.8],
  NAM: [13.9, 3.6], GRC: [7.9, 1.6], PAN: [5.6, 1], GAB: [12, 2.4], BLR: [27.7, 5.1], MNG: [32.2, 4.8], GNB: [11.6, 3.9],
  BGR: [15.2, 4.2], BWA: [11.2, 5.5], SRB: [23, 8], NZL: [17.9, 6.1], DNK: [14.7, 6.3], LSO: [41.4, 16.6],
  GNQ: [10.2, 3.5], IRL: [12.6, 4.6], SVK: [17.1, 3], CRI: [13.4, 2.8], NOR: [18.9, 7.4], KWT: [3.6, 0.3],
  SGP: [11.1, 4.9], GEO: [9.5, 1.3], FIN: [20.5, 8.8], ARM: [4.2, 1], URY: [39.9, 10.5], JAM: [3, 0.4], MDA: [24.8, 5],
  HRV: [25.1, 6.9], TLS: [4.8, 2.3], SWZ: [45, 10.1], QAT: [6.2, 0.8], ALB: [3.2, 2.3], BIH: [13.7, 4.7],
  COM: [7.5, 4.5], DJI: [9.6, 6.4], SLB: [29.2, 9.6], LTU: [36.7, 9.2], BHR: [6.6, 1.4], SVN: [29.9, 7.7],
  MKD: [7.9, 3.8], GUY: [40, 10.3], FJI: [11.2, 5.3], TTO: [22.2, 4.6], CYP: [3.8, 2.2], LVA: [27.5, 4.6],
  MUS: [17.9, 3], EST: [25.1, 5.8], SUR: [30.5, 14], BTN: [6.2, 3.4], MNE: [17.1, 6], LUX: [12.1, 4.3], CPV: [25.3, 4.2],
  MDV: [2.2, 0.3], MLT: [8.4, 4.4],
};
const WORLD: [number, number] = [12.3, 5.9]; // 世界 (同じ出典)

// 年齢による倍率 (粗死亡率に対して)。WHO GHE 2019 の世界の年齢別の形をなぞった推計: 10代前半は低く、年齢とともに上がり、
// 80歳以上で最も高い。世界の年齢構成で平均すると約1になる。10歳未満は0 (この年齢では扱わない)
// ponytail: 国ごとの年齢の形の違い (日本の中高年男性の山など) は入れていない
const AGE_K: [from: number, k: number][] = [[80, 2.8], [70, 2], [50, 1.5], [30, 1.3], [20, 1.2], [15, 0.7], [10, 0.2]];

export const SUICIDE_MIN_AGE = 10;

// 助けを求めた年・人に打ち明けた年・つらい時期を抜けた年と、その翌年には、自死で終わらない (本家 v0.8.61)。
// strain.ts がその年齢を recent.heldOn に置く。全体の件数は変えない (3000人生で 22 → 測って ±20% のうち)
export const shielded = (p: { age: number; recent: Record<string, number> }): boolean => p.age - (p.recent.heldOn ?? -99) <= 1;

// 1年あたりの自死の確率 (その国・性別・年齢)
export function suicideHazard(c: Country, sex: Sex, age: number): number {
  if (age < SUICIDE_MIN_AGE) return 0;
  const [m, f] = RATES[c.code] ?? WORLD;
  return ((sex === 'M' ? m : f) / 1e5) * AGE_K.find(([from]) => age >= from)![1];
}

// 相談先。番号はここにだけ置く (死亡記録の「なぜ」・つらい時期の記録・「心がつらいとき」の欄 ui/care.ts が使う)。
// 日本: 厚生労働省「まもろうよ こころ」の電話相談の一覧 (2026-10 確認)、24時間子供SOSダイヤルは文部科学省。
// 英語: 米国の988 (電話・テキスト)、英国とアイルランドのサマリタンズ 116 123、ほかの国は findahelpline.com
export interface Line { name: string; tel?: string; url?: string; note: string }
export const LINES_JA: Line[] = [
  { name: 'いのちSOS', tel: '0120-061-338', note: '24時間・毎日。「死にたい」「消えたい」気持ちを受け止める' },
  { name: 'よりそいホットライン', tel: '0120-279-338', note: '24時間・毎日。どんな悩みでも。岩手・宮城・福島からは 0120-279-226' },
  { name: 'こころの健康相談統一ダイヤル', tel: '0570-064-556', note: '住んでいる都道府県の窓口につながる。受付の時間は地域で違う' },
  { name: '24時間子供SOSダイヤル', tel: '0120-0-78310', note: '子どもと若い人のための窓口。24時間・毎日' },
];
export const LINES_EN: Line[] = [
  { name: '988 Suicide & Crisis Lifeline (US)', tel: '988', note: 'Call or text, 24/7' },
  { name: 'Samaritans (UK and Ireland)', tel: '116 123', note: 'Free, 24/7' },
  { name: 'Find A Helpline', url: 'https://findahelpline.com', note: 'Free, confidential lines in other countries' },
];
const [INOCHI, , , KODOMO] = LINES_JA;

export const helpline = (): string => L(
  `つらい気持ちを話せる場所があります。${INOCHI.name} ${INOCHI.tel}。10代の人は${KODOMO.name} ${KODOMO.tel}`,
  `If things feel heavy, you can talk to someone. In the US, call or text ${LINES_EN[0].tel}. Elsewhere, findahelpline.com lists free, confidential lines`,
);
