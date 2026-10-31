// 言葉: 住んでいる国の言葉を、暮らすうちに覚える (本家 v0.8.69 / 0.8.85)。
// 段階は 0 初級 / 1 日常会話 / 2 仕事で使える / 3 母語並み。移った年から毎年1段階ずつ上がり、
// 幼いうち (12歳未満) に移った子と、自分の言葉に近い言葉 (同じ語族) は速い。授業を受けた年は2段階。
import { byCode, type Country } from './countries';
import { earnings } from './economy';
import { decide, eduLevel, log, type Person } from './person';
import { L } from '../i18n';

export type LangLevel = 0 | 1 | 2 | 3;

// 国でいちばん使われる言葉 (公用語か、日常で最も話される言葉)。多言語の国は、仕事と学校で使われる方を一つだけ (ponytail)
const LANG: Record<string, string> = {
  USA: 'en', GBR: 'en', AUS: 'en', CAN: 'en', NZL: 'en', IRL: 'en', SGP: 'en', NGA: 'en', GHA: 'en', KEN: 'en', UGA: 'en', ZMB: 'en', ZWE: 'en',
  MWI: 'en', LBR: 'en', SLE: 'en', GMB: 'en', JAM: 'en', TTO: 'en', GUY: 'en', FJI: 'en', PNG: 'en', SLB: 'en', BWA: 'en', NAM: 'en', LSO: 'en',
  SWZ: 'en', MLT: 'en', PHL: 'en', ZAF: 'en', MUS: 'en', IND: 'hi', PAK: 'ur', BGD: 'bn', NPL: 'ne', LKA: 'si', BTN: 'dz', MDV: 'dv',
  DEU: 'de', AUT: 'de', CHE: 'de', LUX: 'de', NLD: 'nl', BEL: 'nl', SWE: 'sv', NOR: 'no', DNK: 'da', ISL: 'is',
  FRA: 'fr', SEN: 'fr', CIV: 'fr', CMR: 'fr', MLI: 'fr', BFA: 'fr', NER: 'fr', TCD: 'fr', BEN: 'fr', TGO: 'fr', GIN: 'fr', GAB: 'fr', COG: 'fr',
  COD: 'fr', CAF: 'fr', BDI: 'fr', RWA: 'fr', MDG: 'fr', HTI: 'fr', DJI: 'fr', COM: 'fr', GNQ: 'es',
  ESP: 'es', MEX: 'es', ARG: 'es', COL: 'es', PER: 'es', VEN: 'es', CHL: 'es', ECU: 'es', GTM: 'es', CUB: 'es', BOL: 'es', DOM: 'es',
  HND: 'es', PRY: 'es', SLV: 'es', NIC: 'es', CRI: 'es', PAN: 'es', URY: 'es', PRT: 'pt', BRA: 'pt', AGO: 'pt', MOZ: 'pt', GNB: 'pt', CPV: 'pt', TLS: 'pt',
  ITA: 'it', ROU: 'ro', MDA: 'ro', RUS: 'ru', BLR: 'ru', KAZ: 'ru', KGZ: 'ru', UKR: 'uk', POL: 'pl', CZE: 'cs', SVK: 'sk', BGR: 'bg', SRB: 'sr',
  HRV: 'hr', BIH: 'bs', MNE: 'sr', MKD: 'mk', SVN: 'sl', LTU: 'lt', LVA: 'lv', EST: 'et', FIN: 'fi', HUN: 'hu', GRC: 'el', CYP: 'el', ALB: 'sq',
  TUR: 'tr', AZE: 'az', TKM: 'tk', UZB: 'uz', TJK: 'tg', MNG: 'mn', GEO: 'ka', ARM: 'hy', IRN: 'fa', AFG: 'fa',
  SAU: 'ar', EGY: 'ar', IRQ: 'ar', SYR: 'ar', JOR: 'ar', LBN: 'ar', PSE: 'ar', LBY: 'ar', TUN: 'ar', DZA: 'ar', MAR: 'ar', SDN: 'ar', YEM: 'ar',
  ARE: 'ar', KWT: 'ar', QAT: 'ar', BHR: 'ar', OMN: 'ar', MRT: 'ar', SOM: 'so', ETH: 'am', ERI: 'ti', TZA: 'sw', ISR: 'he',
  JPN: 'ja', KOR: 'ko', PRK: 'ko', CHN: 'zh', TWN: 'zh', HKG: 'zh', VNM: 'vi', THA: 'th', LAO: 'lo', KHM: 'km', MMR: 'my', MYS: 'ms', IDN: 'id',
};
// 同じ語族 (近い言葉): 覚えるのが1段階ぶん速い
const FAMILY: Record<string, string> = {
  es: 'romance', pt: 'romance', it: 'romance', fr: 'romance', ro: 'romance',
  en: 'germanic', de: 'germanic', nl: 'germanic', sv: 'germanic', no: 'germanic', da: 'germanic', is: 'germanic',
  ru: 'slavic', uk: 'slavic', pl: 'slavic', cs: 'slavic', sk: 'slavic', bg: 'slavic', sr: 'slavic', hr: 'slavic', bs: 'slavic', mk: 'slavic', sl: 'slavic',
  hi: 'indic', ur: 'indic', bn: 'indic', ne: 'indic', si: 'indic',
  tr: 'turkic', az: 'turkic', tk: 'turkic', uz: 'turkic', kk: 'turkic',
  ms: 'malay', id: 'malay', fa: 'iranian', tg: 'iranian', ar: 'semitic', he: 'semitic', am: 'semitic', ti: 'semitic',
};
const NAME: Record<string, [string, string]> = {
  en: ['英語', 'English'], hi: ['ヒンディー語', 'Hindi'], ur: ['ウルドゥー語', 'Urdu'], bn: ['ベンガル語', 'Bengali'], ne: ['ネパール語', 'Nepali'], si: ['シンハラ語', 'Sinhala'],
  dz: ['ゾンカ語', 'Dzongkha'], dv: ['ディベヒ語', 'Dhivehi'], de: ['ドイツ語', 'German'], nl: ['オランダ語', 'Dutch'], sv: ['スウェーデン語', 'Swedish'], no: ['ノルウェー語', 'Norwegian'],
  da: ['デンマーク語', 'Danish'], is: ['アイスランド語', 'Icelandic'], fr: ['フランス語', 'French'], es: ['スペイン語', 'Spanish'], pt: ['ポルトガル語', 'Portuguese'], it: ['イタリア語', 'Italian'],
  ro: ['ルーマニア語', 'Romanian'], ru: ['ロシア語', 'Russian'], uk: ['ウクライナ語', 'Ukrainian'], pl: ['ポーランド語', 'Polish'], cs: ['チェコ語', 'Czech'], sk: ['スロバキア語', 'Slovak'],
  bg: ['ブルガリア語', 'Bulgarian'], sr: ['セルビア語', 'Serbian'], hr: ['クロアチア語', 'Croatian'], bs: ['ボスニア語', 'Bosnian'], mk: ['マケドニア語', 'Macedonian'], sl: ['スロベニア語', 'Slovene'],
  lt: ['リトアニア語', 'Lithuanian'], lv: ['ラトビア語', 'Latvian'], et: ['エストニア語', 'Estonian'], fi: ['フィンランド語', 'Finnish'], hu: ['ハンガリー語', 'Hungarian'], el: ['ギリシャ語', 'Greek'],
  sq: ['アルバニア語', 'Albanian'], tr: ['トルコ語', 'Turkish'], az: ['アゼルバイジャン語', 'Azerbaijani'], tk: ['トルクメン語', 'Turkmen'], uz: ['ウズベク語', 'Uzbek'], tg: ['タジク語', 'Tajik'],
  mn: ['モンゴル語', 'Mongolian'], ka: ['ジョージア語', 'Georgian'], hy: ['アルメニア語', 'Armenian'], fa: ['ペルシア語', 'Persian'], ar: ['アラビア語', 'Arabic'], so: ['ソマリ語', 'Somali'],
  am: ['アムハラ語', 'Amharic'], ti: ['ティグリニャ語', 'Tigrinya'], sw: ['スワヒリ語', 'Swahili'], he: ['ヘブライ語', 'Hebrew'], ja: ['日本語', 'Japanese'], ko: ['韓国語', 'Korean'],
  zh: ['中国語', 'Chinese'], vi: ['ベトナム語', 'Vietnamese'], th: ['タイ語', 'Thai'], lo: ['ラオ語', 'Lao'], km: ['クメール語', 'Khmer'], my: ['ビルマ語', 'Burmese'], ms: ['マレー語', 'Malay'], id: ['インドネシア語', 'Indonesian'],
};
// 学校の授業が英語で進む国 (abroad.ts の留学の判定と同じ)。小学校を終えるころには英語が仕事で使える段階に
export const ENGLISH_SCHOOLING = new Set(['IND', 'NGA', 'KEN', 'GHA', 'PHL', 'PAK', 'BGD', 'MYS', 'SGP', 'ZAF', 'UGA', 'ZMB', 'ZWE', 'TZA']);

export const langOf = (code: string): string | undefined => LANG[code];
export const langName = (lang: string): string => L(...(NAME[lang] ?? [lang, lang]));
const LEVEL: [string, string][] = [['初級', 'basic'], ['日常会話', 'conversational'], ['仕事で使える', 'working'], ['母語並み', 'native-level']];

// 母語は生まれた国の言葉。赤ん坊のうちに外国の養子になった人は、育った国の言葉 (roots.ts)
const homeLang = (p: Person) => langOf(p.roots?.adopted?.abroad ? p.country : p.birthCountry);
function init(p: Person): Record<string, LangLevel> {
  const home = homeLang(p);
  return (p.langs ??= home ? { [home]: 3 } : {});
}
// 今いる国の言葉の段階 (表に無い国は分からないので、母語並みとして扱う)
export function hereLevel(p: Person): LangLevel {
  const here = langOf(p.country);
  if (!here) return 3;
  return init(p)[here] ?? (here === homeLang(p) ? 3 : 0);
}

// 毎年。住んでいる国の言葉が、1段階ずつ上がる
export function languages(p: Person): void {
  const langs = init(p);
  if (ENGLISH_SCHOOLING.has(p.birthCountry) && eduLevel(p) >= 1 && (langs.en ?? 0) < 2) langs.en = 2;
  const here = langOf(p.country);
  if (!here) return;
  const key = `lang:${here}`;
  const name = langName(here);
  if (p.recent[key] === undefined) {
    // 移った年。すでに話せる言葉 (英語圏から英語圏など) ならその旨を残す
    p.recent[key] = p.age;
    if (p.country === p.birthCountry || p.roots?.adopted?.abroad) return;
    if ((langs[here] ?? 0) >= 2) { log(p, L(`${byCode(p.country).name}の言葉は${name}。もう話せた。`, `${byCode(p.country).name} speaks ${name}, which was no problem.`), 'move'); return; }
    langs[here] = 0;
    if (p.age >= 6) log(p, L(`${name}は、まだほとんど分からない。`, `${name} was still almost all noise.`), 'move');
    return;
  }
  if ((langs[here] ?? 0) >= 3) return;
  const since = p.age - p.recent[key];
  const young = p.recent[key] < 12;
  const home = homeLang(p);
  const near = home !== undefined && FAMILY[here] !== undefined && FAMILY[here] === FAMILY[home];
  // 大人が母語並みになるには、幼く移った子と違って8年ほどかかる (推計)
  let step = 1 + (young ? 1 : 0) + (near ? 1 : 0);
  const cap: LangLevel = young || since >= 8 ? 3 : 2;
  const next = Math.min(cap, (langs[here] ?? 0) + step) as LangLevel;
  if (next <= (langs[here] ?? 0)) return;
  langs[here] = next;
  if (next === 2) log(p, L(`${name}が、仕事で使えるくらいになった。`, `${name} was now good enough for work.`), 'family');
  if (next === 3) log(p, L(`${name}で夢を見るようになった。`, `Dreams now came in ${name}.`), 'family');
}

// お金の使い道: この国の言葉の授業。受けた年は2段階上がる。費用はその国の所得に見合う額 (年収の中央値の5%、推計)
export function langClassOffer(p: Person, c: Country): void {
  const here = langOf(p.country);
  if (!here || p.age < 16 || p.age > 60) return;
  const langs = init(p);
  const lv = langs[here] ?? 3;
  if (lv >= 2 || p.recent[`lang:${here}`] === undefined || p.recent[`lang:${here}`] === p.age || p.rng() >= 0.5) return;
  const cost = earnings(c, 0.5) * 0.05;
  const name = langName(here);
  decide(p, {
    title: L(`${name}の授業`, `${name} lessons`),
    text: L(`夜の${name}の教室に通える。1年で${Math.round(cost).toLocaleString()}ドルほど。`, `There is an evening ${name} class. About $${Math.round(cost).toLocaleString()} for the year.`),
    options: [
      { label: L('通う', 'Sign up'), hint: L('言葉が2段階上がる', 'Two steps up in the language'),
        apply: (q) => { q.wealth -= cost; q.langs![here] = Math.min(3, lv + 2) as LangLevel; log(q, L(`${name}の教室に通った。聞き取れる言葉が、急に増えた。`, `Took ${name} classes. Suddenly, far more of it made sense.`), 'family'); } },
      { label: L('暮らしながら覚える', 'Pick it up as I go'), apply: () => {} },
    ],
    auto: (q) => (q.wealth > cost && q.rng() < 0.4 ? 0 : 1),
  });
}

// 身元欄の一行: 「英語 (母語並み)・日本語 (仕事で使える)」。今いる国の言葉は、まだ初級でも必ず入れる
export function langLine(p: Person): string {
  const langs = { ...init(p) };
  const here = langOf(p.country);
  if (here && langs[here] === undefined) langs[here] = here === homeLang(p) ? 3 : 0;
  const home = p.roots?.lang;
  const parts = Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${langName(k)} (${L(...LEVEL[v])})`);
  if (home) parts.unshift(L(`${home} (家の言葉)`, `${home} (at home)`));
  return parts.join(L('・', ', '));
}
