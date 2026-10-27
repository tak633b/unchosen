// 共有用の画像カード。横長 1200×630 (リンクの OGP 画像) と、縦長 1080×1350 (SNS に貼る 4:5)。canvas で描いて PNG にする。
const W = 1200, H = 630;
import { drawPortrait, drawScene, fromData, H as SH, W as SW, type SceneData } from './pixel';
import type { Person } from '../engine/person';
import { isEn } from '../i18n';

export const FONT = isEn ? 'system-ui, "Helvetica Neue", Arial, sans-serif' : '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
export const SERIF = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif';

// years: 1年ずつの色の名前 (人生地図と同じ k-*)。あればカードの下の縁に1年1本の帯で描く
export interface CardText { kicker: string; title: string; lines: string[]; foot: string; scene?: SceneData; years?: string[] }

function strip(g: CanvasRenderingContext2D, years: string[]): void {
  const css = getComputedStyle(document.documentElement);
  const w = W / years.length;
  years.forEach((k, i) => {
    g.fillStyle = css.getPropertyValue(`--k-${k}`).trim() || '#2d3446';
    g.fillRect(Math.floor(i * w), H - 10, Math.ceil(w), 10);
  });
}

export function drawCard(t: CardText): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#11141d';
  g.fillRect(0, 0, W, H);
  if (t.scene) {
    // 上半分にピクセルの場面を拡大して置き、下に文字
    const sc = document.createElement('canvas');
    drawScene(sc, fromData(t.scene));
    g.imageSmoothingEnabled = false;
    const h = Math.round((W / SW) * SH);
    g.drawImage(sc, 0, 0, W, h);
    g.fillStyle = '#a7a193';
    g.font = `24px ${FONT}`;
    g.fillText(t.kicker, 60, h + 46);
    g.fillStyle = '#ebe5d8';
    g.font = `bold 46px ${SERIF}`;
    wrap(g, t.title, 60, h + 104, W - 120, 54, 1);
    g.font = `24px ${FONT}`;
    wrap(g, t.lines.join(' '), 60, h + 150, W - 120, 34, 2);
    g.fillStyle = '#e9a64c';
    g.font = `bold 20px ${FONT}`;
    g.fillText(t.foot, W - 60 - g.measureText(t.foot).width, H - 22);
    if (t.years?.length) strip(g, t.years);
    return cv;
  }
  g.fillStyle = '#e9a64c';
  g.fillRect(0, 0, 14, H);
  g.fillStyle = '#a7a193';
  g.font = `28px ${FONT}`;
  g.fillText(t.kicker, 80, 110);
  g.fillStyle = '#ebe5d8';
  g.font = `bold 60px ${SERIF}`;
  wrap(g, t.title, 80, 200, W - 160, 76, 2);
  g.font = `32px ${FONT}`;
  t.lines.slice(0, 4).forEach((l, i) => wrap(g, l, 80, 360 + i * 52, W - 160, 52, 1));
  g.fillStyle = '#e9a64c';
  g.font = `bold 26px ${FONT}`;
  g.fillText(t.foot, 80, H - 60);
  if (t.years?.length) strip(g, t.years);
  return cv;
}

export function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number): void {
  let line = '';
  let n = 0;
  // 英語は単語の途中で折らない
  for (const ch of isEn ? text.split(/(?<= )/) : text) {
    if (g.measureText(line + ch).width > maxW) {
      if (++n >= maxLines) { g.fillText(line.slice(0, -1) + '…', x, y); return; }
      g.fillText(line, x, y);
      line = ch;
      y += lh;
    } else line += ch;
  }
  g.fillText(line, x, y);
}

export const toPng = (cv: HTMLCanvasElement): Promise<Blob | null> => new Promise((res) => cv.toBlob(res, 'image/png'));

export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function shareCard(cv: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await toPng(cv);
  if (!blob) return;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch { /* キャンセルされたら保存に回す */ }
  }
  download(blob, filename);
}

// ---- 縦長の共有カード (1080×1350、SNS の 4:5) -----------------------------------
// 人の絵はこの2つだけを通して描く (顔や場面の描き方が変わっても、差し替えはここだけ)
const art = {
  face: (p: Person): HTMLCanvasElement => { const cv = document.createElement('canvas'); drawPortrait(cv, p); return cv; },
  scene: (d: SceneData): HTMLCanvasElement => { const cv = document.createElement('canvas'); drawScene(cv, fromData(d)); return cv; },
};

export interface ShareCardData {
  brand: string; tag: string; code: string; // 上の帯: ゲームの名前・ひとこと・記録番号
  face?: Person; scene?: SceneData;   // 顔 (主人公の代わりでよい) と場面
  name: string; sub: string[];        // 名前と、その下の短い行 (2つまで)
  facts: [string, string][];          // 2列に並べる事実 (8つまで)
  stat?: { pct: number; big: string; text: string; note: string }; // 100マスのうち pct マスを塗る。note は数字の出どころ
  closing: string; foot: string; years?: string[];
}

const PW2 = 1080, PH2 = 1350;

export function drawShareCard(t: ShareCardData): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = PW2;
  cv.height = PH2;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#11141d';
  g.fillRect(0, 0, PW2, PH2);
  // 上の帯
  g.fillStyle = '#e9a64c';
  g.fillRect(0, 0, PW2, 84);
  g.fillStyle = '#1a1408';
  g.font = `bold 34px ${FONT}`;
  g.fillText(t.brand, 48, 55);
  const bw = g.measureText(t.brand).width;
  g.font = `22px ${FONT}`;
  g.fillText(t.tag, 48 + bw + 20, 53);
  g.font = `24px ${FONT}`;
  g.fillText(t.code, PW2 - 48 - g.measureText(t.code).width, 53);
  // 場面
  const sh = Math.round((PW2 / SW) * SH);
  if (t.scene) g.drawImage(art.scene(t.scene), 0, 84, PW2, sh);
  else { g.fillStyle = '#1b2030'; g.fillRect(0, 84, PW2, sh); }
  const top = 84 + sh;
  // 顔 (場面の下の縁にかける)
  const fw = 192, fh = 224, fx = 48, fy = top - 90;
  g.fillStyle = '#ebe5d8';
  g.fillRect(fx - 6, fy - 6, fw + 12, fh + 12);
  if (t.face) g.drawImage(art.face(t.face), fx, fy, fw, fh);
  else { g.fillStyle = '#222838'; g.fillRect(fx, fy, fw, fh); }
  // 名前と短い行
  const tx = fx + fw + 40;
  g.fillStyle = '#ebe5d8';
  g.font = `bold 58px ${SERIF}`;
  wrap(g, t.name, tx, top + 70, PW2 - tx - 48, 64, 1);
  g.fillStyle = '#a7a193';
  g.font = `28px ${FONT}`;
  t.sub.slice(0, 2).forEach((s, i) => wrap(g, s, tx, top + 118 + i * 40, PW2 - tx - 48, 40, 1));
  // 事実の表 (2列)
  const gy = fy + fh + 44, colW = (PW2 - 96) / 2, rowH = 82;
  t.facts.slice(0, 8).forEach(([k, v], i) => {
    const x = 48 + (i % 2) * colW, y = gy + Math.floor(i / 2) * rowH;
    g.fillStyle = '#2d3446';
    g.fillRect(x, y, colW - 24, 2);
    g.fillStyle = '#a7a193';
    g.font = `20px ${FONT}`;
    g.fillText(k, x, y + 30);
    g.fillStyle = '#ebe5d8';
    g.font = `bold 28px ${FONT}`;
    wrap(g, v, x, y + 66, colW - 32, 32, 1);
  });
  // 100マス
  const wy = gy + 4 * rowH + 24;
  if (t.stat) {
    const cell = 24, gap = 4;
    for (let i = 0; i < 100; i++) {
      g.fillStyle = i < t.stat.pct ? '#e9a64c' : '#2d3446';
      g.fillRect(48 + (i % 10) * (cell + gap), wy + Math.floor(i / 10) * (cell + gap), cell, cell);
    }
    const sx = 48 + 10 * (cell + gap) + 40;
    g.fillStyle = '#e9a64c';
    g.font = `bold 120px ${FONT}`;
    g.fillText(t.stat.big, sx, wy + 104);
    g.fillStyle = '#ebe5d8';
    g.font = `26px ${FONT}`;
    wrap(g, t.stat.text, sx, wy + 158, PW2 - sx - 48, 36, 2);
    g.fillStyle = '#a7a193';
    g.font = `20px ${FONT}`;
    wrap(g, t.stat.note, sx, wy + 238, PW2 - sx - 48, 28, 2);
  }
  // 締めの一行と、サイト
  g.fillStyle = '#ebe5d8';
  g.font = `bold 34px ${SERIF}`;
  wrap(g, t.closing, 48, PH2 - 76, PW2 - 96, 40, 1);
  g.fillStyle = '#a7a193';
  g.font = `22px ${FONT}`;
  g.fillText(t.foot, 48, PH2 - 34);
  if (t.years?.length) {
    const css = getComputedStyle(document.documentElement);
    const w = PW2 / t.years.length;
    t.years.forEach((k, i) => { g.fillStyle = css.getPropertyValue(`--k-${k}`).trim() || '#2d3446'; g.fillRect(Math.floor(i * w), PH2 - 10, Math.ceil(w), 10); });
  }
  return cv;
}
