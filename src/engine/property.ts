// 家と土地の国ごとの条件: 住宅ローンの金利と借りられる割合、家賃の利回り、空室、維持費と税、持ち家率。
// 値はどれもおおよその目安。表に無い国は1人当たりGDPで3段に分けて埋める
import type { Country } from './countries';

const tier = (c: Country) => (c.gdp >= 25000 ? 0 : c.gdp >= 8000 ? 1 : 2);
const by = (table: Record<string, number>, c: Country, rest: [number, number, number]) => table[c.code] ?? rest[tier(c)];

// 住宅ローンの実質金利 (名目から物価上昇を引いた目安)。日本は名目1%前後・韓国は4%前後で物価も2〜3%上がるので安い。
// 金融の浅い国では名目15〜20%が珍しくない (世界銀行 lending interest rate)
const RATE: Record<string, number> = { JPN: 0.005, KOR: 0.015, CHE: 0.01, DEU: 0.015, NLD: 0.015, FRA: 0.015, USA: 0.03, GBR: 0.025, CHN: 0.03, IND: 0.04, BRA: 0.07, TUR: 0.08, NGA: 0.08 };
export const mortgageRate = (c: Country): number => by(RATE, c, [0.025, 0.045, 0.07]);

// 家の値段のうち借りられる割合 (LTV)。韓国は規制で4〜7割、日本は9割以上も貸す。
// 2軒目 (貸す家) は多くの国で厳しくなる (英国の buy-to-let は75%前後、中国の2軒目は頭金3〜4割)
const LTV_HOME: Record<string, number> = { JPN: 0.9, KOR: 0.6, USA: 0.8, GBR: 0.85, DEU: 0.8, FRA: 0.8, CHN: 0.7, IND: 0.8 };
const LTV_RENT: Record<string, number> = { JPN: 0.8, KOR: 0.4, USA: 0.75, GBR: 0.75, DEU: 0.7, FRA: 0.7, CHN: 0.6, IND: 0.75 };
export const ltv = (c: Country, rental: boolean): number => (rental ? by(LTV_RENT, c, [0.7, 0.5, 0.3]) : by(LTV_HOME, c, [0.8, 0.6, 0.4]));

// 年間家賃 ÷ 物件価格 (表面利回り)。ソウル・北京・上海は2%前後と低く、日本は4〜5%、新興国の都市は6〜8% (Global Property Guide の都市の目安)
const YIELD: Record<string, number> = { JPN: 0.045, KOR: 0.025, CHN: 0.018, USA: 0.06, GBR: 0.05, DEU: 0.035, FRA: 0.038, IND: 0.025, BRA: 0.05, NGA: 0.07, KEN: 0.06, PHL: 0.055, IDN: 0.06 };
export const rentalYield = (c: Country): number => by(YIELD, c, [0.045, 0.055, 0.07]);

// 1年まるごと借り手がつかない確率。米国の賃貸住宅の空室率は6〜7% (国勢調査局 HVS)。日本の賃貸の空き家は2割近い (住宅・土地統計調査 2018) が、多くは古く借り手の見込めない家なので、町の部屋は1割とする
const VACANCY: Record<string, number> = { JPN: 0.1, KOR: 0.08, USA: 0.065, DEU: 0.04, GBR: 0.04 };
export const vacancy = (c: Country): number => by(VACANCY, c, [0.06, 0.1, 0.12]);

// 維持費 (修繕・管理) は価格の1%前後。固定資産税は日本1.4% (評価額は時価の7割ほど → 時価の1%)、米国1.1%前後、
// 韓国は保有税が低く0.2%前後、英国は住む人がカウンシル税を払う
export const UPKEEP = 0.01;
const PROPERTY_TAX: Record<string, number> = { JPN: 0.01, USA: 0.011, KOR: 0.002, GBR: 0, DEU: 0.003, FRA: 0.005 };
export const propertyTax = (c: Country): number => by(PROPERTY_TAX, c, [0.005, 0.003, 0.002]);

// 買うときの税と手数料 (価格に対して)。日本は取得税・登録免許税・仲介で7%前後、韓国の多住宅は取得税が重い、英国は印紙税に2軒目の上乗せ
const BUY_COST: Record<string, number> = { JPN: 0.07, KOR: 0.08, GBR: 0.06, USA: 0.03, DEU: 0.09, FRA: 0.08 };
export const buyCost = (c: Country): number => by(BUY_COST, c, [0.05, 0.05, 0.06]);
// 売るときの手数料
export const SELL_COST = 0.04;
// 貸していた家を売ったときの譲渡益への税。日本は5年を超えて持てば20.315% (5年以内は39.63%)、
// 韓国は多住宅の重課で高く、米国は15%前後、英国は住宅に24%
const TRANSFER_TAX: Record<string, number> = { JPN: 0.20315, KOR: 0.4, USA: 0.15, GBR: 0.24, DEU: 0, FRA: 0.19 };
export const transferTax = (c: Country, yearsHeld: number): number => (c.code === 'JPN' && yearsHeld <= 5 ? 0.3963 : c.code === 'DEU' && yearsHeld <= 10 ? 0.3 : by(TRANSFER_TAX, c, [0.2, 0.15, 0.1]));
// 急いで売ると買い叩かれる (投げ売りは市場価格の1〜2割引き)
export const FIRE_SALE = 0.85;

// 45歳前後の持ち家率の目安。日本は世帯主40代で6割台 (住宅・土地統計調査)、米国は35〜44歳62%・45〜54歳70% (国勢調査局 HVS 2023)、
// 韓国は40代で6割前後 (統計庁 住宅所有統計)、ドイツは賃貸の国で4割台。インドや中国は相続と自分で建てた家で8割を超える
const OWN: Record<string, number> = { JPN: 0.62, KOR: 0.58, USA: 0.66, DEU: 0.45, GBR: 0.62, FRA: 0.6, CHE: 0.4, CHN: 0.85, IND: 0.85, NGA: 0.6 };
export const ownershipTarget = (c: Country): number => by(OWN, c, [0.6, 0.7, 0.75]);

// ローンの毎年の返済額 (元利均等)
export const annuity = (loan: number, rate: number, years: number): number => (rate <= 0 ? loan / years : (loan * rate) / (1 - (1 + rate) ** -years));
// あと years 年払う予定のローンの残り元本
export const balanceOf = (pay: number, rate: number, years: number): number => (years <= 0 ? 0 : rate <= 0 ? pay * years : (pay * (1 - (1 + rate) ** -years)) / rate);
// 家は年をとるほど値上がりが鈍る (建物の傷みが土地の値上がりを食う。建物の減価は年1.5〜2%: Harding, Rosenthal & Sirmans 2007)
export const houseAging = (yearsOwned: number): number => Math.min(0.015, 0.0005 * Math.max(0, yearsOwned));
