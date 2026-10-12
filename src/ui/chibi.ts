// ちびキャラの顔 48×56。頭が大きく、目は大きく丸く、頬に赤み。体は肩から上だけで、服で仕事や土地が分かる。
// 見た目 (肌・髪・髪型・ひげ・眼鏡・服・帽子) は look.ts / wear.ts が決め、ここは描くだけ。
// 立ち絵は chibisprite.ts。外から人を描くときは chibiCanvas / drawChibi を使う (共有カードなど)。
import type { Look } from './look';
import { BAYER, dith, mixc, Pix, tones } from './raster';
import { paintChibiSprite } from './chibisprite';

export const CW = 48, CH = 56;
export type Expr = 'neutral' | 'happy' | 'sad';
export interface ChibiOpts { expr?: Expr; dead?: boolean; bg?: string | null; bob?: number }

const DARK = '#2a1a1e';
const CX = 23.5;
// 頭 (髪の外形) と顔 (肌)
const inSkull = (x: number, y: number, gx = 0, gy = 0) => ((x - CX) / (16.5 + gx)) ** 2 + ((y - 24) / (15.5 + gy)) ** 2 <= 1;
const inFace = (x: number, y: number) => ((x - CX) / 14.5) ** 2 + ((y - 27.5) / 13) ** 2 <= 1;
const side = (x: number) => Math.abs(x - CX);

const stageOf = (age: number) => (age < 2 ? 0 : age < 13 ? 1 : age < 18 ? 2 : age < 50 ? 3 : age < 65 ? 4 : 5); // 赤ちゃん・子ども・十代・大人・中年・年配

export function paintChibiFace(o: Look, opts: ChibiOpts = {}): Pix {
  const P = new Pix(CW, CH);
  const px = (x: number, y: number, c: string, a = 1) => P.px(x, y, c, a);
  const box = (x: number, y: number, w: number, h: number, c: string) => P.box(x, y, w, h, c);
  const fill = (inside: (x: number, y: number) => boolean, col: (x: number, y: number) => string) => {
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (inside(x, y)) px(x, y, col(x, y));
  };
  const sk = tones(o.skin), hr = tones(o.hair), cl = tones(o.cloth);
  const H = o.style, st = stageOf(o.age);
  const expr: Expr = opts.expr ?? (o.smile ? 'happy' : 'neutral');
  const hatC = tones(o.hatC ?? '#3a3a40');

  // 背景
  if (opts.bg !== null) {
    const bg = opts.bg ?? o.bg, bg2 = mixc(bg, '#ffffff', 0.18);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) px(x, y, dith(x, y, 1 - y / CH) ? bg2 : bg);
  }
  // 髪: 右上から光、毛束の筋
  const curly = H === 'afro' || H === 'curly' || H === 'locs';
  // 髪: 地の色に、左の影と、右上に弧を描くつやの帯 (アニメ風の天使の輪)
  const hairAt = (x: number, y: number) => {
    const dx = (x - CX) / 16.5, dy = (y - 24) / 15.5, d = Math.sqrt(dx * dx + dy * dy);
    if (curly) return hr[((x * 7 + y * 13) % 5 === 0) ? 0 : (x * 3 + y * 5) % 7 === 0 ? 2 : dx < -0.55 ? 0 : 1];
    if (dy < -0.2 && d > 0.62 && d < 0.8 && dx > -0.5 && (x + y) % 4 !== 0) return hr[dx > 0.15 ? 3 : 2];
    if (dx < -0.6 || (x * 5 + y) % 11 === 0) return hr[0];
    return hr[dx > 0.55 ? 2 : 1];
  };
  const fillHair = (fn: (x: number, y: number) => boolean) => fill(fn, hairAt);
  const top = (hl: (x: number) => number) => (x: number, y: number) => inSkull(x, y) && y < hl(x);
  const covered = H === 'hijab' || o.hat === 'ghutra';

  // ---- 後ろ髪・かぶり物の後ろ ----
  if (!covered) {
    if (H === 'long' || H === 'center') fillHair((x, y) => inSkull(x, y, 1.5, 0) || (y >= 24 && y < 52 && side(x) < 17 - (y > 46 ? (y - 46) * 0.8 : 0)));
    if (H === 'bob') fillHair((x, y) => inSkull(x, y, 2, 1) || (y >= 24 && y < 41 && side(x) < 18));
    if (H === 'braids') { fillHair((x, y) => inSkull(x, y, 1, 0)); for (const bx of [7, 39]) for (let y = 30; y < 54; y++) { const w = y % 4 < 2 ? 3 : 4; box(bx - (w > 3 ? 2 : 1), y, w, 1, y % 4 === 0 ? hr[0] : hr[1]); } }
    if (H === 'pony') { fillHair((x, y) => inSkull(x, y, 1, 0)); for (let y = 12; y < 40; y++) { const w = 6 - Math.floor((y - 12) / 7); box(37 + Math.floor((y - 12) / 8), y, w, 1, y % 3 ? hr[1] : hr[0]); } }
    if (H === 'afro') fillHair((x, y) => ((x - CX) / 21) ** 2 + ((y - 21) / 18.5) ** 2 <= 1 && y < 40);
    if (H === 'curly') fillHair((x, y) => inSkull(x, y, 3, 2) && y < 36);
    if (H === 'locs') fillHair((x, y) => inSkull(x, y, 2, 0) || (y >= 20 && y < 50 && side(x) < 18 && x % 3 !== 0));
    if (H === 'bun' || H === 'side' || H === 'fringe' || H === 'receding' || H === 'turban' || H === 'cap') fillHair((x, y) => inSkull(x, y, 0.5, 0) && y < 30);
  }
  if (H === 'hijab') { const c = tones(o.cover ?? '#3a5a7a'); fill((x, y) => ((x - CX) / 19) ** 2 + ((y - 26) / 20) ** 2 <= 1 || (y > 38 && side(x) < 21 - (CH - y) * 0.15), (x, y) => c[(x - CX) / 20 + ((x + y) % 11 === 0 ? -0.35 : 0) > 0.35 ? 2 : x < 12 ? 0 : 1]); }
  if (o.hat === 'ghutra') { const c = tones(o.hatC ?? '#ffffff'), red = o.hatC !== '#ffffff'; fill((x, y) => ((x - CX) / 19) ** 2 + ((y - 24) / 18) ** 2 <= 1 || (y > 32 && y < 50 && side(x) < 20 - (y - 32) * 0.2), (x, y) => (red && (x + y) % 4 === 0 && (x - y) % 4 === 0 ? '#f4f0ec' : c[x < 14 ? 0 : x > 34 ? 2 : 1])); }

  // ---- 体: 肩から上 ----
  body(P, o, cl, sk, st);
  // 耳
  if (!covered && !['long', 'center', 'bob', 'locs', 'afro'].includes(H)) for (const s of [-1, 1]) {
    const ex = s < 0 ? 8 : 37;
    box(ex, 26, 3, 6, s < 0 ? sk[0] : sk[1]); px(s < 0 ? 9 : 38, 28, sk[0]);
    if (o.earring) { px(s < 0 ? 9 : 38, 32, '#f0c850'); px(s < 0 ? 9 : 38, 33, '#d8a830'); }
  }
  // 顔: 丸く、右に光
  fill(inFace, (x, y) => { const l = ((x - CX) / 14.5) * 0.9 - ((y - 27.5) / 13) * 0.25; return l > 0.62 ? sk[2] : l < -0.78 ? sk[0] : sk[1]; });
  if (st === 0) fill((x, y) => inFace(x, y) && y > 36 && side(x) < 9, () => sk[1]); // 赤ちゃんはほっぺが丸い

  // ---- 目・眉・口 ----
  const eh = o.narrow ? 3 : st <= 1 ? 7 : st === 5 ? 5 : 6;
  const ey = st === 0 ? 27 : 25, iris = o.eye ?? '#3a2416';
  const EW = 5, ex0 = [13, 30];
  const shut = opts.dead === true;
  for (const ex of ex0) {
    const left = ex < CX, outer = left ? ex - 1 : ex + EW;
    if (shut || (expr === 'happy' && o.narrow)) { box(ex + 1, ey + 2, EW - 2, 1, DARK); px(ex, ey + 3, DARK); px(ex + EW - 1, ey + 3, DARK); continue; }
    box(ex, ey, EW, eh, DARK);
    px(ex, ey, mixc(o.skin, DARK, 0.5)); px(ex + EW - 1, ey, mixc(o.skin, DARK, 0.5)); // 角を丸く
    box(ex + 1, ey + 2, EW - 2, eh - 2, mixc(iris, DARK, 0.3));
    box(ex + 1, ey + Math.ceil(eh / 2), EW - 2, Math.floor(eh / 2) - 1, iris);
    if (eh > 4) box(ex + 1, ey + eh - 2, EW - 2, 1, mixc(iris, '#ffffff', 0.35));
    box(ex + 1, ey + 1, eh > 3 ? 2 : 1, eh > 3 ? 2 : 1, '#ffffff');
    if (eh > 4) px(ex + EW - 2, ey + eh - 3, '#ffffff');
    if (o.sex === 'F' && st >= 2) { px(outer, ey, DARK); px(outer + (left ? -1 : 1), ey - 1, DARK); }
    if (st === 5) { px(outer, ey + eh - 1, sk[0]); px(outer + (left ? -1 : 1), ey + eh - 2, sk[0]); } // 目じりのしわ
  }
  // 眉
  const bw = o.thickBrow ? 2 : 1, brow = st === 5 ? hr[2] : hr[0];
  for (const ex of ex0) {
    const inner = ex < CX ? ex + EW - 1 : ex;
    box(ex, ey - 2 - bw, EW, bw, brow);
    if (expr === 'sad') { px(inner, ey - 3 - bw, brow); px(ex < CX ? ex : ex + EW - 1, ey - 2 - bw + 1, brow); }
  }
  // 頬の赤み・涙
  const blush = st <= 1 || expr === 'happy' || (o.sex === 'F' && st <= 3);
  if (blush && !shut) for (const bx of [11, 34]) { px(bx, ey + eh + 1, '#e8707a', 0.45); px(bx + 1, ey + eh + 1, '#e8707a', 0.55); px(bx + 2, ey + eh + 1, '#e8707a', 0.45); }
  if (expr === 'sad' && !shut) { px(13, ey + eh, '#9ad0f0'); px(13, ey + eh + 1, '#c8e8ff'); px(12, ey + eh + 2, '#c8e8ff'); }
  // しわ (おどけた線): 中年は口の横、年配は額にも
  if (st >= 4) { px(17, 35, sk[0]); px(30, 35, sk[0]); px(16, 34, sk[0]); px(31, 34, sk[0]); }
  if (st === 5) { box(19, 19, 3, 1, sk[0]); box(26, 19, 3, 1, sk[0]); box(21, 17, 6, 1, sk[0]); }
  // 鼻と口
  px(23, 33, sk[0]);
  const lip = mixc(o.skin, '#8a2a32', 0.55);
  if (expr === 'happy') { box(21, 35, 6, 1, DARK); box(22, 36, 4, 1, '#c84a5a'); px(22, 36, DARK); px(25, 36, DARK); box(23, 37, 2, 1, DARK); }
  else if (expr === 'sad') { box(22, 36, 4, 1, DARK); px(21, 37, DARK); px(26, 37, DARK); }
  else { box(22, 36, 4, 1, lip); px(21, 35, lip); px(26, 35, lip); }
  // ひげ
  if (o.beard === 'mustache') { box(19, 34, 4, 1, hr[0]); box(25, 34, 4, 1, hr[0]); box(20, 33, 8, 1, hr[1]); }
  if (o.beard === 'full') fill((x, y) => inFace(x, y) && y >= 33 && !(y >= 35 && y <= 37 && side(x) < 3.5) && !(y < 34 && side(x) < 4), (x, y) => hairAt(x, y));
  if (o.beard === 'stubble') for (let y = 33; y < 41; y++) for (let x = 12; x < 36; x++) if (inFace(x, y) && !(y >= 34 && y <= 37 && side(x) < 4) && BAYER[y & 3][x & 3] < 5) px(x, y, mixc(o.hair, o.skin, 0.45));

  // ---- 前髪・頭頂 ----
  if (!covered) frontHair(o, P, fillHair, top, hairAt, sk, hr);
  // ---- 帽子 ----
  if (o.hat) hatOn(o.hat, P, hatC, o);
  // 眼鏡
  if (o.glasses && !shut) {
    const f = o.glasses === 'gold' ? '#b08a3a' : '#2a2422';
    for (const ex of ex0) { box(ex - 1, ey - 1, EW + 2, 1, f); box(ex - 1, ey + eh, EW + 2, 1, f); box(ex - 1, ey - 1, 1, eh + 2, f); box(ex + EW, ey - 1, 1, eh + 2, f); px(ex + EW - 1, ey, '#ffffff', 0.5); }
    box(19, ey + 1, 10, 1, f);
  }
  if (o.ar && !shut) for (let x = 11; x < 37; x++) for (let y = ey; y < ey + 3; y++) P.px(x, y, '#6ad8f0', 0.35, true);
  if (opts.dead) P.grey();
  return P;
}

// 前髪。fringe 系は目の上まで下ろす (ちびキャラらしく厚めに)
function frontHair(o: Look, P: Pix, fillHair: (fn: (x: number, y: number) => boolean) => void, top: (hl: (x: number) => number) => (x: number, y: number) => boolean, hairAt: (x: number, y: number) => string, sk: string[], hr: string[]): void {
  const H = o.style;
  const longFront = (x: number) => 20 + side(x) * 0.15 + (side(x) > 11 ? 9 : 0) - ((x + 1) % 5 === 0 ? 1 : 0) - (x > CX + 2 && x < CX + 6 ? 2 : 0);
  if (H === 'fringe') fillHair(top((x) => 22 + ((x & 1) ? 0 : -1) + (side(x) > 11 ? 6 : 0)));
  if (H === 'side') fillHair(top((x) => (x < 18 ? 23 : 21 - (x - 18) * 0.35) + (side(x) > 12 ? 6 : 0)));
  if (H === 'buzz') { const thin = mixc(o.hair, o.skin, 0.4); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (inSkull(x, y, -0.4) && y < 19 + (side(x) > 12 ? 6 : 0) && !(inFace(x, y) && y >= 18)) P.px(x, y, dith(x, y, 0.55) ? hairAt(x, y) : thin); }
  if (H === 'receding') fillHair(top((x) => (side(x) < 4 ? 15 : side(x) < 9 ? 18 : 25)));
  if (H === 'bald') {
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (inSkull(x, y) && !inFace(x, y) && y < 22) { const l = (x - CX) / 13 - (y - 12) / 20; P.px(x, y, l > 0.45 ? sk[3] : l > 0 ? sk[2] : sk[1]); }
    for (let y = 21; y < 30; y++) for (const x of [7, 8, 9, 38, 39, 40]) if (inSkull(x, y, 0.5)) P.px(x, y, hairAt(x, y));
    P.px(28, 12, '#ffffff', 0.7); P.px(29, 13, '#ffffff', 0.5); // 頭のつや
  }
  if (H === 'long' || H === 'bob' || H === 'braids' || H === 'pony') fillHair(top(longFront));
  if (H === 'center') fillHair(top((x) => 17 + side(x) * 0.5 + (side(x) > 11 ? 9 : 0) - (side(x) < 1 ? 3 : 0)));
  if (H === 'bun') { fillHair(top((x) => 21 + side(x) * 0.1 + (side(x) > 11 ? 5 : 0) - ((x & 1) ? 1 : 0))); fillHair((x, y) => ((x - CX) / 7) ** 2 + ((y - 7) / 5.5) ** 2 <= 1); }
  if (H === 'curly') fillHair((x, y) => inSkull(x, y, 3, 2) && y < 21 + (side(x) > 11 ? 9 : 0) - ((x % 4) < 2 ? 1 : 0) && !(inFace(x, y) && y > 21));
  if (H === 'afro') fillHair((x, y) => ((x - CX) / 21) ** 2 + ((y - 21) / 18.5) ** 2 <= 1 && y < 19 + (side(x) > 11 ? 10 : 0));
  if (H === 'locs') fillHair(top((x) => 20 + (side(x) > 10 ? 7 : 0)));
  if (H === 'cap') {
    const c = tones(o.cover ?? '#2a3a5a');
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (inSkull(x, y, 0.6) && y < 20) P.px(x, y, c[(x - CX) / 13 > 0.3 ? 2 : (x - CX) / 13 < -0.4 ? 0 : 1]);
    P.box(8, 19, 30, 2, c[0]); P.box(26, 19, 16, 2, c[1]); P.px(CX, 9, c[2]);
    fillHair((x, y) => inSkull(x, y) && y >= 21 && y < 26 && side(x) > 12.5);
  }
  if (H === 'turban') {
    const c = tones(o.cover ?? '#c84a2a');
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (((x - CX) / 17.5) ** 2 + ((y - 14) / 12) ** 2 <= 1 && y < 22 - Math.max(0, side(x) - 12)) {
      const band = Math.round(y + side(x) * 0.5) % 5 === 0;
      P.px(x, y, band ? c[0] : c[(x - CX) / 15 > 0.25 ? 2 : 1]);
    }
  }
}

// 肩から上の服。wear で襟元の形と飾りを変える
function body(P: Pix, o: Look, cl: string[], sk: string[], st: number): void {
  const px = (x: number, y: number, c: string, a = 1) => P.px(x, y, c, a);
  const box = (x: number, y: number, w: number, h: number, c: string) => P.box(x, y, w, h, c);
  const W = o.wear ?? (o.collar ? 'shirt' : 'tee');
  const tr = tones(o.trim ?? '#ffffff');
  const half = (y: number) => Math.min(st === 0 ? 11 : 15, 8 + (y - 42) * 1.6);
  const inBody = (x: number, y: number) => y >= 42 && side(x) < half(y);
  for (let y = 42; y < CH; y++) for (let x = 0; x < CW; x++) if (inBody(x, y)) px(x, y, x > CX + half(y) - 4 ? cl[2] : x < CX - half(y) + 3 ? cl[0] : cl[1]);
  // 首
  box(20, 38, 8, 5, sk[0]); box(23, 39, 4, 4, sk[1]);
  const vneck = (d: number, c: string) => { for (let i = 0; i < d; i++) box(CX - (d - i) / 2 + 0.5, 42 + i, d - i, 1, c); };
  const buttons = (x: number, c: string) => { for (let y = 45; y < CH; y += 3) px(x, y, c); };
  const lapels = (c: string) => { for (let i = 0; i < 9; i++) { px(CX - 4 + i * 0.35, 42 + i, c); px(CX + 4 - i * 0.35, 42 + i, c); } };
  switch (W) {
    case 'tee': case 'onesie': box(21, 42, 6, 1, sk[0]); box(20, 42, 8, 1, cl[0]); if (W === 'onesie') { px(22, 48, tr[1]); px(25, 48, tr[1]); } break;
    case 'shirt': case 'smock': for (let i = 0; i < 4; i++) { box(18 + i, 42 + i, 3, 1, tr[1]); box(27 - i, 42 + i, 3, 1, tr[2]); } box(23, 44, 2, 12, cl[0]); buttons(24, tr[1]); if (o.tie) box(23, 43, 2, 10, '#8a2a3a'); break;
    case 'blouse': vneck(6, sk[1]); for (let i = 0; i < 3; i++) { px(19 + i, 42 + i, tr[1]); px(28 - i, 42 + i, tr[1]); } break;
    case 'suit': case 'blazer': {
      vneck(8, '#f2efe8');
      if (o.tie || W === 'suit') { box(23, 43, 2, 2, o.tie ? (W === 'blazer' ? tr[1] : '#7a2a3a') : '#f2efe8'); if (o.tie) box(23, 45, 2, 8, W === 'blazer' ? tr[1] : '#8a2a3a'); }
      lapels(cl[0]);
      if (W === 'blazer') { box(14, 48, 3, 3, tr[1]); px(15, 49, '#e8c050'); }
      break;
    }
    case 'coat': vneck(7, '#8ab0d8'); lapels('#c8ccd0'); box(14, 50, 4, 1, '#c8ccd0'); box(30, 50, 4, 1, '#c8ccd0'); break;
    case 'scrubs': case 'navy': vneck(6, sk[1]); if (W === 'navy') { box(10, 43, 5, 2, '#d8b050'); box(33, 43, 5, 2, '#d8b050'); } break;
    case 'sailor': {
      const n = tones('#1e2a48');
      for (let y = 42; y < 50; y++) for (let x = 10; x < 38; x++) if (inBody(x, y) && (y < 46 || side(x) > 6)) px(x, y, (y === 45 && side(x) > 6) || (y < 46 && side(x) > 13) ? '#f4f2ee' : n[1]);
      vneck(6, '#f4f2ee'); box(21, 48, 6, 2, tr[1]); box(22, 50, 4, 3, tr[0]);
      break;
    }
    case 'gakuran': box(19, 41, 10, 2, cl[0]); px(23, 41, tr[2]); for (let y = 45; y < CH; y += 3) px(23, y, tr[2]); break;
    case 'track': box(23, 42, 2, 14, tr[1]); for (const x of [12, 35]) box(x, 45, 1, 11, tr[1]); box(20, 41, 8, 2, cl[2]); break;
    case 'military': case 'police': {
      for (let i = 0; i < 4; i++) { box(19 + i, 42 + i, 3, 1, cl[2]); box(26 - i, 42 + i, 3, 1, cl[2]); }
      vneck(4, '#e8e4dc'); box(23, 43, 2, 6, W === 'police' ? '#1a2440' : '#3a4a2a');
      buttons(24, tr[1]);
      if (W === 'police') { box(15, 47, 3, 3, tr[1]); px(16, 48, '#ffffff'); }
      else { box(10, 43, 5, 2, cl[0]); px(11, 43, tr[1]); px(13, 43, tr[1]); box(33, 43, 5, 2, cl[0]); px(34, 43, tr[1]); px(36, 43, tr[1]); box(14, 49, 5, 3, cl[0]); box(29, 49, 5, 3, cl[0]); }
      break;
    }
    case 'overalls': { const d = tones('#3a5a8a'); box(20, 42, 8, 1, sk[0]); for (let y = 48; y < CH; y++) box(16, y, 16, 1, d[1]); for (let y = 42; y < 48; y++) { px(17, y, d[0]); px(30, y, d[2]); } px(17, 48, '#e8c050'); px(30, 48, '#e8c050'); break; }
    case 'apron': box(21, 42, 6, 1, sk[0]); for (let y = 47; y < CH; y++) box(17, y, 14, 1, tr[y === 47 ? 2 : 1]); for (let y = 42; y < 47; y++) { px(18, y, tr[1]); px(29, y, tr[1]); } break;
    case 'jumpsuit': for (let i = 0; i < 3; i++) { box(19 + i, 42 + i, 3, 1, cl[2]); box(26 - i, 42 + i, 3, 1, cl[2]); } box(23, 44, 1, 12, '#c8ccd0'); box(14, 48, 4, 3, cl[0]); if (o.trim && o.trim !== '#e8e8e8') { box(31, 47, 3, 3, tr[1]); } break;
    case 'vest': { box(21, 42, 6, 1, sk[0]); const g = tones('#8a8a8a'); for (let y = 42; y < CH; y++) box(21, y, 6, 1, g[1]); box(10, 50, 11, 2, tr[1]); box(27, 50, 11, 2, tr[1]); break; }
    case 'kurta': box(20, 41, 8, 2, cl[0]); box(23, 43, 2, 8, cl[0]); px(23, 45, tr[2]); px(23, 48, tr[2]); break;
    case 'thobe': box(20, 41, 8, 2, cl[0]); box(23, 43, 2, 10, cl[0]); px(24, 45, tr[1]); px(24, 48, tr[1]); break;
    case 'abaya': vneck(4, '#2a2830'); for (let x = 12; x < 36; x += 4) px(x, 54, tr[2]); break;
    case 'sari': {
      vneck(5, sk[1]);
      for (let y = 42; y < CH; y++) for (let x = 0; x < CW; x++) if (inBody(x, y) && Math.abs(x - (12 + (y - 42) * 1.2)) < 4) px(x, y, Math.abs(x - (12 + (y - 42) * 1.2)) > 2.8 ? tr[1] : cl[2]);
      break;
    }
    case 'boubou': { for (let x = 17; x < 31; x++) { px(x, 42 + (side(x) < 4 ? 2 : side(x) < 6 ? 1 : 0), tr[1]); px(x, 43 + (side(x) < 4 ? 2 : side(x) < 6 ? 1 : 0), tr[2]); } for (let y = 47; y < CH; y += 3) for (let x = 10 + (y % 2) * 2; x < 38; x += 4) if (inBody(x, y)) px(x, y, tr[2]); break; }
    case 'wrap': for (let i = 0; i < 10; i++) { px(18 + i, 42 + i, '#f0ece2'); px(19 + i, 42 + i, tr[1]); px(30 - i * 0.6, 42 + i, cl[0]); } break;
    case 'cardigan': vneck(8, '#f0ece0'); lapels(cl[0]); buttons(21, tr[2]); buttons(27, tr[2]); break;
    case 'poncho': for (const y of [46, 47, 51, 52]) for (let x = 0; x < CW; x++) if (inBody(x, y)) px(x, y, y % 5 === 1 ? tr[1] : tr[2]); box(21, 42, 6, 1, sk[0]); break;
    case 'future': box(19, 39, 10, 4, cl[2]); box(19, 39, 10, 1, cl[3]); for (let y = 43; y < CH; y++) P.px(CX - 4 + (y - 43) * 0.4, y, tr[1], 1, true); break;
    case 'raincoat': box(19, 41, 10, 2, cl[0]); box(23, 43, 2, 13, cl[0]); for (let y = 45; y < CH; y += 4) { box(21, y, 2, 1, '#6a4a2a'); box(25, y, 2, 1, '#6a4a2a'); } break;
    case 'chef': box(20, 41, 8, 2, cl[2]); for (const x of [20, 27]) for (let y = 45; y < CH; y += 3) px(x, y, '#c8c8c8'); break;
    case 'hoodie': for (let x = 14; x < 34; x++) for (let y = 39; y < 44; y++) if (side(x) > 6 - (y - 39)) px(x, y, cl[0]); box(21, 44, 1, 5, tr[1]); box(26, 44, 1, 5, tr[1]); box(17, 51, 14, 1, cl[0]); break;
    case 'turtle': box(19, 38, 10, 5, cl[1]); box(19, 38, 10, 1, cl[2]); box(19, 42, 10, 1, cl[0]); break;
  }
  if (o.necklace && W !== 'abaya') for (let x = 20; x <= 27; x++) px(x, 43 + (side(x) < 2 ? 1 : 0), '#e8c050');
  if (o.item === 'steth') { for (let i = 0; i < 7; i++) { px(19 + i * 0.2, 42 + i, '#3a3a40'); px(28 - i * 0.2, 42 + i, '#3a3a40'); } box(26, 49, 3, 3, '#c8ccd4'); px(27, 50, '#ffffff'); }
  if (o.item === 'pack') for (let y = 42; y < CH; y++) { px(12 + (y - 42) * 0.15, y, '#3a3430'); px(35 - (y - 42) * 0.15, y, '#3a3430'); }
  if (o.item === 'bag') for (let i = 0; i < 14; i++) px(14 + i, 42 + i, '#5a3a24');
  if (o.patch) { box(31, 50, 4, 4, mixc(o.cloth, '#c8a070', 0.55)); px(31, 50, DARK); px(34, 53, DARK); }
}

// 帽子 (髪の上にかぶせる)
function hatOn(h: NonNullable<Look['hat']>, P: Pix, c: string[], o: Look): void {
  const px = (x: number, y: number, col: string) => P.px(x, y, col);
  const box = (x: number, y: number, w: number, hh: number, col: string) => P.box(x, y, w, hh, col);
  const each = (fn: (x: number, y: number) => string | null) => { for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const col = fn(x, y); if (col) px(x, y, col); } };
  const lit = (x: number) => c[(x - CX) / 14 > 0.3 ? 2 : (x - CX) / 14 < -0.4 ? 0 : 1];
  const straw = tones('#d8b860');
  switch (h) {
    case 'straw': case 'brim': {
      const t = h === 'straw' ? straw : c;
      each((x, y) => (((x - CX) / 23) ** 2 + ((y - 15.5) / 3.2) ** 2 <= 1 ? t[y > 15 ? 0 : (x + y) % 3 === 0 ? 2 : 1] : null));
      each((x, y) => (((x - CX) / 12.5) ** 2 + ((y - 13) / 9) ** 2 <= 1 && y < 15 ? t[(x - CX) / 12 > 0.3 ? 2 : (x + y * 2) % 5 === 0 ? 0 : 1] : null));
      if (h === 'straw') box(12, 12, 24, 2, '#a83a2a'); else box(12, 12, 24, 1, mixc(o.hatC ?? '#3a3a40', '#000000', 0.4));
      break;
    }
    case 'conical': each((x, y) => (y >= 0 && y <= 18 && side(x) <= (y + 0.5) * 1.3 ? straw[y === 18 ? 0 : (x + y) % 4 === 0 ? 0 : x > CX + 2 ? 2 : 1] : null)); break;
    case 'bowler': each((x, y) => (((x - CX) / 9) ** 2 + ((y - 9) / 7) ** 2 <= 1 && y < 12 ? lit(x) : null)); box(13, 11, 22, 2, c[0]); box(15, 10, 18, 1, '#6a4a3a'); break;
    case 'fedora': each((x, y) => (((x - CX) / 13) ** 2 + ((y - 11) / 8) ** 2 <= 1 && y < 14 && !(y < 6 && side(x) < 3) ? lit(x) : null)); box(5, 14, 38, 2, c[0]); box(10, 12, 28, 2, '#1a1418'); break;
    case 'flatcap': each((x, y) => (inSkull(x, y, 0.8, 0) && y < 17 ? lit(x) : null)); box(8, 16, 32, 2, c[0]); box(20, 17, 18, 2, c[1]); break;
    case 'beanie': each((x, y) => (inSkull(x, y, 1, 0) && y < 19 ? (y > 15 ? c[x % 2 ? 0 : 1] : x % 3 === 0 ? c[0] : lit(x)) : null)); each((x, y) => (((x - CX) / 3) ** 2 + ((y - 7) / 3) ** 2 <= 1 ? c[2] : null)); break;
    case 'hardhat': each((x, y) => (inSkull(x, y, 1, 0) && y < 17 ? (side(x) < 1 ? c[2] : lit(x)) : null)); box(5, 16, 38, 2, c[0]); box(26, 7, 6, 2, c[3]); break;
    case 'chef': each((x, y) => ((((x - CX) / 13) ** 2 + ((y - 7) / 7) ** 2 <= 1 || (y >= 7 && y < 17 && side(x) < 12)) ? (y > 14 ? '#e0dcd4' : (x + y) % 6 === 0 ? '#e8e4dc' : '#fbf9f4') : null)); break;
    case 'nursecap': box(14, 9, 20, 6, '#fbf9f4'); box(14, 14, 20, 1, '#d8d4cc'); box(18, 11, 12, 1, '#7ab0c8'); break;
    case 'peaked': each((x, y) => (((x - CX) / 17) ** 2 + ((y - 11) / 6) ** 2 <= 1 && y < 15 ? lit(x) : null)); box(8, 14, 32, 2, c[0]); box(12, 16, 24, 2, '#16161c'); box(22, 9, 4, 3, '#e8c050'); break;
    case 'beret': each((x, y) => (((x - CX - 3) / 15) ** 2 + ((y - 11) / 5) ** 2 <= 1 ? lit(x) : null)); px(CX + 3, 5, c[0]); break;
    case 'kufi': each((x, y) => (inSkull(x, y, 0.4, 0) && y < 15 ? ((x + y) % 4 === 0 && y > 9 ? c[2] : lit(x)) : null)); break;
    case 'doppa': each((x, y) => (y >= 6 && y < 15 && side(x) < 13 - Math.max(0, 9 - y) * 0.6 ? ((x % 6 === 2 && y % 4 === 1) || (x % 6 === 5 && y % 4 === 3) ? '#f0ece4' : lit(x)) : null)); box(11, 14, 26, 1, '#f0ece4'); break;
    case 'ghutra': box(9, 14, 30, 2, '#1a1418'); box(9, 12, 30, 1, '#1a1418'); break;
    case 'headwrap': each((x, y) => (y >= 0 && y < 20 && side(x) < 18 - Math.abs(y - 10) * 0.7 && (y > 4 || side(x) < 10 + y) ? ((x + y * 2) % 7 === 0 ? c[3] : (x - y) % 5 === 0 ? c[0] : lit(x)) : null)); break;
    case 'bucket': each((x, y) => (((x - CX) / 13) ** 2 + ((y - 11) / 8) ** 2 <= 1 && y < 15 ? lit(x) : null)); each((x, y) => (y >= 14 && y < 18 && side(x) < 17 - (y - 14) * 0.5 ? c[0] : null)); break;
  }
}

// ---- 外から使う入り口 ----
export type ChibiKind = 'face' | 'sprite';
export function paintChibi(o: Look, opts: ChibiOpts & { kind?: ChibiKind } = {}): Pix {
  return opts.kind === 'sprite' ? paintChibiSprite(o, opts) : paintChibiFace(o, opts);
}

// その人を1枚のキャンバスに (scale 倍、画素はぼかさない)。顔は 48×56、立ち絵は 24×32 が等倍
export function chibiCanvas(o: Look, opts: ChibiOpts & { kind?: ChibiKind; scale?: number } = {}): HTMLCanvasElement {
  const P = paintChibi(o, opts);
  const cv = document.createElement('canvas');
  P.put(cv);
  const k = Math.max(1, Math.round(opts.scale ?? 1));
  if (k === 1) return cv;
  const big = document.createElement('canvas');
  big.width = P.w * k; big.height = P.h * k;
  const g = big.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(cv, 0, 0, big.width, big.height);
  return big;
}

// 別のキャンバス (共有カードなど) の (x, y) に、左上を合わせて scale 倍で描く
export function drawChibi(ctx: CanvasRenderingContext2D, o: Look, x: number, y: number, scale = 1, opts: ChibiOpts & { kind?: ChibiKind } = {}): void {
  const cv = chibiCanvas(o, { ...opts, scale: 1 });
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, Math.round(x), Math.round(y), cv.width * scale, cv.height * scale);
  ctx.imageSmoothingEnabled = smooth;
}
