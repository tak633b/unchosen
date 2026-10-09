// 犬と猫の顔 (48×56、人の顔写真と同じ大きさ・同じ光の向き)。毛の色と耳の形は seed で決まる (表示用の数だけ使う)
import { dith, hash, mixc, Pix, tones } from './raster';
const PW = 48, PH = 56; // portrait.ts と同じ大きさ

const BG = ['#b8c0b0', '#c4bcb0', '#a8b4c0', '#c8c0c4', '#b4bcc4', '#c4bca8'];
const DOG = ['#c8925a', '#3a2e28', '#ece4d6', '#8a5a34', '#d8a848', '#6a5444', '#b8b0a4'];
const CAT = ['#d8843c', '#7a7a82', '#2a2628', '#ece8e0', '#b8a48c', '#9a8070'];

export function paintPet(kind: '犬' | '猫', seed: number): Pix {
  const P = new Pix(PW, PH);
  const h = hash(seed, kind === '犬' ? 7 : 11);
  const coat = (kind === '犬' ? DOG : CAT)[h % (kind === '犬' ? DOG : CAT).length];
  const c = tones(coat);
  const pale = tones(mixc(coat, '#f4ece0', 0.6)); // 口のまわり・胸の明るい毛
  const bg = BG[(h >>> 4) % BG.length];
  const cx = 24, cy = kind === '犬' ? 27 : 28;
  const rx = kind === '犬' ? 12 : 13, ry = kind === '犬' ? 12 : 11;
  const inHead = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const shade = (x: number, y: number, t = c) => { const l = (x - cx) / 14 + 0.15 - (y - 18) / 60; return t[l > 0.55 ? 3 : l > 0.2 ? 2 : l > -0.3 ? 1 : 0]; };
  const bg2 = mixc(bg, '#3a3440', 0.22);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) P.px(x, y, dith(x, y, y / PH) ? bg2 : bg);
  // 胸と肩 (毛の塊)
  for (let y = 40; y < PH; y++) for (let x = 0; x < PW; x++) if (((x - cx) / 17) ** 2 + ((y - 58) / 16) ** 2 <= 1) P.px(x, y, shade(x, y));
  const bib = kind === '猫' ? (h >>> 8) % 3 === 0 : (h >>> 8) % 2 === 0; // 胸の白い毛
  if (bib) for (let y = 44; y < PH; y++) for (let x = 0; x < PW; x++) if (((x - cx) / 6) ** 2 + ((y - 52) / 9) ** 2 <= 1) P.px(x, y, shade(x, y, pale));
  // 耳 (頭より後ろ)
  const floppy = kind === '犬' && (h >>> 12) % 2 === 0;
  if (kind === '猫' || !floppy) {
    // 猫は高い三角、犬は低く幅のある三角。外側も中間の色にして、影の側の耳も細く見えないようにする
    const H = kind === '猫' ? 12 : 9, top = kind === '猫' ? 9 : 12, k = kind === '猫' ? 0.6 : 0.85;
    for (const s of [-1, 1]) for (let y = 0; y < H; y++) {
      const w = Math.floor(y * k) + (kind === '猫' ? 1 : 2);
      for (let i = 0; i < w; i++) {
        const x = s < 0 ? cx - 7 - i : cx + 7 + i;
        P.px(x, top + y, i === 0 && y > 3 ? '#d89a98' : c[i === w - 1 && s < 0 ? 1 : (s < 0 ? 1 : 2)]);
      }
    }
  }
  // 頭
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (inHead(x, y)) P.px(x, y, shade(x, y));
  // 猫のしま (額と頬)
  if (kind === '猫' && (h >>> 16) % 2 === 0) {
    for (const ox of [-3, 0, 3]) for (let y = cy - ry + 2; y < cy - 5; y++) P.px(cx + ox, y, c[0]);
    for (const s of [-1, 1]) for (const oy of [0, 3]) for (let i = 0; i < 4; i++) P.px(cx + s * (rx - 1 - i), cy + oy, c[0]);
  }
  // 垂れた耳 (頭の横に重ねる)
  if (floppy) for (const s of [-1, 1]) for (let y = 16; y < 36; y++) {
    const w = y < 20 ? 3 + (y - 16) : y > 31 ? 6 - (y - 31) : 6;
    for (let i = 0; i < w; i++) P.px(cx + s * (rx - 2 + i), y, i === 0 || i === w - 1 ? c[0] : c[1]);
  }
  // 口のまわり
  const my = kind === '犬' ? 34 : 33;
  for (let y = my - 5; y < my + 5; y++) for (let x = cx - 7; x <= cx + 7; x++) if (((x - cx) / (kind === '犬' ? 7 : 5.5)) ** 2 + ((y - my) / 4.5) ** 2 <= 1) P.px(x, y, shade(x, y, kind === '犬' || bib ? pale : c));
  // 目
  for (const ex of [cx - 6, cx + 5]) {
    if (kind === '犬') { P.box(ex, 25, 2, 2, '#1c1612'); P.px(ex + 1, 25, '#f8f4ec'); }
    else { P.box(ex - 1, 25, 3, 2, (h >>> 20) % 2 ? '#b8c84a' : '#d8a83a'); P.px(ex, 25, '#141210'); P.px(ex, 26, '#141210'); }
  }
  // 鼻と口
  if (kind === '犬') { P.box(cx - 2, my - 3, 4, 2, '#1c1612'); P.px(cx + 1, my - 3, '#5a5048'); P.px(cx - 1, my - 1, '#1c1612'); P.px(cx, my, '#1c1612'); P.px(cx - 2, my + 1, '#3a302a'); P.px(cx + 1, my + 1, '#3a302a'); }
  else {
    P.box(cx - 1, my - 2, 2, 1, '#d88a8a'); P.px(cx - 1, my - 1, '#7a4a4a'); P.px(cx - 2, my, '#7a4a4a'); P.px(cx, my, '#7a4a4a');
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) { P.px(cx + s * (5 + i), my - 1 + (i > 3 ? 1 : 0), '#f4f0e8', 0.75); P.px(cx + s * (5 + i), my + 1 + (i > 4 ? 1 : 0), '#f4f0e8', 0.6); }
  }
  // 犬の首輪
  if (kind === '犬') for (let x = cx - 9; x <= cx + 9; x++) P.px(x, 41 + (Math.abs(x - cx) > 6 ? -1 : 0), ['#c8483c', '#3a5a8a', '#2e7a4a'][(h >>> 24) % 3]);
  return P;
}

export function drawPet(cv: HTMLCanvasElement, kind: '犬' | '猫', seed: number): void {
  paintPet(kind, seed).put(cv);
}
