// お金の置き場所と、その年の市場の値動き。利回りはどれも物価上昇を引いた実質。
//
// ---- 外からつなぐ口 ---------------------------------------------------------------------
// marketReturn(asset, year, country, rng) が「その年・その国で、その資産が何%動いたか」を返す唯一の関数。
// 何もつながなければ、長い目で見た統計 (下の LONG_RUN) から毎年引く。
// 年ごとの実際の相場や景気の波を持つモジュールは setMarketReturn(fn) で差し替える。fn が undefined を返した年・資産は統計に戻る。
// 預金・債券・株・不動産ファンド・家の値段の5つだけを聞く。バランス型と個別株はここから組み立てる (fundReturn)
import type { Country } from './countries';
import { normal, type Rng } from './rng';

export type MarketAsset = 'deposit' | 'bond' | 'stock' | 'realestate' | 'house';
export type MarketReturn = (asset: MarketAsset, year: number, c: Country, rng: Rng) => number | undefined;

// 預けたお金の置き場所。'stock' は株価指数に連動するインデックスファンド (古いセーブの「株」もこれになる)
export type Holding = 'deposit' | 'bond' | 'balanced' | 'stock' | 'realestate' | 'picker';
export const HOLDINGS: Holding[] = ['deposit', 'bond', 'balanced', 'stock', 'realestate', 'picker'];

// 長い目で見た実質の利回り。mean は1年ごとの平均 (算術)、ばらつき sd を引いた複利ではおよそ mean - sd²/2 になる
// 世界の株 1900–2022 年率 実質5.0%・標準偏差17%前後、債券 1.7%・10%前後、短期金利 0.8% (UBS Global Investment Returns Yearbook 2023)
// 新興国の株は年に±22%ほど動く (同)。家の値段は長期で実質年1%前後 (Knoll, Schularick & Steger 2017)
// 不動産ファンドは家賃込みの住宅の総収益 (実質年7%前後、Jordà ほか 2019 "The Rate of Return on Everything") から手数料と空室を引いた目安
const LONG_RUN: Record<Exclude<MarketAsset, 'deposit'>, [mean: number, sd: number, sdEmerging: number]> = {
  bond: [0.022, 0.1, 0.12],
  stock: [0.065, 0.17, 0.22],
  realestate: [0.045, 0.12, 0.15],
  house: [0.01, 0.05, 0.07],
};
export const DEPOSIT = 0.005;

// 統計どおりの1年。預金は乱数を引かない (以前の版と同じ)
export function longRunReturn(asset: MarketAsset, _year: number, c: Country, rng: Rng): number {
  if (asset === 'deposit') return DEPOSIT;
  const [mean, sd, sdEm] = LONG_RUN[asset];
  return normal(rng, mean, c.gdp < 25000 ? sdEm : sd);
}

let source: MarketReturn | null = null;
// 年ごとの相場を持つモジュールがつなぐ。null で統計に戻す
export function setMarketReturn(fn: MarketReturn | null): void { source = fn; }

export function marketReturn(asset: MarketAsset, year: number, c: Country, rng: Rng): number {
  return source?.(asset, year, c, rng) ?? longRunReturn(asset, year, c, rng);
}

// 自分で株を選ぶ人は、平均すると指数より年1.5%ほど負け (Barber & Odean 2000, 手数料と売買のしすぎ)、
// 銘柄が少ないぶん指数のまわりで大きくぶれる。20年で指数に勝つのは3割弱 (market.test.ts で実測。SPIVA: 15年で9割の運用者が指数に負ける)
const PICKER_EDGE = -0.015;
const PICKER_SD = 0.1;

export function fundReturn(h: Holding, year: number, c: Country, rng: Rng): number {
  switch (h) {
    case 'bond': return marketReturn('bond', year, c, rng);
    case 'stock': return marketReturn('stock', year, c, rng);
    case 'realestate': return marketReturn('realestate', year, c, rng);
    // 株と債券を半分ずつ。毎年はじめに半々へ戻す
    case 'balanced': return (marketReturn('stock', year, c, rng) + marketReturn('bond', year, c, rng)) / 2;
    case 'picker': return marketReturn('stock', year, c, rng) + normal(rng, PICKER_EDGE, PICKER_SD);
    default: return marketReturn('deposit', year, c, rng);
  }
}

// ---- 売るときにかかるもの -----------------------------------------------------------------
// 乗り換えは一度売って買い直す。売買の手数料と値幅で1%ほど
export const SWITCH_FEE = 0.01;

// 株や投資信託の売却益への税率 (個人・長期保有のおおよそ)。
// 日本20.315% (申告分離)・ドイツ26.375% (分離課税+連帯付加税)・フランス30% (一律課税)・米国15% (長期の連邦税の主な段)・
// 英国20%前後・カナダは益の半分に所得税で13%前後・豪州は半分に所得税で15%前後・インド12.5% (2024年からの長期)・ブラジル15%。
// 韓国の上場株は大株主でなければかからない。中国A株の個人の売却益・シンガポール・香港・スイス (個人)・NZ・湾岸諸国もかからない
const CGT: Record<string, number> = {
  JPN: 0.20315, DEU: 0.26375, FRA: 0.3, USA: 0.15, GBR: 0.2, CAN: 0.13, AUS: 0.15, IND: 0.125, BRA: 0.15,
  KOR: 0, CHN: 0, SGP: 0, HKG: 0, CHE: 0, NZL: 0, ARE: 0, SAU: 0, QAT: 0, KWT: 0,
};
export const capitalGainsTax = (c: Country): number => CGT[c.code] ?? (c.gdp >= 15000 ? 0.15 : 0.1);
