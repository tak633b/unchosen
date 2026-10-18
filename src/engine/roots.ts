// 生まれの区分 (インドのカースト・ネパールの集団・中国のウイグルとチベット) と、家族の成り立ち (養子・双子)。
// 生まれた時に一度だけ決める。乱数は主人公の乱数とは別に seed から作る (この仕組みが無い国・人生では、これまでと同じ人生になる)
import { byCode } from './countries';
import { familyNames, makeName, pickCity } from './identity';
import { log, yearOf, type Person, type Relative } from './person';
import { ensureBonds, freshName } from './bonds';
import { clamp, makeRng, normal, pickWeighted, type Rng } from './rng';
import { L } from '../i18n';

const mixSeed = (a: number, b: number, salt: number) => {
  let h = Math.imul(a ^ salt, 0x85ebca6b) ^ Math.imul(b + 0x9e3779b9, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return h >>> 0;
};
// その年・その出来事だけの乱数。主人公の乱数 (p.rng) を進めない
export const subRng = (p: Person, salt: number, age = p.age): Rng => makeRng(mixSeed(p.seed, age, salt));

type W<T> = [T, number][];
const draw = <T>(r: Rng, items: W<T>): T => pickWeighted(r, items, ([, w]) => w)[0];

// ---- 区分の名前 ---------------------------------------------------------
export const GROUP: Record<string, [string, string]> = {
  SC: ['指定カースト (SC)', 'Scheduled Caste (SC)'],
  ST: ['指定部族 (ST)', 'Scheduled Tribe (ST)'],
  OBC: ['その他の後進諸階級 (OBC)', 'Other Backward Class (OBC)'],
  GEN: ['一般', 'General'],
  khas: ['カス・アーリヤ (バフン・チェトリなど)', 'Khas-Arya (Bahun, Chhetri and others)'],
  magar: ['マガール', 'Magar'], tharu: ['タルー', 'Tharu'], tamang: ['タマン', 'Tamang'], newar: ['ネワール', 'Newar'],
  rai: ['ライ', 'Rai'], gurung: ['グルン', 'Gurung'], limbu: ['リンブー', 'Limbu'], sherpa: ['シェルパ', 'Sherpa'],
  dalit: ['ダリット', 'Dalit'], madhesi: ['マデシ', 'Madhesi'], muslimNP: ['ムスリム', 'Muslim'],
  uyghur: ['ウイグル族', 'Uyghur'], tibetan: ['チベット族', 'Tibetan'],
};
export const groupName = (g: string): string => L(...(GROUP[g] ?? [g, g]));
const JANAJATI = ['magar', 'tharu', 'tamang', 'newar', 'rai', 'gurung', 'limbu', 'sherpa'];

// ---- インド ------------------------------------------------------------
// 宗教ごとの社会集団の割合。NSSO 第68次調査 (2011-12) の宗教別・社会集団別の世帯 (概数)。
// 指定カーストは法律 (1950年の大統領令) でヒンドゥー・シク・仏教徒に限られる。ダリットのキリスト教徒・ムスリムは SC に入らない
const CASTE_BY_RELIGION: Record<string, W<string>> = {
  ヒンドゥー教: [['SC', 0.22], ['ST', 0.09], ['OBC', 0.43], ['GEN', 0.26]],
  イスラム教: [['ST', 0.01], ['OBC', 0.41], ['GEN', 0.58]],
  キリスト教: [['ST', 0.33], ['OBC', 0.24], ['GEN', 0.43]],
  シク教: [['SC', 0.32], ['ST', 0.01], ['OBC', 0.22], ['GEN', 0.45]],
  その他: [['SC', 0.3], ['ST', 0.4], ['OBC', 0.05], ['GEN', 0.25]], // 仏教徒の多くは SC (新仏教徒)、部族の宗教は ST
};
// 区分ごとの、資産五分位 (下から) の割合。NFHS-4 (2015-16) 世帯の資産指数 (概数)。
// 生まれた家の所得分位 (familyP) はもう決まっているので、ベイズでその家にいそうな区分を引く (全体の割合はほぼ変わらない)
const QUINTILE: Record<string, number[]> = {
  SC: [26.6, 25.3, 21.3, 16.8, 10.0],
  ST: [45.9, 25.1, 14.6, 8.9, 5.4],
  OBC: [18.3, 21.3, 21.2, 20.3, 18.9],
  GEN: [9.7, 13.9, 18.6, 24.6, 33.3],
};
// キリスト教徒のうち、ダリットの出の人。NSSO 第68次で SC と答えたキリスト教徒 (法律上は SC ではない)
const CHRISTIAN_DALIT = 0.09;

function india(p: Person, r: Rng): void {
  const q = Math.min(4, Math.floor(p.familyP * 5));
  const base = CASTE_BY_RELIGION[p.religion] ?? CASTE_BY_RELIGION['その他'];
  const group = draw(r, base.map(([g, w]) => [g, w * QUINTILE[g][q]] as [string, number]));
  const dalit = p.religion === 'キリスト教' && group !== 'ST' && r() < CHRISTIAN_DALIT / 0.67;
  p.roots = { ...p.roots, group, ...(dalit ? { dalit } : {}) };
  log(p, L(`出生の記録の区分は「${groupName(group)}」。`, `Category on the birth record: ${groupName(group)}.`), 'child', false,
    L('インドの人口の16.6%が指定カースト、8.6%が指定部族 (2011年国勢調査)', 'Scheduled Castes are 16.6% and Scheduled Tribes 8.6% of India (2011 census)'));
  if (dalit) log(p, L('家はダリットの出だが、キリスト教徒なので、法律の上では指定カーストに入らない。', 'The family has Dalit roots, but as Christians they are not a Scheduled Caste under Indian law.'), 'child');
}

// ---- ネパール ------------------------------------------------------------
// 2021年国勢調査の集団別人口 (%、概数。小さな集団は除いて割合で引く)
const NEPAL: W<string> = [
  ['khas', 30.5], ['magar', 6.9], ['tharu', 6.2], ['tamang', 5.6], ['newar', 5.0], ['rai', 2.2], ['gurung', 1.9], ['limbu', 1.5], ['sherpa', 0.4],
  ['dalit', 13.4], ['madhesi', 15.0], ['muslimNP', 4.9],
];
// 家で話す言葉。2021年国勢調査の母語別人口を、その言葉を話す集団の人口で割った概算
const LANG: Record<string, [string, string]> = {
  ne: ['ネパール語', 'Nepali'], mgp: ['マガール語', 'Magar'], thl: ['タルー語', 'Tharu'], taj: ['タマン語', 'Tamang'], new: ['ネワール語', 'Nepal Bhasa'],
  rai: ['ライ諸語', 'a Rai language'], gvr: ['グルン語', 'Gurung'], lif: ['リンブー語', 'Limbu'], xsr: ['シェルパ語', 'Sherpa'],
  mai: ['マイティリ語', 'Maithili'], bho: ['ボージプリー語', 'Bhojpuri'], bjj: ['バッジカ語', 'Bajjika'], awa: ['アワディー語', 'Awadhi'], ur: ['ウルドゥー語', 'Urdu'],
  ug: ['ウイグル語', 'Uyghur'], bo: ['チベット語', 'Tibetan'],
};
const MADHESI_LANG: W<string> = [['mai', 0.46], ['bho', 0.26], ['bjj', 0.16], ['awa', 0.12]];
const NEPAL_LANG: Record<string, W<string>> = {
  khas: [['ne', 1]], magar: [['mgp', 0.4], ['ne', 0.6]], tharu: [['thl', 0.95], ['ne', 0.05]], tamang: [['taj', 0.88], ['ne', 0.12]],
  newar: [['new', 0.6], ['ne', 0.4]], rai: [['rai', 0.8], ['ne', 0.2]], gurung: [['gvr', 0.5], ['ne', 0.5]], limbu: [['lif', 0.8], ['ne', 0.2]],
  sherpa: [['xsr', 0.9], ['ne', 0.1]], dalit: [['ne', 0.7], ['mai', 0.3]], madhesi: MADHESI_LANG, muslimNP: [['ur', 0.5], ...MADHESI_LANG.map(([l, w]) => [l, w * 0.5] as [string, number])],
};
// 姓: nepali の姓のうち、その集団に多いもの。ダリット・マデシ・ムスリムは姓の伝統ごと替える
const NEPAL_SURNAMES: Record<string, string[]> = {
  khas: ['Thapa', 'Karki', 'Adhikari', 'Poudel', 'Sharma', 'Bhattarai', 'KC', 'Basnet', 'Khadka', 'Bhandari', 'Shahi', 'Pandey', 'Acharya', 'Ghimire', 'Koirala', 'Dahal', 'Pokharel', 'Sapkota', 'Bista', 'Thakuri', 'Regmi', 'Neupane', 'Subedi', 'Upadhyay', 'Gautam', 'Chhetri', 'Khatri', 'Oli', 'Dhakal', 'Devkota', 'Khanal', 'Tiwari', 'Aryal'],
  magar: ['Magar', 'Pun', 'Ale', 'Budha', 'Rana', 'Thapa'], tharu: ['Tharu', 'Chaudhary', 'Mahato'], tamang: ['Tamang', 'Lama'],
  newar: ['Shrestha', 'Maharjan', 'Shakya', 'Tuladhar', 'Pradhan', 'Amatya', 'Bajracharya', 'Dangol', 'Manandhar', 'Rajbhandari'],
  rai: ['Rai'], gurung: ['Gurung'], limbu: ['Limbu'], sherpa: ['Sherpa', 'Lama'],
};
const NEPAL_POOL: Record<string, string> = { dalit: 'nepali_dalit', madhesi: 'nepali_madhesi', muslimNP: 'nepali_muslim' };

function nepal(p: Person, r: Rng): void {
  // 宗教とつじつまを合わせる: ムスリムはムスリムの集団、仏教徒は仏教徒の多い山の集団から
  const allowed = p.religion === 'イスラム教' ? ['muslimNP']
    : p.religion === '仏教' ? ['tamang', 'sherpa', 'gurung', 'newar', 'magar'] : NEPAL.map(([g]) => g).filter((g) => g !== 'muslimNP');
  const group = draw(r, NEPAL.filter(([g]) => allowed.includes(g)));
  const lang = draw(r, NEPAL_LANG[group]);
  const pool = NEPAL_POOL[group] ?? 'nepali';
  const names = NEPAL_SURNAMES[group];
  if (names) renameFamily(p, r, pool, familyIndexOf(pool, names[Math.floor(r() * names.length)]));
  else renameFamily(p, r, pool);
  p.roots = { ...p.roots, group, lang: L(...LANG[lang]) };
  const kind = group === 'khas' ? '' : JANAJATI.includes(group) ? L('先住の諸民族 (ジャナジャティ) の', 'one of the Indigenous Janajati peoples, ') : '';
  log(p, L(`家は${kind}${groupName(group)}で、家で話す言葉は${L(...LANG[lang])}。`, `The family is ${kind}${groupName(group)}, and speaks ${L(...LANG[lang])} at home.`), 'child', false,
    L('ネパールでは国民の約45%が母語をネパール語と答え、120を超える言葉が話されている (2021年国勢調査)', 'About 45% of Nepal names Nepali as their mother tongue; more than 120 languages are spoken (2021 census)'));
}

// ---- 中国 ------------------------------------------------------------
// 人口に占める割合 (2020年国勢調査): ウイグル族 1177万人 = 0.83%、チベット族 706万人 = 0.50%
const CHINA: W<'uyghur' | 'tibetan' | null> = [['uyghur', 0.0083], ['tibetan', 0.005], [null, 1 - 0.0133]];
const CHINA_CITIES = {
  // 南疆 (カシュガル・ホータン・アクス) と区都。ウイグル族の多くは南疆に住む
  uyghur: [['カシュガル', 'Kashgar'], ['ホータン', 'Hotan'], ['アクス', 'Aksu'], ['ウルムチ', 'Ürümqi']],
  // チベット自治区・青海・四川 (カンゼ)
  tibetan: [['ラサ', 'Lhasa'], ['シガツェ', 'Shigatse'], ['西寧', 'Xining'], ['カンゼ', 'Garzê']],
};
// 農村部の1人あたり可処分所得の、全国の農村部に対する比 (中国統計年鑑 2021、2020年の値): 新疆 14,056元・チベット 14,598元 / 全国 17,131元
const CHINA_INCOME = { uyghur: 14056 / 17131, tibetan: 14598 / 17131 };
// 平均寿命 (2020年前後): 全国 77.9歳 (2020年国勢調査)、新疆 74.7歳 (2019年、新疆の人口白書 2021)、チベット自治区 72.2歳 (2021年、自治区統計局)。
// 差を、年齢ごとの死亡率の倍率に直す。所得の低さ・農村の多さで縮むぶん (実測で約0.7年・1.4年) を除いた残りが、
// 1990年生まれの中国で出るように実測で決めた値 (roots.test.ts。全国 79.7歳に対しウイグル族 約76.5歳・チベット族 約74歳)
// ponytail: 省・自治区全体の値。ウイグル族・チベット族だけの生命表は公表されていない
const CHINA_MORT = { uyghur: 1.18, tibetan: 1.32 };
// 2020年の都市化率: チベット自治区 35.7%、南疆の地区もおよそ3〜4割 (国勢調査)
const CHINA_URBAN = 0.36;

function china(p: Person, r: Rng): void {
  const g = draw(r, CHINA);
  if (!g) return;
  p.religion = g === 'uyghur' ? 'イスラム教' : '仏教';
  p.rural = r() >= CHINA_URBAN;
  const cities = CHINA_CITIES[g];
  const ci = cities[Math.min(cities.length - 1, Math.floor(r() * cities.length))];
  p.city = p.rural ? null : L(ci[0], ci[1]);
  p.familyP = p.birthP = p.incomeP = clamp(p.familyP * CHINA_INCOME[g], 0.01, 0.99);
  renameFamily(p, r, g);
  p.roots = { ...p.roots, group: g, lang: L(...LANG[g === 'uyghur' ? 'ug' : 'bo']) };
}

function chinaLog(p: Person): void {
  const g = p.roots!.group!;
  const lang = L(...LANG[g === 'uyghur' ? 'ug' : 'bo']);
  log(p, L(`家は${groupName(g)}で、家で話す言葉は${lang}。`, `The family is ${groupName(g)} and speaks ${lang} at home.`), 'child', false,
    L('中国のウイグル族は1177万人、チベット族は706万人 (2020年国勢調査)', 'China counts 11.77 million Uyghurs and 7.06 million Tibetans (2020 census)'));
}

// 生まれの話 (life.ts の birthStory) より前に決めること: 宗教・住む町・家の暮らし向きを変えるもの
export function origin(p: Person): void {
  if (p.birthCountry === 'CHN') china(p, subRng(p, 0x7008));
}

export function rootsMortality(p: Person): number {
  const g = p.roots?.group;
  return p.country === 'CHN' && (g === 'uyghur' || g === 'tibetan') ? CHINA_MORT[g] : 1;
}

// ---- 名前の付け直し ------------------------------------------------------
const familyIndexOf = (pool: string, surname: string): number | undefined => {
  const i = familyNames(pool).indexOf(surname);
  return i >= 0 ? i : undefined;
};

// 主人公・親・きょうだいの名を、新しい命名の伝統で付け直す
function renameFamily(p: Person, r: Rng, pool: string, index?: number): void {
  const fam = { pool, index: index ?? Math.floor(r() * familyNames(pool).length) };
  const code = p.country;
  const keys: string[] = [];
  const me = freshName(() => makeName(r, code, p.sex, fam, undefined, p.birthYear), keys);
  Object.assign(p, { given: me.given, name: me.full, pool, familyIndex: fam.index });
  for (const rel of [p.mother, p.father, ...p.siblings]) rel.name = freshName(() => makeName(r, code, rel.sex, fam, undefined, yearOf(p) - rel.age), keys).given;
  p.nameKeys = keys;
}

// ---- 養子 ------------------------------------------------------------
// 生まれた国から外国へ養子に出る割合 (その年の出生に対して)。Selman, "Global statistics for intercountry adoption" (2009・2012) の
// 送り出し国別の件数を、国連 WPP の出生数で割った概算。[この年から, 割合]
const ABROAD: Record<string, [number, number][]> = {
  KOR: [[1953, 0.0004], [1970, 0.0035], [1975, 0.007], [1980, 0.0085], [1985, 0.012], [1990, 0.0036], [2000, 0.0045], [2005, 0.0033], [2010, 0.0017], [2015, 0.0009], [2020, 0.0004]],
  CHN: [[1992, 0.0002], [2000, 0.0005], [2005, 0.0008], [2010, 0.0003], [2015, 0.00015], [2020, 0]],
  GTM: [[1990, 0.0026], [2000, 0.006], [2005, 0.01], [2008, 0]],
  RUS: [[1992, 0.003], [2000, 0.006], [2005, 0.003], [2010, 0.0017], [2013, 0.0004]],
  ETH: [[1995, 0.0002], [2005, 0.0012], [2010, 0.0013], [2013, 0.0003], [2018, 0]],
  VNM: [[1990, 0.0004], [2000, 0.0006], [2009, 0.0002]],
  COL: [[1975, 0.0015], [1985, 0.002], [2010, 0.0007]],
  HTI: [[1995, 0.002], [2000, 0.004], [2010, 0.008], [2012, 0.002]],
  UKR: [[1992, 0.002], [2000, 0.004], [2010, 0.0015]],
  ROU: [[1990, 0.03], [1992, 0.008], [2001, 0]],
};
// 国内で、血縁のない家の養子になる赤ちゃんの割合。米国: 1970年に血縁外の養子約8万9千人 / 出生370万 (NCFA Adoption Factbook)、
// 英国 (イングランドとウェールズ): 1968年の養子2万5千人の多く (ONS)、韓国: 保健福祉部の国内養子の件数、日本: 特別養子縁組の成立件数 (司法統計)
const DOMESTIC: Record<string, [number, number][]> = {
  USA: [[1950, 0.02], [1973, 0.006], [1990, 0.004]],
  GBR: [[1950, 0.015], [1976, 0.003], [1990, 0.0005]],
  KOR: [[1960, 0.002], [1990, 0.0025], [2012, 0.0012]],
  JPN: [[1988, 0.0004]],
};
// 外国への養子の行き先 (Selman 2009: 受け入れ国の件数の割合、概数)。韓国の子は約3分の2が米国へ
const DEST_KOR: W<string> = [['USA', 0.66], ['FRA', 0.07], ['SWE', 0.05], ['DNK', 0.04], ['NOR', 0.03], ['NLD', 0.03], ['BEL', 0.03], ['AUS', 0.03], ['CAN', 0.03], ['DEU', 0.03]];
const DEST: W<string> = [['USA', 0.5], ['ESP', 0.1], ['ITA', 0.1], ['FRA', 0.1], ['CAN', 0.05], ['SWE', 0.05], ['NLD', 0.05], ['DEU', 0.05]];

const rateAt = (table: [number, number][] | undefined, year: number): number => {
  let v = 0;
  for (const [from, rate] of table ?? []) if (year >= from) v = rate;
  return v;
};
export const adoptionRates = (code: string, year: number) => ({ abroad: rateAt(ABROAD[code], year), domestic: rateAt(DOMESTIC[code], year) });

function adoption(p: Person, r: Rng): boolean {
  const { abroad, domestic } = adoptionRates(p.birthCountry, p.birthYear);
  const u = r();
  if (u >= abroad + domestic) return false;
  const out = u < abroad;
  const at = Math.floor(r() * 12); // 生後何か月で
  // 養子を迎える親は年が上 (米国の養親の母の中央値はおよそ30代後半)。ponytail: 国によらず同じ分布
  p.mother.age = Math.round(clamp(normal(r, 36, 5), 24, 50));
  p.father.age = Math.round(clamp(p.mother.age + normal(r, 2, 3), 24, 60));
  if (out) {
    const dest = draw(r, p.birthCountry === 'KOR' ? DEST_KOR : DEST);
    const from = byCode(p.birthCountry).name;
    p.country = dest;
    p.countriesLived = [...p.countriesLived, dest];
    p.rural = false;
    p.city = pickCity(r, dest);
    // 外国から養子を迎える家は暮らしにゆとりのある家が多い。ponytail: 上半分から一様に引く (NSAP 2007 では養親の家の3分の2が貧困線の2倍以上)
    p.familyP = p.incomeP = clamp(0.5 + r() * 0.45, 0.01, 0.99);
    // 生まれた家のきょうだいとは別れる (養家のきょうだいは作らない。ponytail)
    p.siblings = [];
    renameFamily(p, r, makeName(r, dest, p.sex, undefined, undefined, p.birthYear).pool);
    p.mother.country = p.father.country = dest;
    p.roots = { ...p.roots, adopted: { from: p.birthCountry, abroad: true, at } };
    log(p, L(`生後${at || 1}か月で、${byCode(dest).name}の夫婦の養子になった。新しい名前は${p.name}。生まれた${from}の記録は、施設の書類に残っている。`,
      `At ${at || 1} month${at > 1 ? 's' : ''} old, was adopted by a couple in ${byCode(dest).name} and given a new name: ${p.name}. The records from ${from} stayed in an agency file.`), 'move', true,
    L('韓国からは1953年以降、約17万人の子が外国へ養子に出た。1985年には生まれた子のおよそ75人に1人 (韓国保健福祉部)', 'Since 1953 about 170,000 children have been adopted out of South Korea; in 1985 it was about 1 in 75 births (Korean Ministry of Health and Welfare)'));
  } else {
    // 養親は年が上なので、母が45歳を過ぎてから生まれるはずだった弟妹は外す
    p.siblings = p.siblings.filter((s) => s.age >= 0 || p.mother.age - s.age <= 45);
    p.roots = { ...p.roots, adopted: { from: p.birthCountry, abroad: false, at } };
    log(p, L(`生後${at || 1}か月で、${p.mother.name}と${p.father.name}の養子になった。`, `At ${at || 1} month${at > 1 ? 's' : ''} old, was adopted by ${p.mother.name} and ${p.father.name}.`), 'family', false);
  }
  return true;
}

// ---- 双子 ------------------------------------------------------------
// 1000回の出産あたりの双子の出産 (Monden, Pison & Smits 2021, Human Reproduction)。1980-85年と2010-15年の値を直線で結ぶ。
// 体外受精の広がった豊かな国で増え、サハラ以南のアフリカはもとから高い
const NORTH_AFRICA = ['EGY', 'LBY', 'TUN', 'DZA', 'MAR', 'SDN'];
function twinRate(code: string, year: number): number {
  const c = byCode(code);
  const [a, b] = c.region === 'アフリカ' ? (NORTH_AFRICA.includes(code) ? [9, 11] : [17.2, 17.1])
    : ['USA', 'CAN'].includes(code) ? [9.5, 17.0]
      : c.region === 'ヨーロッパ' ? [9.1, 16.0]
        : ['AUS', 'NZL'].includes(code) ? [9.9, 14.6]
          : c.region === 'アジア' ? [8.0, 10.4] : [8.9, 9.3];
  const t = clamp((year - 1982) / 30, 0, 1);
  return (a + (b - a) * t) / 1000;
}
// 生まれた一人が双子である確率 = 双子の出産の子の数 / 子の数
export const twinChance = (code: string, year: number): number => { const t = twinRate(code, year); return (2 * t) / (1 + t); };
// 一卵性の双子は、どこでも1000回の出産あたり約4 (同じ論文)
const MZ = 0.004;

function twin(p: Person, r: Rng): void {
  if (r() >= twinChance(p.birthCountry, p.birthYear)) return;
  const identical = r() < MZ / twinRate(p.birthCountry, p.birthYear);
  const sex = identical ? p.sex : r() < 0.5 ? 'M' : 'F';
  const fam = { pool: p.pool, index: p.familyIndex };
  const s: Relative = { alive: true, age: 0, sex, name: freshName(() => makeName(r, p.birthCountry, sex, fam, undefined, p.birthYear), (p.nameKeys ??= [])).given };
  p.siblings = [...p.siblings, s];
  ensureBonds(p);
  s.bond = 72; // 同じ日に生まれたきょうだい
  p.roots = { ...p.roots, twin: s.id };
  const kind = identical ? L('一卵性の', 'identical ') : '';
  log(p, L(`${kind}双子として生まれた。もう一人は${s.name}。`, `Born ${identical ? 'an identical' : 'a'} twin. The other one is ${s.name}.`), 'child', false,
    L('双子の出産は世界で1000回に約12回。サハラ以南のアフリカでは約17回 (Monden ほか 2021)', 'About 12 in 1,000 births worldwide are twins; about 17 in sub-Saharan Africa (Monden et al. 2021)'));
}

// 生まれた時に一度だけ (life.ts の createPerson)。輪の人の一生 (kin.ts) では呼ばない
export function roots(p: Person): void {
  const r = subRng(p, 0x7007);
  if (p.birthCountry === 'IND') india(p, r);
  else if (p.birthCountry === 'NPL') nepal(p, r);
  else if (p.roots?.group === 'uyghur' || p.roots?.group === 'tibetan') chinaLog(p);
  if (!adoption(p, r)) twin(p, r);
}
