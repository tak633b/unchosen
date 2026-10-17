// 引き直して捨てた生まれは、画面の左下に小さな石として積もる (このタブの間だけ、12個まで)。押すと、その生まれを見られる
import { byCode } from '../engine/countries';
import { genderOf, genderWord, type Person } from '../engine/person';
import { esc } from './dom';
import { L } from '../i18n';

export interface Stone { country: string; year: number; sex: 'F' | 'M' | 'X'; name: string; city: string | null }
const KEY = 'stones';
export const STONE_MAX = 12;

export function stones(): Stone[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Stone[]; } catch { return []; }
}
export function dropStone(p: Person): void {
  const s: Stone = { country: p.birthCountry, year: p.birthYear, sex: genderOf(p), name: p.name, city: p.city };
  try { sessionStorage.setItem(KEY, JSON.stringify([...stones(), s].slice(-STONE_MAX))); } catch { /* 残らなくても遊べる */ }
}

export function stonesHtml(): string {
  const list = stones();
  if (!list.length) return '';
  return `<div class="stones" title="${L('引き直して捨てた生まれ', 'Births you drew and set aside')}">${list.map((_, i) => `<button class="stone" data-stone="${i}" aria-label="${L(`捨てた生まれ ${i + 1}`, `Set-aside birth ${i + 1}`)}"></button>`).join('')}<div class="stonecard" id="stonecard" hidden></div></div>`;
}

// 石を押すと、その生まれのカードを出す。もう一度押すか外を押すと閉じる
export function bindStones(root: HTMLElement): void {
  const box = root.querySelector<HTMLElement>('.stones');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-stone]');
    const card = box.querySelector<HTMLElement>('#stonecard')!;
    if (!b) return;
    const s = stones()[Number(b.dataset.stone)];
    if (!s || (!card.hidden && card.dataset.i === b.dataset.stone)) { card.hidden = true; return; }
    card.dataset.i = b.dataset.stone;
    card.innerHTML = `<p class="kicker">${L('捨てた生まれ', 'A birth set aside')}</p><b>${esc(s.name)}</b><p>${esc(byCode(s.country).name)}${L('・', ' · ')}${s.year}${L('・', ' · ')}${genderWord(s.sex)}${s.city ? `${L('・', ' · ')}${esc(s.city)}` : L('・農村', ' · rural')}</p>`;
    card.hidden = false;
  });
}
