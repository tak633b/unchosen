// ピクセル画の下ごしらえ。画素を配列に書きためて最後に1回だけキャンバスへ移す (fillRect を何万回も呼ばない)。
// tint は場面の時刻の色 (夕方は橙、夜は青)。明かり・太陽・空は raw で描いて tint を受けない。

export const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
// 2色をディザで混ぜる (t: 0=前の色、1=後の色)
export const dith = (x: number, y: number, t: number) => t * 16 > BAYER[y & 3][x & 3];

const RGB = new Map<string, number[]>();
export const rgbOf = (h: string): number[] => {
  let c = RGB.get(h);
  if (!c) { c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); RGB.set(h, c); }
  return c;
};
export const mixc = (a: string, b: string, t: number): string => {
  const A = rgbOf(a), B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
// 1色から4段 (影・中間・光・つや) を作る
export const tones = (c: string) => [mixc(c, '#140c10', 0.45), c, mixc(c, '#fff2e0', 0.22), mixc(c, '#fff8f0', 0.45)];

// 表示用の数を混ぜる。エンジンの乱数は使わない
export function hash(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) { h = Math.imul(h ^ (v >>> 0), 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; }
  return h >>> 0;
}

export class Pix {
  readonly d: Uint8ClampedArray;
  tint: number[] = [1, 1, 1];
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8ClampedArray(w * h * 4); }

  // a<1 は今ある色に重ねる。raw は tint を受けない (明かり)
  px(x: number, y: number, c: string, a = 1, raw = false): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = rgbOf(c), m = raw ? [1, 1, 1] : this.tint, i = (y * this.w + x) * 4, d = this.d;
    d[i] = d[i] * (1 - a) + r * m[0] * a; d[i + 1] = d[i + 1] * (1 - a) + g * m[1] * a; d[i + 2] = d[i + 2] * (1 - a) + b * m[2] * a; d[i + 3] = 255;
  }
  box(x: number, y: number, w: number, h: number, c: string, raw = false): void {
    for (let yy = Math.floor(y); yy < Math.floor(y) + h; yy++) for (let xx = Math.floor(x); xx < Math.floor(x) + w; xx++) this.px(xx, yy, c, 1, raw);
  }
  // 影: 今ある色を暗くする
  dark(x: number, y: number, a: number): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    for (let k = 0; k < 3; k++) this.d[i + k] *= 1 - a;
  }
  put(cv: HTMLCanvasElement): void {
    cv.width = this.w;
    cv.height = this.h;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(this.w, this.h);
    img.data.set(this.d);
    g.putImageData(img, 0, 0);
  }
  grey(): void {
    for (let i = 0; i < this.d.length; i += 4) { const v = (this.d[i] + this.d[i + 1] + this.d[i + 2]) / 3; this.d[i] = this.d[i + 1] = this.d[i + 2] = v; }
  }
}
