import './style.css';
import { COUNTRIES, byCode, totalOf, type BirthBasis } from './engine/countries';
import { earnings, formatMoney } from './engine/economy';
import { createPerson } from './engine/life';
import type { Person } from './engine/person';
import { randomSeed } from './engine/rng';
import { drawCard, shareCard } from './ui/cards';
import { deathCard, deathRecord, pastLives } from './ui/death';
import { $, esc, load, pct, save } from './ui/dom';
import { clearSaved, hasSaved, resumeGame, sameSecondOthers, startWithOthers } from './ui/game';
import { aiPanel, bindAiPanel, handleAiClick } from './ui/aipanel';
import { paintScenes, sceneAttr, sceneFromSummary, sceneOf, toData } from './ui/pixel';

const app = $('#app');
// 世界では1秒に約4.2人が生まれ、約2人が亡くなる (国連世界人口推計 2024)
const BIRTHS_PER_SEC = 4.2;
const DEATHS_PER_SEC = 2.0;
let counterTimer: number | undefined;

interface Shared { id: number; rural: number; job: string; name: string; country: string; sex: 'F' | 'M'; age: number; cause: string; line: string; message: string; candles: number; createdAt: string }

async function fetchShared(): Promise<Shared[]> {
  try {
    const r = await fetch('/api/memorial');
    const j = await r.json();
    return j.success ? (j.data as Shared[]) : [];
  } catch {
    return [];
  }
}

const sharedCard = (m: Shared) => {
  const c = COUNTRIES.find((x) => x.code === m.country);
  const scene = c ? `<canvas class="pixscene" data-scene="${sceneAttr(toData(sceneFromSummary({ id: m.id, country: m.country, sex: m.sex, age: m.age, rural: !!m.rural, job: m.job })))}"></canvas>` : '';
  return `<li>${scene}<p><b>${esc(m.name || 'ある人')}</b>　<small>${esc(c?.name ?? m.country)}・${m.sex === 'F' ? '女性' : '男性'}・${Number(m.age)}歳</small></p>
    <p class="note">${esc(m.line)}</p>${m.message ? `<p class="message">「${esc(m.message)}」</p>` : ''}
    <button data-candle="${Number(m.id)}">ろうそくを灯す ${Number(m.candles)}</button></li>`;
};

// ---- トップ ---------------------------------------------------------------

function home(): void {
  window.clearInterval(counterTimer);
  const basis = load<BirthBasis>('basis', 'births');
  const real = load<string | null>('realCountry', null);
  const saved = hasSaved();
  const total = totalOf(basis);
  const top = [...COUNTRIES].sort((a, b) => b[basis] - a[basis]).slice(0, 9);
  const rest = 1 - top.reduce((s, c) => s + c[basis], 0) / total;
  const opts = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((c) => `<option value="${c.code}" ${c.code === real ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  app.onclick = null;
  app.innerHTML = `
  <main class="home wide">
    <div class="hero">
      <div>
        <p class="kicker">β版・無料の人生シミュレーション・${COUNTRIES.length}か国の実際の統計にもとづく</p>
        <h1 class="title">Un<span>chosen</span></h1><p class="subtitle">生まれは、選べない。</p>
        <p class="lead">今この瞬間にも、1秒に4人ほどの赤ちゃんが生まれている。そのひとりになって、一度きりの人生を最後まで生きる。どこで、誰の子として生まれるかは選べない。あなたがそうだったように。</p>
        <div class="counters"><div><b id="cb">0</b><small>このページを開いてから生まれた赤ちゃん</small></div><div><b id="cd">0</b><small>同じ間に亡くなった人</small></div></div>
      </div>
      <div class="panel odds">
        <h3>${basis === 'births' ? '今生まれる赤ちゃんなら' : '今生きている80億人なら'} <small>国連世界人口推計 2024</small></h3>
        ${top.map((c) => `<div class="odd"><span>${esc(c.name)}</span><i style="width:${((c[basis] / total) * 100 / (top[0][basis] / total)).toFixed(1)}%"></i><b>${pct(c[basis] / total, 1)}</b></div>`).join('')}
        <div class="odd rest"><span>ほか${COUNTRIES.length - 9}か国</span><i style="width:100%"></i><b>${pct(rest, 1)}</b></div>
      </div>
    </div>
    <div class="panel start">
      <div class="startgrid">
        <fieldset><legend>生まれる国の決め方</legend>
          <div class="seg"><button data-basis="births" class="${basis === 'births' ? 'on' : ''}">今生まれる赤ちゃん</button><button data-basis="pop" class="${basis === 'pop' ? 'on' : ''}">今生きている80億人</button></div>
          <p class="note">出生数なら国ごとの年間出生数で、人口なら人口の割合で選ぶ。どちらでも0歳から始まる。</p></fieldset>
        <label class="field">あなたが実際に生まれた国(任意)
          <select id="real"><option value="">選ばない</option>${opts}</select>
          <span class="note">選ぶと、この人生とあなたの人生を並べて比べる。この端末にだけ保存。</span></label>
      </div>
      <div class="choices">
        <button class="primary" data-go="born">生まれる</button>
        ${saved ? `<button data-go="resume">続きから・${esc(byCode(saved.p.country).name)}、${saved.p.age}歳の${esc(saved.p.name)}</button>` : ''}
      </div>
      <p class="note">平均寿命まで生きると約30分(1倍速で1年 ≈ 26秒)。止めることも早送りもできる。途中で閉じても、この端末に保存される。乳幼児の死、児童婚、病気など重い出来事も統計どおりに起こる。15歳以上向け。</p>
    </div>
    ${aiPanel()}
    <section><h2>みんなの人生</h2><p class="note">それぞれが生きた人生と、その人への一言。プレイした人の名前や連絡先は残らない。</p><ul class="memorial" id="shared"><li>読み込み中…</li></ul></section>
    <nav class="homenav"><button data-go="past">前世の記録</button><button data-go="about">データについて</button></nav>
  </main>`;
  const t0 = performance.now();
  counterTimer = window.setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    const cb = document.getElementById('cb');
    if (!cb) return window.clearInterval(counterTimer);
    cb.textContent = Math.floor(s * BIRTHS_PER_SEC).toLocaleString();
    $('#cd').textContent = Math.floor(s * DEATHS_PER_SEC).toLocaleString();
  }, 250);
  void fetchShared().then((list) => {
    const el = document.getElementById('shared');
    if (el) { el.innerHTML = list.length ? list.slice(0, 12).map(sharedCard).join('') : '<li>まだ誰もいない。</li>'; paintScenes(el); }
  });
  $('#real').onchange = (e) => save('realCountry', (e.target as HTMLSelectElement).value || null);
  bindAiPanel();
  app.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (await handleAiClick(t)) return;
    const b = t.closest<HTMLElement>('[data-basis]')?.dataset.basis;
    if (b) { save('basis', b); home(); return; }
    const candle = t.closest<HTMLButtonElement>('[data-candle]');
    if (candle && !candle.disabled) { await light(candle); return; }
    const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'born') {
      if (saved) clearSaved();
      roll(createPerson({ seed: randomSeed(), basis }), basis);
    }
    if (go === 'resume') resumeGame(home);
    if (go === 'past') past();
    if (go === 'about') about();
  };
}

async function light(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  try {
    const r = await fetch(`/api/memorial/${btn.dataset.candle}/candle`, { method: 'POST' });
    const j = await r.json();
    if (j.success) btn.textContent = `ろうそくを灯した ${Number(j.data.candles)}`;
  } catch { btn.disabled = false; }
}

// ---- 生まれる国のくじ -----------------------------------------------------

function roll(p: Person, basis: BirthBasis): void {
  window.clearInterval(counterTimer);
  const total = totalOf(basis);
  app.innerHTML = `<main class="home roll"><p class="kicker">生まれる場所を決めている</p><h1 id="rollname"></h1><p id="rollodds" class="lead"></p></main>`;
  let i = 0;
  const steps = 18;
  const timer = window.setInterval(() => {
    const c = i < steps ? COUNTRIES[Math.floor(Math.random() * 40)] : byCode(p.birthCountry);
    $('#rollname').textContent = c.name;
    $('#rollodds').textContent = `確率 ${pct(c[basis] / total, 1)}`;
    if (++i > steps) { window.clearInterval(timer); setTimeout(() => born(p, basis), 900); }
  }, 70 + i * 6);
}

// ---- 出生届 ---------------------------------------------------------------

function born(p: Person, basis: BirthBasis): void {
  const c = byCode(p.birthCountry);
  const share = c[basis] / total(basis);
  const e0 = p.sex === 'F' ? c.leF : c.leM;
  const others = sameSecondOthers(basis);
  const real = load<string | null>('realCountry', null);
  const r = real ? byCode(real) : null;
  const fields: [string, string][] = [
    ['性別', p.sex === 'F' ? '女性' : '男性'], ['出生国', c.name], ['出生地', p.city ? `${p.city}(都市)` : '農村'],
    ['生まれた家', `${'●'.repeat(Math.min(5, Math.floor(p.familyP * 5) + 1))} ${Math.min(5, Math.floor(p.familyP * 5) + 1)}分位`],
    ['親の年齢', `母 ${p.mother.age}歳・父 ${p.father.age}歳`], ['宗教', p.religion],
    ['平均寿命', `${e0.toFixed(1)}歳`], ['5歳までに亡くなる確率', pct(c.u5mr, 1)], ['1人当たりGDP (PPP)', `$${Math.round(c.gdp).toLocaleString()}`],
  ];
  const perYear = Math.round(c.births / 1e4);
  const oneIn = Math.round(total('births') / c.births);
  const cmp: [string, (x: typeof c) => string][] = [
    ['平均寿命', (x) => `${(p.sex === 'F' ? x.leF : x.leM).toFixed(1)}歳`],
    ['5歳までに亡くなる確率', (x) => pct(x.u5mr, 1)],
    ['平均教育年数', (x) => `${x.school.toFixed(1)}年`],
    ['1人当たりGDP (PPP)', (x) => `$${Math.round(x.gdp).toLocaleString()}`],
  ];
  app.innerHTML = `
  <main class="home">
    <article class="cert">
      <header><span>出生届</span><span>No. ${c.code}-${p.birthYear}-${String(p.seed % 1e7).padStart(7, '0')}</span></header>
      <canvas class="pixscene" data-scene="${sceneAttr(toData(sceneOf(p)))}"></canvas>
      <p class="kicker">名前</p><h1>${esc(p.name)}</h1>
      <p class="lead">${esc(p.log[0].text)}</p>
      <p class="note">平均寿命まで生きると約30分(1年 ≈ 26秒)。途中で閉じてもこの端末に保存され、続きから生きられる。</p>
      <dl class="fields">${fields.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="statbox">今生まれる赤ちゃんの ${pct(c.births / total('births'), 1)} が${esc(c.name)}で生まれる。年に約${perYear.toLocaleString()}万人、${oneIn}人に1人。${share !== c.births / total('births') ? `(人口で数えると ${pct(share, 1)})` : ''}</p>
      ${r ? `<table class="cmp"><tr><th>同じ日に生まれたら</th><th>あなたの${esc(r.name)}</th><th>この子の${esc(c.name)}</th></tr>${cmp.map(([k, f]) => `<tr><td>${k}</td><td>${f(r)}</td><td><b>${f(c)}</b></td></tr>`).join('')}</table>` : ''}
      <h3>同じ1秒に、地球のどこかで生まれた人たち</h3>
      <ul class="certothers">${others.map((o) => `<li><b>${esc(o.name)}</b><span>${esc(byCode(o.birthCountry).name)}${o.city ? ` ${esc(o.city)}` : '・農村'}・${o.sex === 'F' ? '女' : '男'}・${o.familyP < 0.2 ? 'いちばん貧しい家' : o.familyP < 0.4 ? '余裕のない家' : o.familyP < 0.8 ? 'ふつうの家' : '裕福な家'}</span></li>`).join('')}</ul>
      <p class="note">この人たちの人生も同じ統計にしたがって最後まで流れていく。あなたのそばで一緒に見ていく。</p>
      <p class="note">所得の真ん中の人の年収: ${formatMoney(earnings(c, 0.5))}</p>
      <div class="choices">
        <button data-go="card">出生カードを保存</button>
        <button class="primary" data-go="live">人生を始める</button>
      </div>
    </article>
  </main>`;
  window.scrollTo(0, 0);
  paintScenes(app);
  app.onclick = async (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'live') startWithOthers(p, others, basis, home);
    if (go === 'card') {
      await shareCard(drawCard({
        kicker: `出生届・${p.birthYear}年${p.birthMonth}月`, title: p.name,
        lines: [p.log[0].text, `今生まれる赤ちゃんの ${pct(c.births / total('births'), 1)}・平均寿命 ${e0.toFixed(1)}歳`],
        foot: 'Unchosen — 生まれは、選べない',
        scene: toData(sceneOf(p)),
      }), 'birth.png');
    }
  };
}

const total = (basis: BirthBasis) => totalOf(basis);

// ---- 前世の記録 -----------------------------------------------------------

function past(): void {
  const lives = pastLives();
  app.innerHTML = `
  <main class="home wide">
    <h1>前世の記録</h1>
    <p class="note">最近の${lives.length}つの人生(最大10)。この端末にだけ残っている。</p>
    <ul class="pastlist">${lives.map((l, i) => `
      <li><button data-i="${i}"><b>${esc(l.name)}</b>　${esc(byCode(l.birthCountry).name)}・${l.sex === 'F' ? '女性' : '男性'}・${l.age}歳(${esc(l.cause)})
      <small>${new Date(l.date).toLocaleDateString('ja-JP')}</small></button></li>`).join('') || '<li>まだない。</li>'}</ul>
    <div id="pastdetail"></div>
    <button data-go="home">戻る</button>
  </main>`;
  app.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const i = t.closest<HTMLElement>('[data-i]')?.dataset.i;
    if (i !== undefined) {
      $('#pastdetail').innerHTML = `${deathRecord(lives[Number(i)])}<div class="choices"><button data-card="${Number(i)}">記録カードを保存</button></div>`;
      paintScenes($('#pastdetail'));
      $('#pastdetail').scrollIntoView();
    }
    const card = t.closest<HTMLElement>('[data-card]')?.dataset.card;
    if (card !== undefined) await shareCard(deathCard(lives[Number(card)]), 'life.png');
    if (t.closest('[data-go=home]')) home();
  };
}

// ---- データについて -------------------------------------------------------

function about(): void {
  app.innerHTML = `
  <main class="home about">
    <h1>データについて</h1>
    <p>国ごとの指標(${COUNTRIES.length}か国、人口50万人以上): 年間出生数・人口、男女別の平均寿命、乳児死亡率・5歳未満死亡率、1人当たりGDP(購買力平価)、ジニ係数、平均教育年数、高等教育就学率、農業従事者の割合、合計特殊出生率、妊産婦死亡率、HIV陽性率、殺人発生率、喫煙率、医療費の自己負担割合、18歳未満で結婚した女性の割合、生活満足度。</p>
    <p>出典: 国連世界人口推計、UN IGME、世界銀行 WDI、WHO、UNESCO UIS、UNDP、ILO、UNAIDS、UNODC、UNICEF、World Happiness Report(いずれも Our World in Data 経由)。2024年以前で最新の値を使っている。</p>
    <p>亡くなる時期: 乳児・5歳未満死亡率と男女別の平均寿命に合うよう、国と性別ごとに生命表を組み立てている。健康・所得・喫煙・酒・病気の治療で、その人の死亡率は上下する。</p>
    <p>死因: 年齢帯ごとの構成(WHO・GBD のおおまかな形)を、国の豊かさや地域、喫煙で重み付けしている。他殺は殺人発生率から。交通事故の重みは所得からの推計。</p>
    <p>所得: 国ごとの所得分布(ジニ係数から決めた対数正規分布)の中で、家と仕事の位置が決まる。金額は購買力平価ドルと、日本の物価での円換算(1ドル≒95円)を並べている。</p>
    <p>欠けている値は、同じ地域で1人当たりGDPが近い国から推計している。高所得国の児童婚率は1%としている。自殺は実際には主要な死因の一つだが、このゲームでは扱わない。</p>
    <button data-go="home">戻る</button>
  </main>`;
  app.onclick = (e) => { if ((e.target as HTMLElement).closest('[data-go=home]')) home(); };
}

home();
