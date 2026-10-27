// 国ごとの学制: 入学する年齢と、小学校・中学校・高校・学士・修士の年数、学年の数え方。
// 入学年齢と初等・前期中等・後期中等の年数は UNESCO 統計研究所 (UIS) の ISCED 対応表の値
// (世界銀行 WDI の SE.PRM.AGES・SE.PRM.DURS・SE.SEC.DURS.LO・SE.SEC.DURS 各国の最新年)。
// ponytail: 今の学制を1900年からずっと使う。昔の学制の違い (戦前の日本の6年制義務教育など) は入れていない
import data from '../data/schoolsys.json';
import { L, isEn } from '../i18n';

export interface SchoolSys {
  entry: number; // 小学校に入る年齢
  prim: number;  // 初等教育 (ISCED 1) の年数
  lower: number; // 前期中等 (ISCED 2)
  upper: number; // 後期中等 (ISCED 3)
  total: number;
  grade: 'level' | 'us' | 'year' | 'basic'; // 学年の数え方
}

const SYS = data as Record<string, number[]>;

// 学年を通して数える国。us: 1〜12年生 (米国・カナダ・フィリピン・インド・ドイツ・ベトナム・トルコ・ロシア)、
// year: Year 1〜13 (英国・ニュージーランド)、basic: 基礎学校の1〜9年生 (北欧・ポーランド・ブラジルなど)。ほかは学校ごとに数える
const GRADE: Record<string, SchoolSys['grade']> = {
  USA: 'us', CAN: 'us', PHL: 'us', IND: 'us', DEU: 'us', VNM: 'us', TUR: 'us', RUS: 'us',
  GBR: 'year', NZL: 'year',
  FIN: 'basic', SWE: 'basic', NOR: 'basic', DNK: 'basic', ISL: 'basic', EST: 'basic', POL: 'basic', BRA: 'basic',
};

export function schoolSys(code: string): SchoolSys {
  const [entry, prim, lower, upper] = SYS[code] ?? [6, 6, 3, 3];
  return { entry, prim, lower, upper, total: prim + lower + upper, grade: GRADE[code] ?? 'level' };
}

// 学士の年数。ボローニャ・プロセス (1999年) のあと、ヨーロッパの多くの国は3年 (ドイツ・フランス・イタリアは2000年代に移った)。
// 英国・オーストラリア・ニュージーランド・インド・南アフリカは昔から3年。スペイン・アイルランド・ギリシャ・米国・アジアの多くは4年
const BA3_ALWAYS = new Set(['GBR', 'AUS', 'NZL', 'IND', 'ZAF', 'BGD']);
const BA3_BOLOGNA = new Set(['DEU', 'FRA', 'ITA', 'NLD', 'BEL', 'AUT', 'CHE', 'SWE', 'NOR', 'DNK', 'FIN', 'ISL', 'POL', 'CZE', 'SVK', 'HUN', 'PRT', 'SVN', 'HRV', 'EST', 'LVA', 'LTU', 'ROU', 'BGR']);
export const bachelorYears = (code: string, year: number): number => (BA3_ALWAYS.has(code) || (BA3_BOLOGNA.has(code) && year >= 2005) ? 3 : 4);
// 修士は多くの国で2年。英国・アイルランド・スペイン・オランダは1年の課程がふつう
const MA1 = new Set(['GBR', 'IRL', 'ESP', 'NLD']);
export const masterYears = (code: string): number => (MA1.has(code) ? 1 : 2);

// 学校の区切り (通った年数で)。basic の国は小学校と中学校が一つの基礎学校
export const primEnd = (s: SchoolSys) => s.prim;
export const lowerEnd = (s: SchoolSys) => s.prim + s.lower;

const LEVEL = (s: SchoolSys, done: number): [string, string] => (done < s.prim ? (s.grade === 'basic' ? ['基礎学校', 'basic school'] : ['小学校', 'primary school'])
  : done < lowerEnd(s) ? (s.grade === 'basic' ? ['基礎学校', 'basic school'] : ['中学校', 'middle school']) : ['高校', 'high school']);

// 在学中の学年の表示。done はこれまでに終えた年数 (p.school.years)
export function gradeLabel(s: SchoolSys, done: number): string {
  const [ja, en] = LEVEL(s, done);
  const n = done + 1;
  if (s.grade === 'us') return isEn ? `Grade ${n} (${en})` : `${n}年生（${ja}）`;
  if (s.grade === 'year') return isEn ? `Year ${n} (${en})` : `Year ${n}（${ja}）`;
  if (s.grade === 'basic' && done < lowerEnd(s)) return L(`基礎学校${n}年生`, `Grade ${n} (basic school)`);
  const start = done < s.prim ? 0 : done < lowerEnd(s) ? s.prim : lowerEnd(s);
  return L(`${ja}${done - start + 1}年生`, `${en.charAt(0).toUpperCase() + en.slice(1)}, year ${done - start + 1}`);
}
