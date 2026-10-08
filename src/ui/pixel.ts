// ピクセルアートの場面。192×60 のキャンバスに、その人のいまを描く。
// 左に住まい、右にいま過ごしている場所、真ん中に家族。空の色は一生を一日に見立てて朝から夕方へ。
import { byCode, type Country } from '../engine/countries';
import type { Person } from '../engine/person';
import { makeRng, type Rng } from '../engine/rng';

export const W = 192;
export const H = 60;
const GROUND = 47; // 人が立つ地面の高さ

type G = CanvasRenderingContext2D;
const px = (g: G, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

// ---- 色 ---------------------------------------------------------------------

const SKIN: Record<string, string[]> = {
  dark: ['#5a3a26', '#6b4430', '#7a4e34'],
  brown: ['#8a5a3c', '#9b6a46', '#a8744e'],
  olive: ['#b9825a', '#c69068', '#cf9a72'],
  light: ['#e2b48e', '#ecc29e', '#f2cfb0'],
};
const SOUTH_ASIA = ['IND', 'PAK', 'BGD', 'NPL', 'LKA', 'BTN', 'MDV', 'AFG'];
const EAST_ASIA = ['CHN', 'JPN', 'KOR', 'MNG', 'SGP'];
const MENA = ['EGY', 'MAR', 'DZA', 'TUN', 'LBY', 'SAU', 'IRQ', 'IRN', 'SYR', 'JOR', 'LBN', 'PSE', 'ISR', 'ARE', 'OMN', 'KWT', 'QAT', 'BHR', 'TUR', 'AZE', 'ARM', 'GEO', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'];
const SEA = ['IDN', 'PHL', 'VNM', 'THA', 'MMR', 'KHM', 'LAO', 'MYS', 'TLS', 'PNG', 'SLB', 'FJI'];

function skinGroup(c: Country): keyof typeof SKIN {
  if (c.region === 'アフリカ' && !MENA.includes(c.code)) return 'dark';
  if (SOUTH_ASIA.includes(c.code)) return 'brown';
  if (SEA.includes(c.code) || MENA.includes(c.code) || c.region === '南アメリカ' || ['MEX', 'GTM', 'HND', 'SLV', 'NIC', 'PAN', 'CRI', 'DOM', 'HTI', 'JAM', 'TTO', 'CUB'].includes(c.code)) return 'olive';
  if (EAST_ASIA.includes(c.code)) return 'light';
  return 'light';
}

const SHIRTS = ['#3f7d6e', '#c8553d', '#4a6fa5', '#d8a031', '#8e5a9b', '#6b8e4e', '#b04a5a', '#5a8fb0', '#d07a3a', '#7c7c8a'];
const PANTS = ['#3a3f58', '#5b4a3a', '#2f4a5a', '#4a4a4a', '#6a5a7a'];

type Climate = 'tropical' | 'arid' | 'temperate' | 'cold';
const ARID = ['EGY', 'SAU', 'IRQ', 'ARE', 'OMN', 'KWT', 'QAT', 'BHR', 'LBY', 'DZA', 'MRT', 'MLI', 'NER', 'TCD', 'SDN', 'SOM', 'DJI', 'JOR', 'ISR', 'PSE', 'IRN', 'AFG', 'PAK', 'TKM', 'UZB', 'KAZ', 'MNG', 'NAM', 'BWA', 'SYR', 'TUN', 'MAR', 'ERI'];
const COLD = ['RUS', 'FIN', 'NOR', 'SWE', 'EST', 'LVA', 'LTU', 'CAN', 'ISL', 'BLR', 'KGZ', 'TJK'];
function climateOf(c: Country): Climate {
  if (ARID.includes(c.code)) return 'arid';
  if (COLD.includes(c.code)) return 'cold';
  if (SEA.includes(c.code) || SOUTH_ASIA.slice(2, 6).includes(c.code) || (c.region === 'アフリカ' && !ARID.includes(c.code) && !['ZAF', 'LSO', 'SWZ'].includes(c.code))
    || ['BRA', 'COL', 'VEN', 'ECU', 'PER', 'BOL', 'PRY', 'GUY', 'SUR', 'IND', 'CUB', 'DOM', 'HTI', 'JAM', 'TTO', 'PAN', 'CRI', 'NIC', 'HND', 'SLV', 'GTM', 'MEX'].includes(c.code)) return 'tropical';
  return 'temperate';
}

// ---- 場面の材料 --------------------------------------------------------------

export type Home = 'hut' | 'house' | 'apartment' | 'villa';
export type Place = 'school' | 'field' | 'factory' | 'office' | 'stall' | 'hospital' | 'bench' | 'grave' | 'none';
export interface Figure { kind: 'adult' | 'child' | 'baby' | 'elder'; sex: 'F' | 'M'; height: number; skin: string; hair: string; shirt: string; pants: string; me?: boolean }
export interface Scene {
  seed: number; country: Country; urban: boolean; home: Home; place: Place;
  t: number; // 0 = 朝、1 = 夕暮れ
  figures: Figure[]; pet?: '犬' | '猫'; car: boolean; poor: boolean; night?: boolean;
}

function hairOf(rng: Rng, age: number, group: keyof typeof SKIN): string {
  if (age >= 70) return '#e8e6e0';
  if (age >= 58) return '#b8b4ac';
  if (group === 'light' && rng() < 0.25) return ['#b07a3a', '#d8b060', '#8a5a2a'][Math.floor(rng() * 3)];
  return ['#2a2420', '#3a2a20', '#1e1a18'][Math.floor(rng() * 3)];
}

function figureFor(rng: Rng, c: Country, sex: 'F' | 'M', age: number, me = false): Figure {
  const group = skinGroup(c);
  const skin = SKIN[group][Math.floor(rng() * SKIN[group].length)];
  const kind = age < 2 ? 'baby' : age < 13 ? 'child' : age >= 65 ? 'elder' : 'adult';
  const height = age < 2 ? 6 : age < 13 ? 10 : age < 16 ? 14 : 15;
  return { kind, sex, height, skin, hair: hairOf(rng, age, group), shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)], pants: PANTS[Math.floor(rng() * PANTS.length)], me };
}

// Person から場面を組み立てる。同じ人なら毎年同じ顔ぶれ・同じ服の色になるよう seed から引く
export function sceneOf(p: Person): Scene {
  const c = byCode(p.country);
  const rng = makeRng(p.seed ^ 0x9e3779b9);
  const urban = p.city !== null;
  const poor = (p.working ? p.incomeP : p.familyP) < 0.35;
  const home: Home = urban ? (c.gdp > 30000 && p.familyP > 0.75 && !p.migratedTo ? 'villa' : 'apartment') : poor && c.gdp < 8000 ? 'hut' : 'house';
  const place: Place = !p.alive ? 'grave'
    : p.illness ? 'hospital'
    : p.school.enrolled || p.school.uni === 'studying' || p.school.grad === 'studying' ? 'school'
    : p.retired ? 'bench'
    : p.working && p.unemployed === 0 ? (p.jobKind === 'farm' ? 'field' : p.jobKind === 'office' ? 'office' : p.selfEmployed ? 'stall' : 'factory')
    : 'none';
  // 家族: 若いうちは両親と、やがて連れ合いと子ども
  const withParents = p.age < 22 && !p.spouse?.alive;
  const figures: Figure[] = [];
  const parentFig = (sex: 'F' | 'M', age: number) => figureFor(rng, c, sex, age);
  const fatherF = parentFig('M', p.father.age);
  const motherF = parentFig('F', p.mother.age);
  if (withParents && p.father.alive) figures.push(fatherF);
  if (withParents && p.mother.alive) figures.push(motherF);
  const spouseF = p.spouse ? figureFor(rng, c, p.spouse.sex, p.spouse.age) : null;
  const meF = figureFor(rng, c, p.sex, p.age, true);
  figures.push(meF);
  if (!withParents && p.spouse?.alive && spouseF) figures.splice(figures.length - 1, 0, spouseF);
  const kids = p.children.filter((k) => k.alive && k.age < 20).slice(0, 3);
  for (const k of kids) figures.push(figureFor(rng, c, k.sex, k.age));
  if (withParents) for (const s of p.siblings.filter((s) => s.alive && s.age >= 0 && s.age < 18).slice(0, 2)) figures.push(figureFor(rng, c, s.sex, s.age));
  return {
    seed: p.seed, country: c, urban, home, place, t: Math.min(1, p.age / 85), figures,
    pet: p.pet?.kind, car: p.car, poor, night: !p.alive,
  };
}

// ---- 描画 -----------------------------------------------------------------

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c: number[]) => `rgb(${c.map(Math.round).join(',')})`;

function sky(g: G, s: Scene): void {
  // 60歳を過ぎるころから夕焼けに
  const dusk = Math.max(0, (s.t - 0.6) / 0.4);
  const top = s.night ? rgb('#1d2440') : lerp(rgb('#8fc4e0'), rgb('#e3a08e'), dusk);
  const bottom = s.night ? rgb('#3a3f66') : lerp(rgb('#d4e9f1'), rgb('#f6d3a6'), dusk);
  for (let y = 0; y < GROUND; y++) px(g, 0, y, W, 1, css(lerp(top, bottom, y / GROUND)));
  if (s.night) {
    const r = makeRng(s.seed);
    for (let i = 0; i < 30; i++) px(g, r() * W, r() * 30, 1, 1, '#e8e8f8');
    px(g, 150, 8, 6, 6, '#f2efd8'); px(g, 152, 8, 4, 4, '#3a3f66');
    return;
  }
  // 太陽は一生をかけて東から西へ動き、夕方には低く大きくなる
  const sx = 18 + s.t * 150;
  const sy = 13 - Math.sin(Math.PI * Math.min(1, s.t * 1.15)) * 7 + dusk * 9;
  const sun = dusk > 0.3 ? '#fbe39a' : '#fdf3c4';
  px(g, sx - 3, sy - 2, 7, 5, sun); px(g, sx - 2, sy - 3, 5, 7, sun);
  g.globalAlpha = 0.35; px(g, sx - 5, sy - 1, 11, 3, sun); px(g, sx - 1, sy - 5, 3, 11, sun); g.globalAlpha = 1;
}

function clouds(g: G, r: Rng): void {
  for (let i = 0; i < 3; i++) {
    const x = 10 + i * 60 + r() * 30, y = 3 + r() * 10, w = 14 + Math.floor(r() * 10);
    px(g, x, y + 2, w, 3, '#ffffff'); px(g, x + 3, y, w - 7, 3, '#ffffff'); px(g, x + 1, y + 4, w - 2, 1, '#e4eef3');
  }
  for (let i = 0; i < 2; i++) { const x = 40 + r() * 120, y = 6 + r() * 12; px(g, x, y, 1, 1, '#3a3a3a'); px(g, x + 1, y - 1, 1, 1, '#3a3a3a'); px(g, x + 2, y, 1, 1, '#3a3a3a'); }
}

function backdrop(g: G, s: Scene, r: Rng): void {
  const cl = climateOf(s.country);
  if (s.urban) {
    // 遠くのビル群。豊かな国ほど高い
    const tall = s.country.gdp > 25000 ? 26 : s.country.gdp > 8000 ? 20 : 13;
    for (let x = 0; x < W; ) {
      const w = 8 + Math.floor(r() * 10), h = 6 + Math.floor(r() * tall);
      px(g, x, GROUND - 3 - h, w, h, '#b8cad6');
      for (let wy = GROUND - h; wy < GROUND - 5; wy += 3) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (r() < 0.6) px(g, wx, wy, 1, 1, s.night ? '#f2d98a' : '#a6bccb');
      x += w + Math.floor(r() * 3);
    }
    return;
  }
  const far = cl === 'arid' ? '#e3cf9e' : cl === 'cold' ? '#d6e0e6' : '#b9d6b4';
  const near = cl === 'arid' ? '#d9bf86' : cl === 'cold' ? '#c3d1c4' : '#a3c99c';
  for (let x = 0; x < W; x++) {
    const h1 = 10 + Math.sin(x / 23 + s.seed) * 4 + Math.sin(x / 9) * 1.5;
    const h2 = 6 + Math.sin(x / 15 + 2 + s.seed) * 3;
    px(g, x, GROUND - 3 - h1, 1, h1, far);
    px(g, x, GROUND - 3 - h2, 1, h2, near);
    if (cl === 'cold' && h1 > 12) px(g, x, GROUND - 3 - h1, 1, 2, '#ffffff');
  }
}

function pole(g: G): void {
  px(g, 62, 13, 2, GROUND - 13, '#7a5a3a'); px(g, 57, 15, 12, 1, '#7a5a3a');
  g.fillStyle = '#5a5a5a';
  for (const [y0, y1] of [[15, 13], [16, 18]]) for (let x = 0; x < W; x++) {
    const sag = Math.sin(((x % 96) / 96) * Math.PI) * 3;
    g.fillRect(x, Math.round(x < 63 ? y0 + sag : y1 + sag), 1, 1);
  }
}

function tree(g: G, x: number, cl: Climate): void {
  if (cl === 'tropical') {
    px(g, x, GROUND - 13, 1, 13, '#8a6a3a');
    for (const [dx, dy] of [[-4, 0], [-3, -1], [-2, -1], [1, -1], [2, -1], [3, 0], [-1, -2], [0, -2], [1, -2], [-3, 1], [3, 1]]) px(g, x + dx, GROUND - 14 + dy, 1, 1, '#4f9a4a');
  } else if (cl === 'arid') {
    px(g, x, GROUND - 7, 2, 7, '#6f8f4a'); px(g, x - 2, GROUND - 5, 2, 1, '#6f8f4a'); px(g, x - 2, GROUND - 7, 1, 2, '#6f8f4a'); px(g, x + 2, GROUND - 4, 2, 1, '#6f8f4a'); px(g, x + 3, GROUND - 6, 1, 2, '#6f8f4a');
  } else if (cl === 'cold') {
    px(g, x, GROUND - 3, 1, 3, '#6a4a2a');
    for (let i = 0; i < 4; i++) px(g, x - i, GROUND - 4 - (3 - i) * 2 - 1, 1 + i * 2, 2, '#3f6f4f');
  } else {
    px(g, x, GROUND - 5, 2, 5, '#7a5a3a'); px(g, x - 3, GROUND - 11, 8, 6, '#5e9a52'); px(g, x - 2, GROUND - 12, 6, 1, '#5e9a52'); px(g, x - 2, GROUND - 6, 6, 1, '#5e9a52');
  }
}

function home(g: G, s: Scene): void {
  const lit = s.night || s.t > 0.62 ? '#f2d27a' : '#8fb4cc';
  switch (s.home) {
    case 'hut':
      px(g, 6, GROUND - 9, 18, 9, '#b98e5a'); px(g, 6, GROUND - 9, 18, 1, '#8a6a3a');
      for (let i = 0; i < 6; i++) px(g, 4 + i, GROUND - 10 - i, 22 - i * 2, 1, i % 2 ? '#c9a45e' : '#b8924e');
      px(g, 13, GROUND - 6, 4, 6, '#5a3a20'); px(g, 8, GROUND - 6, 3, 2, lit);
      break;
    case 'house':
      px(g, 6, GROUND - 11, 22, 11, '#f1ece2'); px(g, 6, GROUND - 1, 22, 1, '#cfc6b6');
      for (let i = 0; i < 6; i++) px(g, 4 + i, GROUND - 12 - i, 26 - i * 2, 1, '#c8483c');
      px(g, 4, GROUND - 12, 26, 1, '#9a3a30');
      px(g, 15, GROUND - 6, 4, 6, '#8a5a3a'); px(g, 9, GROUND - 8, 4, 3, lit); px(g, 22, GROUND - 8, 4, 3, lit);
      break;
    case 'villa':
      px(g, 4, GROUND - 14, 30, 14, '#ece8e2'); px(g, 3, GROUND - 15, 32, 2, '#4a4a52');
      px(g, 7, GROUND - 11, 8, 5, lit); px(g, 20, GROUND - 11, 10, 5, lit); px(g, 16, GROUND - 6, 4, 6, '#5a4a3a');
      px(g, 0, GROUND - 3, 3, 3, '#5e9a52');
      break;
    default: { // apartment
      const h = s.country.gdp > 20000 ? 32 : 26;
      px(g, 4, GROUND - h, 24, h, '#eeeae4'); px(g, 4, GROUND - h, 24, 1, '#b8b2a8'); px(g, 4, GROUND - h, 1, h, '#d8d2c8');
      const r = makeRng(s.seed + 7);
      for (let y = GROUND - h + 3; y < GROUND - 5; y += 4) for (let x = 7; x < 26; x += 4) px(g, x, y, 2, 2, r() < (s.t > 0.62 ? 0.6 : 0.15) ? '#f2d27a' : '#8fb4cc');
      px(g, 14, GROUND - 4, 4, 4, '#c84a3a'); px(g, 15, GROUND - 3, 2, 3, '#3a3a4a');
    }
  }
}

function place(g: G, s: Scene): void {
  const x0 = 150;
  switch (s.place) {
    case 'school':
      px(g, x0, GROUND - 12, 34, 12, '#f2eee4'); for (let i = 0; i < 4; i++) px(g, x0 - 2 + i, GROUND - 13 - i, 38 - i * 2, 1, '#2f8f86');
      px(g, x0 + 15, GROUND - 6, 4, 6, '#5a4a3a'); px(g, x0 + 4, GROUND - 9, 5, 3, '#8fb4cc'); px(g, x0 + 25, GROUND - 9, 5, 3, '#8fb4cc');
      px(g, x0 + 17, GROUND - 23, 1, 7, '#5a5a5a'); px(g, x0 + 18, GROUND - 23, 5, 3, '#3f9a7a');
      break;
    case 'field':
      for (let y = GROUND; y < H; y += 2) for (let x = x0 - 10; x < W; x += 3) { px(g, x, y, 2, 1, '#5f8a3a'); px(g, x + 1, y - 1, 1, 1, '#7fae4a'); }
      px(g, x0 - 10, GROUND - 1, W - x0 + 10, 1, '#6a8a3a');
      break;
    case 'factory':
      px(g, x0, GROUND - 14, 36, 14, '#a8a29a'); for (let i = 0; i < 4; i++) px(g, x0 + i * 9, GROUND - 17, 9, 3, i % 2 ? '#8a847c' : '#9a948c');
      px(g, x0 + 30, GROUND - 26, 4, 12, '#7a746c');
      g.globalAlpha = 0.6; px(g, x0 + 29, GROUND - 31, 6, 4, '#d8d8d8'); px(g, x0 + 33, GROUND - 35, 7, 4, '#e4e4e4'); g.globalAlpha = 1;
      for (let x = x0 + 3; x < x0 + 28; x += 6) px(g, x, GROUND - 9, 3, 3, '#6f8ea6');
      break;
    case 'office':
      px(g, x0 + 6, GROUND - 38, 22, 38, '#8fb0c6'); px(g, x0 + 6, GROUND - 38, 22, 1, '#6f8ea6');
      for (let y = GROUND - 35; y < GROUND - 3; y += 3) for (let x = x0 + 8; x < x0 + 27; x += 3) px(g, x, y, 2, 2, s.t > 0.62 ? '#f2d27a' : '#cfe2ee');
      break;
    case 'stall':
      px(g, x0 + 2, GROUND - 9, 28, 9, '#8a5a3a'); for (let i = 0; i < 7; i++) px(g, x0 + i * 4, GROUND - 13, 4, 3, i % 2 ? '#e4e0d4' : '#c8483c');
      px(g, x0 + 4, GROUND - 10, 4, 1, '#d8a031'); px(g, x0 + 10, GROUND - 10, 4, 1, '#6b8e4e'); px(g, x0 + 18, GROUND - 10, 5, 1, '#c8553d');
      break;
    case 'hospital':
      px(g, x0, GROUND - 20, 34, 20, '#f4f4f2'); px(g, x0, GROUND - 20, 34, 1, '#c8c8c8');
      px(g, x0 + 15, GROUND - 17, 4, 10, '#d84040'); px(g, x0 + 12, GROUND - 14, 10, 4, '#d84040');
      px(g, x0 + 14, GROUND - 5, 6, 5, '#8fb4cc');
      break;
    case 'bench':
      px(g, x0 + 4, GROUND - 4, 14, 2, '#8a5a3a'); px(g, x0 + 5, GROUND - 2, 1, 2, '#5a3a20'); px(g, x0 + 16, GROUND - 2, 1, 2, '#5a3a20'); px(g, x0 + 4, GROUND - 7, 14, 1, '#8a5a3a');
      px(g, x0 + 26, GROUND - 22, 1, 22, '#4a4a4a'); px(g, x0 + 24, GROUND - 23, 5, 2, s.t > 0.62 ? '#f8e08a' : '#d8d8c8');
      break;
    case 'grave':
      px(g, x0 + 8, GROUND - 10, 8, 10, '#a8a8b0'); px(g, x0 + 9, GROUND - 11, 6, 1, '#a8a8b0'); px(g, x0 + 11, GROUND - 8, 2, 4, '#7a7a84'); px(g, x0 + 10, GROUND - 7, 4, 1, '#7a7a84');
      px(g, x0 + 20, GROUND - 3, 1, 3, '#f2efd8'); px(g, x0 + 20, GROUND - 5, 1, 2, '#f8c060');
      break;
    default:
  }
}

function ground(g: G, s: Scene): void {
  const cl = climateOf(s.country);
  if (s.urban) {
    px(g, 0, GROUND, W, 3, '#c8c4bc'); px(g, 0, GROUND + 3, W, H - GROUND - 3, '#5e6064');
    for (let x = 4; x < W; x += 12) px(g, x, GROUND + 7, 6, 1, '#e8e4dc');
    // 歩道の柵
    for (let x = 32; x < 148; x += 4) px(g, x, GROUND - 4, 1, 4, '#9a9aa0');
    px(g, 32, GROUND - 4, 116, 1, '#9a9aa0');
  } else {
    const grass = cl === 'arid' ? '#c9b07a' : cl === 'cold' ? '#e8eef0' : '#6fae5a';
    px(g, 0, GROUND, W, 2, grass); px(g, 0, GROUND + 2, W, H - GROUND - 2, cl === 'arid' ? '#b08a5a' : '#8a6a46');
    const r = makeRng(s.seed + 3);
    for (let i = 0; i < 40; i++) px(g, r() * W, GROUND + 3 + r() * (H - GROUND - 4), 1, 1, cl === 'arid' ? '#c49a66' : '#6f5236');
    if (!s.poor) { for (let x = 32; x < 148; x += 5) px(g, x, GROUND - 4, 1, 4, '#9a7a52'); px(g, 32, GROUND - 3, 116, 1, '#9a7a52'); }
  }
}

// 人の形。h=髪 s=肌 e=目 t=上着 p=ズボン/スカート k=靴
const ADULT = {
  M: ['..hhhh..', '.hhhhhh.', '.hssssh.', '.sesses.', '.ssssss.', '..ssss..', '.tttttt.', 'tttttttt', 'tttttttt', 's.tttt.s', '..tttt..', '..pppp..', '..p..p..', '..p..p..', '..k..k..'],
  F: ['..hhhh..', '.hhhhhh.', 'hhsssshh', 'hsessesh', 'hssssssh', 'h.ssss.h', '.tttttt.', 'tttttttt', 'tttttttt', 's.tttt.s', '.pppppp.', '.pppppp.', '..p..p..', '..s..s..', '..k..k..'],
};
const CHILD = {
  M: ['.hhhh.', 'hhhhhh', 'hssssh', 'sesses', 'ssssss', '.ssss.', 'tttttt', 'stttts', '.p..p.', '.k..k.'],
  F: ['.hhhh.', 'hhhhhh', 'hssssh', 'hesseh', 'hssssh', 'h.ss.h', 'tttttt', 'stttts', 'pppppp', '.k..k.'],
};
const SHOE = '#2e2a28';
const EYE = '#2a2220';

function figure(g: G, x: number, f: Figure): number {
  if (f.kind === 'baby') {
    // おくるみに包まれた赤ちゃん
    px(g, x + 1, GROUND - 7, 4, 4, f.skin); px(g, x + 1, GROUND - 7, 4, 1, f.hair);
    px(g, x + 2, GROUND - 5, 1, 1, EYE); px(g, x + 4, GROUND - 5, 1, 1, EYE);
    px(g, x, GROUND - 4, 6, 4, '#f4f1ea'); px(g, x, GROUND - 1, 6, 1, '#dcd6ca');
    return 6;
  }
  const small = f.height < 12;
  const adult = ADULT[f.sex];
  // 13〜15歳は脚を1段短く
  const rows = small ? CHILD[f.sex] : f.height < 15 ? [...adult.slice(0, 12), ...adult.slice(13)] : adult;
  const top = GROUND - rows.length;
  rows.forEach((row, k) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      const color = ch === 'h' ? f.hair : ch === 's' ? f.skin : ch === 'e' ? EYE : ch === 't' ? f.shirt : ch === 'k' ? SHOE : f.pants;
      px(g, x + c, top + k, 1, 1, color);
    }
  });
  const w = rows[0].length;
  if (f.kind === 'elder') px(g, x + w, top + 8, 1, rows.length - 8, '#7a5a3a'); // 杖
  return w + (f.kind === 'elder' ? 1 : 0);
}

function pet(g: G, x: number, kind: '犬' | '猫'): void {
  const c = kind === '犬' ? '#9a6a3a' : '#8a8a8a';
  px(g, x, GROUND - 3, 6, 2, c); px(g, x + 5, GROUND - 5, 3, 3, c); px(g, x + 5, GROUND - 6, 1, 1, c); px(g, x + 7, GROUND - 6, 1, 1, c);
  px(g, x, GROUND - 1, 1, 1, c); px(g, x + 4, GROUND - 1, 1, 1, c); px(g, x - 1, GROUND - 4, 1, 2, c);
  px(g, x + 6, GROUND - 4, 1, 1, '#2a2a2a');
}

function car(g: G, x: number): void {
  px(g, x, GROUND + 3, 14, 4, '#c8483c'); px(g, x + 3, GROUND + 1, 7, 2, '#c8483c'); px(g, x + 4, GROUND + 1, 2, 2, '#bfe0ee'); px(g, x + 7, GROUND + 1, 2, 2, '#bfe0ee');
  px(g, x + 2, GROUND + 7, 3, 2, '#2a2a2a'); px(g, x + 9, GROUND + 7, 3, 2, '#2a2a2a');
}

export function drawScene(cv: HTMLCanvasElement, s: Scene): void {
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const r = makeRng(s.seed);
  sky(g, s);
  if (!s.night) clouds(g, r);
  backdrop(g, s, r);
  ground(g, s);
  if (!s.urban || s.country.gdp < 15000) pole(g);
  const cl = climateOf(s.country);
  tree(g, 44, cl);
  if (!s.urban) tree(g, 52, cl);
  home(g, s);
  place(g, s);
  const n = s.figures.length;
  const span = n * 9 + (s.pet ? 11 : 0);
  let x = Math.round(98 - span / 2);
  for (const f of s.figures) x += figure(g, x, f) + 1;
  if (s.pet) pet(g, x + 1, s.pet);
  if (s.car && s.urban) car(g, 36);
}

// 小さなキャンバスを1つ作って描く (追悼館や共有カード用)
export function sceneCanvas(s: Scene): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  drawScene(cv, s);
  return cv;
}

// 追悼館のように Person が手元にないときの、ありあわせの場面
export function sceneFromSummary(o: { id: number; country: string; sex: 'F' | 'M'; age: number; rural: boolean; job?: string }): Scene {
  const c = byCode(o.country);
  const rng = makeRng(o.id * 2654435761);
  const me = figureFor(rng, c, o.sex, o.age, true);
  const partner = figureFor(rng, c, o.sex === 'F' ? 'M' : 'F', o.age);
  const figures = o.age >= 20 ? [partner, me] : [me];
  const kind = o.job ? (/農|畑|漁|家畜/.test(o.job) ? 'field' : /店|露天|市場/.test(o.job) ? 'stall' : /工|建設|縫製|整備|電気/.test(o.job) ? 'factory' : 'office') : 'none';
  return {
    seed: o.id * 97, country: c, urban: !o.rural, home: o.rural ? (c.gdp < 8000 ? 'hut' : 'house') : 'apartment',
    place: o.age < 18 ? 'school' : (kind as Place), t: Math.min(1, o.age / 85), figures, pet: rng() < 0.3 ? '犬' : undefined, car: false, poor: c.gdp < 5000,
  };
}

// 身分証の顔写真: 胸から上を 16×18 で
export function drawPortrait(cv: HTMLCanvasElement, p: Person): void {
  cv.width = 16;
  cv.height = 18;
  const g = cv.getContext('2d')!;
  const c = byCode(p.birthCountry);
  const rng = makeRng(p.seed ^ 0x9e3779b9);
  const f = figureFor(rng, c, p.sex, p.age, true);
  px(g, 0, 0, 16, 18, '#dfe4e6');
  const sc = p.age < 6 ? 0.8 : 1;
  const ox = p.age < 6 ? 2 : 0;
  // 肩と服
  px(g, 2 + ox, 13, 12 - ox * 2, 5, f.shirt);
  px(g, 6, 12, 4, 2, f.skin);
  // 顔
  const hw = Math.round(8 * sc);
  const hx = 8 - hw / 2;
  px(g, hx, 4, hw, 8, f.skin);
  px(g, hx, 2, hw, 3, f.hair);
  px(g, hx - 1, 3, 1, p.sex === 'F' ? 9 : 3, f.hair);
  px(g, hx + hw, 3, 1, p.sex === 'F' ? 9 : 3, f.hair);
  px(g, hx + 2, 7, 1, 1, EYE);
  px(g, hx + hw - 3, 7, 1, 1, EYE);
  px(g, 7, 10, 2, 1, '#b06a5a');
  if (!p.alive) {
    const d = g.getImageData(0, 0, 16, 18);
    for (let i = 0; i < d.data.length; i += 4) { const v = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
    g.putImageData(d, 0, 0);
  }
}

// 保存や HTML 埋め込みのための、国を国コードにした場面
export type SceneData = Omit<Scene, 'country'> & { country: string };
export const toData = (s: Scene): SceneData => ({ ...s, country: s.country.code });
export const fromData = (d: SceneData): Scene => ({ ...d, country: byCode(d.country) });

// data-scene (SceneData の JSON) を持つキャンバスを、まとめて描く
export function paintScenes(root: ParentNode = document): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-scene]').forEach((cv) => {
    try { drawScene(cv, fromData(JSON.parse(cv.dataset.scene!))); } catch { /* 古い記録で形が違えば描かない */ }
  });
}

export const sceneAttr = (d: SceneData) => JSON.stringify(d).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
