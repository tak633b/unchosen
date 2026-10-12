// 顔写真 48×56 (ちびキャラの頭と肩)。見た目は look.ts / wear.ts が決め、描くのは chibi.ts。
import type { Person, Tie } from '../engine/person';
import { lookOfMe, lookOfRel, type Look } from './look';
import type { Pix } from './raster';
import { paintChibiFace, type Expr } from './chibi';
import { drawPet } from './petportrait';

export const PW = 48;
export const PH = 56;

// 顔はちびキャラ (chibi.ts)。名前は前のまま残す
export function paintPortrait(o: Look, expr?: Expr): Pix {
  return paintChibiFace(o, { expr });
}

// 身分証の顔写真 (主人公)。亡くなったら目を閉じて白黒にする
export function drawPortrait(cv: HTMLCanvasElement, p: Person, expr?: Expr): void {
  paintChibiFace(lookOfMe(p), { expr, dead: !p.alive }).put(cv);
}

// 同じ1秒に生まれた人の顔 (名前の横の小さな顔)。canvas[data-oface=i] に people[i] を描く
export function paintOtherFaces(root: ParentNode, people: (Person | undefined)[]): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-oface]').forEach((cv) => { const o = people[Number(cv.dataset.oface)]; if (o) drawPortrait(cv, o); });
}

// 人の輪の顔 (家族・友人など)。同じ人は何度描いても同じ顔。亡くなった人の扱いは画面側でする
export function drawTiePortrait(cv: HTMLCanvasElement, t: Tie, p: Person, expr?: Expr): void {
  if (t.role === 'pet') return drawPet(cv, t.pet ?? '犬', (p.seed ^ Math.imul(t.id ?? 0, 0x9e3779b1)) >>> 0);
  paintChibiFace(lookOfRel(p, t, t.role), { expr }).put(cv);
}
