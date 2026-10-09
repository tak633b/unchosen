// ゲームの進行: 時間・意思決定・止まった時間の問い・保存。
import { byCode, countryAt, type BirthBasis } from '../engine/countries';
import { advanceYear, createPerson, fromSaved, pauseQuestion, settle, toSaved, type SavedPerson } from '../engine/life';
import { choose, type Decision, type Focus, type Person, type Question } from '../engine/person';
import { randomSeed } from '../engine/rng';
import { nowLine } from '../engine/summary';
import { lifeBand, survivalChart } from './charts';
import { showDeath } from './death';
import { $, esc, load, save, setHTML } from './dom';
import { setMusic } from './music';
import { playCrisis, playFarewell } from './crisis';
import { crisisScript, declineScript, farewell } from './farewell';
import { isAcute } from '../engine/crisis';
import { aiOthersLines, aiStatus, onYear, resetAi } from '../ai/director';
import { aiOn } from '../ai/settings';
import { isEn, L } from '../i18n';
import { drawPortrait, drawScene, sceneOf, type Scene } from './pixel';
import { comparePanel, countryPanel, familyPanel, focusPanel, idCard, logPanel, othersPanel, scenePanel, statsPanel, yearPanel } from './panels';
import { mountRing, paintFaces, personCard } from './ring';
import { paintOtherFaces } from './portrait';
import { briefOf, otherHtml } from './otherview';
import { continueAs, generation, othersFor } from '../engine/lineage';

const YEAR_MS = 26000;  // 1倍速で1年 = 26秒 (平均寿命まで約30分)
const SPEEDS = [1, 2, 4, 8, 16];
const OTHERS = 4;
const AUTO_WAIT_MS = 4000; // 自動で決めるとき、選択肢を見せておく時間
const SAVE_KEY = 'current';
const SCENE_MS = 100; // 場面の動きは1秒に10コマ

type Tab = '' | 'me' | 'band' | 'compare' | 'log';
const TABS: [Exclude<Tab, ''>, string][] = [['me', L('いまの状態', 'Status')], ['band', L('人生の帯', 'Life band')], ['compare', L('比べる', 'Compare')], ['log', L('全部の記録', 'Full record')]];

interface Saved { basis: BirthBasis; speed: number; p: SavedPerson; others: SavedPerson[] }

interface GameState {
  p: Person;
  others: Person[];
  basis: BirthBasis;
  speed: number;
  ff: boolean;       // 次の決定まで早送り
  paused: boolean;
  music: boolean;
  progress: number;
  modal: boolean;
  logOpen: boolean;
  sel?: number;      // 人の輪で選んでいる人の id
  life: boolean;     // 選んだ人の一生を開いているか
  other?: number;    // 詳しく見ている、同じ1秒に生まれた人 (others の番号)
  osel?: number;     // その人の輪で選んでいる人の id
  olife: boolean;    // その人の輪の人の一生を開いているか
  tab: Tab;          // 開いている「データ」の欄。'' なら閉じている
  raf: number;
  last: number;
  timer?: number;
  onExit: () => void;
  scene?: Scene;     // いま見えている場面。動かすときはこれを描き直す
  tk: number;        // 場面の動きのコマ
  tkAt: number;
  seen: boolean;     // 場面が画面の中にあるか
  io?: IntersectionObserver;
}

let S: GameState | null = null;

export const hasSaved = () => load<Saved | null>(SAVE_KEY, null);
export const clearSaved = () => save(SAVE_KEY, null);

export function resumeGame(onExit: () => void): void {
  const s = hasSaved();
  if (!s) return onExit();
  run(fromSaved(s.p), s.others.map(fromSaved), s.basis, s.speed, onExit);
}

export const sameSecondOthers = (basis: BirthBasis, year?: number) =>
  Array.from({ length: OTHERS }, () => createPerson({ seed: randomSeed(), basis, auto: true, year }));

export function startWithOthers(p: Person, others: Person[], basis: BirthBasis, onExit: () => void): void {
  run(p, others, basis, 1, onExit);
}

function run(p: Person, others: Person[], basis: BirthBasis, speed: number, onExit: () => void): void {
  p.reflect = true;
  resetAi();
  S = { p, others, basis, speed, ff: false, paused: false, music: load('music', false), progress: 0, modal: false, logOpen: false, life: false, olife: false, tab: '', raf: 0, last: performance.now(), onExit, tk: 0, tkAt: 0, seen: true };
  $('#app').innerHTML = shell();
  S.io = new IntersectionObserver(([en]) => { if (S) S.seen = en.isIntersecting; });
  S.io.observe($('#scene'));
  $('#app').onclick = onClick;
  if (S.music) setMusic(true);
  render();
  persist();
  S.raf = requestAnimationFrame(frame);
}

function persist(): void {
  if (!S || !S.p.alive) return;
  save(SAVE_KEY, { basis: S.basis, speed: S.speed, p: toSaved(S.p), others: S.others.map(toSaved) } satisfies Saved);
}

function frame(t: number): void {
  if (!S) return;
  const dt = Math.min(250, t - S.last);
  S.last = t;
  if (!S.paused && !S.modal && S.p.alive) {
    S.progress += (dt * (S.ff ? 400 : S.speed)) / YEAR_MS;
    while (S && S.progress >= 1 && !S.modal) {
      S.progress -= 1;
      tick();
    }
    if (S?.modal) S.progress = 0;
  }
  if (!S) return;
  const bar = $('#yearbar');
  if (bar) bar.style.width = `${S.progress * 100}%`;
  animScene(t);
  S.raf = requestAnimationFrame(frame);
}

// 場面を少しだけ動かす。止めている間・問いの間・タブが隠れている間・画面の外・動きを減らす設定では動かさない
const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function animScene(t: number): void {
  if (!S?.scene || calm?.matches || S.paused || S.modal || !S.p.alive || !S.seen || document.hidden || t - S.tkAt < SCENE_MS) return;
  S.tkAt = t;
  S.tk++;
  const cv = document.querySelector<HTMLCanvasElement>('#scenecv');
  if (cv) drawScene(cv, S.scene, S.tk);
}

function tick(): void {
  if (!S) return;
  advanceYear(S.p);
  for (const o of S.others) advanceYear(o);
  // AI の1年分が届いていれば反映し、用意した文の出来事は1つだけ残す
  if (S.p.alive && onYear(S.p, S.others)) {
    const age = S.p.age;
    let kept = 0;
    S.p.log = S.p.log.filter((e) => !(e.age === age && e.tpl && kept++ >= 1));
  }
  render();
  // 九死に一生の年は、その場面を見せてから先へ進む
  const near = S.p.alive ? S.p.log.find((e) => e.age === S!.p.age && e.crisis) : undefined;
  if (near) {
    S.modal = true;
    S.ff = false;
    void playCrisis(crisisScript(S.p, near.crisis!, true), S.music).then(() => {
      if (!S) return;
      S.modal = false;
      nextModal();
      if (S && !S.modal) persist();
    });
    return;
  }
  nextModal();
  if (S && !S.modal) persist();
}

// ---- 描画 -----------------------------------------------------------------

function shell(): string {
  return `
  <header class="topbar">
    <div class="who"><b class="brand">Un<span>chosen</span></b><span class="agebig" id="age"></span><span id="wholine"></span></div>
    <div class="controls">
      <button data-act="pause" id="pausebtn" aria-label="${L('一時停止', 'Pause')}">❚❚</button>
      <span class="speeds">${SPEEDS.map((s) => `<button data-act="speed" data-v="${s}">${s}×</button>`).join('')}</span>
      <button data-act="ff" title="${L('次に決めることが来るまで早送り', 'Fast-forward to the next decision')}">${L('次の決定まで', 'Next decision')} »</button>
      <button data-act="auto" id="autobtn">${L('自動で決める', 'Auto')}</button>
      <span class="aibadge" id="aibadge" hidden>AI</span>
      <button data-act="music" id="musicbtn" aria-label="${L('音楽', 'Music')}">♪</button>
      <button data-act="exit">${L('中断', 'Quit')}</button>
    </div>
    <div class="yeartrack"><div id="yearbar"></div></div>
  </header>
  <main class="stage">
    <section class="ringcol">
      <div class="ringwrap" id="ring"></div>
      <div class="panel pcard" id="pcard"></div>
    </section>
    <section class="side">
      <div class="scenebox" id="scene"></div>
      <div class="panel" id="focus"></div>
      <div class="panel" id="year"></div>
      <div class="panel" id="others"></div>
    </section>
  </main>
  <section class="datadrawer">
    <nav class="tabs"><span class="tabslabel">${L('データ', 'Data')}</span>${TABS.map(([k, label]) => `<button data-act="tab" data-v="${k}">${label}</button>`).join('')}</nav>
    <div id="data"></div>
  </section>
  <div class="modal-back" id="modal" hidden><div class="modal" id="modalbody"></div></div>`;
}

function render(): void {
  if (!S) return;
  const { p } = S;
  $('#age').textContent = L(`${p.age}歳`, `Age ${p.age}`);
  const secs = Math.round(YEAR_MS / 1000 / S.speed);
  const gen = generation(p) > 1 ? L(`・第${generation(p)}世代`, ` · gen ${generation(p)}`) : '';
  setHTML('#wholine', L(`${p.birthYear + p.age}年・${esc(p.name)}${gen}・1年 ≈ ${secs}秒`, `${p.birthYear + p.age} · ${esc(p.name)}${gen} · 1 yr ≈ ${secs}s`));
  $('#pausebtn').textContent = S.paused ? L('▶ 再開', '▶ Resume') : L('❚❚ 止める', '❚❚ Pause');
  document.querySelectorAll<HTMLButtonElement>('[data-act=speed]').forEach((b) => b.classList.toggle('on', +b.dataset.v! === S!.speed));
  $('#autobtn').classList.toggle('on', p.auto);
  $('#musicbtn').classList.toggle('on', S.music);
  mountRing($('#ring'), p, S.sel);
  // 一生の欄は毎年書き直すので、読んでいた位置を保つ
  const kinTop = document.querySelector('#pcard .kinlist')?.scrollTop ?? 0;
  setHTML('#pcard', personCard(p, S.sel, S.life));
  const kin = document.querySelector('#pcard .kinlist');
  if (kin) kin.scrollTop = kinTop;
  setHTML('#scene', scenePanel(p));
  const scv = $<HTMLCanvasElement>('#scenecv');
  S.scene = sceneOf(p);
  drawScene(scv, S.scene, calm?.matches ? 0 : S.tk);
  fitPixels(scv);
  setHTML('#focus', focusPanel(p));
  setHTML('#year', yearPanel(p));
  paintFaces($('#pcard'), p);
  paintFaces($('#year'), p);
  renderData();
  renderOthers();
  const st = aiStatus();
  const badge = $('#aibadge');
  if (badge) {
    badge.hidden = !aiOn();
    badge.textContent = st.error ? 'AI ⚠' : st.waiting > 0 ? 'AI …' : 'AI';
    badge.title = st.error ? L(`AIの呼び出しに失敗: ${st.error}`, `AI call failed: ${st.error}`) : L('AIが出来事を書いている', 'AI is writing events');
  }
}

// 同じ1秒に生まれた人たち。1人を開いていれば、その人の今の年までの記録・輪・比べ
function renderOthers(): void {
  if (!S) return;
  const o = S.other === undefined ? undefined : S.others[S.other];
  if (!o) { setHTML('#others', othersPanel(S.others, aiOthersLines())); paintOtherFaces($('#others'), S.others); return; }
  const lists = [...document.querySelectorAll('#others .kinlist')].map((x) => x.scrollTop);
  setHTML('#others', otherHtml(o, briefOf(S.p), { sel: S.osel, life: S.olife, upto: S.p.birthYear + S.p.age }));
  document.querySelectorAll('#others .kinlist').forEach((x, i) => { x.scrollTop = lists[i] ?? 0; });
  mountRing($('#others .oring'), o, S.osel);
  paintFaces($('#others'), o);
}

// 「データ」の欄は開いている1つだけ作る
function renderData(): void {
  if (!S) return;
  const { p, tab } = S;
  document.querySelectorAll<HTMLButtonElement>('[data-act=tab]').forEach((b) => b.classList.toggle('on', b.dataset.v === tab));
  const html = tab === 'me' ? `<div class="datagrid"><div class="panel idcard">${idCard(p)}</div><div class="panel">${statsPanel(p)}</div><div class="panel">${familyPanel(p)}</div></div>`
    : tab === 'band' ? `<div class="datagrid two"><div class="panel"><h3>${L('人生の帯', 'Life band')} <small>${L('1本 = 1年', '1 bar = 1 year')}</small></h3>${lifeBand(p)}</div><div class="panel"><h3>${L('生存曲線', 'Survival curve')} <small>${L('同じ年に生まれた人のうち生きている割合', 'Share of the same birth cohort still alive')}</small></h3>${survivalChart(p)}</div></div>`
    : tab === 'compare' ? `<div class="datagrid two"><div class="panel">${comparePanel(p)}</div><div class="panel">${countryPanel(p)}</div></div>`
    : tab === 'log' ? `<div class="panel">${logPanel(p, S.logOpen)}</div>` : '';
  setHTML('#data', html);
  const pc = $<HTMLCanvasElement>('#portraitcv');
  if (pc) drawPortrait(pc, p);
}

// ピクセル画は整数倍で拡大する。枠が狭くて2倍に届かなければ枠いっぱいに
function fitPixels(cv: HTMLCanvasElement): void {
  const box = cv.parentElement!.clientWidth;
  const k = Math.floor(box / cv.width);
  cv.style.width = k >= 2 ? `${cv.width * k}px` : '100%';
}

// ---- 操作 -----------------------------------------------------------------

function onClick(e: MouseEvent): void {
  if (!S) return;
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!t || t.closest('#modal')) return;
  const v = t.dataset.v;
  switch (t.dataset.act) {
    case 'pause': S.paused = !S.paused; break;
    case 'speed': S.speed = Number(v); S.ff = false; break;
    case 'ff': S.ff = true; S.paused = false; break;
    case 'auto': S.p.auto = !S.p.auto; break;
    case 'music': S.music = !S.music; save('music', S.music); setMusic(S.music); break;
    case 'focus': S.p.focus = v as Focus; break;
    case 'logmore': S.logOpen = !S.logOpen; break;
    case 'person': if (t.closest('#others')) S.osel = v ? Number(v) : undefined; else S.sel = v ? Number(v) : undefined; break;
    case 'kinlife': if (t.closest('#others')) S.olife = !S.olife; else S.life = !S.life; break;
    case 'other': S.other = v ? Number(v) : undefined; S.osel = undefined; break;
    case 'tab': S.tab = S.tab === v ? '' : (v as Tab); break;
    case 'exit': confirmExit(); return;
    default: return;
  }
  render();
}

function openModal(html: string): void {
  if (!S) return;
  S.modal = true;
  S.ff = false;
  window.clearTimeout(S.timer);
  setHTML('#modalbody', html);
  $('#modal').hidden = false;
}
function closeModal(): void {
  if (!S) return;
  S.modal = false;
  window.clearTimeout(S.timer);
  $('#modal').hidden = true;
}

function nextModal(): void {
  if (!S) return;
  const { p } = S;
  if (p.pending.length) return showDecision(p.pending[0]);
  const q = p.questions.find((x) => x.a === undefined);
  if (q && p.alive) return showQuestion(q);
  if (!p.alive) {
    closeModal();
    finish();
    return;
  }
  closeModal();
  persist();
}

function showDecision(d: Decision): void {
  const p = S!.p;
  const auto = p.auto ? d.auto(p) : -1;
  openModal(`<p class="kicker">${L(`大きな決定・${p.age}歳・${p.birthYear + p.age}年`, `Big decision · age ${p.age} · ${p.birthYear + p.age}`)}</p><h2>${esc(d.title)}</h2><p>${esc(d.text)}</p>
    ${d.stat ? `<p class="statbox">${esc(d.stat)}</p>` : ''}
    <div class="cards">${d.options.map((o, i) => `<button data-i="${i}" class="${i === auto ? 'pre' : ''}"><span class="num">${i + 1}</span><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>
    <div class="modalfoot">${auto >= 0
      ? `<span class="countdown">${L(`まもなく「${esc(d.options[auto].label)}」で進む・カードを押すと止まる`, `Going with "${esc(d.options[auto].label)}" shortly. Tap a card to stop.`)}</span><button class="link" data-x="manual">${L('自分で選ぶ', 'Choose myself')}</button>`
      : `<button class="link" data-x="auto">${L('これからは自動で決める', 'Decide automatically from now on')}</button>`}</div>`);
  if (auto >= 0) S!.timer = window.setTimeout(() => decideNow(d, auto), AUTO_WAIT_MS);
  $('#modalbody').onclick = (e) => {
    const t = e.target as HTMLElement;
    const x = t.closest<HTMLElement>('[data-x]')?.dataset.x;
    if (x === 'manual') { S!.p.auto = false; render(); showDecision(d); return; }
    if (x === 'auto') { S!.p.auto = true; render(); decideNow(d, d.auto(S!.p)); return; }
    const b = t.closest<HTMLElement>('[data-i]');
    if (b) decideNow(d, Number(b.dataset.i));
  };
}

function decideNow(d: Decision, i: number): void {
  if (!S || S.p.pending[0] !== d) return;
  S.p.pending.shift();
  choose(S.p, d, i);
  settle(S.p);
  render();
  nextModal();
}

function questionContext(q: Question): string {
  const { p, others } = S!;
  // その年齢になった年の、生まれた国とあなたの国
  const b = countryAt(p.birthCountry, p.birthYear + q.age);
  const real = load<string | null>('realCountry', null);
  const r = real ? countryAt(real, p.birthYear + q.age) : null;
  const lines: string[] = [];
  if (q.age === 5) lines.push(isEn
    ? `In ${b.name}, about ${(b.u5mr * 100).toFixed(1)}% of children do not reach their fifth birthday. This child did.${r ? ` In ${r.name}, where you were born, it is ${(r.u5mr * 100).toFixed(1)}%.` : ''}`
    : `${b.name}では子どものおよそ${(b.u5mr * 100).toFixed(1)}%が5歳の誕生日を迎えられない。この子は迎えた。${r ? `あなたの生まれた${r.name}では${(r.u5mr * 100).toFixed(1)}%。` : ''}`);
  if (q.age === 15) lines.push(isEn
    ? (!p.school.enrolled ? `This child no longer goes to school. Adults in ${b.name} average ${b.school.toFixed(1)} years of schooling${r ? `; in ${r.name}, ${r.school.toFixed(1)}` : ''}.` : 'This child is in school.')
    : (!p.school.enrolled ? `この子はもう学校に通っていない。${b.name}の大人の平均教育年数は${b.school.toFixed(1)}年${r ? `、${r.name}は${r.school.toFixed(1)}年` : ''}。` : `この子は学校に通っている。`));
  lines.push(`${L('同じ1秒に生まれた人たち — ', 'Born in the same second: ')}${others.map((o) => `${o.given}${isEn ? ' ' : ''}(${byCode(o.birthCountry).name}): ${nowLine(o)}`).join(' / ')}`);
  return lines.map((l) => `<p>${esc(l)}</p>`).join('');
}

function showQuestion(q: Question): void {
  const p = S!.p;
  q.q ||= pauseQuestion(p, q.age) ?? '';
  openModal(`<p class="kicker">${L(`時間が止まった・${q.age}歳・${p.birthYear + q.age}年`, `Time stopped · age ${q.age} · ${p.birthYear + q.age}`)}</p><h2>${esc(p.given)}${L(`、${q.age}歳`, `, ${q.age}`)}</h2>
    <div class="context">${questionContext(q)}</div>
    <p class="q">${esc(q.q)}</p>
    <textarea id="answer" maxlength="140" rows="3" placeholder="${L('一行だけ(書かなくてもいい)', 'One line (optional)')}"></textarea>
    <div class="cards"><button data-a="write"><span class="num">1</span><b>${L('書き留めて生き続ける', 'Write it down, live on')}</b><small>${L('この人生の記録に残る', 'Kept in this life\'s record')}</small></button>
    <button data-a="keep"><span class="num">2</span><b>${L('胸にしまって生き続ける', 'Keep it to myself, live on')}</b></button></div>`);
  $('#modalbody').onclick = (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a || !S) return;
    const text = $<HTMLTextAreaElement>('#answer').value.trim();
    q.a = a === 'write' ? text : '';
    if (a === 'write' && text) S.p.log.push({ age: S.p.age, text: L(`「${text}」`, `"${text}"`), kind: S.p.kinds[S.p.age] ?? 'family' });
    render();
    nextModal();
  };
}

function confirmExit(): void {
  if (!S) return;
  const wasModal = S.modal;
  openModal(`<h2>${L('ここで中断する？', 'Stop here?')}</h2><p>${L('この人生はこの端末に保存され、トップ画面から続きを生きられる。', 'This life is saved on this device. You can continue it from the start screen.')}</p>
    <div class="cards"><button data-x="yes"><b>${L('中断してトップへ', 'Quit to start')}</b></button><button data-x="no"><b>${L('続ける', 'Keep going')}</b></button></div>`);
  $('#modalbody').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'yes') { persist(); return leave(); }
    if (wasModal) nextModal(); else closeModal();
  };
}

function leave(): void {
  if (!S) return;
  cancelAnimationFrame(S.raf);
  window.clearTimeout(S.timer);
  S.io?.disconnect();
  if (S.music) setMusic(false);
  const exit = S.onExit;
  S = null;
  exit();
}

// 自分が亡くなったあとも、同じ1秒の人たちは最後まで生きる
function finish(): void {
  if (!S) return;
  const { p, others, basis, onExit, music } = S;
  for (const o of others) while (o.alive) advanceYear(o);
  clearSaved();
  cancelAnimationFrame(S.raf);
  S.io?.disconnect();
  if (music) setMusic(false);
  S = null;
  // 急な死は、九死に一生と同じ場面で始まる (最後の一拍まで、どちらになるか分からない)。病や老いは静かな場面
  const scene = isAcute(p.cause) ? crisisScript(p, p.cause!, false) : declineScript(p);
  void playCrisis(scene, music).then(() => playFarewell(p, farewell(p), music)).then(() => {
    // 輪の誰かで続けるなら、その人のここまでの一生を次の主人公にして、同じ画面で始める
    showDeath(p, others, basis, onExit, (id) => {
      const q = continueAs(p, id);
      run(q, othersFor(q, basis), basis, 1, onExit);
      window.scrollTo(0, 0);
    });
  });
}
