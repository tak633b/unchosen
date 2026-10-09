// 見た目の決め方。顔写真 (portrait.ts) と場面の人物 (scene.ts) が同じものを引く。
// 同じ人は何度描いても同じ見た目 (主人公の seed と相手の id から決める)。家族は主人公から肌・髪質・目元を受け継ぐ。
// 年をとると白髪・しわ・生え際の後退が進む。どれも「ある年齢を越えたら」で決めるので、一度出たものは消えない。
import { byCode, type Country } from '../engine/countries';
import type { Person, Relative, Role } from '../engine/person';
import { makeRng, type Rng } from '../engine/rng';
import { hash, mixc } from './raster';

// 肌: 濃い方から薄い方へ
export const SKINS = ['#4a2c1e', '#5e3826', '#7a4a32', '#9a6444', '#b07a58', '#c68e68', '#d4a07e', '#e8bc9c', '#f2cdb0'];
const SOUTH_ASIA = ['IND', 'PAK', 'BGD', 'NPL', 'LKA', 'BTN', 'MDV', 'AFG'];
const EAST_ASIA = ['CHN', 'JPN', 'KOR', 'PRK', 'MNG', 'TWN', 'HKG', 'SGP'];
const MENA = ['EGY', 'MAR', 'DZA', 'TUN', 'LBY', 'SDN', 'SAU', 'IRQ', 'IRN', 'SYR', 'JOR', 'LBN', 'PSE', 'ISR', 'ARE', 'OMN', 'KWT', 'QAT', 'BHR', 'YEM', 'TUR', 'AZE', 'ARM', 'GEO'];
const CENTRAL_ASIA = ['KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'];
const SEA = ['IDN', 'PHL', 'VNM', 'THA', 'MMR', 'KHM', 'LAO', 'MYS', 'TLS', 'PNG', 'SLB', 'FJI', 'BRN'];
const LATAM = ['MEX', 'GTM', 'HND', 'SLV', 'NIC', 'PAN', 'CRI', 'DOM', 'HTI', 'JAM', 'TTO', 'CUB', 'PRI', 'BLZ'];
const MIXED = ['USA', 'CAN', 'GBR', 'FRA', 'AUS', 'NZL', 'ZAF']; // 肌の色の幅が広い国
const AFRICA_NORTH = ['EGY', 'MAR', 'DZA', 'TUN', 'LBY', 'SDN', 'MRT'];

export type Area = 'africa' | 'southAsia' | 'eastAsia' | 'mena' | 'seAsia' | 'latam' | 'west';
export function areaOf(c: Country): Area {
  if (SOUTH_ASIA.includes(c.code)) return 'southAsia';
  if (EAST_ASIA.includes(c.code)) return 'eastAsia';
  if (MENA.includes(c.code) || CENTRAL_ASIA.includes(c.code) || AFRICA_NORTH.includes(c.code)) return 'mena';
  if (SEA.includes(c.code)) return 'seAsia';
  if (c.region === 'アフリカ') return 'africa';
  if (c.region === '南アメリカ' || LATAM.includes(c.code)) return 'latam';
  return 'west';
}

export type Climate = 'tropical' | 'arid' | 'temperate' | 'cold';
const ARID = ['EGY', 'SAU', 'IRQ', 'ARE', 'OMN', 'KWT', 'QAT', 'BHR', 'YEM', 'LBY', 'DZA', 'MRT', 'MLI', 'NER', 'TCD', 'SDN', 'SOM', 'DJI', 'JOR', 'ISR', 'PSE', 'IRN', 'AFG', 'PAK', 'TKM', 'UZB', 'KAZ', 'MNG', 'NAM', 'BWA', 'SYR', 'TUN', 'MAR', 'ERI'];
const COLD = ['RUS', 'FIN', 'NOR', 'SWE', 'EST', 'LVA', 'LTU', 'CAN', 'ISL', 'BLR', 'KGZ', 'TJK'];
const TROPICAL = ['BRA', 'COL', 'VEN', 'ECU', 'PER', 'BOL', 'PRY', 'GUY', 'SUR', 'IND', 'BGD', 'LKA', 'NPL', 'MDV', 'CUB', 'DOM', 'HTI', 'JAM', 'TTO', 'PAN', 'CRI', 'NIC', 'HND', 'SLV', 'GTM', 'MEX', 'BLZ'];
export function climateOf(c: Country): Climate {
  if (ARID.includes(c.code)) return 'arid';
  if (COLD.includes(c.code)) return 'cold';
  if (SEA.includes(c.code) || TROPICAL.includes(c.code) || (c.region === 'アフリカ' && !['ZAF', 'LSO', 'SWZ'].includes(c.code))) return 'tropical';
  return 'temperate';
}

// 受け継ぐもの
interface Genes { skin: number; hair: string; texture: 0 | 1 | 2; narrow: boolean; brow: boolean; eye?: string }

function skinRange(c: Country): [number, number] {
  if (MIXED.includes(c.code)) return [5.6, 2.6];
  if (c.code === 'BRA') return [4.4, 2.6];
  switch (areaOf(c)) {
    case 'africa': return [1.2, 1.0];
    case 'southAsia': return [3.4, 1.3];
    case 'mena': return [5.0, 1.3];
    case 'seAsia': return [4.6, 1.0];
    case 'latam': return [4.6, 1.8];
    case 'eastAsia': return [6.8, 0.8];
    default: return [7.3, 0.9];
  }
}

const DARK_HAIR = ['#16120f', '#1e1612', '#2a1e16', '#1a1410'];
const LIGHT_HAIR = ['#6a4426', '#3a2a20', '#b88a4a', '#d0a868', '#8a4a26', '#4a3424'];
function genesFor(c: Country, r: Rng): Genes {
  const [m, s] = skinRange(c);
  const skin = Math.max(0, Math.min(8, m + (r() + r() - 1) * s));
  const area = areaOf(c);
  const fair = skin > 6.4 && (area === 'west' || area === 'latam' || area === 'mena');
  const hair = fair && r() < 0.55 ? LIGHT_HAIR[Math.floor(r() * LIGHT_HAIR.length)] : DARK_HAIR[Math.floor(r() * DARK_HAIR.length)];
  const t = r();
  const texture: Genes['texture'] = skin < 2.6 && t < 0.92 ? 2 : (area === 'mena' || area === 'latam' || area === 'west' || area === 'southAsia') && t < 0.35 ? 1 : 0;
  const narrow = r() < (area === 'eastAsia' ? 0.55 : area === 'seAsia' ? 0.25 : CENTRAL_ASIA.includes(c.code) ? 0.35 : 0.03);
  const brow = r() < (area === 'southAsia' || area === 'mena' ? 0.45 : 0.15);
  const eye = fair && r() < 0.35 ? ['#4a6a7a', '#5a7a5a', '#6a7480'][Math.floor(r() * 3)] : undefined;
  return { skin, hair, texture, narrow, brow, eye };
}

// 血のつながった人: 少しずつ違えて受け継ぐ
function inherit(g: Genes, c: Country, r: Rng, spread: number): Genes {
  const other = genesFor(c, r);
  const keep = () => r() < 0.75;
  return {
    skin: Math.max(0, Math.min(8, g.skin + (r() - 0.5) * spread)),
    hair: keep() ? g.hair : other.hair, texture: keep() ? g.texture : other.texture,
    narrow: keep() ? g.narrow : other.narrow, brow: keep() ? g.brow : other.brow, eye: keep() ? g.eye : other.eye,
  };
}
function blend(a: Genes, b: Genes, r: Rng): Genes {
  const one = () => (r() < 0.5 ? a : b);
  return { skin: (a.skin + b.skin) / 2 + (r() - 0.5) * 0.6, hair: one().hair, texture: one().texture, narrow: one().narrow, brow: one().brow, eye: one().eye };
}

export type Style = 'side' | 'fringe' | 'buzz' | 'receding' | 'bald' | 'long' | 'center' | 'bob' | 'braids' | 'pony' | 'bun' | 'afro' | 'curly' | 'locs' | 'hijab' | 'turban' | 'cap';
export interface Look {
  sex: 'F' | 'M'; age: number; skin: string; hair: string; style: Style;
  beard?: 'stubble' | 'mustache' | 'full'; glasses?: 'dark' | 'gold';
  earring?: boolean; necklace?: boolean; collar?: boolean; narrow?: boolean; thickBrow?: boolean; smile?: boolean;
  eye?: string; cloth: string; pants: string; cover?: string; bg: string; skirt?: boolean;
}

const CLOTH = ['#2e4258', '#a8343e', '#4a6a3a', '#5a5a48', '#7a5a3a', '#2e6a5a', '#d8ccb8', '#5a4a6a', '#c08a2a', '#3a5a8a', '#6a3a4a', '#3a4a3a', '#8a8a8a', '#e0d8c8', '#b0583a', '#40607a'];
const PANTS = ['#2a2c3c', '#3a3028', '#22303a', '#3a3a3a', '#4a3e52', '#5a5040'];
const BG = ['#a8b4c0', '#c4bcb0', '#b8c0b0', '#c8c0b0', '#c0b8a8', '#b8c4b4', '#a8b0b8', '#c8c0c4', '#c4bca8', '#b0bcc8', '#b8b0a2', '#b4bcc4'];
const SCARF = ['#3a5a7a', '#6a3a4a', '#2e5a4a', '#8a6a3a', '#4a3a5a', '#d8ccb8', '#2a2a30', '#a85a6a'];
const TURBAN = ['#c84a2a', '#d8a031', '#2a4a7a', '#e0d8c8', '#6a2a3a', '#d86a8a', '#3a6a3a', '#ff9a3a'];
const CAP = ['#2a3a5a', '#8a2a2a', '#3a4a3a', '#d8d0c0', '#2a2a2a'];
const at = <T>(a: readonly T[], u: number) => a[Math.floor(u * a.length) % a.length];
// 重み付きで選ぶ (u は 0–1)
function choose<T>(u: number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = u * total;
  for (const [t, w] of items) { x -= w; if (x <= 0) return t; }
  return items[items.length - 1][0];
}

function hijabRate(c: Country): number {
  if (['TUR', 'ALB', 'BIH', 'AZE', 'KAZ', 'UZB', 'KGZ', 'TJK', 'TKM', 'TUN', 'LBN'].includes(c.code)) return 0.3;
  if (['IRN', 'SAU', 'YEM', 'AFG'].includes(c.code)) return 0.85;
  return 0.55;
}

// 遺伝子と年齢・性別・宗教から、その年の見た目を作る。u は人ごとに固定の乱数なので、年をまたいでも同じ人は同じ
function makeLook(g: Genes, c: Country, sex: 'F' | 'M', age: number, religion: string, key: number): Look {
  const r = makeRng(key);
  const u = Array.from({ length: 16 }, () => r());
  const area = areaOf(c);
  const muslim = religion === 'イスラム教', sikh = religion === 'シク教';
  const grey = Math.max(0, Math.min(1, ((age - 38) / 36) * (0.7 + u[12] * 0.6)));
  const hair = mixc(g.hair, '#d8d4cc', grey);
  const skin = mixc(SKINS[Math.floor(g.skin)], SKINS[Math.min(8, Math.floor(g.skin) + 1)], g.skin % 1);
  const ea = area === 'eastAsia';
  let style: Style;
  let beard: Look['beard'];
  if (sex === 'M') {
    if (sikh && age >= 12 && u[0] < 0.75) style = 'turban';
    else if (age < 13) style = g.texture === 2 ? choose(u[1], [['buzz', 3], ['curly', 1]]) : choose(u[1], [['side', 2], ['buzz', 1.5], ['fringe', ea ? 3 : 1], ['curly', g.texture]]);
    else if (age >= 30 && u[2] < (age - 30) / 90) style = 'bald';
    else if (age >= 25 && u[2] < (age - 25) / 55) style = 'receding';
    else if (age >= 15 && age < 60 && u[3] < 0.07) style = 'cap';
    else style = g.texture === 2 ? choose(u[1], [['buzz', 4], ['afro', 1], ['locs', 0.6], ['curly', 1]]) : choose(u[1], [['side', 4], ['buzz', 1.5], ['fringe', ea ? 2 : 0.6], ['curly', g.texture * 1.5], ['long', 0.25]]);
    if (age >= 17) {
      const p = 0.22 + (muslim ? 0.2 : 0) + (style === 'turban' ? 0.65 : 0) + (age > 40 ? 0.1 : 0) - (ea ? 0.1 : 0);
      if (u[4] < p) beard = style === 'turban' ? 'full' : choose(u[5], [['full', muslim ? 3 : 1.2], ['mustache', area === 'southAsia' || area === 'mena' || area === 'latam' ? 2 : 1], ['stubble', 1.6]]);
    }
  } else {
    if (muslim && age >= 12 && u[0] < hijabRate(c)) style = 'hijab';
    else if (age < 13) style = g.texture === 2 ? choose(u[1], [['braids', 3], ['afro', 1], ['pony', 1], ['bun', 1]]) : choose(u[1], [['pony', 2], ['braids', 1.5], ['bob', 1.5], ['long', 1.5], ['fringe', ea ? 2 : 0.5]]);
    else if (age >= 58 && u[6] < 0.55) style = u[7] < 0.6 ? 'bun' : 'bob';
    else style = g.texture === 2 ? choose(u[1], [['braids', 2], ['afro', 1], ['bun', 1.2], ['locs', 0.6], ['curly', 1]]) : choose(u[1], [['long', 3], ['center', 2], ['bob', 2], ['pony', 1.2], ['bun', 1], ['fringe', ea ? 1.5 : 0.4], ['curly', g.texture * 1.5]]);
  }
  const cover = style === 'hijab' ? at(SCARF, u[8]) : style === 'turban' ? at(TURBAN, u[8]) : style === 'cap' ? at(CAP, u[8]) : undefined;
  const glassP = 0.04 + Math.max(0, age - 40) * 0.009 + (c.gdp > 20000 ? 0.06 : 0) + (age >= 10 && age < 30 && ea ? 0.15 : 0);
  return {
    sex, age, skin, hair, style, beard,
    glasses: age >= 8 && u[9] < glassP ? (u[10] < 0.4 ? 'gold' : 'dark') : undefined,
    earring: age >= 5 && u[11] < (sex === 'F' ? 0.45 : 0.04),
    necklace: sex === 'F' && age >= 16 && u[13] < 0.2,
    collar: age >= 18 && u[14] < 0.4,
    narrow: g.narrow, thickBrow: g.brow, smile: u[15] < 0.35, eye: g.eye,
    cloth: at(CLOTH, u[10] * 7.3 % 1), pants: at(PANTS, u[13] * 5.1 % 1), cover, bg: at(BG, u[12] * 3.7 % 1),
    skirt: sex === 'F' && (style === 'hijab' || u[14] * 3.3 % 1 < 0.6),
  };
}

// ---- 人ごとの入り口 ---------------------------------------------------------

const ROLE_N: Record<Role, number> = { mother: 1, father: 2, sibling: 3, spouse: 4, partner: 5, child: 6, friend: 7, mentor: 8, rival: 9, ex: 10, grandchild: 11, grandparent: 12, pet: 13 };
const keyOf = (p: Person, r: Relative, role: Role) => hash(p.seed, 0x7a11, r.id ?? ROLE_N[role] * 1000 + (r.sex === 'F' ? 1 : 0));
const myGenes = (p: Person) => genesFor(byCode(p.birthCountry), makeRng(hash(p.seed, 0x5eed)));

export const lookOfMe = (p: Person): Look => makeLook(myGenes(p), byCode(p.birthCountry), p.sex, p.age, p.religion, hash(p.seed, 0x5eed, 1));

export function lookOfRel(p: Person, t: Relative, role: Role): Look {
  const key = keyOf(p, t, role);
  const r = makeRng(key ^ 0x9e3779b9);
  const home = byCode(p.birthCountry), here = byCode(p.country);
  const me = myGenes(p);
  let g: Genes;
  let religion = p.religion;
  switch (role) {
    case 'mother': case 'father': case 'sibling': g = inherit(me, home, r, 1.0); break;
    case 'grandchild': g = inherit(me, here, r, 1.6); break;
    case 'child': {
      const sp = p.spouse;
      const mate = sp ? genesFor(here, makeRng(keyOf(p, sp, 'spouse') ^ 0x9e3779b9)) : genesFor(here, makeRng(key ^ 0x51));
      g = blend(me, mate, r);
      break;
    }
    case 'spouse': case 'partner': case 'ex': g = genesFor(here, r); break;
    default: g = genesFor(here, r); if (r() > 0.7) religion = '';
  }
  const c = role === 'mother' || role === 'father' || role === 'sibling' ? home : here;
  return makeLook(g, c, t.sex, t.age, religion, key);
}

// Person が手元にない時 (追悼館) の、id から決める見た目
export function lookOfId(id: number, c: Country, sex: 'F' | 'M', age: number, n = 0): Look {
  const key = hash(id, 0xa11, n);
  return makeLook(genesFor(c, makeRng(key)), c, sex, age, '', key);
}
