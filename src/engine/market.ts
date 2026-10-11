// 相場と景気。過去の年は実際の値動き、これから先の年は景気の波 (不況と金融危機) で動く。
// 利回りはどれも実質 (物価上昇を引いた値)。
import { L } from '../i18n';
import { countryOf, log, yearOf, type Person } from './person';
import { makeRng, normal, type Rng } from './rng';

// ---- 過去の値動き (年ごとの実質の利回り、%) ----------------------------------------
// 株: 米国 = S&P500 配当込み (Damodaran, NYU Stern "Historical Returns" 2026年1月版) を米国の消費者物価 (BLS / 世界銀行) で割り引いた値。
//     日本 = 日経平均の年末値の変化 + 配当利回りの目安 (1960年代3%・70年代2%・80〜2000年代1%・2010年以降2%) - 日本の消費者物価 (世界銀行)。
//     韓国 = KOSPI の年末値の変化 (1980年1月4日=100) + 配当2% (2000年以降1.5%) - 韓国の消費者物価 (世界銀行)。
//     世界 = MSCI World 配当込み・ドル建て - 米国の消費者物価。1970年より前は米国で代える
// 家: 米国 = 1950〜70年は Case-Shiller (Damodaran の表) - 物価、1971年からと韓国 (1976年から) は BIS の実質住宅価格 (FRED の Q?R628BIS、第4四半期どうし)
const STOCK: Record<string, [number, number[]]> = {
  USA: [1950, [29, 15, 16, -2, 51, 33, 6, -13, 40, 11, -1, 25, -10, 21, 15, 11, -13, 20, 6, -13, -2, 10, 15, -19, -33, 26, 17, -13, -1, 7, 16, -14, 13, 19, 2, 27, 16, 2, 12, 25, -8, 25, 4, 7, -1, 33, 19, 30, 26, 18, -12, -14, -23, 26, 8, 1, 12, 3, -39, 26, 13, -1, 14, 30, 12, 1, 10, 19, -7, 29, 17, 23, -24, 21, 21, 15]],
  JPN: [1960, [53, 3, -4, -16, -1, 12, 0, -12, 30, 34, -19, 30, 85, -24, -26, 4, 7, -8, 20, 7, 1, 4, 3, 22, 15, 12, 43, 16, 40, 27, -40, -6, -27, 3, 13, 2, -2, -22, -9, 38, -26, -22, -17, 26, 9, 42, 8, -10, -42, 22, 0, -15, 25, 58, 6, 10, 3, 21, -11, 20, 18, 7, -10, 26, 18, 24]],
  KOR: [1980, [-15, 3, -6, -7, 17, 14, 64, 89, 63, -3, -28, -18, 6, 24, 13, -16, -28, -43, 41, 83, -51, 34, -11, 26, 8, 51, 3, 30, -42, 47, 20, -13, 9, 1, -4, 3, 4, 21, -17, 9, 32, 3, -27, 16, -10, 73]],
  WLD: [1970, [-7, 15, 20, -19, -32, 23, 8, -1, 10, 1, 12, -12, 5, 19, 1, 37, 40, 13, 19, 12, -21, 14, -7, 20, 3, 18, 11, 14, 23, 23, -16, -19, -21, 31, 12, 6, 17, 7, -43, 31, 11, -8, 14, 26, 4, 0, 7, 21, -10, 26, 15, 17, -24, 20, 16, 18]],
};
const HOUSE: Record<string, [number, number[]]> = {
  USA: [1950, [2, -2, 2, 11, 0, 0, -1, -1, -2, -1, -1, 0, -1, 1, 0, 0, -2, 0, 0, 1, 2, 6, 4, 3, -4, 2, 2, 9, 6, 4, -3, -4, -3, 2, 1, 3, 7, 5, 5, 2, -5, -3, -3, 0, -1, 0, 0, 3, 6, 5, 6, 6, 7, 9, 12, 11, -2, -13, -18, -3, -5, -4, 6, 9, 4, 5, 4, 4, 2, 2, 8, 10, 0, 2, 1, -2]],
  KOR: [1976, [10, 29, 20, -9, -13, -9, 5, 15, 8, 4, 2, 1, 7, 8, 11, -7, -10, -8, -6, -4, -4, -2, -18, 2, -2, 5, 13, 3, -5, 1, 7, 2, -1, -2, -2, 3, -1, -1, 1, 3, 0, 0, 1, 0, 7, 12, -5, -9, -2, -2]],
};
export const HISTORY_TO = 2025; // 表の最後の年。これより先は景気の波で動かす

const at = (t: Record<string, [number, number[]]>, code: string, year: number): number | undefined => {
  const row = t[code];
  if (!row || year < row[0]) return undefined;
  const v = row[1][year - row[0]];
  return v === undefined ? undefined : v / 100;
};

// ---- 経済の大きな出来事 (過去) ---------------------------------------------------
// dep: その年の預金の実質利回り / debt: 借金の実質金利 / layoff: 失業する確率の倍率 / stock: 世界の相場に足す、その国の株の値動き
// 数字は各国の消費者物価と政策金利・預金金利 (世界銀行・各国中央銀行) からの目安。'*' は世界中
interface Shock { codes: string[]; year: number; dep?: number; debt?: number; layoff?: number; stock?: number; ja?: string; en?: string; stat?: [string, string] }
export const SHOCKS: Shock[] = [
  // アジア通貨危機。韓国は1997年12月に IMF の支援を受け、預金金利は年10%台半ばまで上がった (韓国銀行)
  { codes: ['THA', 'IDN', 'MYS', 'PHL'], year: 1997, stock: -0.5, ja: '通貨が急に値を下げ、会社の倒産と株の暴落が続いた。', en: 'The currency suddenly collapsed. Companies went under and shares crashed.', stat: ['タイ・バーツは1997年7月の変動相場への移行から半年で、ドルに対し半分ほどの値になった', 'Within six months of the July 1997 float, the Thai baht lost about half its value against the dollar'] },
  { codes: ['KOR'], year: 1998, dep: 0.07, debt: 0.1, layoff: 3, ja: 'IMF危機。会社が次々につぶれ、街に失業者があふれた。預金の利息は年に1割を超え、借金のある家は利息に追われた。', en: 'The IMF crisis. Firms collapsed one after another and the streets filled with the jobless. Deposits paid over 10% a year; families in debt drowned in interest.', stat: ['韓国の失業率は1997年の2.6%から1998年には7.0%へ上がった (韓国統計庁)', "South Korea's unemployment rate rose from 2.6% in 1997 to 7.0% in 1998 (Statistics Korea)"] },
  { codes: ['IDN'], year: 1998, dep: -0.15, debt: 0.1, layoff: 2.5, ja: '物価が1年で6割近く上がり、米の値段が何倍にもなった。', en: 'Prices rose by almost 60% in a year. Rice cost several times what it had.', stat: ['インドネシアの物価上昇率は1998年に58%、ルピアはドルに対し危機前の5分の1ほどになった (世界銀行)', "Indonesia's inflation hit 58% in 1998, and the rupiah fell to about a fifth of its pre-crisis value against the dollar (World Bank)"] },
  { codes: ['THA'], year: 1998, debt: 0.08, layoff: 2 },
  { codes: ['RUS'], year: 1992, dep: -0.9, ja: '物価が1年で何十倍にもなり、銀行に積み立ててきた貯金はほとんど紙くずになった。', en: 'Prices multiplied many times over in one year. Savings built up in the bank were worth almost nothing.', stat: ['ロシアの物価は1992年の1年で約26倍になった (ロシア連邦統計局)', 'Russian prices rose about 26-fold during 1992 (Rosstat)'] },
  { codes: ['RUS'], year: 1998, dep: -0.4, stock: -0.7, layoff: 1.5, ja: '8月、政府が国債の支払いを止めた。ルーブルは数か月で3分の1の値になり、銀行の窓口は閉まった。', en: 'In August the government stopped paying its debts. Within months the ruble was worth a third of what it had been, and bank counters shut.', stat: ['1998年8月の債務不履行のあと、ルーブルはドルに対して約3分の1に下がった (ロシア中央銀行)', 'After the August 1998 default, the ruble fell to about a third of its value against the dollar (Bank of Russia)'] },
  { codes: ['BRA'], year: 1990, dep: -0.4, ja: '新しい大統領の経済計画で、銀行の預金が1年半のあいだ凍結された。', en: "Under the new president's economic plan, bank deposits were frozen for a year and a half.", stat: ['1990年3月のコロール計画は、預金など金融資産の約8割を18か月凍結した', 'The Collor Plan of March 1990 froze about 80% of financial assets for 18 months'] },
  { codes: ['BRA'], year: 2015, layoff: 1.8 },
  { codes: ['BRA'], year: 2016, layoff: 1.8, ja: '2年続けて景気が縮み、失業者が1,000万人を超えた。', en: 'The economy shrank for a second year running; more than ten million people were out of work.', stat: ['ブラジルの失業率は2014年の6.8%から2016年には11.5%になった (IBGE)', "Brazil's unemployment rate went from 6.8% in 2014 to 11.5% in 2016 (IBGE)"] },
  { codes: ['ARG'], year: 1989, dep: -0.6, ja: '物価が月ごとに倍になり、給料は受け取ったその日に使い切るしかなかった。', en: 'Prices doubled from one month to the next. Wages had to be spent the day they were paid.', stat: ['アルゼンチンの物価上昇率は1989年に3,000%を超えた (INDEC)', "Argentina's inflation passed 3,000% in 1989 (INDEC)"] },
  { codes: ['ARG'], year: 1990, dep: -0.4 },
  { codes: ['ARG'], year: 2002, dep: -0.5, stock: -0.4, layoff: 2, ja: '銀行の預金が引き出せなくなった (コラリート)。ドルの預金はペソに換えられ、価値は3分の1ほどになった。', en: 'Bank deposits were frozen (the corralito). Dollar savings were converted to pesos and lost about two thirds of their value.', stat: ['2002年5月、アルゼンチンの失業率は21.5%に達した (INDEC)', "Argentina's unemployment reached 21.5% in May 2002 (INDEC)"] },
  { codes: ['ARG'], year: 2019, dep: -0.15 },
  { codes: ['ARG'], year: 2023, dep: -0.4, ja: '物価が1年で3倍になった。店の値札は週ごとに書き換えられた。', en: 'Prices tripled in a year. Shop price tags were rewritten every week.', stat: ['アルゼンチンの2023年の物価上昇率は211% (INDEC)', "Argentina's inflation for 2023 was 211% (INDEC)"] },
  { codes: ['TUR'], year: 2001, dep: -0.15, stock: -0.3, layoff: 1.8, ja: '銀行が次々に破綻し、リラは半分の値になった。', en: 'Banks failed one after another and the lira lost half its value.', stat: ['トルコの経済は2001年に5.7%縮んだ (トルコ統計局)', "Turkey's economy shrank 5.7% in 2001 (TurkStat)"] },
  { codes: ['TUR'], year: 2018, dep: -0.05 },
  { codes: ['TUR'], year: 2021, dep: -0.12 },
  { codes: ['TUR'], year: 2022, dep: -0.3, ja: '物価が1年で7割上がった。貯金の値打ちは目に見えて減っていった。', en: 'Prices rose 70% in a year. Savings visibly melted away.', stat: ['トルコの2022年の物価上昇率は平均72% (トルコ統計局)', "Turkey's average inflation in 2022 was 72% (TurkStat)"] },
  { codes: ['EGY'], year: 2017, dep: -0.12, ja: '前の年の11月にポンドの固定相場がやめられ、値打ちは半分になった。輸入品の値段がいっせいに上がった。', en: 'The pound had been floated the previous November and lost half its value. Imported goods all went up at once.', stat: ['2016年11月の変動相場への移行で、エジプト・ポンドは1ドル約8.9から約18に下がった (エジプト中央銀行)', 'After the November 2016 float the Egyptian pound went from about 8.9 to about 18 per dollar (Central Bank of Egypt)'] },
  { codes: ['EGY'], year: 2023, dep: -0.12 },
  { codes: ['NGA'], year: 2016, dep: -0.08, layoff: 1.6, ja: '石油の値下がりで国の景気が縮み、給料の遅れる職場が増えた。', en: 'Falling oil prices pushed the country into recession. More and more workplaces paid wages late.', stat: ['ナイジェリアの経済は2016年に1.6%縮んだ (世界銀行)', "Nigeria's economy shrank 1.6% in 2016 (World Bank)"] },
  { codes: ['NGA'], year: 2024, dep: -0.15, ja: 'ナイラが大きく値を下げ、食べ物の値段が1年で4割ほど上がった。', en: 'The naira plunged and food prices rose about 40% in a year.', stat: ['ナイラは2023年6月からの1年あまりで、ドルに対し3分の1ほどの値になった (ナイジェリア中央銀行)', 'In little over a year from June 2023 the naira fell to about a third of its value against the dollar (Central Bank of Nigeria)'] },
  { codes: ['PAK'], year: 2023, dep: -0.1, layoff: 1.3, ja: '物価が1年で3割近く上がり、電気代と小麦粉の値段が家計を圧迫した。', en: 'Prices rose nearly 30% in a year. Electricity bills and the price of flour squeezed every household.', stat: ['パキスタンの物価上昇率は2023年5月に前年比38%に達した (パキスタン統計局)', "Pakistan's inflation reached 38% year on year in May 2023 (Pakistan Bureau of Statistics)"] },
  { codes: ['GHA'], year: 2022, dep: -0.2, ja: '物価の上がり方が年末には5割を超え、セディはドルに対して半分近く値を下げた。', en: 'By the end of the year prices were rising more than 50% a year, and the cedi had lost almost half its value against the dollar.', stat: ['ガーナの物価上昇率は2022年12月に54%に達した (ガーナ統計局)', "Ghana's inflation reached 54% in December 2022 (Ghana Statistical Service)"] },
  { codes: ['IRN'], year: 2012, dep: -0.12, ja: '制裁が強まり、リヤルは1年でドルに対し3分の1ほどの値になった。', en: 'Sanctions tightened and in one year the rial fell to about a third of its value against the dollar.' },
  { codes: ['IRN'], year: 2019, dep: -0.15, ja: '制裁の再開で物価が1年に4割ほど上がり、肉が食卓から消えた家も多かった。', en: 'With sanctions back, prices rose about 40% a year. Meat disappeared from many tables.', stat: ['イランの物価上昇率は2019年に約40% (世界銀行)', "Iran's inflation was about 40% in 2019 (World Bank)"] },
  { codes: ['IND'], year: 2016, layoff: 1.3, ja: '11月8日の夜、500ルピー札と1,000ルピー札が使えなくなると発表された。銀行の前に何日も行列が続いた。', en: 'On the night of 8 November it was announced that 500 and 1,000 rupee notes were no longer legal tender. Queues stretched outside banks for days.', stat: ['廃止された紙幣は、出回っていた現金の額の86%にあたった (インド準備銀行)', 'The withdrawn notes made up 86% of the cash in circulation by value (Reserve Bank of India)'] },
  { codes: ['USA'], year: 2001, layoff: 1.5, ja: 'ITバブルがはじけ、ネット企業の株は高値の何分の一にもなった。', en: 'The dot-com bubble burst. Internet stocks fell to a fraction of their peak.', stat: ['ナスダック総合指数は2000年3月の高値から2002年10月までに78%下がった', 'The Nasdaq Composite fell 78% from its March 2000 peak to October 2002'] },
  { codes: ['USA', 'GBR', 'IRL', 'ESP', 'ISL'], year: 2008, ja: '9月、大きな投資銀行が破綻し、世界中の株と家の値段が崩れた。', en: 'In September a major investment bank collapsed, and share and house prices fell all over the world.', stat: ['米国の失業率は2009年10月に10.0%に達した (米労働統計局)', 'US unemployment reached 10.0% in October 2009 (Bureau of Labor Statistics)'] },
  { codes: ['USA', 'GBR', 'IRL', 'ESP', 'ISL'], year: 2009, layoff: 2 },
  { codes: ['*'], year: 2009, layoff: 1.3 }, // 世界の経済が戦後はじめて縮んだ年 (世界銀行: -1.3%)
  { codes: ['GRC'], year: 2011, layoff: 2.5 },
  { codes: ['GRC'], year: 2012, layoff: 2.5, ja: '給料と年金が削られ、若い人の半分以上が仕事を見つけられなかった。', en: 'Wages and pensions were cut, and more than half of young people could not find work.', stat: ['ギリシャの失業率は2013年に27%を超えた (ギリシャ統計局)', "Greece's unemployment rate passed 27% in 2013 (ELSTAT)"] },
  // 2022年の物価高と、2023年の利上げ。日本と韓国は物価の上がり方が小さかった
  { codes: ['JPN'], year: 2022, dep: -0.02 },
  { codes: ['KOR'], year: 2022, dep: -0.04 },
  { codes: ['*'], year: 2022, dep: -0.06, ja: '物価が上がり続け、預けてあるお金の値打ちが目に見えて減った。', en: 'Prices kept climbing, and money in the bank was visibly worth less.', stat: ['2022年の世界の物価上昇率は約9%で、1990年代半ば以来の高さだった (世界銀行)', 'Global inflation in 2022 was about 9%, the highest since the mid-1990s (World Bank)'] },
  { codes: ['*'], year: 2023, debt: 0.05 }, // 政策金利がほぼ0から4〜5%へ上がり、借金の利息が重くなった
];

// 記録に書く文のある出来事。国の出来事を世界の出来事より先に見る
const newsOf = (code: string, year: number) =>
  SHOCKS.find((s) => s.year === year && s.codes.includes(code) && s.ja) ?? SHOCKS.find((s) => s.year === year && s.codes[0] === '*' && s.ja);
// 同じ年に、国の出来事と世界の出来事が両方あるとき、値はそれぞれの項目で先に見つかった方
const pick = <K extends 'dep' | 'debt' | 'layoff' | 'stock'>(code: string, year: number, k: K): number | undefined =>
  SHOCKS.find((s) => s.year === year && s.codes.includes(code) && s[k] !== undefined)?.[k] ?? SHOCKS.find((s) => s.year === year && s.codes[0] === '*' && s[k] !== undefined)?.[k];

// ---- これから先の景気の波 ---------------------------------------------------------
// 不況は8年に1度ほど (NBER: 米国は1945〜2020年に12回)、金融危機は50年に1度ほど
// (Laeven & Valencia 2018: 1970〜2017年に151件の銀行危機、約165か国 → 1国1年あたり約2%)。
// 世界の同時不況 (2009年・2020年のような年) は25年に1度として、どの国にも同じ年に来る。
// 国と年だけで決まるので、同じ年に同じ国にいる人は同じ景気を生きる (人生の乱数は使わない)
const P_CRISIS = 0.02, P_LOCAL = 0.08, P_GLOBAL = 0.04;
export type Phase = 'normal' | 'recession' | 'crisis';
const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
const draw = (key: string): Rng => makeRng(hash(key));
const globalRecession = (year: number) => draw(`WLD:${year}`)() < P_GLOBAL;
export function phaseOf(code: string, year: number): Phase {
  if (year <= HISTORY_TO) return 'normal';
  const u = draw(`${code}:${year}`)();
  if (u < P_CRISIS) return 'crisis';
  return u < P_CRISIS + P_LOCAL || globalRecession(year) ? 'recession' : 'normal';
}
// 平均を今の統計どおりに保つため、不況・危機の年に下がるぶんを、ふつうの年に少しずつ上乗せする
// 世界の同時不況は年ごとに一つに決まるので、確率ではなく 2100年までに実際に来る年の割合で割り戻す
const FUTURE = Array.from({ length: 2100 - HISTORY_TO }, (_, i) => HISTORY_TO + 1 + i);
const GLOBAL_SHARE = FUTURE.filter(globalRecession).length / FUTURE.length;
const P_REC = P_LOCAL + (1 - P_CRISIS - P_LOCAL) * GLOBAL_SHARE;
const DROP = { stock: { recession: -0.2, crisis: -0.35 }, house: { recession: -0.04, crisis: -0.12 } }; // 米国の不況の年の実質株価の平均は約 -9%、ふつうの年は +12% (上の表から)。家は銀行危機のあと数年で実質3割ほど下がる (Reinhart & Rogoff 2009)
const LAYOFF = { recession: 2, crisis: 3 }; // 不況の年は失業率がおよそ2〜3ポイント上がる
const lift = (d: { recession: number; crisis: number }) => -(P_REC * d.recession + P_CRISIS * d.crisis);
const shift = (d: { recession: number; crisis: number }, ph: Phase) => lift(d) + (ph === 'normal' ? 0 : d[ph]);
const LAYOFF_NORMAL = (1 - P_REC * LAYOFF.recession - P_CRISIS * LAYOFF.crisis) / (1 - P_REC - P_CRISIS);
export const layoffOf = (code: string, year: number): number => {
  if (year <= HISTORY_TO) return pick(code, year, 'layoff') ?? 1;
  const ph = phaseOf(code, year);
  return ph === 'normal' ? LAYOFF_NORMAL : LAYOFF[ph];
};

// ---- 個人の利回り -----------------------------------------------------------------
// 株: 過去は実際の値動き + 銘柄の違いによるぶれ。表のない国は世界の相場に、その国の危機と新興国らしい揺れを足す
export function stockReturn(p: Person, emerging: boolean): number {
  const year = yearOf(p);
  const code = p.country;
  if (year > HISTORY_TO) return normal(p.rng, 0.04 + shift(DROP.stock, phaseOf(code, year)), emerging ? 0.22 : 0.16);
  const own = at(STOCK, code, year);
  if (own !== undefined) return normal(p.rng, own, 0.04);
  const world = at(STOCK, 'WLD', year) ?? at(STOCK, 'USA', year) ?? 0.04;
  return normal(p.rng, world + (pick(code, year, 'stock') ?? 0), emerging ? 0.15 : 0.06);
}

// 家: mean と sd は今の統計での平均とぶれ。米国と韓国の過去は実際の値動き
export function houseReturn(p: Person, mean: number, sd: number): number {
  const year = yearOf(p);
  if (year > HISTORY_TO) return normal(p.rng, mean + shift(DROP.house, phaseOf(p.country, year)), sd);
  const own = at(HOUSE, p.country, year);
  return own !== undefined ? normal(p.rng, own, 0.03) : normal(p.rng, mean, sd);
}

export const depositRate = (p: Person, usual: number) => (yearOf(p) <= HISTORY_TO ? pick(p.country, yearOf(p), 'dep') : undefined) ?? usual;
export const debtRate = (p: Person, usual: number) => (yearOf(p) <= HISTORY_TO ? pick(p.country, yearOf(p), 'debt') : undefined) ?? usual;
export const layoffK = (p: Person) => layoffOf(p.country, yearOf(p));

// その年の経済の出来事を、大人の暮らしの記録に一行残す
export function economyNews(p: Person): void {
  if (p.age < 18) return;
  const year = yearOf(p);
  const key = `econ:${p.country}:${year}`;
  if (p.recent[key] !== undefined) return;
  if (year <= HISTORY_TO) {
    const s = newsOf(p.country, year);
    // 世界中の出来事 (2022年の物価高など) は、貯えのある人の話として書く
    if (!s?.ja || !s.en || (s.codes[0] === '*' && p.wealth <= 0)) return;
    p.recent[key] = p.age;
    log(p, L(s.ja, s.en), 'hard', false, s.stat && L(...s.stat));
    return;
  }
  // これから先の年は、危機と世界の同時不況だけを書く (国内の不況は失業で見える)
  const ph = phaseOf(p.country, year);
  if (ph === 'normal' || (ph === 'recession' && !globalRecession(year))) return;
  p.recent[key] = p.age;
  const c = countryOf(p);
  log(p, ph === 'crisis'
    ? L(`${c.name}で銀行が相次いで破綻し、金融危機になった。株と家の値段が大きく下がり、仕事を失う人が増えた。`, `Banks failed one after another in ${c.name}. In the financial crisis share and house prices fell hard and many lost their jobs.`)
    : L('世界中で景気が冷え込んだ。どの国でも、職を失う人が増えた。', 'A recession swept the world. In every country more people lost their jobs.'), 'hard');
}
