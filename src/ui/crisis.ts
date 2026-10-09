// 命が危うい場面と、最期のふりかえりを画面いっぱいに再生する。台本は farewell.ts。
// どの場面も、押す・Enter・Esc で飛ばせる。動きを減らす設定では、脈や溶け込みを止めて少し早く進む
import type { Person } from '../engine/person';
import { esc } from './dom';
import { drawScene, sceneOf } from './pixel';
import { everyone, face, lastWordsHtml, paintFaces } from './ring';
import { flatline, thump } from './music';
import { L } from '../i18n';
import type { Beat, CrisisScript, Farewell, Pulse } from './farewell';

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BEAT_MS: Record<Pulse, number> = { fast: 450, slow: 900, weak: 1300, back: 700, flat: 0, none: 0 };

interface Step { html: string; ms: number; pulse?: Pulse; add?: boolean; paint?: (el: HTMLElement) => void }

function play(cls: string, steps: Step[], sound: boolean): Promise<void> {
  return new Promise((done) => {
    const el = document.createElement('div');
    el.className = `crisis ${cls}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<div class="cr-heart" aria-hidden="true"></div><div class="cr-body"></div><button class="cr-skip">${L('飛ばす', 'Skip')} ›</button>`;
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const body = el.querySelector<HTMLElement>('.cr-body')!;
    const heart = el.querySelector<HTMLElement>('.cr-heart')!;
    const k = calm() ? 0.7 : 1;
    let i = 0, timer = 0, beat = 0, over = false;
    const setPulse = (p: Pulse = 'none') => {
      heart.className = `cr-heart p-${p}`;
      window.clearInterval(beat);
      if (!sound) return;
      if (p === 'flat') flatline();
      else if (BEAT_MS[p]) { thump(); beat = window.setInterval(thump, BEAT_MS[p]); }
    };
    const end = () => {
      if (over) return;
      over = true;
      window.clearTimeout(timer);
      window.clearInterval(beat);
      document.removeEventListener('keydown', onKey);
      el.classList.remove('in');
      window.setTimeout(() => { el.remove(); done(); }, calm() ? 0 : 400);
    };
    const onKey = (e: KeyboardEvent) => { if (['Enter', 'Escape', ' '].includes(e.key)) { e.preventDefault(); end(); } };
    document.addEventListener('keydown', onKey);
    el.onclick = end;
    const next = () => {
      if (over) return;
      const s = steps[i++];
      if (!s) return end();
      const node = document.createElement('div');
      node.className = 'cr-step';
      node.innerHTML = s.html;
      if (!s.add) body.replaceChildren();
      body.append(node);
      s.paint?.(node);
      requestAnimationFrame(() => node.classList.add('on'));
      if (s.pulse) setPulse(s.pulse);
      timer = window.setTimeout(next, s.ms * k);
    };
    next();
  });
}

const beatStep = (b: Beat, add = true): Step => ({ html: `<p>${esc(b.text)}</p>`, ms: b.ms, pulse: b.pulse, add });

// 危うい場面。助かるか亡くなるかは、最後の一拍まで分からない
export function playCrisis(s: CrisisScript, sound: boolean): Promise<void> {
  return play(s.survive ? 'cr-near' : 'cr-acute', [
    { html: `<p class="cr-head">${esc(s.head)}</p>`, ms: 900, pulse: 'fast', add: true },
    ...s.beats.map((b) => beatStep(b)),
    ...s.end.map((b) => beatStep(b)),
  ], sound);
}

// 最期のふりかえり: 最後の場面 → 生まれ → 大きかった出来事 → そばにいた人 → 静かな一行
export function playFarewell(p: Person, f: Farewell, sound: boolean): Promise<void> {
  const ties = everyone(p);
  const faces = (ids: number[]) => (ids.length ? `<div class="cr-faces">${ids.slice(0, 4).map((id) => face(id, 'big')).join('')}</div>` : '');
  const paint = (el: HTMLElement) => paintFaces(el, p, ties);
  const steps: Step[] = [
    {
      html: `<canvas class="cr-scene"></canvas>`, ms: 3200,
      paint: (el) => drawScene(el.querySelector('canvas')!, sceneOf(p), 0),
    },
    { html: `<p class="cr-big">${esc(f.birth)}</p>`, ms: 2600 },
    ...f.highlights.map((h): Step => ({
      html: `<p class="cr-age">${L(`${h.age}歳`, `Age ${h.age}`)}</p><p>${esc(h.text)}</p>${faces(h.who)}`, ms: 2200, paint,
    })),
    { html: `<div class="cr-words">${lastWordsHtml(p, ties, f.words)}</div>`, ms: f.words.length ? 4500 : 2600, paint },
    { html: `${face(0, 'big')}<p class="cr-big">${esc(f.last)}</p>`, ms: 3500, paint },
  ];
  return play('cr-farewell', steps, sound);
}
