// 共有用の画像カード (1200×630)。canvas で描いて PNG にする。
const W = 1200, H = 630;
import { drawScene, fromData, H as SH, W as SW, type SceneData } from './pixel';
import { isEn } from '../i18n';

const FONT = isEn ? 'system-ui, "Helvetica Neue", Arial, sans-serif' : '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const SERIF = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif';

export interface CardText { kicker: string; title: string; lines: string[]; foot: string; scene?: SceneData }

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
  return cv;
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number): void {
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

export async function shareCard(cv: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch { /* キャンセルされたら保存に回す */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
