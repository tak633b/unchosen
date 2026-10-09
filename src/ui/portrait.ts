// 顔写真 48×56。顔は楕円に3段の陰影 (光は右上)、髪は毛筋の線とつや。見た目は look.ts が決める。
import type { Person, Tie } from '../engine/person';
import { lookOfMe, lookOfRel, type Look } from './look';
import { BAYER, dith, mixc, Pix, tones } from './raster';
import { drawPet } from './petportrait';

export const PW = 48;
export const PH = 56;
const FX = 23.5, FY = 26.5, RX = 10, RY = 13;
const inFace = (x: number, y: number) => ((x - FX) / RX) ** 2 + ((y - FY) / RY) ** 2 <= 1;
const inSkull = (x: number, y: number, gx = 0, gy = 0) => ((x - FX) / (RX + 1.6 + gx)) ** 2 + ((y - 23) / (RY + 0.5 + gy)) ** 2 <= 1;

export function paintPortrait(o: Look): Pix {
  const P = new Pix(PW, PH);
  const px = (x: number, y: number, c: string, a = 1) => P.px(x, y, c, a);
  const box = (x: number, y: number, w: number, h: number, c: string) => P.box(x, y, w, h, c);
  const sk = tones(o.skin), hr = tones(o.hair), cl = tones(o.cloth);
  const H = o.style;
  const curly = H === 'afro' || H === 'curly' || H === 'locs';
  // 背景: 縦のグラデーションをディザで
  const bg2 = mixc(o.bg, '#3a3440', 0.22);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) px(x, y, dith(x, y, y / PH) ? bg2 : o.bg);
  // 髪の色: 右から光、毛筋の線
  const hairAt = (x: number, y: number, c = curly) => {
    let l = (x - FX) / 14 + 0.15 - (y - 14) / 70;
    l += c ? (((x * 7 + y * 13) % 5) - 2) * 0.12 : ((x * 3 + y) % 6 === 0 ? 0.25 : (x + y * 2) % 7 === 0 ? -0.2 : 0);
    return hr[l > 0.55 ? 3 : l > 0.25 ? 2 : l > -0.25 ? 1 : 0];
  };
  const fillHair = (fn: (x: number, y: number) => boolean, c = curly) => { for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (fn(x, y)) px(x, y, hairAt(x, y, c)); };
  const top = (hl: (x: number) => number) => (x: number, y: number) => inSkull(x, y) && y < hl(x);
  const side = (x: number) => Math.abs(x - FX);

  // 後ろ髪 (顔より後ろ)
  if (H === 'long' || H === 'center') fillHair((x, y) => inSkull(x, y, 1.5, 0) || (y >= 22 && y < 52 && side(x) < 13.5 - (y > 46 ? (y - 46) * 0.6 : 0)));
  if (H === 'bob') fillHair((x, y) => inSkull(x, y, 2, 0) || (y >= 22 && y < 40 && side(x) < 13.5));
  if (H === 'braids') { fillHair((x, y) => inSkull(x, y, 0.8, 0)); for (const bx of [11, 35]) for (let y = 30; y < 54; y++) { const w = y % 4 < 2 ? 2 : 3; box(bx - (w > 2 ? 1 : 0), y, w, 1, y % 4 === 0 ? hr[0] : hr[1]); } }
  if (H === 'pony') {
    // 結び目は後頭部の右寄り。頭の輪郭に重ねて付け根から垂らす
    fillHair((x, y) => inSkull(x, y, 0.8, 0));
    for (let y = 14; y < 44; y++) { const w = 5 - Math.floor((y - 14) / 9); box(31 + Math.floor((y - 14) / 7), y, w, 1, y % 3 ? hr[1] : hr[0]); }
    box(31, 15, 4, 2, hr[0]);
  }
  if (H === 'afro') fillHair((x, y) => ((x - FX) / 17) ** 2 + ((y - 20) / 15) ** 2 <= 1 && y < 38);
  if (H === 'locs') fillHair((x, y) => inSkull(x, y, 2, 0) || (y >= 18 && y < 50 && side(x) < 14 && x % 3 !== 0));
  if (H === 'hijab') {
    const c = tones(o.cover!);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      if (((x - FX) / 14) ** 2 + ((y - 25) / 17) ** 2 <= 1 || (y > 34 && side(x) < 17 - (56 - y) * 0.1)) { const l = (x - FX) / 18 + 0.1 + ((x + y) % 9 === 0 ? -0.3 : 0); px(x, y, c[l > 0.45 ? 2 : l > -0.3 ? 1 : 0]); }
    }
  }
  // 肩・服と首
  if (H !== 'hijab') {
    for (let y = 44; y < PH; y++) for (let x = 4 + Math.max(0, 48 - y) * 1.2; x < 44 - Math.max(0, 48 - y) * 1.2; x++) { const xx = Math.round(x); px(xx, y, xx > 33 ? cl[2] : xx < 14 ? cl[0] : cl[1]); }
    box(20, 37, 8, 8, sk[0]); box(23, 38, 5, 7, sk[1]);
    if (o.collar) for (let i = 0; i < 5; i++) { px(19 + i, 44 + i, cl[3]); px(28 - i, 44 + i, cl[3]); }
    if (o.necklace) for (let x = 19; x <= 28; x++) px(x, 45 + (x > 21 && x < 26 ? 1 : 0), '#d8b050');
  }
  // 耳
  if (!['hijab', 'long', 'center', 'bob', 'locs'].includes(H)) for (const s of [-1, 1]) {
    box(s < 0 ? 12 : 34, 25, 2, 5, s < 0 ? sk[0] : sk[1]); px(s < 0 ? 13 : 34, 27, sk[0]);
    if (o.earring) px(s < 0 ? 12 : 35, 31, '#e8c050');
  }
  // 顔: 3段の陰影 (光は右上)
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    if (!inFace(x, y)) continue;
    const l = ((x - FX) / RX) * 0.8 - ((y - FY) / RY) * 0.3;
    px(x, y, l > 0.35 ? sk[2] : l < -0.45 ? sk[0] : sk[1]);
  }
  // 年齢: しわ・ほうれい線 (55歳から1段、70歳から2段)
  if (o.age >= 55) {
    px(17, 31, sk[0]); px(31, 31, sk[0]); px(18, 32, sk[0]); px(30, 32, sk[0]); box(20, 20, 7, 1, sk[0]);
    if (o.age >= 70) { box(21, 22, 5, 1, sk[0]); px(16, 29, sk[0]); px(32, 29, sk[0]); px(19, 33, sk[0]); px(29, 33, sk[0]); }
  }
  // 目・眉・鼻・口
  const bw = o.thickBrow ? 2 : 1, brow = o.age >= 65 ? hr[1] : hr[0];
  box(17, 27 - bw, 4, bw, brow); box(27, 27 - bw, 4, bw, brow);
  const eyeH = o.narrow ? 1 : 2, iris = o.eye ?? '#2a1a14';
  box(18, 28, 3, eyeH, '#ece6dc'); box(27, 28, 3, eyeH, '#ece6dc');
  box(19, 28, 2, eyeH, iris); box(28, 28, 2, eyeH, iris);
  px(20, 28, '#f6f0e8'); px(29, 28, '#f6f0e8');
  box(18, 27, 3, 1, sk[0]); box(27, 27, 3, 1, sk[0]);
  px(24, 31, sk[2]); px(23, 32, sk[0]); px(24, 33, sk[0]); px(25, 33, sk[0]);
  const lip = mixc(o.skin, '#7a2a2a', 0.35);
  box(22, 36, 5, 1, lip);
  if (o.smile) { px(21, 35, sk[0]); px(27, 35, sk[0]); } else px(23, 37, mixc(lip, '#fff0e0', 0.3));
  // ひげ
  if (o.beard === 'mustache') box(21, 34, 7, 1, hr[0]);
  if (o.beard === 'full') for (let y = 31; y < 42; y++) for (let x = 13; x < 35; x++) {
    if (!inFace(x, y) && !(y > 38 && side(x) < 6)) continue;
    if ((y === 36 && x > 21 && x < 27) || (y < 34 && side(x) < 6)) continue;
    px(x, y, hairAt(x, y, true));
  }
  if (o.beard === 'stubble') for (let y = 32; y < 40; y++) for (let x = 14; x < 34; x++) if (inFace(x, y) && !(y >= 35 && y <= 37 && x > 20 && x < 28) && BAYER[y & 3][x & 3] < 6) px(x, y, mixc(o.hair, o.skin, 0.4));
  // 前髪・頭頂 (顔より前)
  if (H === 'fringe') fillHair(top((x) => 19 + (side(x) > 8 ? 4 : 0)));
  if (H === 'side') fillHair(top((x) => (x < 20 ? 21 : 18 - (x - 20) * 0.15) + (side(x) > 9 ? 5 : 0)));
  if (H === 'buzz') {
    // 頭の形は塗りつぶし、短い毛は地肌と混ぜて出す (縁に隙間を作らない)
    const thin = mixc(o.hair, o.skin, 0.45);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (inSkull(x, y, -0.3) && y < 18 + (side(x) > 9 ? 6 : 0) && !(inFace(x, y) && y >= 17)) px(x, y, dith(x, y, 0.6) ? hairAt(x, y, false) : thin);
  }
  if (H === 'receding') fillHair(top((x) => (side(x) < 5 ? 12 : side(x) < 8 ? 15 : 23)));
  if (H === 'bald') {
    for (let y = 20; y < 30; y++) for (const x of [12, 13, 34, 35]) if (inSkull(x, y)) px(x, y, hairAt(x, y));
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (inSkull(x, y) && !inFace(x, y) && y < 20) { const l = (x - FX) / 11 - (y - 12) / 18; px(x, y, l > 0.45 ? sk[3] : l > 0 ? sk[2] : sk[1]); }
  }
  if (H === 'long' || H === 'bob' || H === 'braids' || H === 'pony') fillHair(top((x) => 18 + side(x) * 0.25 + (side(x) > 9 ? 6 : 0) - (x > FX + 1 && x < FX + 4 ? 2 : 0)));
  if (H === 'center') fillHair(top((x) => 16 + side(x) * 0.45 + (side(x) > 9 ? 6 : 0) - (side(x) < 1 ? 3 : 0)));
  if (H === 'bun') { fillHair(top((x) => 18 + side(x) * 0.3 + (side(x) > 9 ? 4 : 0))); fillHair((x, y) => ((x - FX) / 5.5) ** 2 + ((y - 7) / 4.5) ** 2 <= 1); }
  if (H === 'curly') fillHair((x, y) => inSkull(x, y, 2.5, 1.5) && y < 20 + (side(x) > 9 ? 9 : 0) && !(inFace(x, y) && y > 19));
  if (H === 'afro') fillHair((x, y) => ((x - FX) / 17) ** 2 + ((y - 20) / 15) ** 2 <= 1 && y < 19 + (side(x) > 9 ? 9 : 0));
  if (H === 'locs') fillHair(top((x) => 18 + (side(x) > 8 ? 6 : 0)));
  if (H === 'cap') {
    const c = tones(o.cover!);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (inSkull(x, y, 0.5) && y < 19) px(x, y, c[(x - FX) / 10 > 0.3 ? 2 : (x - FX) / 10 < -0.4 ? 0 : 1]);
    box(14, 18, 22, 2, c[0]); box(28, 18, 10, 1, c[1]); px(24, 8, c[2]);
    fillHair((x, y) => inSkull(x, y) && y >= 19 && y < 25 && side(x) > 9.5);
  }
  if (H === 'turban') {
    const c = tones(o.cover!);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (((x - FX) / 13) ** 2 + ((y - 15) / 10) ** 2 <= 1 && y < 21 - Math.max(0, side(x) - 9)) {
      const band = Math.round(y + side(x) * 0.5) % 4 === 0;
      px(x, y, band ? c[0] : c[(x - FX) / 12 > 0.2 ? 2 : 1]);
    }
  }
  if (H === 'hijab') { const c = tones(o.cover!); for (let x = 13; x < 35; x++) if (inFace(x, 16) || inFace(x, 17)) { px(x, 15, c[1]); px(x, 16, c[1]); } }
  // 眼鏡
  if (o.glasses) {
    const f = o.glasses === 'gold' ? '#b08a3a' : '#2a2422';
    for (const ox of [16, 26]) { box(ox, 26, 6, 1, f); box(ox, 31, 6, 1, f); box(ox, 26, 1, 6, f); box(ox + 5, 26, 1, 6, f); px(ox + 4, 27, '#ffffff', 0.6); }
    box(22, 27, 4, 1, f);
  }
  return P;
}

// 身分証の顔写真 (主人公)。亡くなったら白黒にする
export function drawPortrait(cv: HTMLCanvasElement, p: Person): void {
  const P = paintPortrait(lookOfMe(p));
  if (!p.alive) P.grey();
  P.put(cv);
}

// 同じ1秒に生まれた人の顔 (名前の横の小さな顔)。canvas[data-oface=i] に people[i] を描く
export function paintOtherFaces(root: ParentNode, people: (Person | undefined)[]): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-oface]').forEach((cv) => { const o = people[Number(cv.dataset.oface)]; if (o) drawPortrait(cv, o); });
}

// 人の輪の顔 (家族・友人など)。同じ人は何度描いても同じ顔。亡くなった人の扱いは画面側でする
export function drawTiePortrait(cv: HTMLCanvasElement, t: Tie, p: Person): void {
  if (t.role === 'pet') return drawPet(cv, t.pet ?? '犬', (p.seed ^ Math.imul(t.id ?? 0, 0x9e3779b1)) >>> 0);
  paintPortrait(lookOfRel(p, t, t.role)).put(cv);
}
