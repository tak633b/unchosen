// ちびキャラの立ち絵 24×32 (2頭身ほど)。背景は透明で、足元が下端。最後に 1px の暗い輪郭を付ける。
// 場面 (scene.ts) の家族と、外から描く立ち絵 (chibi.ts の chibiCanvas) がこれを使う。光は右から。
import type { ChibiOpts } from './chibi';
import type { Look } from './look';
import { mixc, Pix, tones } from './raster';

export const SPW = 24, SPH = 32;
const DARK = '#2a1a1e';
const WOOD = tones('#7a5232'), STEEL = tones('#9aa2b0');

// 頭の幅・高さ、胴、脚、胴の幅
function dims(age: number): [number, number, number, number, number] {
  if (age < 2) return [9, 8, 4, 2, 6];
  if (age < 6) return [10, 9, 4, 3, 6];
  if (age < 13) return [10, 9, 5, 4, 6];
  if (age < 18) return [11, 10, 6, 5, 7];
  if (age < 65) return [12, 11, 7, 6, 8];
  return [12, 11, 6, 5, 8];
}
const LONG_HAIR = ['long', 'center', 'braids', 'locs'];
// 場面で並べるときの幅 (頭の幅と少しの余白)
export const spriteWidth = (age: number) => dims(age)[0] + 2;

export function paintChibiSprite(o: Look, opts: ChibiOpts = {}): Pix {
  const P = new Pix(SPW, SPH);
  const bob = opts.bob ?? 0;
  let oy = 0;
  const px = (x: number, y: number, c: string) => P.px(x, y + oy, c);
  const box = (x: number, y: number, w: number, h: number, c: string) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px(x + xx, y + yy, c); };
  const [hw, hh, bh, lh, bw] = dims(o.age);
  const sk = tones(o.skin), hr = tones(o.hair), cl = tones(o.cloth), pt = tones(o.pants), tr = tones(o.trim ?? '#ffffff');
  const W = o.wear ?? (o.collar ? 'shirt' : 'tee'), H = o.style;
  const stoop = o.age >= 65 ? 1 : 0;
  const foot = SPH - 1, legTop = foot - lh + 1, top = legTop - bh, hb = top + stoop, ht = hb - hh + 1;
  const cx = 12, x0 = cx - bw / 2, x1 = cx + bw / 2 - 1, hx0 = cx - hw / 2, hx1 = cx + hw / 2 - 1;
  const long = o.long || W === 'thobe' || W === 'abaya' || W === 'sari';
  const skirt = !long && !!o.skirt && o.age >= 4;
  const coatLong = W === 'coat' || W === 'raincoat' || W === 'kurta' || W === 'boubou' || W === 'wrap' || W === 'poncho';
  const expr = opts.expr ?? (o.smile ? 'happy' : 'neutral');
  const hc = tones(o.hatC ?? '#3a3a40');

  // ---- 背中: 長い髪・リュック・おさげ ----
  oy = -bob;
  const hcy = (ht + hb) / 2;
  const inHead = (x: number, y: number, g = 0) => ((x + 0.5 - cx) / (hw / 2 + g)) ** 2 + ((y + 0.5 - hcy) / (hh / 2 + g)) ** 2 <= 1;
  if (H !== 'hijab' && o.hat !== 'ghutra') {
    if (LONG_HAIR.includes(H)) box(hx0, hcy, hw, bh + (H === 'center' || H === 'long' ? 2 : 4), hr[0]);
    if (H === 'bob') box(hx0 - 1, hcy - 1, hw + 2, hh / 2 + 1, hr[0]);
    if (H === 'pony') { box(hx1 + 1, ht + 3, 2, 6, hr[0]); px(hx1 + 2, ht + 9, hr[0]); }
    if (H === 'afro' || H === 'curly') for (let y = ht - 3; y < hb - 1; y++) for (let x = hx0 - 3; x <= hx1 + 3; x++) if (((x + 0.5 - cx) / (hw / 2 + (H === 'afro' ? 3 : 1.5))) ** 2 + ((y + 0.5 - hcy + 2) / (hh / 2 + (H === 'afro' ? 2.5 : 1.2))) ** 2 <= 1) px(x, y, hr[(x + y) % 3 === 0 ? 0 : x > cx + 2 ? 2 : 1]);
  }
  if (H === 'hijab') { const c = tones(o.cover ?? '#3a5a7a'); for (let y = ht - 1; y < top + bh - 1; y++) for (let x = hx0 - 1; x <= hx1 + 1; x++) if (inHead(x, y, 1) || (y > hcy && Math.abs(x + 0.5 - cx) < hw / 2 + 1 - (y - hcy) * 0.1)) px(x, y, c[x < cx - 3 ? 0 : x > cx + 3 ? 2 : 1]); }
  if (o.hat === 'ghutra') for (let y = ht - 1; y < top + 3; y++) for (let x = hx0 - 1; x <= hx1 + 1; x++) if (inHead(x, y, 1) || y > hcy) px(x, y, hc[x < cx - 3 ? 0 : x > cx + 3 ? 2 : 1]);
  if (o.item === 'pack') box(x0 - 1, top + 1, bw + 2, bh - 1, '#5a4a3a');

  // ---- 脚 ----
  oy = 0;
  const lw = Math.max(2, bw / 2 - 1);
  const legC = W === 'suit' || W === 'military' || W === 'police' || W === 'navy' || W === 'jumpsuit' || W === 'onesie' || W === 'track' || W === 'overalls' ? (W === 'overalls' ? tones('#3a5a8a') : cl) : pt;
  for (const lx of [cx - 1 - lw, cx + 1]) {
    box(lx, legTop - 1, lw, lh + 1, lx < cx ? legC[0] : legC[1]);
    box(lx - (lx < cx ? 1 : 0), foot, lw + 1, 1, W === 'onesie' ? cl[0] : o.age < 13 ? '#c84a3a' : '#2a2224');
  }

  // ---- 胴 ----
  oy = -bob;
  const to = long ? foot : coatLong ? legTop + Math.floor(lh / 2) : skirt ? legTop + Math.ceil(lh / 2) : legTop;
  for (let y = top; y < to; y++) {
    const flare = y >= legTop - 1 ? Math.floor((y - legTop + 2) / (long ? 2 : 1.5)) : 0;
    for (let x = x0 - flare; x <= x1 + flare; x++) {
      if (y === top && (x === x0 || x === x1)) continue;
      px(x, y, x <= x0 - flare ? cl[0] : x >= x1 + flare - 1 ? cl[2] : cl[1]);
    }
  }
  // 胸元: 服ごとの1〜2画素の印
  const mid = (c: string, y0 = top, n = bh) => box(cx - 1, y0, 2, n, c);
  switch (W) {
    case 'suit': case 'blazer': box(cx - 1, top, 2, 2, '#f2efe8'); if (o.tie || W === 'suit') mid(W === 'blazer' ? tr[1] : '#8a2a3a', top + 1, bh - 2); px(x0, top + 1, cl[0]); px(x1, top + 1, cl[0]); break;
    case 'shirt': case 'blouse': case 'smock': px(cx - 1, top, tr[1]); px(cx, top, tr[1]); if (o.tie) mid('#8a2a3a', top + 1, bh - 2); break;
    case 'coat': mid('#8ab0d8', top, 2); box(cx - 1, top + 2, 2, to - top - 2, '#d8dce0'); break;
    case 'sailor': box(x0, top, bw, 2, '#1e2a48'); box(x0, top + 1, bw, 1, '#f4f2ee'); mid(tr[1], top + 2, 2); break;
    case 'gakuran': box(cx - 1, top, 2, 1, cl[0]); for (let y = top + 1; y < to; y += 2) px(cx, y, tr[2]); break;
    case 'track': mid(tr[1]); break;
    case 'military': case 'police': box(x0, top, 2, 1, tr[1]); box(x1 - 1, top, 2, 1, tr[1]); if (W === 'police') px(x0 + 1, top + 2, tr[1]); box(x0, legTop - 1, bw, 1, '#2a2224'); break;
    case 'navy': box(x0, top, 2, 1, tr[1]); box(x1 - 1, top, 2, 1, tr[1]); break;
    case 'overalls': box(x0 + 1, top + 2, bw - 2, bh - 2, '#3a5a8a'); px(x0 + 1, top, '#3a5a8a'); px(x1 - 1, top, '#3a5a8a'); break;
    case 'apron': box(x0 + 1, top + 2, bw - 2, to - top + 1, tr[1]); break;
    case 'jumpsuit': mid('#c8ccd0', top + 1, bh - 1); break;
    case 'vest': box(cx - 1, top, 2, bh, '#8a8a8a'); box(x0, top + 3, bw, 1, tr[1]); break;
    case 'thobe': case 'kurta': mid(cl[0], top, 3); break;
    case 'sari': for (let y = top; y < to; y++) { const x = x0 + Math.floor((y - top) * 0.6); px(x, y, tr[1]); px(x + 1, y, cl[2]); } break;
    case 'boubou': box(cx - 2, top, 4, 1, tr[1]); for (let y = top + 2; y < to; y += 2) px(x0 + ((y >> 1) % 3) * 2, y, tr[2]); break;
    case 'wrap': for (let i = 0; i < 4; i++) px(x0 + 1 + i, top + i, '#f0ece2'); box(x0, legTop - 2, bw, 1, tr[1]); break;
    case 'cardigan': mid('#f0ece0', top, 2); px(cx - 2, top + 3, tr[2]); px(cx - 2, top + 5, tr[2]); break;
    case 'poncho': box(x0 - 1, top + 2, bw + 2, 1, tr[1]); box(x0 - 1, top + 4, bw + 2, 1, tr[2]); break;
    case 'future': box(cx - 1, top - 1, 3, 2, cl[2]); P.px(cx, top + 3 + oy, tr[1], 1, true); P.px(cx, top + 4 + oy, tr[1], 1, true); break;
    case 'chef': px(cx - 2, top + 2, '#c8c8c8'); px(cx + 1, top + 2, '#c8c8c8'); px(cx - 2, top + 4, '#c8c8c8'); px(cx + 1, top + 4, '#c8c8c8'); break;
    case 'hoodie': box(x0 + 1, top - 1, bw - 2, 1, cl[0]); px(cx - 1, top + 1, tr[1]); px(cx, top + 1, tr[1]); break;
    case 'raincoat': mid(cl[0]); break;
    case 'turtle': box(cx - 2, top - 1, 4, 1, cl[1]); break;
    case 'onesie': px(cx, top + 2, tr[1]); break;
  }
  if (o.patch) px(x1 - 1, top + bh - 2, mixc(o.cloth, '#c8a070', 0.55));
  if (o.item === 'steth') { px(cx - 2, top + 1, '#3a3a40'); px(cx + 1, top + 1, '#3a3a40'); px(cx + 1, top + 3, '#c8ccd4'); }
  if (o.item === 'bag') for (let i = 0; i < bh; i++) px(x0 + Math.floor(i * bw / bh), top + i, '#5a3a24');

  // ---- 腕と手 ----
  const sleeve = W === 'tee' || W === 'vest' || W === 'overalls' ? sk : cl;
  const armLen = Math.max(3, bh - 1);
  for (const s of [-1, 1]) {
    const ax = s < 0 ? x0 - 1 : x1 + 1;
    box(ax, top + 1, 1, armLen, s < 0 ? sleeve[0] : sleeve[2]);
    if (sleeve !== sk) box(ax, top + 1, 1, 2, s < 0 ? cl[0] : cl[2]);
    px(ax, top + 1 + armLen, sk[1]);
  }
  const hand: [number, number] = [x1 + 1, top + 1 + armLen];
  if (o.item) item(o.item, hand, px, box, foot);

  // ---- 頭 ----
  for (const s of [-1, 1]) if (H !== 'hijab' && o.hat !== 'ghutra' && !LONG_HAIR.includes(H)) px(s < 0 ? hx0 - 1 : hx1 + 1, hcy + 1, s < 0 ? sk[0] : sk[1]);
  for (let y = ht; y <= hb; y++) for (let x = hx0; x <= hx1; x++) if (inHead(x, y)) px(x, y, sk[x < hx0 + 1 ? 0 : x > hx1 - 1 ? 2 : 1]);
  // 目・口・頬
  const eyeY = ht + Math.round(hh * 0.55), e = Math.round(hw * 0.22);
  const eL = cx - e - 2, eR = cx + e;
  const dead = opts.dead === true;
  for (const ex of [eL, eR]) {
    if (dead || (expr === 'happy' && o.narrow)) { box(ex, eyeY, 2, 1, DARK); continue; }
    box(ex, eyeY - 1, 2, 1, DARK); box(ex, eyeY, 2, 1, mixc(o.eye ?? '#3a2416', DARK, 0.2)); px(ex + 1, eyeY - 1, '#ffffff');
    if (o.sex === 'F' && o.age >= 13) px(ex < cx ? ex - 1 : ex + 2, eyeY - 1, DARK);
  }
  if (o.age < 13 || expr === 'happy' || (o.sex === 'F' && o.age < 50)) { px(eL - 1, eyeY + 1, '#e88a8a'); px(eR + 2, eyeY + 1, '#e88a8a'); }
  if (expr === 'sad' && !dead) px(eL, eyeY + 1, '#9ad0f0');
  const my = eyeY + 2;
  if (expr === 'happy') { box(cx - 1, my, 2, 1, '#8a2a32'); }
  else if (expr === 'sad') { px(cx - 1, my + 1, DARK); px(cx, my, DARK); }
  else px(cx - 1, my, mixc(o.skin, '#7a2a2a', 0.45));
  if (o.beard === 'full') for (let y = my; y <= hb + 1; y++) for (let x = hx0 + 1; x < hx1; x++) if ((inHead(x, y) || y > hb) && !(y === my && Math.abs(x + 0.5 - cx) < 1.5)) px(x, y, hr[x < cx ? 0 : 1]);
  if (o.beard === 'mustache') box(cx - 2, my - 1, 4, 1, hr[0]);
  if (o.glasses && !dead) { box(eL - 1, eyeY - 1, 4, 1, o.glasses === 'gold' ? '#b08a3a' : '#2a2422'); box(eR - 1, eyeY - 1, 4, 1, o.glasses === 'gold' ? '#b08a3a' : '#2a2422'); }
  if (o.ar && !dead) for (let x = eL - 1; x <= eR + 2; x++) P.px(x, eyeY - 1 + oy, '#6ad8f0', 0.6, true);

  // ---- 前髪 ----
  const hairPx = (x: number, y: number) => px(x, y, hr[x > hx1 - 2 ? 2 : x < hx0 + 1 ? 0 : (x + y) % 5 === 0 ? 0 : 1]);
  const cap = (fr: (x: number) => number) => { for (let y = ht - 1; y <= hb; y++) for (let x = hx0 - 1; x <= hx1 + 1; x++) if (inHead(x, y, 0.8) && y < fr(x)) hairPx(x, y); };
  const edge = (x: number) => x <= hx0 || x >= hx1;
  const fringe = ht + Math.round(hh * 0.32);
  if (H !== 'hijab' && o.hat !== 'ghutra') switch (H) {
    case 'bald': for (const x of [hx0, hx1]) box(x, eyeY - 2, 1, 2, hr[1]); px(cx + 2, ht + 1, sk[3]); break;
    case 'receding': cap((x) => (edge(x) ? eyeY - 1 : Math.abs(x + 0.5 - cx) < 2 ? ht + 2 : ht + 1)); break;
    case 'buzz': cap((x) => (edge(x) ? eyeY - 2 : ht + 2)); break;
    case 'long': case 'center': case 'braids': case 'locs': case 'bob': case 'pony': cap((x) => (x <= hx0 + 1 || x >= hx1 - 1 ? eyeY + 2 : fringe + (H === 'center' ? (Math.abs(x + 0.5 - cx) < 1 ? -2 : 0) : x === cx + 1 ? -1 : 0))); break;
    case 'bun': cap((x) => (edge(x) ? eyeY - 1 : fringe)); box(cx - 2, ht - 3, 4, 3, hr[1]); px(cx, ht - 3, hr[2]); break;
    case 'afro': case 'curly': cap((x) => (edge(x) ? eyeY : fringe - ((x & 1) ? 1 : 0))); break;
    case 'cap': cap((x) => (edge(x) ? eyeY : fringe)); { const c = tones(o.cover ?? '#2a3a5a'); box(hx0, ht - 1, hw, fringe - ht + 1, c[1]); box(cx - 1, fringe, hw / 2 + 2, 1, c[0]); } break;
    case 'turban': { const c = tones(o.cover ?? '#c84a2a'); for (let y = ht - 3; y < fringe + 1; y++) for (let x = hx0 - 1; x <= hx1 + 1; x++) if (inHead(x, y + 1, 1)) px(x, y, (x + y) % 3 === 0 ? c[0] : c[x > cx + 2 ? 2 : 1]); break; }
    default: cap((x) => (edge(x) ? eyeY : x < cx ? fringe + 1 : fringe));
  }
  if (o.hat) hat(o.hat, hc, px, box, hx0, hx1, ht, hw, fringe, cx);

  outline(P);
  if (opts.dead) P.grey();
  return P;
}

type Px = (x: number, y: number, c: string) => void;
type Box = (x: number, y: number, w: number, h: number, c: string) => void;

function hat(h: NonNullable<Look['hat']>, c: string[], px: Px, box: Box, hx0: number, hx1: number, ht: number, hw: number, fringe: number, cx: number): void {
  const straw = tones('#d8b860');
  switch (h) {
    case 'straw': case 'brim': { const t = h === 'straw' ? straw : c; box(hx0 - 3, fringe - 1, hw + 6, 1, t[0]); box(hx0 + 1, ht - 2, hw - 2, fringe - ht + 1, t[1]); box(hx0 + 1, fringe - 2, hw - 2, 1, h === 'straw' ? '#a83a2a' : t[0]); break; }
    case 'conical': for (let i = 0; i < 6; i++) box(cx - 1 - i * 1.4, ht - 4 + i, 2 + i * 2.8, 1, straw[i === 5 ? 0 : i % 2 ? 1 : 2]); break;
    case 'bowler': box(cx - 3, ht - 3, 6, 3, c[1]); box(cx - 4, ht - 1, 8, 1, c[0]); break;
    case 'fedora': box(hx0 + 1, ht - 3, hw - 2, 3, c[1]); box(hx0 - 2, ht, hw + 4, 1, c[0]); box(hx0 + 1, ht - 1, hw - 2, 1, '#1a1418'); break;
    case 'flatcap': box(hx0, ht - 1, hw, 2, c[1]); box(cx - 1, ht + 1, hw / 2 + 2, 1, c[0]); break;
    case 'beanie': box(hx0, ht - 2, hw, fringe - ht + 2, c[1]); box(hx0, fringe - 1, hw, 1, c[0]); px(cx, ht - 3, c[2]); break;
    case 'hardhat': box(hx0, ht - 2, hw, fringe - ht + 1, c[1]); box(hx0 - 1, fringe - 1, hw + 2, 1, c[0]); box(cx + 1, ht - 2, 2, 1, c[3]); break;
    case 'chef': box(hx0 + 1, ht - 6, hw - 2, 6, '#fbf9f4'); box(hx0, ht - 6, hw, 2, '#ffffff'); box(hx0 + 1, ht - 1, hw - 2, 1, '#d8d4cc'); break;
    case 'nursecap': box(cx - 3, ht - 2, 6, 2, '#fbf9f4'); px(cx, ht - 2, '#7ab0c8'); break;
    case 'peaked': box(hx0, ht - 2, hw, 3, c[1]); box(hx0 + 1, ht + 1, hw - 2, 1, '#16161c'); px(cx, ht - 1, '#e8c050'); break;
    case 'beret': box(hx0, ht - 2, hw + 1, 2, c[1]); px(cx + 1, ht - 3, c[0]); break;
    case 'kufi': case 'doppa': box(hx0 + 1, ht - 2, hw - 2, 3, c[1]); if (h === 'doppa') { px(cx - 2, ht - 1, '#f0ece4'); px(cx + 2, ht - 1, '#f0ece4'); } else px(cx, ht - 1, c[2]); break;
    case 'ghutra': box(hx0, fringe - 2, hw, 1, '#1a1418'); break;
    case 'headwrap': for (let i = 0; i < 6; i++) box(cx - 3 - i * 0.7, ht - 5 + i, 6 + i * 1.4, 1, c[(i + 1) % 3]); break;
    case 'bucket': box(hx0 + 1, ht - 2, hw - 2, 3, c[1]); box(hx0 - 1, ht + 1, hw + 2, 1, c[0]); break;
  }
}

// 持ち物 (右手)
function item(it: NonNullable<Look['item']>, [hx, hy]: [number, number], px: Px, box: Box, foot: number): void {
  switch (it) {
    case 'hoe': for (let y = hy - 9; y < foot; y++) px(hx + 1, y, WOOD[1]); box(hx, hy - 10, 3, 1, STEEL[1]); break;
    case 'rod': for (let i = 0; i < 12; i++) px(hx + 1 + Math.floor(i / 3), hy - i, WOOD[i % 2]); px(hx + 5, hy - 10, '#d8d8e0'); px(hx + 5, hy - 9, '#d8d8e0'); break;
    case 'net': box(hx, hy + 1, 4, 3, '#b8a878'); px(hx + 1, hy + 2, '#6a5a3a'); px(hx + 3, hy + 2, '#6a5a3a'); break;
    case 'case': box(hx - 1, hy + 1, 5, 3, '#3a2a22'); px(hx + 1, hy, '#5a4a40'); break;
    case 'basket': box(hx - 1, hy + 1, 5, 3, '#b08a3a'); px(hx, hy + 1, '#5aa040'); px(hx + 2, hy, '#d04a3a'); px(hx + 1, hy + 2, '#7a5a2a'); break;
    case 'book': box(hx, hy - 2, 3, 4, '#3a5a8a'); px(hx + 2, hy - 2, '#f0ece0'); break;
    case 'bag': box(hx - 1, hy + 1, 4, 3, '#6a4a2a'); break;
    case 'wrench': for (let i = 0; i < 4; i++) px(hx + 1, hy - i, STEEL[1]); box(hx, hy - 5, 3, 1, STEEL[2]); break;
    case 'cane': for (let y = hy; y <= foot; y++) px(hx + 1, y, WOOD[1]); px(hx, hy, WOOD[1]); break;
    case 'ball': box(hx, hy + 1, 3, 3, '#e8e4dc'); px(hx + 1, hy + 2, '#2a2a30'); break;
    case 'clip': box(hx, hy - 2, 3, 4, '#a8803a'); box(hx, hy - 1, 3, 2, '#f4f0e8'); break;
    case 'scissors': px(hx + 1, hy - 1, STEEL[2]); px(hx + 2, hy - 2, STEEL[2]); break;
    default: break;
  }
}

// 1px の輪郭: 描いていない画素で、上下左右に描いた画素があれば、その色を暗くして塗る
export function outline(P: Pix): void {
  const d = P.d, src = new Uint8ClampedArray(d);
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const i = (y * P.w + x) * 4;
    if (src[i + 3]) continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= P.w || Y >= P.h) continue;
      const j = (Y * P.w + X) * 4;
      if (!src[j + 3]) continue;
      const k = 0.7;
      d[i] = src[j] * (1 - k) + 26 * k; d[i + 1] = src[j + 1] * (1 - k) + 16 * k; d[i + 2] = src[j + 2] * (1 - k) + 22 * k; d[i + 3] = 255;
      break;
    }
  }
}
