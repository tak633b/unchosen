// 人生をふりかえる (走馬灯)。亡くなった直後に流し、死亡記録と前世の記録から何度でも流し直せる。
// 台本 (reelOf) は前世の記録 (PastLife) だけから作る。人生の乱数は使わない。再生 (playReel) は画面いっぱいの重ね絵
import { countryAt } from '../engine/countries';
import { bornIn } from '../engine/polity';
import type { LogEntry } from '../engine/person';
import type { LastWord } from '../ai/words';
import type { PastLife } from './death';
import type { SceneData } from './pixel';
import { paintScenes, sceneAttr } from './pixel';
import { face, lastWordsHtml } from './ring';
import { esc } from './dom';
import { isEn, L } from '../i18n';

export type Tone = 'dawn' | 'day' | 'dusk' | 'night';
export interface Shot { age: number; text: string; scene?: SceneData; who?: number[]; star?: boolean; mine?: boolean }
export interface Chapter { tone: Tone; title: string; shots: Shot[] }
export interface Reel {
  name: string; span: string;
  birth: { text: string; scene?: SceneData };
  chapters: Chapter[];
  people: { id: number; name: string }[];
  words: LastWord[];
  days: string; last: string; thanks: string;
  scene?: SceneData;
}

// 人生の区切り。生きた年のある区切りだけ流す
const STAGES: { from: number; to: number; tone: Tone; ja: string; en: string }[] = [
  { from: 0, to: 12, tone: 'dawn', ja: '小さかったころ', en: 'When they were small' },
  { from: 13, to: 29, tone: 'day', ja: '若かった日々', en: 'The young years' },
  { from: 30, to: 64, tone: 'dusk', ja: '重ねていった日々', en: 'The years that piled up' },
  { from: 65, to: 200, tone: 'night', ja: '晩年', en: 'The later years' },
];
const PER_STAGE = 3;   // 1つの区切りに流す場面 (☆はこれを超えても入れる。最大5)
const STAR_STAGE = 5;
const PEOPLE = 6;

// 場面の重み: ☆ > 自分で書いた言葉 > 写真のある年 > 大きな出来事 > ふだんの一瞬。人が出てくると少し上。
// 脚注つきの大きな出来事 (戦争・震災など、生きた時代) も少し上
// お金の額が並ぶ行は、ふりかえりには乾きすぎるので下げる
const SAD = new Set(['loss', 'ill', 'hard']);
type Cand = Shot & { big?: boolean; warm?: boolean; hist?: boolean; kind?: string };
function score(s: Cand): number {
  return (s.star ? 100 : 0) + (s.mine ? 40 : 0) + (s.scene ? 6 : 0) + (s.big ? 4 : s.warm ? 3 : 0) + (s.hist ? 3 : 0) + (s.who?.length ? 2 : 0)
    + (s.kind && ['love', 'family', 'child'].includes(s.kind) ? 1 : 0) - (/[$€¥]|万円/.test(s.text) ? 5 : 0) - (!s.big && s.kind && SAD.has(s.kind) ? 2 : 0);
}
// 重みの高い順に選ぶ。同じ種類が続くと下げ、悲しい出来事は1つの区切りに1つまでを目安にする (☆は別)
function choose(list: Cand[], n: number): Cand[] {
  const out: Cand[] = [];
  const left = [...list];
  while (out.length < n && left.length) {
    const w = (c: Cand) => score(c) - 3 * out.filter((o) => o.kind === c.kind).length - (c.kind && SAD.has(c.kind) && out.some((o) => o.kind && SAD.has(o.kind)) && !c.star ? 6 : 0);
    let best = 0;
    for (let i = 1; i < left.length; i++) if (w(left[i]) > w(left[best])) best = i;
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

const isNote = (e: LogEntry) => e.note === true;
// 節目の年の統計の行 (moments.ts の milestone)。思い出ではないので流さない
const STAT_LINE = /^(\d+歳。同じ年に|5歳の誕生日。|Age \d+\. Of the |Fifth birthday\.)/;

export function reelOf(l: PastLife): Reel {
  const album = l.album ?? [];
  const photo = (age: number) => album.find((m) => m.age === age)?.scene;
  // 候補: 記録の行 (☆・大きな出来事・自分の一言)、写真、ひと息に書いた答え
  const cands = new Map<string, Cand>();
  const put = (s: Cand) => {
    const k = `${s.age}|${s.text}`;
    const old = cands.get(k);
    cands.set(k, old ? { ...old, ...s, star: old.star || s.star, scene: old.scene ?? s.scene } : s);
  };
  for (const e of l.log) {
    if (e.kind === 'death' || e.quiet || (STAT_LINE.test(e.text) && !e.star)) continue;
    put({ age: e.age, text: e.text, who: e.who, star: e.star, mine: isNote(e), big: e.big, warm: e.tpl, hist: e.big && !!e.stat && !e.tpl, kind: e.kind, scene: photo(e.age) });
  }
  for (const m of album) if (m.age > 0 && !STAT_LINE.test(m.text)) put({ age: m.age, text: m.text, scene: m.scene, kind: m.kind });
  for (const q of l.questions) if (q.a) put({ age: q.age, text: L(`「${q.a}」`, `"${q.a}"`), mine: true });

  const all = [...cands.values()];
  const chapters: Chapter[] = [];
  for (const st of STAGES) {
    if (st.from > l.age) break;
    const inStage = all.filter((s) => s.age >= Math.max(1, st.from) && s.age <= st.to && s.age <= l.age);
    if (!inStage.length) continue;
    // ☆は枠を広げる (最大5)。自分で書いた言葉は枠の外に足す (ほかの場面を押し出さない)
    const stars = inStage.filter((s) => s.star && !s.mine).length;
    const mine = inStage.filter((s) => s.mine).length;
    const n = Math.min(STAR_STAGE, Math.max(PER_STAGE, stars)) + mine;
    const picked = choose(inStage, n);
    picked.sort((a, b) => a.age - b.age);
    chapters.push({ tone: st.tone, title: L(st.ja, st.en), shots: picked.map(({ big: _b, warm: _w, hist: _h, kind: _k, ...s }) => s) });
  }

  const born = bornIn(l.birthCountry, l.birthYear); // 1950年より前は当時の国名 (イギリス領インド など)
  const end = l.birthYear + l.age;
  const home = countryAt(l.country, end).name;
  // 近かった人から。ペットも入れる
  const people = (l.circle ?? []).filter((t) => t.name && (t.bond ?? 0) > 0).sort((a, c) => (c.bond ?? 0) - (a.bond ?? 0)).slice(0, PEOPLE)
    .map((t) => ({ id: t.id!, name: t.name! }));
  const days = Math.round(l.age * 365.25 + 180);
  return {
    name: l.name,
    span: `${l.birthYear} – ${end}`,
    birth: {
      text: isEn ? `Born in ${born}, ${l.birthYear}.` : `${l.birthYear}年${l.birthMonth ? `${l.birthMonth}月` : ''}、${born}で生まれた。`,
      scene: album.find((m) => m.age === 0)?.scene,
    },
    chapters,
    people,
    words: l.words ?? [],
    days: l.age < 1 ? L('ほんの短いあいだ、ここにいた。', 'Here for only a little while.') : L(`およそ${days.toLocaleString('ja-JP')}日を生きた。`, `About ${days.toLocaleString('en-US')} days, lived.`),
    last: isEn ? `${l.given}. Age ${l.age}. ${l.city ? `${l.city}, ${home}` : `Rural ${home}`}. ${end}.` : `${l.given}、${l.age}歳。${l.city ? `${home}、${l.city}` : `${home}の農村`}。${end}年。`,
    thanks: L('この人生を生きてくれて、ありがとう。', 'Thank you for living this life.'),
    scene: l.scene,
  };
}

// ---- 再生 -----------------------------------------------------------------

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
interface Step { html: string; ms: number; tone?: Tone; cls?: string }

const sceneHtml = (d?: SceneData) => (d ? `<div class="rl-photo"><canvas class="pixscene" data-scene="${sceneAttr(d)}"></canvas></div>` : '');
const facesHtml = (ids?: number[]) => (ids?.length ? `<div class="cr-faces">${ids.slice(0, 4).map((id) => face(id, 'big')).join('')}</div>` : '');

function stepsOf(r: Reel, me: Parameters<typeof lastWordsHtml>[0], ties: Parameters<typeof lastWordsHtml>[1]): Step[] {
  const steps: Step[] = [
    { html: `<p class="rl-title">${esc(r.name)}</p><p class="rl-span">${esc(r.span)}</p>`, ms: 3200, tone: 'night', cls: 'rl-open' },
    { html: `${sceneHtml(r.birth.scene)}<p class="cr-big">${esc(r.birth.text)}</p>`, ms: 3800, tone: 'dawn' },
  ];
  for (const c of r.chapters) {
    steps.push({ html: `<p class="rl-chapter">${esc(c.title)}</p>`, ms: 2200, tone: c.tone, cls: 'rl-open' });
    for (const s of c.shots) {
      const tag = s.star ? `<span class="rl-star">★</span>` : s.mine ? `<span class="rl-mine">${L('あなたが書いた言葉', 'Your words')}</span>` : '';
      steps.push({
        html: `${sceneHtml(s.scene)}<p class="cr-age">${L(`${s.age}歳`, `Age ${s.age}`)}${tag}</p><p class="${s.mine ? 'rl-minetext' : ''}">${esc(s.text)}</p>${s.scene ? '' : facesHtml(s.who)}`,
        ms: (s.scene ? 4800 : 3800) + Math.min(2000, s.text.length * (isEn ? 12 : 30)), tone: c.tone,
      });
    }
  }
  if (r.people.length) steps.push({
    html: `<p class="rl-chapter">${L('ともに生きた人たち', 'The ones who were there')}</p><div class="rl-people">${r.people.map((t, i) => `<figure style="--i:${i}">${face(t.id, 'big')}<figcaption>${esc(t.name)}</figcaption></figure>`).join('')}</div>`,
    ms: 3000 + r.people.length * 700, tone: 'night',
  });
  steps.push({ html: `<div class="cr-words">${lastWordsHtml(me, ties, r.words)}</div>`, ms: r.words.length ? 6000 : 3200, tone: 'night' });
  steps.push({ html: `${sceneHtml(r.scene)}<p class="cr-big">${esc(r.days)}</p>`, ms: 4200, tone: 'night' });
  steps.push({ html: `${face(0, 'big')}<p class="cr-big">${esc(r.last)}</p>`, ms: 4200, tone: 'night' });
  return steps;
}

/**
 * 画面いっぱいに流す。押す・→・スペースで次へ、← で前へ、Esc と「飛ばす」で最後へ。
 * 最後は「もう一度」と「閉じる」を出して待つ。paint は顔を描く (呼ぶ側が人の輪を持っている)
 */
export function playReel(r: Reel, paint: (el: HTMLElement) => void, me: Parameters<typeof lastWordsHtml>[0], ties: Parameters<typeof lastWordsHtml>[1]): Promise<void> {
  const steps = stepsOf(r, me, ties);
  return new Promise((done) => {
    const el = document.createElement('div');
    el.className = 'crisis reel t-night';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', L('人生をふりかえる', 'Looking back on this life'));
    el.innerHTML = `<div class="rl-bar"><i></i></div><div class="cr-body" aria-live="polite"></div><button class="cr-skip">${L('飛ばす', 'Skip')} ›</button>`;
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const body = el.querySelector<HTMLElement>('.cr-body')!;
    const bar = el.querySelector<HTMLElement>('.rl-bar i')!;
    const skip = el.querySelector<HTMLButtonElement>('.cr-skip')!;
    const k = calm() ? 0.75 : 1;
    let i = 0, timer = 0, over = false, atEnd = false;
    const show = (html: string, step?: Step) => {
      const node = document.createElement('div');
      node.className = `cr-step ${step?.cls ?? ''}`;
      node.innerHTML = html;
      body.replaceChildren(node);
      paintScenes(node);
      paint(node);
      if (step?.tone) el.className = `crisis reel in t-${step.tone}`;
      requestAnimationFrame(() => node.classList.add('on'));
    };
    const close = () => {
      if (over) return;
      over = true;
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      el.classList.remove('in');
      window.setTimeout(() => { el.remove(); done(); }, calm() ? 0 : 900);
    };
    const finale = () => {
      window.clearTimeout(timer);
      atEnd = true;
      skip.hidden = true;
      bar.style.width = '100%';
      show(`<p class="rl-thanks">${esc(r.thanks)}</p><div class="choices rl-end"><button data-r="again">↻ ${L('もう一度', 'Watch again')}</button><button class="primary" data-r="close">${L('閉じる', 'Close')}</button></div>`, { html: '', ms: 0, tone: 'night', cls: 'rl-open' });
      el.querySelector<HTMLButtonElement>('[data-r=close]')?.focus();
    };
    const go = (to: number) => {
      if (over) return;
      window.clearTimeout(timer);
      i = Math.max(0, to);
      const s = steps[i];
      if (!s) return finale();
      atEnd = false;
      skip.hidden = false;
      bar.style.width = `${(i / steps.length) * 100}%`;
      show(s.html, s);
      timer = window.setTimeout(() => go(i + 1), s.ms * k);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); if (atEnd) close(); else finale(); }
      else if (atEnd) return;
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); go(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    };
    document.addEventListener('keydown', onKey);
    el.onclick = (e) => {
      const t = e.target as HTMLElement;
      const a = t.closest<HTMLElement>('[data-r]')?.dataset.r;
      if (a === 'again') return go(0);
      if (a === 'close') return close();
      if (t.closest('.cr-skip')) return finale();
      if (!atEnd) go(i + 1);
    };
    go(0);
  });
}
