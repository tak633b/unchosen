// ☆ この瞬間を覚えておく: 記録の行に印を付ける (1つの人生に12個まで)。印は保存データの log に残り、死亡記録の先頭に並ぶ
import type { LogEntry, Person } from '../engine/person';
import { esc } from './dom';
import { L } from '../i18n';

export const STAR_MAX = 12;

export const starred = (log: LogEntry[]): LogEntry[] => log.filter((e) => e.star);

// 付けられなければ false (上限)
export function toggleStar(p: Person, i: number): boolean {
  const e = p.log[i];
  if (!e) return false;
  if (e.star) { delete e.star; return true; }
  if (starred(p.log).length >= STAR_MAX) return false;
  e.star = true;
  return true;
}

// 記録の行の横に置く小さなボタン。i は p.log の番号
export const starBtn = (e: LogEntry, i: number): string =>
  `<button class="star${e.star ? ' on' : ''}" data-act="star" data-v="${i}" aria-label="${L('この瞬間を覚えておく', 'Remember this moment')}" aria-pressed="${!!e.star}">${e.star ? '★' : '☆'}</button>`;

// 死亡記録の先頭: 印を付けた行だけ、古い順に
export function starsHtml(log: LogEntry[]): string {
  const s = starred(log);
  if (!s.length) return '';
  return `<section class="panel stars"><h3>${L('覚えておきたい瞬間', 'Moments to remember')} <small>${L(`★ ${s.length}`, `★ ${s.length}`)}</small></h3>
    <ol class="log">${s.map((e) => `<li class="k-${e.kind} big"><span class="age">${L(`${e.age}歳`, `${e.age}`)}</span><span>${esc(e.text)}</span></li>`).join('')}</ol></section>`;
}
