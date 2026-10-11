// 留学の行き先: 生まれた国の学生が実際によく行く上位3か国、その学費と暮らしの費用、言葉、卒業後に残って働ける見込み。
import { byCode, countriesAt, type Country } from './countries';
import type { Person } from './person';
import { pickWeighted } from './rng';

// 学位をとりに外国へ出る学生の行き先の上位 (UNESCO 統計研究所 UIS の受け入れ国別の目安。韓国は教育部 2023)
const TOP: Record<string, string[]> = {
  CHN: ['USA', 'GBR', 'AUS'], IND: ['USA', 'CAN', 'AUS'], KOR: ['USA', 'CHN', 'JPN'], VNM: ['JPN', 'USA', 'AUS'],
  NGA: ['GBR', 'USA', 'CAN'], PAK: ['GBR', 'AUS', 'USA'], BGD: ['USA', 'GBR', 'MYS'], NPL: ['AUS', 'JPN', 'USA'],
  IDN: ['AUS', 'MYS', 'USA'], MYS: ['GBR', 'AUS', 'USA'], THA: ['USA', 'GBR', 'AUS'], PHL: ['USA', 'AUS', 'GBR'],
  JPN: ['USA', 'GBR', 'AUS'], USA: ['GBR', 'CAN', 'DEU'], DEU: ['AUT', 'NLD', 'GBR'], FRA: ['BEL', 'GBR', 'CAN'],
  ITA: ['GBR', 'AUT', 'DEU'], ESP: ['GBR', 'DEU', 'USA'], UKR: ['POL', 'DEU', 'CZE'], TUR: ['DEU', 'USA', 'GBR'],
  IRN: ['DEU', 'TUR', 'ITA'], SAU: ['USA', 'GBR', 'AUS'], MAR: ['FRA', 'ESP', 'DEU'], DZA: ['FRA', 'DEU', 'CAN'],
  TUN: ['FRA', 'DEU', 'CAN'], SEN: ['FRA', 'CAN', 'MAR'], CIV: ['FRA', 'CAN', 'MAR'], CMR: ['FRA', 'DEU', 'BEL'],
  KEN: ['USA', 'GBR', 'AUS'], GHA: ['USA', 'GBR', 'CAN'], BRA: ['USA', 'PRT', 'FRA'], MEX: ['USA', 'ESP', 'CAN'],
  COL: ['ESP', 'USA', 'FRA'], KAZ: ['RUS', 'KOR', 'CZE'], UZB: ['RUS', 'KOR', 'TUR'],
};

// 表に無い国は、留学生を多く受け入れる豊かな国から人口の重みで選ぶ (以前の版と同じ考え)
const HOSTS = ['USA', 'GBR', 'AUS', 'CAN', 'DEU', 'FRA', 'JPN'];

export function destinations(p: Person, year: number): Country[] {
  const listed = (TOP[p.birthCountry] ?? []).filter((c) => c !== p.country).map((c) => byCode(c));
  if (listed.length >= 3) return listed.slice(0, 3);
  const pool = countriesAt(year).filter((d) => d.gdp > 35000 && d.code !== p.country && !listed.some((l) => l.code === d.code));
  const out = [...listed];
  while (out.length < 3 && pool.length) {
    const d = pickWeighted(p.rng, pool, (x) => x.pop * (HOSTS.includes(x.code) ? 4 : 1));
    out.push(d);
    pool.splice(pool.indexOf(d), 1);
  }
  return out;
}

// 留学生の1年の学費 (購買力平価ドルの目安)。米国は州立でも州外・留学生で2万8千ドル前後、英国・豪州・カナダは2万ドル台、
// 日本の国立大学は年53万5800円、ドイツ・チェコ (チェコ語の課程)・アルゼンチンの国立大学は授業料がかからない
const TUITION: Record<string, number> = {
  USA: 28000, GBR: 22000, AUS: 25000, CAN: 22000, NZL: 20000, IRL: 18000, NLD: 14000, ARE: 15000, FIN: 10000,
  JPN: 5600, KOR: 6000, CHN: 4000, MYS: 5000, RUS: 4000, FRA: 3000, BEL: 4000, PRT: 3000, POL: 3000, ESP: 2500, ITA: 2500,
  CHE: 1500, AUT: 1500, TUR: 1000, MAR: 1000, DEU: 0, CZE: 0, NOR: 0, ARG: 0, SAU: 0,
};
export const tuitionAbroad = (d: Country): number => TUITION[d.code] ?? 8000;
export const isFree = (d: Country): boolean => tuitionAbroad(d) === 0;

// 教える言葉
const LANG: Record<string, string> = {
  USA: 'en', GBR: 'en', AUS: 'en', CAN: 'en', NZL: 'en', IRL: 'en', MYS: 'en', SGP: 'en', NLD: 'en',
  DEU: 'de', AUT: 'de', CHE: 'de', FRA: 'fr', BEL: 'fr', SEN: 'fr', CIV: 'fr', CMR: 'fr', MAR: 'fr', DZA: 'fr', TUN: 'fr',
  JPN: 'ja', KOR: 'ko', CHN: 'zh', ESP: 'es', ARG: 'es', MEX: 'es', COL: 'es', PRT: 'pt', BRA: 'pt',
  RUS: 'ru', KAZ: 'ru', UZB: 'ru', UKR: 'ru', KGZ: 'ru', TUR: 'tr', CZE: 'cs', POL: 'pl', ITA: 'it', SAU: 'ar', ARE: 'ar', EGY: 'ar',
};
// 大学まで英語で学ぶことの多い国
const ENGLISH_SCHOOLING = new Set(['IND', 'NGA', 'KEN', 'GHA', 'PHL', 'PAK', 'BGD', 'MYS', 'SGP', 'ZAF', 'UGA', 'ZMB', 'ZWE', 'TZA']);

// 行き先の言葉で授業を受けられるか。できなければ言葉を学ぶ1年が足される
export function speaks(p: Person, d: Country): boolean {
  const to = LANG[d.code];
  if (!to || to === LANG[p.birthCountry]) return true;
  return to === 'en' && (ENGLISH_SCHOOLING.has(p.birthCountry) || p.stats.learn >= 75);
}

// 卒業後に就労の在留資格を得て残れる見込み。5年後もその国にいる留学生は国により2〜6割 (OECD International Migration Outlook 2022)
const STAY: Record<string, number> = { CAN: 0.6, DEU: 0.55, AUS: 0.45, USA: 0.45, NZL: 0.5, GBR: 0.35, FRA: 0.35, JPN: 0.4, NLD: 0.35, IRL: 0.35 };
export const stayOdds = (d: Country): number => STAY[d.code] ?? 0.4;

// 第三国: 学んだ国でも生まれた国でもない豊かな国
export function thirdCountry(p: Person, year: number): Country | null {
  const pool = countriesAt(year).filter((d) => d.gdp > 35000 && d.code !== p.birthCountry && d.code !== p.school.abroad);
  return pool.length ? pickWeighted(p.rng, pool, (x) => x.pop * (HOSTS.includes(x.code) ? 4 : 1)) : null;
}
