// 場面のピクセル画 320×100。左に住まい、右にいま過ごしている場所、真ん中に家族。
// 空はディザのグラデーション、遠景ほど霞み、物は光の向きに沿った3段の陰影と長い影を持つ。
// 時刻 (朝・昼・夕・夜) と季節は年ごとに変わる。場面の色は時刻の tint を受け、窓や街灯の明かりだけは受けない。
// 暦年があれば時代と国で描き分ける (電気・テレビ・車の普及、ビルの高さ、2050年ごろからの太陽光パネル)。
// 時代の判定は c.r と別の乱数 c.e で引く。暦年の無い古い記録は c.r の並びも絵も前のまま
import type { Country } from '../engine/countries';
import { techShare } from '../engine/tech';
import { makeRng, type Rng } from '../engine/rng';
import { climateOf, type Climate, type Style } from './look';
import { dith, hash, mixc, Pix, tones } from './raster';

export const W = 320;
export const H = 100;
const HZ = 66; // 地面の始まり
const BY = 77; // 建物の足もと
const GY = 87; // 人の足もと

export type Home = 'hut' | 'house' | 'apartment' | 'villa';
export type Place = 'school' | 'field' | 'factory' | 'office' | 'stall' | 'hospital' | 'bench' | 'grave' | 'none';
export type Tod = 'morning' | 'day' | 'dusk' | 'night';
export interface Figure {
  kind: 'adult' | 'child' | 'baby' | 'elder'; sex: 'F' | 'M'; height: number; skin: string; hair: string; shirt: string; pants: string; me?: boolean;
  style?: Style; cover?: string; skirt?: boolean; beard?: boolean;
}
export interface Scene {
  seed: number; country: Country; urban: boolean; home: Home; place: Place;
  t: number; // 一生のどこか 0–1
  figures: Figure[]; pet?: '犬' | '猫'; car: boolean; poor: boolean; night?: boolean;
  tod?: Tod; season?: number; // 季節 0 春 / 1 夏 / 2 秋 / 3 冬。古い記録には無い
  year?: number; // 暦年。country はこの年の値。古い記録には無い (今の時代として描く)
}

const SKY: Record<Tod, string[]> = {
  morning: ['#6f8fc0', '#9ab4d8', '#d8c8cc', '#f4d4b0', '#f8e4c4'],
  day: ['#3f78c0', '#5a90d0', '#80acdc', '#acc8e4', '#cfe0ea'],
  dusk: ['#2b2f5a', '#5b3f6e', '#a8546a', '#e07b55', '#f4b664', '#f8d98e'],
  night: ['#0c1024', '#141a38', '#22284a', '#3a3456'],
};
const TINT: Record<Tod, number[]> = { morning: [1, 0.95, 0.9], day: [1, 1, 1], dusk: [0.94, 0.72, 0.64], night: [0.34, 0.38, 0.6] };
const LIT = '#f6c35c', LIT2 = '#fff1b0';

interface Land { far: string; mid: string; near: string; g0: string; g1: string; soil: string; leaf: string; snow: boolean }
function landOf(cl: Climate, season: number): Land {
  const winter = season === 3 && (cl === 'cold' || cl === 'temperate');
  if (winter) return { far: '#8a98b0', mid: '#6a7a88', near: '#4a5a5a', g0: '#dfe6ee', g1: '#c8d4e2', soil: '#8a8e9a', leaf: '#3f5f4a', snow: true };
  switch (cl) {
    case 'arid': return { far: '#b89a8a', mid: '#a8805c', near: '#8a6440', g0: '#c8a46a', g1: '#d8b47a', soil: '#a07a4a', leaf: '#6f7f3a', snow: false };
    case 'cold': return { far: '#7a8aa8', mid: '#4a6a62', near: '#34503e', g0: '#5e7a42', g1: '#6e8a4a', soil: '#5a4a3a', leaf: season === 2 ? '#b08a3a' : '#3f6f4a', snow: false };
    case 'tropical': return season === 2 || season === 3
      ? { far: '#7a8a8a', mid: '#6a7a4a', near: '#5a6a36', g0: '#a0904a', g1: '#b09a54', soil: '#8a5a36', leaf: '#5a8a3a', snow: false }
      : { far: '#6a8a8a', mid: '#3e6e4a', near: '#2f5a36', g0: '#4a7a32', g1: '#5e8e3a', soil: '#7a4a2e', leaf: '#3f8a3a', snow: false };
    default: return season === 2
      ? { far: '#8a8aa0', mid: '#7a6a4a', near: '#5a5a36', g0: '#8a8a42', g1: '#9a9a4e', soil: '#6a4e34', leaf: '#c8702a', snow: false }
      : { far: '#7a8aa8', mid: '#5a7a5a', near: '#46683a', g0: '#5e8a3e', g1: '#76a04a', soil: '#6a4e34', leaf: season === 0 ? '#6aa04a' : '#4a8a3a', snow: false };
  }
}

// 古い記録には時刻・季節が無いので、一生のどこかと夜かどうかから決める
export const todOf = (s: Scene): Tod => s.tod ?? (s.night ? 'night' : s.t > 0.7 ? 'dusk' : s.t < 0.2 ? 'morning' : 'day');

interface Ctx {
  P: Pix; s: Scene; r: Rng; tod: Tod; land: Land; cl: Climate; dir: number; lightsOn: boolean; nightish: boolean;
  e: Rng; year?: number; grid: number; lamp: boolean; // grid: その土地の電気の普及率、lamp: この場面の灯りは電気でなくランプ
  carX?: number; // 農村の家の車の位置。貯水タンクがあれば右へよける
  tallF: number; fut: number; // tallF: 行き先の建物の高さの倍率、fut: 未来らしさ 0–1 (2045年から伸び、豊かな国ほど強い)
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// ビルの高さの時代の倍率: 1950年は今の半分弱、2000年で今と同じ、2050年からまた少し伸びる
const eraTall = (y?: number) => (y === undefined ? 1 : y < 2000 ? 0.45 + 0.55 * clamp01((y - 1950) / 50) : 1 + 0.35 * clamp01((y - 2045) / 45));
const tallOf = (s: Scene) => (s.year === undefined ? 1 : eraTall(s.year) * (s.country.gdp < 8000 ? 0.7 + 0.3 * clamp01(s.country.gdp / 8000) : 1));
const futOf = (s: Scene) => (s.year === undefined ? 0 : clamp01((s.year - 2045) / 45) * (0.25 + 0.75 * clamp01(s.country.gdp / 25000)) * (s.urban ? 1 : 0.8));
// 行き先の建物の高さ。lo は低い建物が潰れないための下限の倍率
const vh = (c: Ctx, h: number, lo = 0.3) => Math.min(BY - 3, Math.round(h * Math.max(lo, c.tallF)));
const GREEN = ['#3a6a32', '#4a8a3a', '#6aa04a'];
// 屋上と壁面の緑
function greenOn(c: Ctx, x: number, y: number, w: number, h: number): void {
  y = Math.round(y); h = Math.round(h);
  for (let k = 0; k < w; k++) { c.P.px(x + k, y - 1, GREEN[(k * 7) % 3]); if ((k * 5) % 3) c.P.px(x + k, y - 2, GREEN[2]); }
  for (let yy = y + 2; yy < y + h - 2; yy++) for (let k = 0; k < 3; k++) if (dith(x + k, yy, 0.55)) c.P.px(x + k, yy, GREEN[(yy + k) % 2]);
}
const glassy = (c: Ctx) => (c.year ?? 0) >= 2050 && c.s.country.gdp > 15000;

function gradRows(P: Pix, h: number, stops: string[]): void {
  for (let y = 0; y < h; y++) {
    const f = (y / (h - 1)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), t = f - i;
    for (let x = 0; x < W; x++) P.px(x, y, dith(x, y, t) ? stops[i + 1] : stops[i], 1, true);
  }
}
const disc = (P: Pix, cx: number, cy: number, rad: number, c: string, c2: string) => {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) { const d = Math.hypot(x, y); if (d < rad - 0.5) P.px(cx + x, cy + y, d < rad * 0.72 ? c : c2, 1, true); }
};

function sky(c: Ctx): void {
  const { P, tod, r } = c;
  gradRows(P, HZ + 6, SKY[tod]);
  if (tod === 'night') {
    for (let i = 0; i < 46; i++) P.px(r() * W, r() * 36, r() < 0.3 ? '#c8d0f0' : '#5a6290', 1, true);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { const d = Math.hypot(x, y), d2 = Math.hypot(x - 2, y - 1); if (d < 4.6 && d2 > 3.6) P.px(282 + x, 14 + y, '#f2ecc8', 1, true); }
    return;
  }
  if (tod === 'dusk') { disc(P, 246, 52, 10, '#fff4c8', '#fbe3a0'); for (let x = 190; x < 310; x++) if (dith(x, 58, 0.4)) P.px(x, 58, '#fbe3a0', 1, true); }
  else if (tod === 'morning') disc(P, 58, 40, 7, '#fff8e0', '#fbe8b8');
  else disc(P, 214, 12, 6, '#fffbe8', '#fdf3c4');
  // 雲: 下側に空の色を混ぜて厚みを出す
  const cloud = tod === 'dusk' ? ['#6a4a6a', '#e8a07a'] : tod === 'morning' ? ['#e8d8d8', '#fff4ec'] : ['#dce8f2', '#ffffff'];
  for (let i = 0; i < 4; i++) {
    const cx = 20 + i * 78 + r() * 40, cy = 8 + r() * (tod === 'dusk' ? 26 : 22), w = 18 + Math.floor(r() * 22);
    for (let y = -3; y <= 3; y++) for (let x = -w / 2; x <= w / 2; x++) {
      const e = (x / (w / 2)) ** 2 + (y / 3.2) ** 2 + Math.sin(x * 0.7 + i) * 0.15;
      if (e < 1) P.px(cx + x, cy + y, y > 0 && !dith(cx + x, cy + y, 0.5 - y * 0.1) ? cloud[0] : cloud[1], 1, true);
    }
  }
  if (tod !== 'dusk') for (let i = 0; i < 3; i++) { const bx = 90 + r() * 120, by = 14 + r() * 16; for (const [dx, dy] of [[0, 0], [1, -1], [2, 0], [-1, -1], [-2, 0]]) P.px(bx + dx, by + dy, '#3a3a48', 1, true); }
}

// 稜線。遠いほど空の色に寄せて霞ませる
function ridge(c: Ctx, base: number, amp: number, f: number, ph: number, col: string, haze: number, flat = false, cap?: string): void {
  const hz = SKY[c.tod][SKY[c.tod].length - 1], mixed = mixc(col, c.tod === 'night' ? '#2a2e50' : hz, haze);
  for (let x = 0; x < W; x++) {
    let y = base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.3 + 1) * amp * 0.4 + Math.sin(x * 0.9) * 0.6;
    if (flat) y = Math.max(base - amp * 0.4, y);
    y = Math.round(y);
    for (let yy = y; yy < HZ + 6; yy++) c.P.px(x, yy, dith(x, yy, 0.5) ? mixed : mixc(col, hz, haze * 0.6));
    if (cap && y < base - amp * 0.55) for (let k = 0; k < 2; k++) c.P.px(x, y + k, cap);
    if (c.tod === 'dusk' && haze < 0.2) c.P.px(x, y, '#d79a5a', 1, true); // 夕日に照らされた縁
  }
}

function backdrop(c: Ctx): void {
  const { P, s, r, land, cl, tod } = c;
  if (s.urban) {
    const tall = Math.round((s.country.gdp > 25000 ? 34 : s.country.gdp > 8000 ? 26 : 14) * eraTall(c.year));
    const far = tod === 'night' ? '#3a4470' : mixc('#5a6a80', SKY[tod][SKY[tod].length - 1], 0.4);
    for (let x = 0; x < W;) {
      const w = 10 + Math.floor(r() * 18), top = HZ - 4 - Math.floor(r() * tall);
      P.box(x, top, w, HZ + 6 - top, far);
      P.box(c.dir > 0 ? x + w - 2 : x, top, 2, HZ + 6 - top, mixc(far, '#ffffff', 0.12));
      if (c.lightsOn) for (let yy = top + 3; yy < HZ; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (r() < (glassy(c) ? 0.32 : 0.18) && c.e() < c.grid) P.px(xx, yy, glassy(c) ? '#a8a070' : '#8a7a5a', 1, true);
      x += w + 1;
    }
    // 手前のビル: 人の後ろに2棟
    const fore: number[][] = [];
    for (const [bx, bw, bh] of [[98 + (s.seed % 4) * 6, 26 + (s.seed % 3) * 4, 18 + tall * (0.5 + r() * 0.5)], [168 + (s.seed % 5) * 4, 22 + (s.seed % 2) * 6, 14 + tall * (0.4 + r() * 0.4)]]) {
      const col = glassy(c) ? ['#5a7a94', '#6a8aa0', '#4a6a8a'][s.seed % 3] : s.country.gdp < 8000 ? ['#b8a890', '#a89a8a', '#c8b498'][s.seed % 3] : ['#8a8a94', '#7a8494', '#9a948a'][s.seed % 3];
      wall(c, bx, BY - bh, bw, bh, col);
      if (glassy(c)) for (let xx = bx + 2; xx < bx + bw - 2; xx += 4) P.box(xx, BY - bh + 2, 1, bh - 4, mixc(col, '#cfe2ee', 0.3)); // ガラスの縦の目地
      for (let y = BY - bh + 4; y < BY - 6; y += 6) for (let xx = bx + 3; xx < bx + bw - 4; xx += 6) win(c, xx, y, 3, 3, 0.45);
      if (c.fut > 0.15 && c.e() < c.fut + 0.3) greenOn(c, c.dir > 0 ? bx : bx + bw - 3, BY - bh, bw, bh);
      fore.push([bx, bw, bh]);
    }
    future(c, fore);
    return;
  }
  ridge(c, 46, 5, 0.025, s.seed % 7, land.far, 0.6, cl === 'arid', cl === 'cold' || land.snow ? '#eef2f8' : undefined);
  ridge(c, 55, 3, 0.045, 3 + (s.seed % 5), land.mid, 0.35, cl === 'arid');
  ridge(c, 63, 1.4, 0.08, s.seed % 3, land.near, 0.1);
}

// 未来の街: 空中の歩道と、細い高架の軌道を走る無人の車両
function future(c: Ctx, fore: number[][]): void {
  const { P, e } = c;
  if (c.fut <= 0.15) return;
  const [[ax, aw, ah], [bx, , bh]] = fore, wy = BY - Math.min(ah, bh) + 8;
  if (wy < BY - 12) { P.box(ax + aw, wy, bx - ax - aw, 3, '#8ab4cc'); P.box(ax + aw, wy, bx - ax - aw, 1, '#cfe6f2'); P.box(ax + aw, wy + 3, bx - ax - aw, 1, '#5a6a7a'); }
  if (c.fut <= 0.25) return;
  const ty = BY - 30;
  for (let x = 20 + Math.floor(e() * 30); x < W; x += 70) P.box(x, ty + 2, 2, BY - ty - 2, '#9aa0a8');
  P.box(0, ty, W, 2, '#d8dce0'); P.box(0, ty + 2, W, 1, '#7a8088');
  const px = Math.floor(e() * (W - 30));
  P.box(px + 1, ty - 5, 18, 5, '#eef0f2'); P.box(px, ty - 4, 20, 3, '#eef0f2'); P.box(px + 3, ty - 4, 14, 2, c.lightsOn ? LIT2 : '#6a8aa4', c.lightsOn);
}
// 小さな配送ドローン
function drones(c: Ctx): void {
  const { P, e } = c;
  const n = Math.round(c.fut * 3 + c.fut * 2 * e());
  for (let i = 0; i < n; i++) {
    const x = 20 + e() * 280, y = 6 + e() * 30;
    P.box(x, y, 4, 2, '#2a2a30', true); P.box(x - 2, y - 1, 2, 1, '#6a6a72', true); P.box(x + 4, y - 1, 2, 1, '#6a6a72', true); P.box(x + 1, y + 2, 2, 2, '#c8a050');
    if (c.lightsOn) P.px(x + 1, y, '#ff6a5a', 1, true);
  }
}

function ground(c: Ctx): void {
  const { P, s, land } = c;
  if (s.urban) {
    for (let y = HZ + 2; y < H; y++) for (let x = 0; x < W; x++) {
      let col: string;
      if (y < BY) col = '#4a4a54';
      else if (y < 89) col = (x + (y > 83 ? 4 : 0)) % 9 === 0 || y === 83 ? '#6a6a70' : dith(x, y, (y - BY) / 12) ? '#8a8a8e' : '#9a9a9c';
      else if (y === 89) col = '#b8b8b4';
      else col = dith(x, y, 0.3) ? '#3a3a40' : '#34343a';
      P.px(x, y, col);
    }
    for (let x = 6; x < W; x += 24) P.box(x, 95, 10, 1, '#c8b860');
    return;
  }
  const furrows = s.place === 'field' || (s.poor && !land.snow);
  for (let y = HZ; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (y - HZ) / (H - HZ);
    let col = dith(x, y, t) ? land.g1 : land.g0;
    if (furrows && y > 70 && (y - 70) % 5 === 0) col = mixc(land.soil, '#000000', 0.25);
    else if (furrows && y > 70) col = dith(x, y, t) ? land.soil : mixc(land.soil, land.g0, 0.4);
    P.px(x, y, col);
  }
  const r = makeRng(s.seed + 3);
  if (!furrows) for (let i = 0; i < 220; i++) {
    const x = r() * W, y = HZ + 2 + r() * (H - HZ - 2), big = y > 84;
    P.px(x, y, mixc(land.g0, '#000000', 0.3)); P.px(x, y - 1, tones(land.g1)[2]);
    if (big) P.px(x + 1, y - 1, mixc(land.g0, '#000000', 0.2));
    if (s.season === 0 && !land.snow && r() < 0.15) P.px(x, y - 2, ['#f2e6a0', '#e8a0b0', '#ffffff'][i % 3]);
  }
}

// 壁: 光の当たる側を明るく、反対側を暗く。地面に影を落とす
function wall(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  const t = tones(col), { P, dir } = c;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const k = xx - x, lit = dir > 0 ? k >= w - Math.max(3, w * 0.22) : k < Math.max(3, w * 0.22), shade = dir > 0 ? k < 2 : k >= w - 2;
    P.px(xx, yy, lit ? t[2] : shade ? t[0] : t[1]);
  }
  castShadow(c, x, w, h);
}
function castShadow(c: Ctx, x: number, w: number, h: number, base = BY): void {
  const len = c.tod === 'day' ? 2 : c.tod === 'night' ? 0 : Math.min(18, h * 0.5);
  for (let i = 0; i < len; i++) for (let k = 0; k < w; k++) c.P.dark(c.dir > 0 ? x + k - i : x + k + i, base + Math.floor(i / 4), 0.28);
}
function win(c: Ctx, x: number, y: number, w: number, h: number, chance = 0.5): void {
  const { P, r } = c;
  const on = c.lightsOn && r() < chance;
  if (on && !c.lamp) { P.box(x, y, w, h, LIT, true); P.px(x + (c.dir > 0 ? w - 1 : 0), y, LIT2, 1, true); return; }
  P.box(x, y, w, h, c.nightish ? '#1a1e34' : '#7a9ab4');
  if (!c.nightish) P.px(x + (c.dir > 0 ? w - 1 : 0), y, '#cfe2ee');
  // 電気の無い家: ランプやろうそくの小さく弱い明かりが、一部の窓にだけ
  if (on && c.e() < 0.6) { P.box(x + Math.floor((w - 2) / 2), y + Math.floor((h - 2) / 2), Math.min(2, w), Math.min(2, h), '#b8743a', true); P.px(x + Math.floor(w / 2), y + Math.floor(h / 2), '#e0a050', 1, true); }
}

// 屋根の上 (x, y は屋根のてっぺん)。テレビのアンテナ: 2000年までは八木アンテナ、その後は一部がパラボラ。2040年からは減り、2080年からは無い
function antenna(c: Ctx, x: number, y: number): void {
  const yr = c.year;
  if (yr === undefined || yr >= 2080) return;
  const fade = 1 - clamp01((yr - 2040) / 40);
  if (c.e() >= techShare(c.s.country, 'tv', !c.s.urban, yr) * fade) return;
  const { P } = c;
  if (yr >= 2000 && c.e() < 0.4) {
    P.box(x, y - 3, 1, 3, '#5a5a62');
    for (let k = 0; k < 4; k++) P.box(x - 2 + k, y - 7 + k, 2 + (k === 1 || k === 2 ? 1 : 0), 1, k < 2 ? '#e8e8e4' : '#b8b8b8');
    P.px(x + 2, y - 5, '#5a5a62');
    return;
  }
  P.box(x, y - 9, 1, 9, '#3a3a42');
  for (const [dy, w] of [[-9, 7], [-7, 5], [-5, 3]]) P.box(x - (w >> 1), y + dy, w, 1, '#3a3a42');
}
// 2050年ごろから屋根に太陽光パネル。豊かな国ほど多い
function solar(c: Ctx, x: number, y: number, w: number): void {
  const yr = c.year;
  if (yr === undefined || yr < 2045 || c.e() >= 0.6 * clamp01((yr - 2040) / 40) * (c.s.country.gdp > 12000 ? 1 : 0.4)) return;
  panel(c, x, y, w);
}
function panel(c: Ctx, x: number, y: number, w: number): void {
  for (let k = 0; k < w; k++) { c.P.px(x + k, y, k % 4 === 3 ? '#4a5a7a' : '#2a3a6a'); c.P.px(x + k, y + 1, k % 4 === 3 ? '#3a4a6a' : '#1e2a50'); }
  if (!c.nightish) c.P.box(x + 1, y, Math.max(1, w - 4), 1, '#6a8ac8');
}
// 屋根の小さな風車 (x, y は屋根の上)
function turbine(c: Ctx, x: number, y: number): void {
  if (c.e() >= c.fut * 0.7) return;
  const { P } = c;
  P.box(x, y - 9, 1, 9, '#d8d8dc');
  for (const [dx, dy] of [[0, -1], [0, -2], [0, -3], [1, 1], [2, 2], [-1, 1], [-2, 2]]) P.px(x + dx, y - 9 + dy, '#f0f0f2');
}
// 農村の未来: 足の付いた貯水タンク (x は左端)
function tank(c: Ctx, x: number): boolean {
  if (c.e() >= c.fut * 1.2) return false;
  const { P } = c, t = tones('#4a7a9a');
  P.box(x, BY - 14, 1, 14, '#6a6a70'); P.box(x + 8, BY - 14, 1, 14, '#6a6a70'); P.box(x + 4, BY - 14, 1, 14, '#5a8aa4');
  for (let k = 0; k < 9; k++) P.box(x + k, BY - 22, 1, 8, t[k === (c.dir > 0 ? 8 : 0) ? 2 : k === (c.dir > 0 ? 0 : 8) ? 0 : 1]);
  P.box(x, BY - 23, 9, 1, t[2]);
  return true;
}

function home(c: Ctx): void {
  const { P, s, r } = c;
  const x = 8 + (s.seed % 5) * 4;
  switch (s.home) {
    case 'hut': {
      wall(c, x + 4, BY - 20, 34, 20, '#a4785a');
      for (let y = BY - 18; y < BY; y += 3) for (let xx = x + 5 + (y % 2) * 2; xx < x + 37; xx += 5) P.px(xx, y, '#8d6650');
      const thatch = c.cl === 'tropical' || c.cl === 'arid';
      for (let i = 0; i < 9; i++) P.box(x + 1 + i * (thatch ? 0.5 : 0), BY - 28 + i, 40 - (thatch ? i : 0), 1, thatch ? (i % 2 ? '#c9a45e' : '#a8843e') : i % 2 ? '#7a7f86' : '#9aa0a6');
      P.box(x, BY - 20, 42, 1, thatch ? '#7a5a30' : '#4f545a');
      P.box(x + 16, BY - 12, 7, 12, '#2a1e18');
      win(c, x + 28, BY - 15, 5, 4, 0.9);
      antenna(c, x + 26, BY - 28);
      if (c.fut > 0 && c.e() < c.fut * 1.2) panel(c, x + 6, BY - 27, 10);
      if (tank(c, x + 46)) c.carX = x + 58;
      break;
    }
    case 'house': {
      const col = c.cl === 'cold' ? '#a85a44' : c.cl === 'tropical' ? '#e8d8a8' : '#e8e0d0';
      wall(c, x, BY - 24, 44, 24, col);
      const roof = c.cl === 'temperate' && s.country.region === 'アジア' ? '#4a5462' : '#a8483c';
      for (let i = 0; i < 12; i++) P.box(x - 3 + i * 2, BY - 25 - i, 50 - i * 4, 1, i % 2 ? roof : tones(roof)[0]);
      P.box(x - 3, BY - 25, 50, 1, tones(roof)[0]);
      if (c.cl === 'cold' || c.land.snow) { P.box(x + 32, BY - 40, 4, 10, '#7a4a3a'); for (let i = 0; i < 4; i++) P.px(x + 33 + i, BY - 42 - i * 2, '#c8c8d0', 0.5); }
      if (c.land.snow) for (let i = 0; i < 12; i++) P.box(x - 3 + i * 2, BY - 26 - i, 50 - i * 4, 1, i % 3 ? '#eef2f8' : '#d8e0ea');
      P.box(x + 19, BY - 13, 7, 13, '#6a4a3a'); P.px(x + 24, BY - 7, '#d8b050');
      win(c, x + 5, BY - 17, 8, 6); win(c, x + 31, BY - 17, 8, 6);
      P.box(x + 4, BY - 11, 10, 1, '#ffffff');
      solar(c, x + 4, BY - 30, 11);
      antenna(c, x + 22, BY - 36);
      turbine(c, x + 38, BY - 30);
      if (!s.urban && !s.car) tank(c, x + 50); // 車の置き場と重なるので、車の無い家だけ
      break;
    }
    case 'villa': {
      P.box(x - 6, BY - 6, 70, 6, '#3f6a3a');
      wall(c, x, BY - 34, 62, 34, '#ece8e2');
      P.box(x - 2, BY - 36, 66, 3, '#4a4a52');
      P.box(x - 2, BY - 18, 34, 2, '#4a4a52');
      win(c, x + 4, BY - 30, 24, 9, 0.8); win(c, x + 36, BY - 30, 20, 9, 0.8); win(c, x + 36, BY - 14, 20, 12, 0.8);
      P.box(x + 14, BY - 14, 8, 14, '#5a4a3a');
      solar(c, x + 6, BY - 38, 22);
      antenna(c, x + 50, BY - 36);
      turbine(c, x + 58, BY - 36);
      for (let xx = x - 6; xx < x + 64; xx++) P.px(xx, BY - 6 - ((xx * 7) % 3 === 0 ? 1 : 0), '#4f7a46');
      break;
    }
    default: { // apartment
      const tall = s.country.gdp > 20000 ? 62 : 48, poor = s.country.gdp < 8000;
      wall(c, x, BY - tall, 50, tall, glassy(c) ? '#8aa8bc' : poor ? '#c8b8a0' : '#d8d0c4');
      if (c.fut > 0.2) greenOn(c, c.dir > 0 ? x : x + 47, BY - tall, 50, tall);
      P.box(x, BY - tall, 50, 2, '#8a847a');
      for (let y = BY - tall + 5, f = 0; y < BY - 8; y += 7, f++) {
        for (let xx = x + 4; xx < x + 46; xx += 8) win(c, xx, y, 4, 4, 0.55);
        if (f % 2) P.box(x + 2, y + 5, 46, 1, '#6a645a');
      }
      if (poor) { P.box(x + 6, BY - tall - 5, 7, 5, '#3a6a8a'); P.box(x + 34, BY - tall - 4, 6, 4, '#5a5a5a'); for (let i = 0; i < 8; i++) P.px(x + 6 + r() * 38, BY - tall + 6 + r() * 30, '#a89880', 0.8); }
      P.box(x + 21, BY - 7, 8, 7, '#3a3a4a'); P.box(x + 20, BY - 8, 10, 1, '#c84a3a');
      solar(c, x + 18, BY - tall - 2, 26);
      antenna(c, x + 44, BY - tall);
    }
  }
}

function tree(c: Ctx, x: number, base: number, sc = 1): void {
  const { P, land, cl, s, dir } = c;
  const lt = tones(land.leaf);
  const leaf = (dx: number, dy: number) => (dy < 0 && dx * dir > 0 ? lt[2] : dx * dir < -2 ? lt[0] : lt[1]);
  if (cl === 'tropical' || (cl === 'arid' && s.country.region !== 'アフリカ')) {
    // ヤシ: 少し曲がった幹と放射する葉
    const h = Math.round(26 * sc);
    for (let i = 0; i < h; i++) { const xx = x + Math.round(Math.sin(i / h * 1.4) * 3); P.px(xx, base - i, i % 3 ? '#7a5a3a' : '#5a4028'); P.px(xx + 1, base - i, '#8a6a46'); }
    const tx = x + 3, ty = base - h;
    for (let a = 0; a < 7; a++) {
      const ang = Math.PI * (1.08 + a * 0.14);
      for (let k = 1; k < 12 * sc; k++) P.px(tx + Math.cos(ang) * k, ty + Math.sin(ang) * k * 0.6 + k * k * 0.05, k > 8 ? lt[0] : leaf(Math.cos(ang), -1));
    }
    return;
  }
  if (cl === 'arid') {
    // アカシア: 平らな樹冠
    P.box(x, base - 22, 2, 22, '#3a2a1e');
    for (let dx = -13; dx <= 13; dx++) for (let dy = -3; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) * 3 <= 14 && (dx * 13 + dy * 7) % 9) P.px(x + dx, base - 25 + dy, leaf(dx, dy));
    return;
  }
  if (cl === 'cold') {
    P.box(x, base - 4, 2, 4, '#4a3020');
    for (let i = 0; i < 5; i++) for (let k = -(1 + i * 2); k <= 1 + i * 2; k++) for (let j = 0; j < 4; j++) P.px(x + k, base - 26 + i * 4 + j, land.snow && j === 0 ? '#eef2f8' : leaf(k, j - 1));
    return;
  }
  // 広葉樹: 冬は枝だけ、春の東アジアは花
  P.box(x, base - 12, 2, 12, '#5a4030'); P.px(x + (dir > 0 ? 1 : 0), base - 10, '#7a5a40');
  if (land.snow || (s.season === 3 && cl === 'temperate')) { for (const [dx, dy] of [[-4, -16], [-2, -14], [3, -15], [5, -18], [0, -18], [-5, -19], [2, -20]]) P.px(x + dx, base + dy, '#4a3424'); return; }
  const bloom = s.season === 0 && ['JPN', 'KOR', 'CHN'].includes(s.country.code);
  for (let dy = -10; dy <= 8; dy++) for (let dx = -10; dx <= 10; dx++) {
    if ((dx / 10) ** 2 + (dy / 9) ** 2 > 1 - ((dx * 31 + dy * 17) & 7) * 0.02) continue;
    P.px(x + 1 + dx, base - 21 + dy, bloom ? ['#c88aa0', '#e8b4c4', '#f8d4dc'][dy < 0 && dx * dir > 0 ? 2 : dx * dir < -2 ? 0 : 1] : leaf(dx, dy));
  }
}

function place(c: Ctx): void {
  const { P, s, land, r } = c;
  const x = 230;
  switch (s.place) {
    case 'school':
      wall(c, x, BY - 24, 66, 24, '#e8dcc0');
      for (let i = 0; i < 4; i++) P.box(x - 2 + i, BY - 25 - i, 70 - i * 2, 1, i % 2 ? '#2f8f86' : '#24706a');
      for (let xx = x + 4; xx < x + 62; xx += 10) if (Math.abs(xx - x - 30) > 5) win(c, xx, BY - 19, 6, 6, 0.3);
      P.box(x + 29, BY - 12, 8, 12, '#5a4a3a');
      disc(c.P, x + 33, BY - 33, 3, '#f2eee4', '#5a5a5a');
      P.box(x + 70, BY - 40, 1, 40, '#6a6a6a'); P.box(x + 71, BY - 40, 9, 5, '#c8483c'); P.box(x + 71, BY - 38, 9, 1, '#f2eee4');
      break;
    case 'field': {
      const crop = land.snow ? '#a89a7a' : s.season === 2 ? '#c8a040' : s.season === 0 ? '#7ab04a' : '#4a8a32';
      const ct = tones(crop);
      for (let y = 72; y < H; y += 4) for (let xx = 200 + ((y / 4) % 2) * 2; xx < W; xx += 4) {
        const sz = 1 + Math.floor((y - 70) / 10);
        for (let k = 0; k < sz + 1; k++) P.px(xx, y - k, k === sz ? ct[2] : ct[1]); P.px(xx + 1, y - 1, ct[0]);
      }
      if (s.season === 2) { for (let dy = 0; dy < 8; dy++) P.box(286 - dy, BY - dy, 14 + dy * 0, 1, dy > 5 ? '#e0c060' : '#c8a040'); }
      break;
    }
    case 'factory': {
      const fh = vh(c, 26, 0.85), ch = vh(c, 58, 0.6);
      wall(c, x, BY - fh, 72, fh, '#a8a29a');
      for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) P.box(x + i * 18 + k * 3, BY - fh - k, 18 - k * 3, 1, k % 2 ? '#8a847c' : '#9a948c');
      P.box(x + 60, BY - ch, 7, ch - fh, '#8a5a4a'); P.box(x + 60, BY - ch, 7, 2, '#5a3a30');
      for (let i = 0; i < 12; i++) for (let k = 0; k < 4 + i * 0.4; k++) { const sx = x + 63 + i * 1.6 + Math.sin(i + k) * 2, sy = BY - ch - 4 - i * 2.2 + k * 0.6; if (dith(Math.round(sx), Math.round(sy), 0.6 - i * 0.03)) P.px(sx, sy, '#c8c4c0'); }
      for (let xx = x + 4; xx < x + 56; xx += 7) win(c, xx, BY - 16, 4, 4, 0.6);
      P.box(x + 24, BY - 9, 12, 9, '#5a5a5a');
      if (c.fut > 0.2) panel(c, x + 2, BY - fh - 2, 52);
      break;
    }
    case 'office': {
      const lh = vh(c, 46), th = vh(c, 70);
      wall(c, x + 30, BY - lh, 30, lh, '#b8b0a4');
      for (let y = BY - lh + 4; y < BY - 4; y += 5) for (let xx = x + 33; xx < x + 57; xx += 5) win(c, xx, y, 3, 3, 0.5);
      wall(c, x, BY - th, 34, th, '#4a6a84');
      for (let y = BY - th + 3; y < BY - 4; y += 4) for (let xx = x + 3; xx < x + 32; xx += 4) win(c, xx, y, 3, 2, 0.45);
      P.box(x + 13, BY - 6, 8, 6, '#2a3440');
      if (c.fut > 0.2) { greenOn(c, c.dir > 0 ? x : x + 31, BY - th, 34, th); greenOn(c, c.dir > 0 ? x + 30 : x + 57, BY - lh, 30, lh); }
      break;
    }
    case 'stall':
      wall(c, x + 4, BY - 12, 46, 12, '#8a5a3a');
      for (let i = 0; i < 12; i++) P.box(x + i * 4, BY - 26, 4, 5, i % 2 ? '#e4e0d4' : '#c8483c');
      for (let i = 0; i < 12; i++) P.px(x + i * 4 + 2, BY - 21, i % 2 ? '#e4e0d4' : '#c8483c');
      P.box(x + 2, BY - 21, 1, 9, '#5a3a20'); P.box(x + 47, BY - 21, 1, 9, '#5a3a20');
      for (let i = 0; i < 14; i++) { const g = ['#d8a031', '#6b8e4e', '#c8553d', '#e8c84a', '#8a3a6a'][Math.floor(r() * 5)]; P.box(x + 6 + i * 3, BY - 14 - (i % 2), 2, 2, g); }
      P.box(x + 54, BY - 7, 10, 7, '#a07a4a'); P.box(x + 54, BY - 7, 10, 1, '#7a5a3a');
      break;
    case 'hospital': {
      const hh = vh(c, 38, 0.6);
      wall(c, x, BY - hh, 66, hh, '#eef0ee');
      P.box(x, BY - hh, 66, 2, '#b8c0c0');
      for (let y = BY - hh + 6; y < BY - 12; y += 7) for (let xx = x + 4; xx < x + 64; xx += 9) win(c, xx, y, 5, 4, 0.5);
      P.box(x + 28, BY - hh - 12, 10, 10, '#f4f4f2'); P.box(x + 31, BY - hh - 11, 4, 8, '#d84040', c.nightish); P.box(x + 29, BY - hh - 9, 8, 4, '#d84040', c.nightish);
      P.box(x + 24, BY - 10, 18, 2, '#5a8a9a'); P.box(x + 27, BY - 8, 12, 8, '#8fb4cc');
      if (c.fut > 0.2) greenOn(c, c.dir > 0 ? x : x + 63, BY - hh, 66, hh);
      break;
    }
    case 'bench':
      tree(c, x + 50, BY);
      P.box(x + 6, BY + 4, 20, 2, '#8a5a3a'); P.box(x + 6, BY, 20, 1, '#8a5a3a'); P.box(x + 6, BY + 2, 20, 1, '#6a4a2a');
      P.box(x + 7, BY + 6, 1, 3, '#3a2a1a'); P.box(x + 24, BY + 6, 1, 3, '#3a2a1a');
      lamp(c, x + 36);
      break;
    case 'grave': {
      // 遠くの墓石は小さく霞ませる
      for (const [gx, gh] of [[x + 40, 7], [x + 54, 6], [x + 64, 8]]) { P.box(gx, BY - gh, 5, gh, '#8a8a94'); P.px(gx, BY - gh, '#6a6a74'); }
      const gx = x + 14, gt = tones('#a8a8b0');
      for (let y = 0; y < 18; y++) for (let k = 0; k < 14; k++) {
        if (y < 3 && ((k - 6.5) / 7) ** 2 + ((y - 3) / 3) ** 2 > 1) continue;
        P.px(gx + k, BY + 4 - 18 + y, c.dir > 0 ? (k > 10 ? gt[2] : k < 2 ? gt[0] : gt[1]) : (k < 3 ? gt[2] : k > 11 ? gt[0] : gt[1]));
      }
      P.box(gx + 6, BY - 10, 2, 7, gt[0]); P.box(gx + 4, BY - 8, 6, 2, gt[0]);
      for (const [fx, fc] of [[gx - 3, '#c84a5a'], [gx - 1, '#f2e6a0'], [gx + 16, '#e8e8f0']] as [number, string][]) { P.box(fx, BY + 1, 1, 3, '#3a6a3a'); P.px(fx, BY, fc); }
      P.box(gx + 19, BY, 2, 4, '#f2efd8'); P.px(gx + 19, BY - 1, '#f8c060', 1, true); P.px(gx + 20, BY - 2, LIT2, 1, true);
      for (let y = -4; y <= 4; y++) for (let k = -4; k <= 4; k++) if (Math.hypot(k, y) < 4 && dith(gx + 20 + k, BY - 1 + y, 0.35)) P.px(gx + 20 + k, BY - 1 + y, '#f8c060', 0.3, true);
      break;
    }
    default:
      if (s.urban) {
        // 角の売店
        wall(c, x + 4, BY - 18, 34, 18, ['#c8b8a0', '#a8b8b0', '#c0a898'][s.seed % 3]);
        for (let i = 0; i < 9; i++) P.box(x + 2 + i * 4, BY - 20, 4, 3, i % 2 ? '#e8e4d8' : ['#2e6a5a', '#3a5a8a', '#a8343e'][s.seed % 3]);
        win(c, x + 8, BY - 14, 12, 8, 0.9); P.box(x + 25, BY - 12, 7, 12, '#3a3a44');
      } else {
        // 井戸
        const st = tones('#9a948a');
        for (let k = 0; k < 12; k++) for (let y = 0; y < 6; y++) P.px(x + 6 + k, BY - 6 + y, st[(k + y * 3) % 5 === 0 ? 0 : c.dir > 0 ? (k > 8 ? 2 : 1) : k < 3 ? 2 : 1]);
        P.box(x + 6, BY - 16, 1, 10, '#5a4030'); P.box(x + 17, BY - 16, 1, 10, '#5a4030'); P.box(x + 5, BY - 17, 14, 1, '#7a5a3a'); P.box(x + 11, BY - 16, 1, 6, '#3a3a3a'); P.box(x + 10, BY - 10, 3, 2, '#6a5a4a');
      }
      tree(c, x + 40, BY);
      for (let k = 0; k < 14; k++) for (let y = 0; y < 5; y++) if (((k - 7) / 7) ** 2 + ((y - 5) / 5) ** 2 < 1) P.px(x + 50 + k, BY - 5 + y, tones(land.leaf)[y < 2 ? 2 : 1]);
  }
}

function lamp(c: Ctx, x: number): void {
  const { P } = c;
  P.box(x, BY - 40, 2, 40 + (GY - BY) - 6, '#2a2a34'); P.box(x - 4, BY - 41, 8, 2, '#3a3a44');
  const led = c.fut > 0.15; // 未来の街灯は白い LED
  if (!c.lightsOn) { P.box(x - 3, BY - 39, 6, 1, led ? '#eef4ff' : '#d8d8c8'); return; }
  P.box(x - 3, BY - 39, 6, 1, led ? '#f4f8ff' : LIT2, true);
  // 光だまり: 下へ広がる三角をディザで
  for (let y = BY - 38; y < GY + 2; y++) {
    const half = (y - BY + 38) * 0.42;
    for (let k = -half; k <= half; k++) {
      const xx = Math.round(x + 1 + k), t = 1 - (Math.abs(k) / (half + 1)) * 0.8 - (y - BY + 38) / 90;
      if (t > 0.3 && dith(xx, y, t - 0.15)) P.px(xx, y, led ? '#e8f0ff' : '#f8e0a0', led ? 0.3 : 0.22, true);
    }
  }
}

function pole(c: Ctx): void {
  const { P } = c;
  P.box(96, BY - 52, 2, 52, '#5a4030'); P.box(90, BY - 50, 14, 1, '#5a4030');
  for (const dy of [0, 3]) for (let x = 0; x < W; x++) P.px(x, BY - 50 + dy + Math.sin((((x + 64) % 160) / 160) * Math.PI) * 5, '#2a2a30');
}

// 人: 3段の陰影。dir の側から光が当たり、影は反対へ伸びる
function figure(c: Ctx, x: number, f: Figure): { w: number; h: number } {
  const { P, dir } = c;
  const h = Math.round(f.height * 1.75);
  if (f.kind === 'baby') return { w: 0, h };
  const s = tones(f.skin), hr = tones(f.hair), cl = tones(f.shirt), pt = tones(f.pants);
  const hd = Math.max(3, Math.round(h / 6.6)), headTop = GY - h, sh = headTop + hd + 1;
  const bw = Math.max(3, Math.round(h * 0.26)), legT = GY - Math.round(h * 0.46);
  const litK = (k: number, w: number) => (dir > 0 ? (k >= w - 1 - Math.floor(w * 0.25) ? 2 : k <= Math.floor(w * 0.2) ? 0 : 1) : (k <= Math.floor(w * 0.25) ? 2 : k >= w - 1 - Math.floor(w * 0.2) ? 0 : 1));
  // 影
  const len = c.tod === 'day' ? h * 0.25 : c.tod === 'night' ? 3 : h * 0.95;
  for (let i = 0; i < len; i++) { P.dark(x + bw / 2 - dir * i, GY - 1, 0.4); P.dark(x + bw / 2 - dir * i, GY, 0.3); }
  const skirt = f.skirt ?? (f.sex === 'F' && f.kind !== 'child');
  if (!skirt) { P.box(x, legT, Math.floor(bw / 2), GY - legT, pt[dir > 0 ? 0 : 1]); P.box(x + Math.ceil(bw / 2), legT, Math.floor(bw / 2), GY - legT, pt[dir > 0 ? 1 : 0]); }
  else P.box(x + 1, GY - 2, bw - 2, 2, s[0]);
  const bottom = skirt ? GY - 2 : legT;
  for (let y = sh; y < bottom; y++) {
    const spread = skirt ? Math.floor(((y - sh) / (bottom - sh)) * 2) : 0;
    for (let k = -spread; k < bw + spread; k++) P.px(x + k, y, cl[litK(k + spread, bw + spread * 2)]);
  }
  if (skirt) for (let k = -2; k < bw + 2; k++) P.px(x + k, GY - 2, cl[0]);
  P.box(x, GY - 1, Math.floor(bw / 2) - (bw > 4 ? 1 : 0), 1, '#2a2220'); P.box(x + Math.ceil(bw / 2) + (bw > 4 ? 1 : 0), GY - 1, Math.floor(bw / 2) - (bw > 4 ? 1 : 0), 1, '#2a2220');
  // 腕
  const armB = sh + Math.round(h * 0.34);
  for (let y = sh + 1; y < armB; y++) { P.px(x - 1, y, cl[dir > 0 ? 0 : 2]); P.px(x + bw, y, cl[dir > 0 ? 2 : 0]); }
  P.px(x - 1, armB, s[0]); P.px(x + bw, armB, s[1]);
  // 首と頭
  P.px(x + Math.floor(bw / 2), sh - 1, s[0]);
  const hx = x + Math.floor((bw - hd) / 2);
  for (let y = 0; y < hd; y++) for (let k = 0; k < hd; k++) {
    if ((y === 0 || y === hd - 1) && (k === 0 || k === hd - 1)) continue;
    P.px(hx + k, headTop + y, k === (dir > 0 ? hd - 1 : 0) ? s[2] : k === (dir > 0 ? 0 : hd - 1) ? s[0] : s[1]);
  }
  hairOn(c, hx, headTop, hd, f, hr);
  if (f.beard) for (let k = 1; k < hd - 1; k++) P.px(hx + k, headTop + hd - 1, hr[0]);
  if (f.kind === 'elder') for (let y = sh + 4; y < GY; y++) P.px(x + (dir > 0 ? bw + 2 : -3), y, '#4a3420');
  return { w: bw, h };
}

function hairOn(c: Ctx, hx: number, top: number, hd: number, f: Figure, hr: string[]): void {
  const { P, dir } = c;
  const st = f.style ?? (f.sex === 'F' ? 'long' : 'side');
  const lit = (k: number) => hr[k === (dir > 0 ? hd - 1 : 0) ? 2 : 0];
  const row = (y: number, from = 0, to = hd) => { for (let k = from; k < to; k++) P.px(hx + k, y, lit(k)); };
  const sides = (y0: number, y1: number, col = hr[0]) => { for (let y = y0; y < y1; y++) { P.px(hx - 1, top + y, col); P.px(hx + hd, top + y, col); } };
  switch (st) {
    case 'bald': for (let k = 1; k < hd - 1; k++) P.px(hx + k, top, tones(f.skin)[2]); P.px(hx, top + 1, hr[0]); P.px(hx + hd - 1, top + 1, hr[0]); return;
    case 'receding': P.px(hx, top, hr[0]); P.px(hx + hd - 1, top, hr[0]); P.px(hx, top + 1, hr[0]); return;
    case 'buzz': for (let k = 0; k < hd; k++) P.px(hx + k, top, mixc(f.hair, f.skin, 0.35)); return;
    case 'cap': { const t = tones(f.cover ?? '#2a3a5a'); row(top - 1, 0, hd); for (let k = 0; k < hd; k++) P.px(hx + k, top, t[1]); P.px(hx + (dir > 0 ? hd : -1), top + 1, t[0]); return; }
    case 'turban': { const t = tones(f.cover ?? '#c84a2a'); for (let y = -1; y < 2; y++) for (let k = -1; k <= hd; k++) P.px(hx + k, top + y, t[(k + y) % 3 === 0 ? 0 : k === (dir > 0 ? hd : -1) ? 2 : 1]); return; }
    case 'hijab': { const t = tones(f.cover ?? '#3a5a7a'); for (let k = -1; k <= hd; k++) P.px(hx + k, top - 1 + (k < 0 || k >= hd ? 1 : 0), t[1]); for (let k = 0; k < hd; k++) P.px(hx + k, top, t[1]); for (let y = 0; y < hd + 3; y++) { P.px(hx - 1, top + y, t[dir > 0 ? 0 : 2]); P.px(hx + hd, top + y, t[dir > 0 ? 2 : 0]); } P.box(hx - 1, top + hd + 1, hd + 2, 2, t[1]); return; }
    case 'afro': case 'curly': row(top - 1); row(top); sides(0, st === 'afro' ? 3 : 2); return;
    case 'bun': row(top); P.box(hx + Math.floor(hd / 2) - 1, top - 2, 2, 2, hr[0]); return;
    case 'long': case 'center': case 'locs': row(top); row(top + 1, 0, 1); row(top + 1, hd - 1, hd); sides(1, hd + 3, st === 'locs' ? hr[1] : hr[0]); return;
    case 'bob': row(top); sides(1, hd + 1); return;
    case 'braids': row(top); sides(1, hd + 5, hr[1]); return;
    case 'pony': row(top); for (let y = 1; y < hd + 2; y++) P.px(hx + (dir > 0 ? -1 : hd), top + y, hr[0]); return;
    case 'fringe': row(top); row(top + 1); return;
    default: row(top); row(top + 1, 0, 2);
  }
}

function baby(c: Ctx, x: number, y: number, f: Figure): void {
  const { P } = c;
  const bl = tones('#f0ece2');
  for (let k = 0; k < 7; k++) for (let j = 0; j < 4; j++) if (!((k === 0 || k === 6) && (j === 0 || j === 3))) P.px(x + k, y + j, bl[j === 0 ? 2 : k === 0 ? 0 : 1]);
  const s = tones(f.skin);
  P.box(x + 4, y - 2, 3, 3, s[1]); P.px(x + 6, y - 1, s[2]); P.px(x + 4, y - 2, f.hair); P.px(x + 5, y - 2, f.hair);
}

function pet(c: Ctx, x: number, kind: '犬' | '猫'): void {
  const t = tones(kind === '犬' ? '#9a6a3a' : '#8a8a8a'), { P, dir } = c;
  for (let i = 0; i < 9; i++) P.dark(x + 4 - dir * i, GY - 1, 0.3);
  P.box(x, GY - 6, 8, 3, t[1]); P.box(x, GY - 6, 8, 1, t[2]);
  P.box(x + 7, GY - 9, 4, 4, t[1]); P.px(x + 10, GY - 9, t[2]); P.px(x + 7, GY - 10, t[0]); P.px(x + (kind === '猫' ? 10 : 9), GY - 10, t[0]);
  P.px(x + 9, GY - 8, '#1a1a1a');
  for (const lx of [0, 2, 5, 7]) P.box(x + lx, GY - 3, 1, 3, t[lx % 2 ? 0 : 1]);
  P.box(x - 1, GY - 8, 1, kind === '猫' ? 4 : 2, t[0]);
}

// 車の形は時代で: 〜1977年は丸い屋根とメッキのバンパー、〜2039年は今の形、2040年からは低く丸い
function car(c: Ctx, x: number, y: number, k = c.s.seed): void {
  const { P, dir } = c;
  const t = tones(['#c8483c', '#3a5a8a', '#d8d4cc', '#2a2a2e', '#6a7a4a'][k % 5]);
  const gen = c.year === undefined ? 1 : c.year < 1978 ? 0 : c.year < 2040 ? 1 : 2;
  const glass = (a: string) => (c.nightish ? '#2a3044' : a);
  for (let i = 0; i < 6; i++) for (let k = 0; k < 28; k++) P.dark(x + k - dir * i, y + 9, 0.3);
  if (gen === 2) {
    P.box(x, y + 4, 28, 5, t[1]); P.box(x + 1, y + 3, 26, 1, t[2]);
    P.box(x + 5, y + 1, 18, 2, t[1]); P.box(x + 7, y, 13, 1, t[2]);
    P.box(x + 6, y + 1, 16, 2, glass('#8ab0cc')); P.px(x + (dir > 0 ? 21 : 6), y + 1, glass('#cfe6f2'));
    for (const wx of [4, 20]) { P.box(x + wx, y + 8, 5, 2, '#1a1a1a'); P.px(x + wx + 2, y + 8, '#6a6a6a'); }
    if (c.lightsOn) P.box(x + (dir > 0 ? 25 : 0), y + 5, 3, 1, '#e8f4ff', true);
    return;
  }
  P.box(x, y + 3, 28, 6, t[1]); P.box(x, y + 3, 28, 1, t[2]); P.box(x + (dir > 0 ? 24 : 0), y + 4, 4, 4, t[2]);
  if (gen === 0) {
    P.box(x + 8, y, 12, 3, t[1]); P.box(x + 7, y + 1, 14, 2, t[1]);
    P.box(x + 8, y + 1, 5, 2, glass('#9ac0d8')); P.box(x + 15, y + 1, 5, 2, glass('#bfe0ee'));
    P.box(x, y + 7, 28, 1, '#c8c8c0'); // メッキのバンパー
    for (const wx of [4, 20]) { P.box(x + wx, y + 7, 5, 4, '#1a1a1a'); P.box(x + wx + 1, y + 9, 3, 1, '#b8b4a8'); }
  } else {
    P.box(x + 6, y, 15, 3, t[1]);
    P.box(x + 7, y + 1, 6, 2, glass('#9ac0d8')); P.box(x + 14, y + 1, 6, 2, glass('#bfe0ee'));
    for (const wx of [4, 20]) { P.box(x + wx, y + 8, 5, 3, '#1a1a1a'); P.px(x + wx + 2, y + 9, '#8a8a8a'); }
  }
  if (gen === 0) for (const k of [0, 27]) P.px(x + k, y + 3, mixc(t[1], '#000000', 0.15)); // 丸い角
  if (c.lightsOn) P.box(x + (dir > 0 ? 27 : 0), y + 4, 1, 2, '#fff4c0', true);
}

// 未来の畑: 灌漑の配管と、屋根に太陽光パネルの付いた電動の農機
function farmFuture(c: Ctx): void {
  const { P, e } = c;
  if (c.fut <= 0 || e() >= c.fut * 1.5) return;
  P.box(200, BY + 1, W - 200, 1, '#8a9098');
  for (let x = 206; x < W; x += 26) { P.box(x, BY - 3, 1, 4, '#8a9098'); if (!c.nightish) for (let k = -2; k <= 2; k++) if (dith(x + k, BY - 4, 0.5)) P.px(x + k, BY - 4 - Math.abs(k) % 2, '#cfe6f2', 0.7); }
  if (e() >= c.fut) return;
  const x = 268, t = tones('#4a8aa0');
  P.box(x, BY - 4, 16, 5, t[1]); P.box(x, BY - 4, 16, 1, t[2]);
  P.box(x + 3, BY - 10, 8, 6, '#9ac0d8'); P.box(x + 2, BY - 11, 11, 1, '#2a3a6a');
  P.box(x + 1, BY + 1, 5, 4, '#1a1a1a'); P.box(x + 12, BY + 2, 3, 3, '#1a1a1a');
}

function goat(c: Ctx, x: number): void {
  const { P } = c;
  for (let i = 0; i < 6; i++) P.dark(x + 3 - c.dir * i, BY + 6, 0.3);
  P.box(x, BY, 8, 4, '#d8cfc0'); P.box(x, BY, 8, 1, '#ece4d4'); P.box(x + 7, BY - 2, 3, 3, '#e8e0d0'); P.px(x + 9, BY - 3, '#6a5a4a');
  for (const lx of [0, 2, 5, 7]) P.box(x + lx, BY + 4, 1, 2, '#8a7a6a');
}

export function paintScene(s: Scene): Pix {
  const P = new Pix(W, H);
  const tod = todOf(s);
  const cl = climateOf(s.country);
  const season = s.season ?? 1;
  const land = landOf(cl, season);
  const e = makeRng(hash(s.seed, 0xe7)), year = s.year;
  const grid = year === undefined ? 1 : techShare(s.country, 'electricity', !s.urban, year);
  const c: Ctx = { P, s: { ...s, season }, r: makeRng(hash(s.seed, 0x5c)), tod, land, cl, dir: tod === 'morning' ? -1 : 1, lightsOn: tod === 'dusk' || tod === 'night', nightish: tod === 'night', e, year, grid, lamp: e() >= grid, tallF: tallOf(s), fut: futOf(s) };
  sky(c);
  P.tint = TINT[tod];
  backdrop(c);
  ground(c);
  // 電柱: 電気が来ている土地だけ。2045年からは豊かな国から地中へ
  const buried = year === undefined ? 0 : clamp01((year - 2045) / 35) * clamp01(s.country.gdp / 20000);
  if ((!s.urban || s.country.gdp < 8000) && (year === undefined || (e() < grid && e() >= buried))) pole(c);
  home(c);
  tree(c, 84 + (s.seed % 7) * 3, BY);
  if (!s.urban) tree(c, 200 + (s.seed % 6) * 4, BY + 1, 0.9);
  place(c);
  if (s.place === 'field') farmFuture(c);
  if (s.urban && s.place !== 'bench') lamp(c, 206);
  if (s.car) { if (s.urban) car(c, 34, 87); else car(c, c.carX ?? 70, BY - 2); }
  if (s.urban && year !== undefined && e() < techShare(s.country, 'car', false, year)) car(c, 262, 88, s.seed + 2); // 道を通る車
  if (!s.urban && s.poor && c.r() < 0.6 && s.place !== 'field') goat(c, 186);
  if (c.fut > 0) drones(c);
  // 家族: 真ん中に並べる。赤ちゃんは隣の大人が抱く
  const widths = s.figures.map((f) => (f.kind === 'baby' ? 0 : Math.max(3, Math.round(f.height * 1.75 * 0.26)) + 5));
  const span = widths.reduce((a, b) => a + b, 0) + (s.pet ? 14 : 0);
  let x = Math.round(156 - span / 2);
  let prev: { x: number; w: number; h: number } | null = null;
  for (const f of s.figures) {
    if (f.kind === 'baby') {
      if (prev) baby(c, prev.x + prev.w - 3, GY - Math.round(prev.h * 0.62), f);
      else { baby(c, x, GY - 4, f); x += 9; }
      continue;
    }
    const d = figure(c, x, f);
    prev = { x, w: d.w, h: d.h };
    x += d.w + 5;
  }
  if (s.pet) pet(c, x + 1, s.pet);
  return P;
}
