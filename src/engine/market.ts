// お金の置き場所と、その年の市場の値動き。利回りはどれも物価上昇を引いた実質。
//
// marketReturn(asset, year, country, rng) が「その年・その国で、その資産が何%動いたか」を返す唯一の関数。
// ふだんは historyReturn: 過去の年は実際の値動きと経済危機 (1900〜1949年は market1900.ts の JST の表)、これから先の年は景気の波 (不況と金融危機)、
// 表のない国・資産は長い目で見た統計 (下の LONG_RUN)。
// テストなどで setMarketReturn(fn) を差し替えられる。fn が undefined を返した年・資産は historyReturn に戻る。
// 預金・債券・株・不動産ファンド・家の値段の5つだけを聞く。バランス型と個別株はここから組み立てる (fundReturn)
import type { Country } from './countries';
import { L } from '../i18n';
import { countryOf, log, yearOf, type Person } from './person';
import { makeRng, normal, type Rng } from './rng';
import { EARLY, EARLY_FROM, EARLY_WORLD, type EarlyAsset } from './market1900';

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
  // ---- 1900〜1949年: market1900.ts の表 (JST) の無い国の、物価の大崩れ。預金と債券がほぼ消えた年 ----
  // 物価の上がり方からの目安 (Hanke & Krus 2012 "World Hyperinflations"、Sargent 1982 "The Ends of Four Big Inflations")。暮らしの話は events/*.json が書く
  ...([[1918, -0.8], [1919, -0.9], [1920, -0.9], [1921, -0.9], [1922, -0.99], [1923, -0.99]] as const).map(([year, dep]) => ({ codes: ['RUS', 'UKR', 'BLR', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'], year, dep })), // 革命と内戦、1922〜24年のルーブルの崩壊
  { codes: ['MEX'], year: 1915, dep: -0.9 }, { codes: ['MEX'], year: 1916, dep: -0.95 }, // 革命の各派が刷った紙幣が値打ちを失った
  { codes: ['AUT'], year: 1921, dep: -0.8 }, { codes: ['AUT'], year: 1922, dep: -0.95 },
  { codes: ['HUN'], year: 1923, dep: -0.9 }, { codes: ['HUN'], year: 1924, dep: -0.5 },
  { codes: ['POL'], year: 1923, dep: -0.99 },
  // 日中戦争からの国民政府の紙幣の崩壊 (重慶の物価は1937〜45年に約2,000倍、Young 1965)、1948年の金円券
  ...([[1938, -0.3], [1939, -0.5], [1940, -0.6], [1941, -0.6], [1942, -0.6], [1943, -0.6], [1944, -0.6], [1945, -0.9], [1946, -0.8], [1947, -0.9], [1948, -0.99], [1949, -0.99]] as const).map(([year, dep]) => ({ codes: ['CHN'], year, dep })),
  { codes: ['GRC'], year: 1942, dep: -0.9 }, { codes: ['GRC'], year: 1943, dep: -0.9 }, { codes: ['GRC'], year: 1944, dep: -0.99 },
  { codes: ['PHL'], year: 1944, dep: -0.99 }, // 日本の占領下の軍票
  { codes: ['MYS', 'SGP', 'IDN', 'MMR'], year: 1945, dep: -0.95 }, // 日本の軍票は敗戦で紙くずになった
  { codes: ['KOR'], year: 1945, dep: -0.9 }, { codes: ['KOR'], year: 1946, dep: -0.7 }, { codes: ['KOR'], year: 1947, dep: -0.5 }, // 日本と同じ円の地域。解放後も物価が何十倍にもなった (目安)
  { codes: ['HUN'], year: 1945, dep: -0.99 }, { codes: ['HUN'], year: 1946, dep: -0.99 },
  { codes: ['ROU'], year: 1946, dep: -0.9 }, { codes: ['ROU'], year: 1947, dep: -0.95 }, // 1947年8月、2万対1で新しいレウへ
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

// ---- ふだんの値動き -------------------------------------------------------------------
// 不動産ファンドの家賃のぶん (総収益と家の値上がりの差)
const RENT = LONG_RUN.realestate[0] - LONG_RUN.house[0];

// ---- 1900〜1949年 -------------------------------------------------------------------------
// 表 (market1900.ts、JST の16か国) のある国は実際の値動き。無い国は統計どおりの1年に、世界の株の値動きと物価の大崩れ (SHOCKS) を足す。
// 乱数の引き方は1950年からと同じ (預金は引かず、ほかは1回)。1年で失うのは99%まで (残高が0や負にならない)
const EARLY_TO = 1949;
const early = (code: string, a: EarlyAsset, year: number): number | undefined => {
  const v = EARLY[code]?.[a][year - EARLY_FROM];
  return v == null ? undefined : v / 100;
};
function earlyReturn(asset: MarketAsset, year: number, c: Country, rng: Rng): number {
  const own = early(c.code, asset === 'realestate' ? 'house' : asset, year);
  const dep = pick(c.code, year, 'dep');
  let r: number;
  switch (asset) {
    case 'deposit': r = own ?? dep ?? DEPOSIT; break;
    case 'bond': r = own !== undefined ? normal(rng, own, 0.02) : longRunReturn('bond', year, c, rng) + (dep === undefined ? 0 : dep - DEPOSIT); break;
    case 'stock': r = own !== undefined ? normal(rng, own, 0.04) : normal(rng, EARLY_WORLD[year - EARLY_FROM] / 100 + (pick(c.code, year, 'stock') ?? 0), c.gdp < 25000 ? 0.15 : 0.06); break;
    default: r = own === undefined ? longRunReturn(asset, year, c, rng) : asset === 'house' ? normal(rng, own, 0.03) : normal(rng, own + RENT, 0.06);
  }
  return Math.max(-0.99, r);
}

export function historyReturn(asset: MarketAsset, year: number, c: Country, rng: Rng): number {
  if (year >= EARLY_FROM && year <= EARLY_TO) return earlyReturn(asset, year, c, rng);
  const code = c.code;
  const emerging = c.gdp < 25000;
  if (year > HISTORY_TO) {
    if (asset === 'deposit' || asset === 'bond') return longRunReturn(asset, year, c, rng);
    const [mean, sd, sdEm] = LONG_RUN[asset];
    const ph = phaseOf(code, year);
    return normal(rng, mean + shift(asset === 'stock' ? DROP.stock : DROP.house, ph), emerging ? sdEm : sd);
  }
  const dep = pick(code, year, 'dep');
  switch (asset) {
    case 'deposit': return dep ?? DEPOSIT;
    // 物価が急に上がった年は、債券も預金と同じだけ目減りする
    case 'bond': return longRunReturn('bond', year, c, rng) + (dep === undefined ? 0 : dep - DEPOSIT);
    case 'stock': {
      // 表のある国は実際の値動き + 銘柄の違いによるぶれ。ない国は世界の相場に、その国の危機と新興国らしい揺れを足す
      const own = at(STOCK, code, year);
      if (own !== undefined) return normal(rng, own, 0.04);
      const world = at(STOCK, 'WLD', year) ?? at(STOCK, 'USA', year);
      if (world === undefined) return longRunReturn('stock', year, c, rng) + (pick(code, year, 'stock') ?? 0);
      return normal(rng, world + (pick(code, year, 'stock') ?? 0), emerging ? 0.15 : 0.06);
    }
    // 米国と韓国の過去は実際の家の値動き。不動産ファンドはそこに家賃が乗る
    case 'house': case 'realestate': {
      const own = at(HOUSE, code, year);
      if (own === undefined) return longRunReturn(asset, year, c, rng);
      return asset === 'house' ? normal(rng, own, 0.03) : normal(rng, own + RENT, 0.06);
    }
  }
}

let source: MarketReturn | null = null;
// 差し替える。null でふだんの値動き (historyReturn) に戻す
export function setMarketReturn(fn: MarketReturn | null): void { source = fn; }

export function marketReturn(asset: MarketAsset, year: number, c: Country, rng: Rng): number {
  return source?.(asset, year, c, rng) ?? historyReturn(asset, year, c, rng);
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


// 借金の金利。過去の経済危機の年 (韓国1998年など) はその年の金利に置き換える
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
