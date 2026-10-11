// 思い出のアルバム: 大きな出来事の年と、ひと息の年の場面を、遊んでいる間に1枚ずつ撮っておく (game.ts)。
// 死亡記録でカードとして並べる。場面は撮った年の家族・家・場所のまま残る
import { PAUSE_AGES } from '../engine/life';
import type { Person, YearKind } from '../engine/person';
import { esc } from './dom';
import { sceneAttr, sceneOf, toData, type SceneData } from './pixel';
import { L } from '../i18n';

export interface Moment { age: number; year: number; text: string; kind: YearKind; scene: SceneData }

export const ALBUM_MAX = 12;   // 死亡記録に並べる枚数
const KEEP_MAX = 24;           // 遊んでいる間に持っておく枚数 (保存の大きさを抑える)

// この年を1枚に残すか。大きな出来事があった年、生まれた年、ひと息の年
export function momentOf(p: Person): Moment | null {
  const now = p.log.filter((e) => e.age === p.age && !e.crisis);
  const big = now.find((e) => e.big);
  const e = big ?? (p.age === 0 || PAUSE_AGES.includes(p.age) ? now[0] : undefined);
  if (!e) return null;
  return { age: p.age, year: p.birthYear + p.age, text: e.text, kind: e.kind, scene: toData(sceneOf(p)) };
}

// 多すぎるときは、最初と最後を残して間を均等に間引く
export function pickMoments<T>(list: T[], max = ALBUM_MAX): T[] {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.round((i * (list.length - 1)) / (max - 1))]);
}

export function addMoment(list: Moment[], m: Moment | null): Moment[] {
  if (!m || list.some((x) => x.age === m.age)) return list;
  const next = [...list, m];
  return next.length > KEEP_MAX ? pickMoments(next, KEEP_MAX) : next;
}

export function albumHtml(moments: Moment[]): string {
  const shown = pickMoments(moments);
  if (!shown.length) return '';
  return `<div class="album">${shown.map((m) => `<figure class="memory"><canvas class="pixscene" data-scene="${sceneAttr(m.scene)}"></canvas>
    <figcaption><b>${L(`${m.age}歳`, `Age ${m.age}`)}<small>${m.year}</small></b>${esc(m.text)}</figcaption></figure>`).join('')}</div>`;
}
