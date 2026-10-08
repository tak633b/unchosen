// 所得は国ごとの対数正規分布。σ はジニ係数から、平均は1人当たりGDPから決める。
import type { Country } from './countries';
import { isEn } from '../i18n';
import { invNorm } from './rng';

// 1人当たりGDPのうち家計に届く割合の目安
const HOUSEHOLD_SHARE = 0.6;
// 世帯の1人当たり所得 → 働き手1人の年収
const EARNER_FACTOR = 1.6;
// 円換算: 日本の購買力平価 (円 / 国際ドル) の目安
export const JPY_PER_PPP = 95;

const sigmaFromGini = (g: number) => Math.SQRT2 * invNorm((g + 1) / 2);

// 所得分布の p 分位 (0–1) にいる世帯の、1人あたり年間所得 (PPPドル)
export function incomeAt(c: Country, p: number): number {
  const s = sigmaFromGini(c.gini);
  return c.gdp * HOUSEHOLD_SHARE * Math.exp(s * invNorm(p) - (s * s) / 2);
}

export const earnings = (c: Country, p: number) => incomeAt(c, p) * EARNER_FACTOR;

const usd = (ppp: number) => `${ppp < 0 ? '-' : ''}$${Math.round(Math.abs(ppp)).toLocaleString('en-US')}`;

export function formatMoney(ppp: number): string {
  if (isEn) return usd(ppp);
  const yen = ppp * JPY_PER_PPP;
  const yenS = yen >= 1e8 ? `${(yen / 1e8).toFixed(1)}億円` : yen >= 1e4 ? `${Math.round(yen / 1e4).toLocaleString()}万円` : `${Math.round(yen).toLocaleString()}円`;
  return `$${Math.round(ppp).toLocaleString()} (約${yenS})`;
}

// 1日あたりに直すと貧しさが伝わりやすい
export const perDay = (ppp: number) => (isEn ? `$${(ppp / 365).toFixed(ppp < 3650 ? 2 : 0)}/day` : `1日 $${(ppp / 365).toFixed(ppp < 3650 ? 2 : 0)}`);

// 日本の物価での感覚 (月あたり)
export function monthlyYen(ppp: number): string {
  if (isEn) return `${usd(ppp / 12)}/mo`;
  const man = (ppp * JPY_PER_PPP) / 12 / 1e4;
  return man >= 1 ? `${Math.round(man).toLocaleString()}万円` : `${Math.round(man * 1e4).toLocaleString()}円`;
}

export function yen(ppp: number): string {
  if (isEn) return usd(ppp);
  const v = ppp * JPY_PER_PPP;
  const a = Math.abs(v);
  const s = a >= 1e8 ? `${(a / 1e8).toFixed(1)}億円` : a >= 1e4 ? `${Math.round(a / 1e4).toLocaleString()}万円` : `${Math.round(a).toLocaleString()}円`;
  return v < 0 ? `-${s}` : s;
}
