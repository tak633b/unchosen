import { byCode, type BirthBasis, type Country } from '../engine/countries';
import { earnings, formatMoney, perDay } from '../engine/economy';
import { advanceYear, createPerson, settle } from '../engine/life';
import { lifeTable } from '../engine/lifetable';
import type { Decision, Focus, Person, Question } from '../engine/person';
import { randomSeed } from '../engine/rng';
import { drawCard, shareCard } from './cards';
import { lifeMap, survivalChart } from './charts';
import { $, esc, load, pct, save, setHTML } from './dom';
import { setMusic } from './music';

const YEAR_MS = 24000; // 1倍速で1年 = 24秒
const SPEEDS = [1, 2, 4, 8, 16];
const OTHERS = 4;
const MAX_PAST = 10;

export interface PastLife {
  seed: number; basis: BirthBasis; name: string; sex: Person['sex'];
  birthCountry: string; country: string; age: number; cause: string;
  log: Person['log']; kinds: Person['kinds']; questions: Question[]; message?: string; date: string;
}

export const pastLives = () => load<PastLife[]>('lives', []);

function toPast(p: Person, basis: BirthBasis): PastLife {
  return {
    seed: p.seed, basis, name: p.name, sex: p.sex, birthCountry: p.birthCountry, country: p.country,
    age: p.age, cause: p.cause ?? '', log: p.log, kinds: p.kinds, questions: p.questions, date: new Date().toISOString(),
  };
}

const FOCUS: [Focus, string, string][] = [
  ['health', '健康', '体をいたわる'],
  ['learn', '学び', '知識や技術を身につける'],
  ['work', '仕事', '稼ぎを増やす。体と家族の時間は減る'],
  ['family', '家族・人', '家族や友人と過ごす'],
  ['rest', '休む', '心を休める'],
];

interface GameState {
  p: Person;
  others: Person[];
  basis: BirthBasis;
  speed: number;
  paused: boolean;
  music: boolean;
  progress: number;
  modal: boolean;
  logOpen: boolean;
  raf: number;
  last: number;
  onExit: () => void;
}

let S: GameState | null = null;

export function startGame(p: Person, basis: BirthBasis, onExit: () => void): void {
  p.reflect = true;
  const others = Array.from({ length: OTHERS }, () => createPerson({ seed: randomSeed(), basis, auto: true }));
  S = { p, others, basis, speed: 1, paused: false, music: load('music', false), progress: 0, modal: false, logOpen: false, raf: 0, last: performance.now(), onExit };
  $('#app').innerHTML = shell();
  $('#app').onclick = onClick;
  if (S.music) setMusic(true);
  render();
  S.raf = requestAnimationFrame(frame);
}

function frame(t: number): void {
  if (!S) return;
  const dt = Math.min(250, t - S.last);
  S.last = t;
  if (!S.paused && !S.modal && S.p.alive) {
    S.progress += (dt * S.speed) / YEAR_MS;
    if (S.progress >= 1) {
      S.progress = 0;
      tick();
    }
  }
  const bar = $('#yearbar');
  if (bar) bar.style.width = `${S.progress * 100}%`;
  const month = $('#month');
  if (month) month.textContent = S.p.alive ? `${Math.floor(S.progress * 12)}か月` : '';
  S.raf = requestAnimationFrame(frame);
}

function tick(): void {
  if (!S) return;
  advanceYear(S.p);
  for (const o of S.others) advanceYear(o);
  render();
  nextModal();
}

// ---- 描画 -----------------------------------------------------------------

function shell(): string {
  return `
  <header class="topbar">
    <div class="who" id="who"></div>
    <div class="controls">
      <button data-act="pause" id="pausebtn" aria-label="一時停止">❚❚</button>
      <span class="speeds">${SPEEDS.map((s) => `<button data-act="speed" data-v="${s}">${s}×</button>`).join('')}</span>
      <label class="toggle"><input type="checkbox" id="autobtn"> 自動で決める</label>
      <button data-act="music" id="musicbtn" aria-label="音楽">♪</button>
      <button data-act="exit">終える</button>
    </div>
    <div class="yeartrack"><div id="yearbar"></div></div>
  </header>
  <main class="game">
    <section class="col">
      <div class="panel" id="stats"></div>
      <div class="panel" id="family"></div>
      <div class="panel" id="focus"></div>
      <div class="panel" id="log"></div>
    </section>
    <section class="col">
      <div class="panel" id="others"></div>
      <div class="panel" id="map"></div>
      <div class="panel" id="survival"></div>
      <div class="panel" id="compare"></div>
    </section>
  </main>
  <div class="modal-back" id="modal" hidden><div class="modal" id="modalbody"></div></div>`;
}

function render(): void {
  if (!S) return;
  const { p } = S;
  const c = byCode(p.country);
  const born = byCode(p.birthCountry);
  setHTML('#who', `<b>${esc(p.name)}</b>　${p.age}歳 <span id="month"></span>　${esc(c.name)}${p.migratedTo ? `(${esc(born.name)}生まれ)` : ''}・${p.sex === 'F' ? '女性' : '男性'}`);
  $('#pausebtn').textContent = S.paused ? '▶' : '❚❚';
  document.querySelectorAll<HTMLButtonElement>('[data-act=speed]').forEach((b) => b.classList.toggle('on', +b.dataset.v! === S!.speed));
  $<HTMLInputElement>('#autobtn').checked = p.auto;
  $('#musicbtn').classList.toggle('on', S.music);
  setHTML('#stats', statsPanel(p, c));
  setHTML('#family', familyPanel(p));
  setHTML('#focus', focusPanel(p));
  setHTML('#log', logPanel(p, S.logOpen));
  setHTML('#others', othersPanel(S.others));
  setHTML('#map', `<h3>人生地図 <small>1マス = 1年</small></h3>${lifeMap(p)}`);
  setHTML('#survival', `<h3>生存曲線</h3>${survivalChart(p)}`);
  setHTML('#compare', comparePanel(p));
}

const bar = (label: string, v: number) =>
  `<div class="stat"><span>${label}</span><div class="meter"><i style="width:${v.toFixed(0)}%"></i></div><b>${v.toFixed(0)}</b></div>`;

function statsPanel(p: Person, c: Country): string {
  const own = p.working && p.school.uni !== 'studying' && p.unemployed === 0;
  const income = own ? earnings(c, p.incomeP) * (p.retired ? 0.6 : 1) : earnings(c, p.familyP) / 1.6;
  const label = own ? (p.retired ? '年金・仕送り' : '年収') : '家の1人あたり所得';
  return `<h3>状態 <small>0–100</small></h3>
    ${bar('健康', p.stats.health)}${bar('幸福', p.stats.happy)}${bar('暮らし向き', p.stats.money)}${bar('学び', p.stats.learn)}${bar('つながり', p.stats.bond)}
    <p class="money">${label}: <b>${formatMoney(income)}</b>　<small>${perDay(income)}・購買力平価ドル</small></p>`;
}

function familyPanel(p: Person): string {
  const rel = (alive: boolean, age: number) => (alive ? `${age}歳` : '他界');
  const sibs = p.siblings.filter((s) => s.age >= 0);
  const sibDead = sibs.filter((s) => !s.alive).length;
  const kids = p.children.length;
  const kidsDead = p.children.filter((k) => !k.alive).length;
  const edu = p.school.uni === 'done' ? '大学卒' : p.school.uni === 'studying' ? '大学在学中'
    : p.school.enrolled ? `在学中(${p.school.years}年目)` : p.age < 6 ? '—' : `${p.school.years}年間の学校教育`;
  const rows: [string, string][] = [
    ['父', rel(p.father.alive, p.father.age)],
    ['母', rel(p.mother.alive, p.mother.age)],
    ['きょうだい', sibs.length ? `${sibs.length}人${sibDead ? `(うち${sibDead}人が他界)` : ''}` : 'なし'],
    ['連れ合い', p.spouse ? (p.spouse.alive ? `${p.spouse.age}歳` : '他界') : 'なし'],
    ['子ども', kids ? `${kids}人${kidsDead ? `(うち${kidsDead}人が他界)` : ''}` : 'なし'],
    ['住まい', `${byCode(p.country).name}・${p.migratedTo ? '都市' : p.rural ? '農村' : '町'}`],
    ['教育', edu],
    ['仕事', p.working ? (p.unemployed ? '失業中' : p.retired ? '引退' : p.job ?? '') : 'なし'],
  ];
  if (p.smoker) rows.push(['タバコ', '吸う']);
  if (p.hiv === 'treated') rows.push(['HIV', '治療中']);
  if (p.illness) rows.push(['病気', `${p.illness.name}`]);
  return `<h3>家族と暮らし</h3><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function focusPanel(p: Person): string {
  return `<h3>今年の焦点 <small>いつでも変えられる</small></h3><div class="focus">${FOCUS.map(([k, label, hint]) =>
    `<button data-act="focus" data-v="${k}" class="${p.focus === k ? 'on' : ''}" title="${hint}">${label}</button>`).join('')}</div>`;
}

function logPanel(p: Person, open: boolean): string {
  const items = [...p.log].reverse();
  const shown = open ? items : items.slice(0, 10);
  return `<h3>人生の記録</h3><ol class="log">${shown.map((e) =>
    `<li class="k-${e.kind}${e.big ? ' big' : ''}"><span class="age">${e.age}歳</span>${esc(e.text)}</li>`).join('')}</ol>
    ${items.length > 10 ? `<button class="link" data-act="logmore">${open ? '閉じる' : `もっと見る(${items.length})`}</button>` : ''}`;
}

function othersPanel(others: Person[]): string {
  return `<h3>同じ1秒に生まれた人たち</h3><ul class="others">${others.map((o) => {
    const c = byCode(o.country);
    const last = o.log.at(-1)!;
    const head = `${esc(byCode(o.birthCountry).name)}の${o.sex === 'F' ? '女の子' : '男の子'}`;
    const body = o.alive ? `${o.age}歳・${esc(c.name)}で暮らす。<small>${esc(last.text)}</small>` : `${o.age}歳で亡くなった(${esc(o.cause)})。`;
    return `<li class="${o.alive ? '' : 'gone'}"><b>${head}</b><br>${body}</li>`;
  }).join('')}</ul>`;
}

function comparePanel(p: Person): string {
  const real = load<string | null>('realCountry', null);
  const b = byCode(p.birthCountry);
  if (!real) return `<h3>あなたの出生地と比べる</h3><p class="note">トップ画面で実際に生まれた国を選ぶと、ここで並べて比べられます(この端末にだけ保存)。</p>`;
  const r = byCode(real);
  const le = (c: Country) => `${(p.sex === 'F' ? c.leF : c.leM).toFixed(1)}歳`;
  const rows: [string, (c: Country) => string][] = [
    ['平均寿命', le],
    ['5歳までに亡くなる子', (c) => pct(c.u5mr, 1)],
    ['1人当たりGDP', (c) => `$${Math.round(c.gdp).toLocaleString()}`],
    ['平均教育年数', (c) => `${c.school.toFixed(1)}年`],
    ['大学進学率', (c) => pct(Math.min(1, c.tertiary))],
    ['18歳未満で結婚する女性', (c) => pct(c.childMarriage)],
    ['生活満足度 (0–10)', (c) => c.happiness.toFixed(1)],
  ];
  return `<h3>あなたの出生地と比べる</h3><table class="cmp"><tr><th></th><th>${esc(b.name)}<small>この人生</small></th><th>${esc(r.name)}<small>あなた</small></th></tr>
    ${rows.map(([k, f]) => `<tr><td>${k}</td><td>${f(b)}</td><td>${f(r)}</td></tr>`).join('')}</table>`;
}

// ---- 操作 -----------------------------------------------------------------

function onClick(e: MouseEvent): void {
  if (!S) return;
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  const auto = (e.target as HTMLElement).closest('#autobtn');
  if (auto) { setAuto($<HTMLInputElement>('#autobtn').checked); return; }
  if (!t) return;
  const v = t.dataset.v;
  switch (t.dataset.act) {
    case 'pause': S.paused = !S.paused; break;
    case 'speed': S.speed = Number(v); break;
    case 'music': S.music = !S.music; save('music', S.music); setMusic(S.music); break;
    case 'focus': S.p.focus = v as Focus; break;
    case 'logmore': S.logOpen = !S.logOpen; break;
    case 'exit': confirmExit(); return;
    default: return;
  }
  render();
}

function setAuto(on: boolean): void {
  if (!S) return;
  S.p.auto = on;
  if (on && S.p.pending.length && S.modal) {
    // 開いている意思決定も自動で決めて先へ進む
    const d = S.p.pending.shift()!;
    choose(d, d.auto(S.p));
  }
}

function openModal(html: string): void {
  if (!S) return;
  S.modal = true;
  setHTML('#modalbody', html);
  $('#modal').hidden = false;
}
function closeModal(): void {
  if (!S) return;
  S.modal = false;
  $('#modal').hidden = true;
}

function nextModal(): void {
  if (!S) return;
  const { p } = S;
  if (p.pending.length) return showDecision(p.pending[0]);
  const q = p.questions.find((x) => x.a === undefined);
  if (q && p.alive) return showQuestion(q);
  if (!p.alive) return showDeath();
  closeModal();
}

function showDecision(d: Decision): void {
  openModal(`<p class="kicker">${S!.p.age}歳</p><h2>${esc(d.title)}</h2><p>${esc(d.text)}</p>
    <div class="choices">${d.options.map((o, i) => `<button data-i="${i}">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>`);
  $('#modalbody').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!b || !S) return;
    S.p.pending.shift();
    choose(d, Number(b.dataset.i));
  };
}

function choose(d: Decision, i: number): void {
  if (!S) return;
  d.options[i].apply(S.p);
  settle(S.p);
  render();
  nextModal();
}

function showQuestion(q: Question): void {
  openModal(`<p class="kicker">${q.age}歳・時間が止まった</p><h2>${esc(q.q)}</h2>
    <textarea id="answer" maxlength="140" rows="3" placeholder="一行だけ(書かなくてもいい)"></textarea>
    <div class="choices"><button data-act="answer">先へ進む</button></div>`);
  $('#modalbody').onclick = (e) => {
    if (!(e.target as HTMLElement).closest('[data-act=answer]')) return;
    q.a = $<HTMLTextAreaElement>('#answer').value.trim();
    nextModal();
  };
}

function confirmExit(): void {
  if (!S) return;
  const wasModal = S.modal;
  openModal(`<h2>この人生を途中で終える？</h2><p>ここまでの記録は残りません。</p>
    <div class="choices"><button data-x="yes">終える</button><button data-x="no">続ける</button></div>`);
  $('#modalbody').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-x]');
    if (!b) return;
    if (b.dataset.x === 'yes') return leave();
    if (wasModal) nextModal(); else closeModal();
  };
}

function leave(): void {
  if (!S) return;
  cancelAnimationFrame(S.raf);
  if (S.music) setMusic(false);
  const exit = S.onExit;
  S = null;
  exit();
}

// ---- 人生の終わり ---------------------------------------------------------

export function deathSummary(life: PastLife): string {
  const b = byCode(life.birthCountry);
  const c = byCode(life.country);
  const l = lifeTable(b, life.sex).l;
  const earlier = 1 - l[Math.min(110, life.age)];
  const e0 = life.sex === 'F' ? b.leF : b.leM;
  const moments = life.log.filter((e) => e.big && e.kind !== 'death').slice(-8);
  const answers = life.questions.filter((q) => q.a);
  return `<p class="kicker">${esc(b.name)}に生まれ、${life.country !== life.birthCountry ? `${esc(c.name)}で` : ''}${life.age}歳で</p>
    <h2>${esc(life.name)}の一生</h2>
    <p>死因: <b>${esc(life.cause)}</b>。${esc(b.name)}の${life.sex === 'F' ? '女性' : '男性'}の平均寿命は${e0.toFixed(1)}歳。
    同じ年に生まれた人のうち <b>${pct(earlier)}</b> がこれより早く亡くなる。</p>
    <ol class="log moments">${moments.map((e) => `<li><span class="age">${e.age}歳</span>${esc(e.text)}</li>`).join('')}</ol>
    ${answers.length ? `<h3>止まった時間に書いたこと</h3><ul class="answers">${answers.map((q) => `<li><small>${q.age}歳・${esc(q.q)}</small><br>${esc(q.a)}</li>`).join('')}</ul>` : ''}
    ${life.message ? `<p class="message">「${esc(life.message)}」</p>` : ''}`;
}

export function deathCard(life: PastLife): HTMLCanvasElement {
  const b = byCode(life.birthCountry);
  const moments = life.log.filter((e) => e.big && e.kind !== 'death').slice(-3).map((e) => `${e.age}歳　${e.text}`);
  return drawCard({ kicker: `${b.name}に生まれた${life.sex === 'F' ? '女性' : '男性'}`, title: `${life.name}、${life.age}歳で(${life.cause})`, lines: moments, foot: '80億分の1 — 一度きりの人生' });
}

function showDeath(): void {
  if (!S) return;
  const { p, basis } = S;
  const life = toPast(p, basis);
  const lives = [life, ...pastLives()].slice(0, MAX_PAST);
  save('lives', lives);
  openModal(`${deathSummary(life)}
    <h3>この人に一言</h3>
    <textarea id="msg" maxlength="200" rows="2" placeholder="おつかれさま、など"></textarea>
    <label class="toggle"><input type="checkbox" id="tomemorial" checked> 追悼館に残す(名前は残りません)</label>
    <div class="choices">
      <button data-d="done">見送る</button>
      <button data-d="card">記録カードを保存</button>
    </div>`);
  $('#modalbody').onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
    if (!b || !S) return;
    if (b.dataset.d === 'card') { await shareCard(deathCard(life), 'life.png'); return; }
    const message = $<HTMLTextAreaElement>('#msg').value.trim();
    if (message) { life.message = message; save('lives', [life, ...lives.slice(1)]); }
    if ($<HTMLInputElement>('#tomemorial').checked) await postMemorial(life);
    leave();
  };
}

async function postMemorial(life: PastLife): Promise<void> {
  const highlight = life.log.filter((e) => e.big && e.kind !== 'death').at(-1)?.text ?? '';
  try {
    await fetch('/api/memorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: life.birthCountry, sex: life.sex, age: life.age, cause: life.cause, line: highlight, message: life.message ?? '' }),
    });
  } catch {
    // 追悼館に届かなくても、前世の記録には残っている
  }
}
