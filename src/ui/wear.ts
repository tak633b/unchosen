// 服と帽子と持ち物。仕事・学校・時代・土地・暮らし向きで決める。顔 (chibi.ts) と場面の立ち絵が同じものを引く。
// 乱数は look.ts の見た目とは別の流れ (hash(key, 0xd2e55)) から引くので、ここを足しても肌・髪・髪型は前と同じ。
// 土地の装い (サリー・トーブ・ゲレ・ドッパ・山高帽・すげ笠など) は、その土地でふだん見かけるものだけを、
// 時代が古いほど・農村ほど・年配ほど多めに。どれも確率で、同じ国でも着ない人の方が多いことがある。
import type { Country } from '../engine/countries';
import { makeRng } from '../engine/rng';
import type { Area, Style } from './look';
import { hash, mixc } from './raster';

export type Wear =
  | 'tee' | 'shirt' | 'blouse' | 'suit' | 'coat' | 'scrubs' | 'sailor' | 'gakuran' | 'blazer' | 'track' | 'military' | 'navy'
  | 'overalls' | 'apron' | 'jumpsuit' | 'vest' | 'kurta' | 'thobe' | 'abaya' | 'sari' | 'boubou' | 'wrap' | 'cardigan'
  | 'poncho' | 'future' | 'police' | 'raincoat' | 'chef' | 'onesie' | 'hoodie' | 'smock' | 'turtle';
export type Hat =
  | 'straw' | 'conical' | 'brim' | 'bowler' | 'fedora' | 'flatcap' | 'beanie' | 'hardhat' | 'chef' | 'nursecap' | 'peaked'
  | 'beret' | 'kufi' | 'doppa' | 'ghutra' | 'headwrap' | 'bucket';
export type Item = 'hoe' | 'case' | 'basket' | 'book' | 'bag' | 'rod' | 'wrench' | 'cane' | 'steth' | 'clip' | 'ball' | 'pack' | 'scissors' | 'net';

export interface Dress {
  wear: Wear; trim: string; hat?: Hat; hatC?: string; item?: Item; patch?: boolean; tie?: boolean; ar?: boolean;
  cloth?: string; pants?: string; long?: boolean; // long: 足首までの丈 (トーブ・サリー・アバヤ・白衣ではない)
}
// 見た目を決めるのに使う、その人の暮らし。分からない欄は省いてよい (追悼館・前世の記録)
export interface LookCtx {
  job?: string; year?: number; rural?: boolean; wealth?: number; // wealth: 所得分位 0–1
  student?: boolean; uni?: boolean; retired?: boolean; homemaker?: boolean;
}

const GULF = ['SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'BHR', 'YEM'];
const WEST_AFRICA = ['NGA', 'GHA', 'SEN', 'MLI', 'CIV', 'CMR', 'BEN', 'TGO', 'BFA', 'NER', 'GIN', 'SLE', 'LBR', 'GMB', 'MRT', 'TCD', 'GNB'];
const CENTRAL_ASIA = ['UZB', 'TJK', 'KGZ', 'KAZ', 'TKM'];
const ANDES = ['PER', 'BOL', 'ECU'];
const CONICAL = ['VNM', 'KHM', 'LAO', 'MMR', 'THA', 'IDN', 'PHL', 'BGD'];
const SARI = ['IND', 'BGD', 'NPL', 'LKA'];
const SALWAR = ['PAK', 'AFG', 'IND', 'BGD'];
const SOVIET = ['RUS', 'UKR', 'BLR', 'KAZ', 'UZB', 'KGZ', 'TJK', 'TKM', 'AZE', 'ARM', 'GEO', 'MDA', 'EST', 'LVA', 'LTU'];
const SMOCK_SCHOOL = ['ARG', 'URY'];
const UNIFORM_WEST = ['GBR', 'IRL', 'AUS', 'NZL', 'MLT', 'CYP'];

const PRINT = ['#d8a031', '#2a6a8a', '#b0402a', '#3a7a3a', '#7a3a7a', '#e07a2a', '#1a5a6a'];
const FUTURE = ['#e8ecf0', '#c8d8e4', '#d8e4dc', '#2a3440', '#f0e4ec'];
const at = <T>(a: readonly T[], u: number): T => a[Math.floor(u * a.length) % a.length];

// 仕事の名前 (日本語のまま持っている) から服を決める。合わないものは null (ふだん着)
function jobDress(job: string, c: Country, ea: Area, sex: 'F' | 'M', year: number, u: () => number): Dress | null {
  const sunHat = (): Hat => (CONICAL.includes(c.code) && u() < 0.7 ? 'conical' : ea === 'latam' && u() < 0.6 ? 'brim' : u() < 0.6 ? 'straw' : 'flatcap');
  if (/漁|船員/.test(job)) return { wear: u() < 0.5 ? 'raincoat' : 'tee', trim: '#e8b830', hat: u() < 0.6 ? 'bucket' : 'beanie', hatC: '#3a4a5a', item: u() < 0.5 ? 'rod' : 'net', cloth: u() < 0.5 ? '#e8b830' : undefined };
  if (/畑|農|家畜/.test(job)) return { wear: u() < 0.4 ? 'overalls' : 'shirt', trim: '#6a5a3a', hat: u() < 0.75 ? sunHat() : undefined, hatC: '#d8b860', item: /家畜/.test(job) ? undefined : 'hoe', cloth: u() < 0.5 ? '#7a6a4a' : undefined };
  if (/宇宙飛行士/.test(job)) return { wear: 'jumpsuit', trim: '#d86a2a', cloth: '#ece8e0', pants: '#ece8e0', hat: undefined };
  if (/海軍/.test(job)) return { wear: 'navy', trim: '#d8b050', hat: 'peaked', hatC: '#f4f2ee', cloth: '#f4f2ee', pants: '#f4f2ee' };
  if (/パイロット/.test(job)) return { wear: 'jumpsuit', trim: '#d8b050', cloth: '#5a6a4a', pants: '#5a6a4a', hat: undefined };
  if (/陸軍|空軍|将校/.test(job)) return { wear: 'military', trim: '#d8b050', hat: u() < 0.5 ? 'peaked' : 'beret', hatC: /空軍/.test(job) ? '#3a4a6a' : '#4a5a3a', cloth: /空軍/.test(job) ? '#4a5a7a' : '#5a6a42', pants: /空軍/.test(job) ? '#3a4a6a' : '#4a5a38' };
  if (/警察/.test(job)) return { wear: 'police', trim: '#d8b050', hat: 'peaked', hatC: '#22304a', cloth: '#2a3a5a', pants: '#22304a' };
  if (/警備/.test(job)) return { wear: 'police', trim: '#c8c8c8', hat: 'peaked', hatC: '#3a3a40', cloth: '#5a5a62', pants: '#3a3a40' };
  if (/医師/.test(job)) return { wear: 'coat', trim: '#8aa0b8', item: 'steth', cloth: '#f2f2ee' };
  if (/研究者/.test(job)) return { wear: 'coat', trim: '#8aa0b8', item: 'clip', cloth: '#f2f2ee' };
  if (/看護/.test(job)) return { wear: 'scrubs', trim: '#ffffff', hat: year < 1990 && sex === 'F' ? 'nursecap' : undefined, hatC: '#ffffff', cloth: year < 1990 ? '#f4f2ee' : at(['#7ab0c8', '#8ac0a8', '#e8a0b8'], u()), item: 'steth' };
  if (/介護/.test(job)) return { wear: 'scrubs', trim: '#ffffff', cloth: at(['#e8a0b8', '#8ac0a8', '#a8c0e0'], u()) };
  if (/料理/.test(job)) return { wear: 'chef', trim: '#2a2a2a', hat: u() < 0.7 ? 'chef' : undefined, hatC: '#ffffff', cloth: '#f4f2ee' };
  if (/建設/.test(job)) return { wear: 'vest', trim: '#e8e8e8', hat: 'hardhat', hatC: at(['#e8b830', '#f0f0f0', '#e86a2a'], u()), cloth: '#f07a2a' };
  if (/日雇い/.test(job)) return { wear: u() < 0.5 ? 'tee' : 'vest', trim: '#e8e8e8', hat: u() < 0.4 ? 'hardhat' : u() < 0.5 ? 'flatcap' : undefined, hatC: '#e8b830', cloth: u() < 0.5 ? '#f07a2a' : undefined, patch: u() < 0.4 };
  if (/整備|電気工/.test(job)) return { wear: 'jumpsuit', trim: '#e8e8e8', hat: u() < 0.4 ? 'flatcap' : undefined, hatC: '#2a3a5a', item: 'wrench', cloth: at(['#2a4a7a', '#4a5a6a', '#7a4a2a'], u()), pants: undefined };
  if (/ライン工/.test(job)) return { wear: 'jumpsuit', trim: '#e8e8e8', hat: u() < 0.5 ? 'flatcap' : undefined, hatC: '#4a6a8a', cloth: at(['#4a6a8a', '#6a7a8a', '#3a5a4a'], u()) };
  if (/縫製/.test(job)) return { wear: 'smock', trim: '#ffffff', hat: u() < 0.4 ? 'headwrap' : undefined, hatC: at(PRINT, u()), cloth: at(['#8ab0d0', '#e8b0c0', '#c8d0d8'], u()) };
  if (/露天|市場|物売り/.test(job)) return { wear: 'apron', trim: at(PRINT, u()), item: 'basket', hat: CONICAL.includes(c.code) && u() < 0.4 ? 'conical' : undefined, hatC: '#d8b860' };
  if (/店員|販売員/.test(job)) return { wear: u() < 0.5 ? 'apron' : 'shirt', trim: at(['#2a5a8a', '#a8343e', '#3a7a3a'], u()), item: undefined };
  if (/家事手伝い|家の仕事|家事/.test(job)) return { wear: 'apron', trim: '#f0ece0' };
  if (/運転/.test(job)) return { wear: 'shirt', trim: '#2a3a5a', hat: u() < 0.6 ? 'flatcap' : undefined, hatC: '#2a3a5a' };
  if (/美容/.test(job)) return { wear: 'apron', trim: '#2a2a30', item: 'scissors', cloth: '#2a2a30' };
  if (/教師|教員|講師/.test(job)) return { wear: u() < 0.5 ? 'cardigan' : 'shirt', trim: '#e8e0d0', item: 'book', tie: sex === 'M' && u() < 0.3 };
  if (/スポーツ|ダンサー|舞踊団/.test(job)) return { wear: 'track', trim: '#ffffff', item: /スポーツ/.test(job) ? 'ball' : undefined, cloth: at(['#2a5aa0', '#c03a3a', '#2a8a5a', '#1a1a2a'], u()) };
  if (/音楽家|デザイナー/.test(job)) return { wear: 'turtle', trim: '#d8b050', hat: u() < 0.25 ? 'beret' : undefined, hatC: '#2a2a30', cloth: at(['#1a1a20', '#5a2a3a', '#2a3a3a'], u()) };
  if (/プログラマー/.test(job)) return { wear: u() < 0.6 ? 'hoodie' : 'tee', trim: '#d8d8d8', item: u() < 0.5 ? 'pack' : undefined };
  if (/エンジニア|農業技術者/.test(job)) return { wear: 'shirt', trim: '#e8e8e8', hat: u() < 0.3 ? 'hardhat' : undefined, hatC: '#f0f0f0', item: 'clip' };
  if (/記者|編集/.test(job)) return { wear: 'shirt', trim: '#e8e0d0', item: 'clip' };
  if (/事務|窓口|公務員|会計|金融/.test(job)) return { wear: sex === 'F' && u() < 0.5 ? 'blouse' : u() < 0.45 ? 'suit' : 'shirt', trim: '#e8e4dc', tie: u() < 0.5, item: u() < 0.3 ? 'case' : undefined, cloth: undefined };
  if (/会社員|弁護士|経営者/.test(job)) return { wear: 'suit', trim: '#ece6dc', tie: sex === 'M' || u() < 0.2, item: 'case', cloth: at(['#2a2c3c', '#3a3e48', '#2a3440', '#4a4a50'], u()) };
  return null;
}

// 土地の装い (ふだん着の時だけ)。trad は「伝統の服を着ている度合い」0–1 (古い時代・農村・年配で上がる)
function localDress(c: Country, area: Area, sex: 'F' | 'M', age: number, style: Style, muslim: boolean, trad: number, u: () => number): Partial<Dress> | null {
  const code = c.code;
  if (GULF.includes(code) && age >= 14) {
    if (sex === 'M' && u() < 0.8) return { wear: 'thobe', long: true, cloth: '#f4f2ee', trim: '#d8d4cc', hat: u() < 0.8 ? 'ghutra' : 'kufi', hatC: u() < 0.5 ? '#ffffff' : '#c83a3a' };
    if (sex === 'F' && style === 'hijab' && u() < 0.75) return { wear: 'abaya', long: true, cloth: '#1e1c22', trim: '#3a3440' };
  }
  if ((code === 'EGY' || code === 'SDN') && sex === 'M' && age >= 14 && u() < trad * 0.8) return { wear: 'thobe', long: true, cloth: at(['#e8e0d0', '#8a9aa8', '#a89a7a'], u()), trim: '#6a6a6a', hat: u() < 0.5 ? 'kufi' : undefined, hatC: '#f0ece4' };
  if (area === 'southAsia' && age >= 14) {
    if (sex === 'F' && SARI.includes(code) && style !== 'hijab' && u() < 0.25 + trad * 0.5) return { wear: 'sari', long: true, cloth: at(['#c83a5a', '#e07a2a', '#2a8a7a', '#7a3a8a', '#d8a031', '#2a5aa0'], u()), trim: '#d8b050' };
    if (SALWAR.includes(code) && u() < (code === 'PAK' || code === 'AFG' ? 0.75 : 0.2 + trad * 0.3)) return { wear: 'kurta', cloth: at(['#f0ece0', '#c8d8e0', '#d8c8a8', '#a8b8a0', '#e0b8c8'], u()), trim: '#d8d0c0', hat: sex === 'M' && muslim && u() < 0.3 ? 'kufi' : undefined, hatC: '#f4f0e8' };
  }
  if (WEST_AFRICA.includes(code) && age >= 14 && u() < 0.25 + trad * 0.45) {
    const pr = at(PRINT, u());
    return sex === 'F'
      ? { wear: 'boubou', cloth: pr, trim: at(PRINT, u()), hat: style !== 'hijab' && u() < 0.6 ? 'headwrap' : undefined, hatC: pr }
      : { wear: 'boubou', cloth: pr, trim: at(PRINT, u()), hat: u() < 0.5 ? 'kufi' : undefined, hatC: at(PRINT, u()) };
  }
  if (area === 'africa' && sex === 'F' && style !== 'hijab' && age >= 16 && u() < 0.15 + trad * 0.3) return { hat: 'headwrap', hatC: at(PRINT, u()) };
  if (CENTRAL_ASIA.includes(code) && sex === 'M' && age >= 14 && u() < 0.15 + trad * 0.5) return { hat: 'doppa', hatC: '#1e1c22' };
  if (muslim && sex === 'M' && age >= 14 && (area === 'seAsia' || area === 'africa' || area === 'mena') && u() < 0.12 + trad * 0.2) return { hat: 'kufi', hatC: area === 'seAsia' ? '#1e1c22' : '#f0ece4' };
  if (ANDES.includes(code) && age >= 16 && u() < trad * 0.8) return sex === 'F' ? { wear: 'poncho', cloth: at(['#c83a3a', '#d86a2a', '#7a3a8a', '#2a6a8a'], u()), trim: '#e8c050', hat: u() < 0.7 ? 'bowler' : undefined, hatC: '#3a2a22' } : { wear: 'poncho', cloth: at(['#a8343e', '#6a4a2a', '#4a3a5a'], u()), trim: '#e8c050', hat: 'brim', hatC: '#e8e0d0' };
  if (area === 'eastAsia' && age >= 14 && u() < Math.max(0, trad - 0.5) * 1.6) return { wear: 'wrap', cloth: at(['#3a3a5a', '#5a4a3a', '#e8e0d0', '#7a3a4a', '#2a4a4a'], u()), trim: '#e8e0d0' };
  return null;
}

// dress の本体。base は肌・髪型などを決め終えた見た目の一部
export function dressOf(o: { sex: 'F' | 'M'; age: number; style: Style; cloth: string }, c: Country, area: Area, religion: string, ctx: LookCtx, key: number): Dress {
  const r = makeRng(hash(key, 0xd2e55));
  const u = () => r();
  const year = ctx.year ?? 2025, age = o.age, sex = o.sex;
  const rural = ctx.rural ?? c.agri > 0.4;
  const w = ctx.wealth ?? 0.5;
  const coverHead = o.style === 'hijab' || o.style === 'turban' || o.style === 'cap';
  // 伝統の服の度合い: 1950年より前は高く、2030年を過ぎると下がる。農村・年配・暮らしの苦しい家で上がる
  const trad = Math.max(0, Math.min(1, (2030 - year) / 110 + (rural ? 0.25 : 0) + Math.max(0, age - 45) / 90 + (w < 0.3 ? 0.1 : 0)));
  let d: Dress | null = null;
  if (age < 2) d = { wear: 'onesie', trim: '#ffffff', cloth: at(['#f0d8e0', '#d8e8f4', '#f4ecc8', '#dcecd8'], u()) };
  else if (age < 6) d = { wear: 'tee', trim: '#ffffff', cloth: at(['#e8a040', '#5ab0d8', '#e86a7a', '#7ac06a', '#f0d060'], u()) };
  else if (ctx.job && !ctx.retired) d = jobDress(ctx.job, c, area, sex, year, u);
  // 学校: 制服のある国では制服、無い国はふだん着とかばん
  const studying = ctx.student ?? (age >= 6 && age < 18 && u() < 0.85);
  if (!d && studying && age < 19 && !ctx.uni) {
    const soviet = SOVIET.includes(c.code) && year < 1992;
    const uniform = area === 'eastAsia' || area === 'southAsia' || area === 'seAsia' || area === 'africa' || area === 'latam' || UNIFORM_WEST.includes(c.code) || soviet;
    if (uniform && u() < 0.85) {
      if (SMOCK_SCHOOL.includes(c.code)) d = { wear: 'coat', trim: '#e8e8e8', cloth: '#f4f4f0', item: 'pack' };
      else if (c.code === 'JPN' && age >= 12) d = sex === 'F' ? (year < 2000 || u() < 0.45 ? { wear: 'sailor', trim: '#c83a3a', cloth: '#1e2a48', pants: '#1e2a48', item: 'bag' } : { wear: 'blazer', trim: '#c83a3a', cloth: '#2a3450', pants: '#5a5a6a', tie: true, item: 'bag' })
        : (year < 2000 || u() < 0.45 ? { wear: 'gakuran', trim: '#d8b050', cloth: '#16161e', pants: '#16161e', item: 'bag' } : { wear: 'blazer', trim: '#8a2a2a', cloth: '#2a3450', pants: '#3a3a48', tie: true, item: 'bag' });
      else if (c.code === 'CHN' && year >= 1990) d = { wear: 'track', trim: '#ffffff', cloth: at(['#2a5aa0', '#c03a3a', '#2a8a5a'], u()), item: 'pack' };
      else if (soviet) d = sex === 'F' ? { wear: 'blouse', trim: '#ffffff', cloth: '#5a3a2a', tie: false, item: 'pack' } : { wear: 'blazer', trim: '#c83a3a', cloth: '#2a3450', item: 'pack' };
      else if (c.code === 'KOR' || c.code === 'TWN' || UNIFORM_WEST.includes(c.code) || age >= 12) d = { wear: 'blazer', trim: '#ffffff', cloth: at(['#2a3450', '#3a2a3a', '#2a4a3a', '#4a3a2a'], u()), pants: '#3a3a48', tie: u() < 0.7, item: 'pack' };
      else d = { wear: 'shirt', trim: '#ffffff', cloth: at(['#f4f4f0', '#e8e4b0', '#c8dcf0', '#e0e8d0', '#f0d8a0', '#d8c8f0'], u()), pants: at(['#2a3a6a', '#5a4a3a', '#3a5a3a', '#6a2a3a', '#2a2a30'], u()), item: 'pack' };
    } else d = { wear: u() < 0.5 ? 'tee' : 'hoodie', trim: '#ffffff', cloth: at(['#e86a5a', '#4a8ad0', '#6ab06a', '#f0c050', '#8a6ac0', '#3a3a48'], u()), item: 'pack' };
  }
  if (!d && ctx.uni && age < 30) d = { wear: u() < 0.5 ? 'hoodie' : 'tee', trim: '#ffffff', item: u() < 0.6 ? 'pack' : 'book' };
  // ふだん着: 土地の装い、時代、年配
  if (!d) {
    const local = age >= 6 ? localDress(c, area, sex, age, o.style, religion === 'イスラム教', trad, u) : null;
    const base: Dress = year >= 2060 && u() < 0.25 + 0.5 * Math.min(1, c.gdp / 30000)
      ? { wear: 'future', trim: '#6ad8e8', cloth: at(FUTURE, u()), ar: u() < 0.25 }
      : age >= 60 || ctx.retired ? { wear: u() < 0.6 ? 'cardigan' : 'shirt', trim: '#e8e0d0' }
      : year < 1960 && sex === 'M' && u() < 0.5 ? { wear: u() < 0.5 ? 'suit' : 'shirt', trim: '#ece6dc', tie: u() < 0.5 }
      : sex === 'F' ? { wear: u() < 0.5 ? 'blouse' : 'tee', trim: '#ffffff' }
      : { wear: u() < 0.45 ? 'shirt' : u() < 0.5 ? 'tee' : 'hoodie', trim: '#ffffff' };
    d = local ? { ...base, ...local, wear: local.wear ?? base.wear, trim: local.trim ?? base.trim } : base;
    if (ctx.homemaker && !local && u() < 0.5) d = { ...d, wear: 'apron', trim: '#f0ece0' };
    // 帽子: 古い時代の西洋の中折れ帽・鳥打帽、寒い国の毛糸の帽子
    if (!d.hat && sex === 'M' && age >= 18 && year < 1965 && (area === 'west' || area === 'latam') && u() < 0.55) d = { ...d, hat: u() < 0.55 ? 'fedora' : 'flatcap', hatC: at(['#3a3a40', '#5a4a3a', '#4a4a3a', '#2a2a30'], u()) };
    if (!d.hat && ['RUS', 'FIN', 'NOR', 'SWE', 'CAN', 'ISL', 'MNG', 'KAZ', 'EST', 'LVA', 'LTU', 'BLR'].includes(c.code) && u() < 0.2) d = { ...d, hat: 'beanie', hatC: at(['#c83a3a', '#3a5a8a', '#e8e0d0', '#3a6a4a', '#d8a031'], u()) };
    if (!d.hat && rural && age >= 16 && CONICAL.includes(c.code) && u() < 0.15 + trad * 0.3) d = { ...d, hat: 'conical', hatC: '#d8b860' };
  }
  if (coverHead && d.hat && d.hat !== 'nursecap' && d.hat !== 'hardhat') d = { ...d, hat: undefined };
  if (o.style === 'hijab' && d.hat) d = { ...d, hat: undefined };
  // 暮らし向き: 苦しい家は継ぎ当て、豊かな人の服は色が深い
  const patch = d.patch ?? (w < 0.2 && age >= 4 && u() < 0.5);
  const tone = (col: string) => (w < 0.25 ? mixc(col, '#8a7a68', 0.3) : year < 1960 ? mixc(col, '#6a6258', 0.25) : col);
  const cloth = tone(d.cloth ?? o.cloth);
  if (age >= 70 && !d.item && u() < 0.45) d = { ...d, item: 'cane' };
  return { ...d, cloth, trim: d.trim, patch };
}
