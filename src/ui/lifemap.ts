// 人生地図: 1マス = 1年。10年で1行。色はその年をいちばんよく表す出来事 (engine/person.ts の log が決める p.kinds)。
// ひと息で何か書いた年には小さな印。まだ来ていない年は暗いマスで、平均寿命あたりまで並べる。
import type { YearKind } from '../engine/person';
import { KIND_LABEL } from './charts';
import { L } from '../i18n';

const STATE: MapKind[] = ['child', 'school', 'work', 'old'];
export type MapKind = YearKind | 'future';
export interface MapCell { age: number; kind: MapKind; now: boolean; note: boolean }

export interface MapLife { kinds: (YearKind | undefined)[]; age: number; alive: boolean; noted?: number[] }

// 生きた年は記録の色。記録の無い年は、その前の暮らしの色 (幼い日々・学び・仕事・老後) を引き継ぐ。
// 結婚や病気のような出来事の色は、その年だけ
// 亡くなった年は死の色。生きているなら、少なくとも until 歳まで先の年を暗く並べる
export function lifeMapCells(l: MapLife, until = 80): MapCell[] {
  const end = l.alive ? Math.max(until, l.age + 1) : l.age + 1;
  const rows = Math.ceil(end / 10) * 10;
  const noted = new Set(l.noted ?? []);
  let last: YearKind = 'child';
  return Array.from({ length: rows }, (_, a) => {
    if (a > l.age) return { age: a, kind: 'future', now: false, note: false };
    let kind: MapKind = l.kinds[a] ?? last;
    if (!l.alive && a === l.age) kind = 'death';
    else if (kind === 'death') kind = last; // 誰かを亡くした年は loss。death は本人の最期だけ
    if (STATE.includes(kind)) last = kind as YearKind;
    return { age: a, kind, now: l.alive && a === l.age, note: noted.has(a) };
  });
}

export function lifeMap(l: MapLife, until?: number): string {
  const cells = lifeMapCells(l, until);
  const rows = Array.from({ length: cells.length / 10 }, (_, r) => cells.slice(r * 10, r * 10 + 10));
  const used = new Set(cells.map((c) => c.kind).filter((k) => k !== 'future'));
  const legend = (Object.keys(KIND_LABEL) as YearKind[]).filter((k) => used.has(k)).map((k) => `<span><i class="cell k-${k}"></i>${KIND_LABEL[k]}</span>`).join('');
  return `<div class="lifemap" role="img" aria-label="${L(`人生地図・${l.age}年`, `Life map, ${l.age} years`)}">${rows.map((row, r) => `<div class="lmrow"><span class="lmdec">${r * 10}</span>${row.map((c) =>
    `<i class="lm k-${c.kind}${c.now ? ' now' : ''}${c.note ? ' note' : ''}" title="${L(`${c.age}歳`, `Age ${c.age}`)}${c.kind !== 'future' ? ` · ${KIND_LABEL[c.kind]}` : ''}"></i>`).join('')}</div>`).join('')}</div>
    <div class="legend">${legend}</div>
    <p class="note">${L('1マス = 1年。左から右へ、10年で1行。', '1 square = 1 year. Left to right, ten years per row.')}${l.noted?.length ? L('点のある年に、ひと息のことばを残した。', ' A dot marks a year you left a note.') : ''}</p>`;
}
