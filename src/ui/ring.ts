// 人の輪: 主人公を真ん中に、出会った人を輪に並べる。線の太さ = 近さ、亡くなった人は薄く、離れた人は外の輪へ。
// 毎年作り直さず、同じ人の要素を動かす (CSS の transition で近さの変化がなめらかに見える)
import { people } from '../engine/bonds';
import type { Person, Role, Tie } from '../engine/person';
import { esc } from './dom';
import { isEn, L } from '../i18n';
import { drawPortrait, drawTiePortrait } from './pixel';
import { lifeHtml } from './lifeview';

type Kind = 'family' | 'love' | 'friend' | 'rival';
const kindOf = (r: Role): Kind =>
  r === 'spouse' || r === 'partner' || r === 'ex' ? 'love' : r === 'friend' || r === 'mentor' ? 'friend' : r === 'rival' ? 'rival' : 'family';

export function roleName(t: Tie, p: Person): string {
  const f = t.sex === 'F';
  const older = t.age > p.age;
  switch (t.role) {
    case 'mother': return L('母', 'Mother');
    case 'father': return L('父', 'Father');
    case 'sibling': return f ? L(older ? '姉' : '妹', 'Sister') : L(older ? '兄' : '弟', 'Brother');
    case 'spouse': return f ? L('妻', 'Wife') : L('夫', 'Husband');
    case 'partner': return L('恋人', 'Partner');
    case 'child': return f ? L('娘', 'Daughter') : L('息子', 'Son');
    case 'grandchild': return L('孫', f ? 'Granddaughter' : 'Grandson');
    case 'friend': return L('友だち', 'Friend');
    case 'mentor': return L('恩師', 'Mentor');
    case 'rival': return L('ライバル', 'Rival');
    case 'ex': return L('昔の恋人', 'Ex');
  }
}

const ORDER: Role[] = ['mother', 'father', 'spouse', 'partner', 'child', 'grandchild', 'friend', 'mentor', 'rival', 'ex', 'sibling'];
const gone = (t: Tie) => t.until !== undefined || t.role === 'ex';
const INNER_MAX = 16;

interface Spot { t: Tie; x: number; y: number; size: number; r: number; deg: number; outer: boolean }

// 内の輪 = 今いる人 (近いほど中心へ寄る)。外の輪 = 離れた人・昔の恋人・孫。内が混んだら亡くなった人も外へ
function layout(ties: Tie[]): Spot[] {
  const all = [...ties].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || (a.id ?? 0) - (b.id ?? 0));
  let inner = all.filter((t) => !gone(t) && t.role !== 'grandchild');
  if (inner.length > INNER_MAX) inner = inner.filter((t) => t.alive);
  const outer = all.filter((t) => !inner.includes(t));
  const place = (list: Tie[], outerRing: boolean): Spot[] => {
    const n = list.length;
    const base = outerRing ? 44 : 30;
    const minR = outerRing ? base : base * 0.78;
    const size = Math.max(outerRing ? 5 : 7, Math.min(outerRing ? 9 : 13, ((2 * Math.PI * minR) / Math.max(n, 1)) * 0.8));
    return list.map((t, i) => {
      const deg = -90 + (360 * (i + (outerRing ? 0.5 : 0))) / Math.max(n, 1) + (n === 1 ? 0 : 360 / n / 2);
      const r = outerRing ? base : base * (1.15 - 0.37 * ((t.bond ?? 50) / 100));
      const a = (deg * Math.PI) / 180;
      return { t, x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a), size, r, deg, outer: outerRing };
    });
  };
  return [...place(inner, false), ...place(outer, true)];
}

interface NodeEls { line: HTMLElement; btn: HTMLElement; cv: HTMLCanvasElement; key: string }
const mounted = new WeakMap<HTMLElement, Map<number, NodeEls>>();

// interactive なら顔を押すと data-act=person で選べる。sel は選ばれている人の id。
// ties を渡せば (前世の記録の要約など) people(p) の代わりにそれを並べる
export function mountRing(el: HTMLElement, p: Person, sel?: number, interactive = true, ties: Tie[] = people(p)): void {
  let nodes = mounted.get(el);
  if (!nodes || !el.querySelector('.rcenter')) {
    el.innerHTML = `<div class="ring"><div class="rlines"></div><div class="rcenter"><canvas class="pix"></canvas><b>${esc(p.given)}</b></div></div>`;
    nodes = new Map();
    mounted.set(el, nodes);
  }
  const ring = el.querySelector<HTMLElement>('.ring')!;
  const lines = el.querySelector<HTMLElement>('.rlines')!;
  drawPortrait(el.querySelector<HTMLCanvasElement>('.rcenter canvas')!, p);
  const spots = layout(ties);
  const showNames = spots.filter((s) => !s.outer).length <= 12;
  const seen = new Set<number>();
  for (const s of spots) {
    const id = s.t.id!;
    seen.add(id);
    let n = nodes.get(id);
    if (!n) {
      const line = document.createElement('i');
      const btn = document.createElement(interactive ? 'button' : 'div');
      const cv = document.createElement('canvas');
      cv.className = 'pix';
      btn.append(cv, document.createElement('span'));
      if (interactive) { btn.dataset.act = 'person'; btn.dataset.v = String(id); }
      lines.append(line);
      ring.append(btn);
      n = { line, btn, cv, key: '' };
      nodes.set(id, n);
    }
    const t = s.t;
    const state = !t.alive ? 'dead' : gone(t) ? 'left' : '';
    const key = `${t.alive}|${Math.floor(t.age / 5)}|${state}`;
    if (n.key !== key) { drawTiePortrait(n.cv, t, p); n.key = key; }
    const bond = t.bond ?? 50;
    n.line.className = `rline r-${kindOf(t.role)} ${state}`;
    n.line.style.width = `${s.r}%`;
    n.line.style.transform = `rotate(${s.deg}deg)`;
    n.line.style.borderTopWidth = `${state === 'dead' ? 1 : (1 + (bond / 100) * 8).toFixed(1)}px`;
    n.btn.className = `rnode r-${kindOf(t.role)} ${state}${id === sel ? ' sel' : ''}${s.outer ? ' outer' : ''}`;
    n.btn.style.left = `${s.x}%`;
    n.btn.style.top = `${s.y}%`;
    n.btn.style.width = `${s.size}%`;
    n.btn.title = `${t.name ?? ''} (${roleName(t, p)})`;
    n.btn.lastElementChild!.textContent = showNames && !s.outer ? t.name ?? '' : '';
  }
  for (const [id, n] of nodes) if (!seen.has(id)) { n.line.remove(); n.btn.remove(); nodes.delete(id); }
}

// data-face="id" のキャンバスに顔を描く。0 は主人公
export function paintFaces(root: ParentNode, p: Person, ties: Tie[] = people(p)): void {
  const byId = new Map(ties.map((t) => [t.id!, t]));
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-face]').forEach((cv) => {
    const id = Number(cv.dataset.face);
    if (id === 0) return drawPortrait(cv, p);
    const t = byId.get(id);
    if (t) drawTiePortrait(cv, t, p);
  });
}

export const face = (id: number, cls = 'mini') => `<canvas class="pix ${cls}" data-face="${id}" aria-hidden="true"></canvas>`;

// その人との時間: mem と、その人が関わった記録を合わせて新しい順に
function together(p: Person, t: Tie): { age: number; text: string; d?: number }[] {
  const seen = new Set<string>();
  const rows: { age: number; text: string; d?: number }[] = [];
  for (const m of t.mem ?? []) { seen.add(`${m.age}|${m.text}`); rows.push(m); }
  for (const e of p.log) if (e.who?.includes(t.id!) && !seen.has(`${e.age}|${e.text}`)) rows.push({ age: e.age, text: e.text });
  return rows.sort((a, b) => b.age - a.age);
}

const yearsWord = (n: number) => L(`${n}年`, `${n} ${n === 1 ? 'year' : 'years'}`);

// life: その人の一生を開いているか
export function personCard(p: Person, id?: number, life = false): string {
  const t = id === undefined ? undefined : people(p).find((x) => x.id === id);
  if (!t) {
    return `<p class="note">${L('顔を押すと、その人と過ごした時間が読める。', 'Tap a face to read the time spent with that person.')}</p>
      <p class="rlegend"><span class="r-family"></span>${L('家族', 'Family')}<span class="r-love"></span>${L('恋人・連れ合い', 'Love')}<span class="r-friend"></span>${L('友だち・恩師', 'Friends')}<span class="r-rival"></span>${L('ライバル', 'Rival')}</p>
      <p class="note">${L('線が太いほど近い。薄い顔は亡くなった人、外の輪は離れた人。', 'Thicker line, closer bond. Faded faces have died; the outer ring is people who drifted away.')}</p>`;
  }
  const end = t.until ?? t.diedAt ?? p.age;
  const known = Math.max(0, end - t.since);
  const ago = p.age - (t.diedAt ?? p.age);
  const status = !t.alive
    ? (ago === 0 ? L('この年に亡くなった', 'Died this year') : L(`${yearsWord(ago)}前に亡くなった`, `Died ${yearsWord(ago)} ago`))
    : t.until !== undefined ? L(`${t.until}歳のころ離れた`, `Drifted apart around age ${t.until}`) : L(`${t.age}歳`, `Age ${t.age}`);
  const rows = together(p, t);
  const bond = Math.round(t.bond ?? 50);
  return `<div class="pchead">${face(t.id!, 'big')}<div>
      <p class="kicker">${roleName(t, p)}</p><h3 class="pname">${esc(t.name ?? '')}</h3>
      <p class="note">${status}${L('・', ' · ')}${t.since === 0 && (t.role === 'mother' || t.role === 'father') ? L('生まれた時から', 'Since birth') : L(`知り合って${yearsWord(known)}`, `Known ${yearsWord(known)}`)}</p></div>
      <button class="link close" data-act="person" data-v="" aria-label="${L('閉じる', 'Close')}">×</button></div>
    <div class="stat"><span>${L('近さ', 'Closeness')}</span><div class="meter"><i class="m-bond" style="width:${bond}%"></i></div><b>${bond}</b></div>
    ${rows.length ? `<ol class="log together">${rows.map((m) => `<li><span class="age">${L(`${m.age}歳`, `${m.age}`)}</span><span>${esc(m.text)}${m.d ? ` <i class="dd ${m.d > 0 ? 'up' : 'down'}">${m.d > 0 ? '▲' : '▼'}</i>` : ''}</span></li>`).join('')}</ol>`
      : `<p class="note">${L('まだ一緒の出来事は記録されていない。', 'No shared moments recorded yet.')}</p>`}
    <button class="link kinbtn" data-act="kinlife" aria-expanded="${life}">${life ? L('その人の一生を閉じる', 'Close their whole life') : L('その人の一生を読む', 'Read their whole life')}</button>
    ${life ? lifeHtml(p, t.id!) : ''}`;
}

// 最後にそばにいた人: 顔と、その人の最後の言葉。AI が書いた言葉には「想像」の印
export function lastWordsHtml(p: Person, ties: Tie[], words: { id: number; name: string; text: string; ai: boolean }[]): string {
  if (!words.length) return `<p class="note">${L('最後は、ひとりだった。', 'At the end, no one was there.')}</p>`;
  return `<ul class="lastpeople">${words.map((w) => {
    const t = ties.find((x) => x.id === w.id);
    return `<li>${face(w.id, 'big')}<div><b>${esc(w.name)}</b>${t ? ` <small>${roleName(t, p)}${isEn ? ', ' : '・'}${L(`${t.age}歳`, `${t.age}`)}</small>` : ''}
      <p class="words">${w.ai ? `<i class="aitag">${L('想像', 'Imagined')}</i>` : ''}${esc(w.text)}</p></div></li>`;
  }).join('')}</ul>`;
}
