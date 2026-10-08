import './style.css';
import { COUNTRIES, byCode, totalOf, type BirthBasis } from './engine/countries';
import { earnings, formatMoney } from './engine/economy';
import { causeName } from './engine/causes';
import { createPerson } from './engine/life';
import type { Person } from './engine/person';
import { randomSeed } from './engine/rng';
import { drawCard, shareCard } from './ui/cards';
import { deathCard, deathRecord, pastLives } from './ui/death';
import { $, esc, load, pct, save } from './ui/dom';
import { clearSaved, hasSaved, resumeGame, sameSecondOthers, startWithOthers } from './ui/game';
import { aiPanel, bindAiPanel, handleAiClick } from './ui/aipanel';
import { paintScenes, sceneAttr, sceneFromSummary, sceneOf, toData } from './ui/pixel';
import { isEn, L, lang, religionName, setLang } from './i18n';

const app = $('#app');
// 世界では1秒に約4.2人が生まれ、約2人が亡くなる (国連世界人口推計 2024)
const BIRTHS_PER_SEC = 4.2;
const DEATHS_PER_SEC = 2.0;
let counterTimer: number | undefined;
document.documentElement.lang = lang;
if (isEn) document.title = 'Unchosen. You don’t choose where you’re born.';
const sexWord = (s: 'F' | 'M') => (s === 'F' ? L('女性', 'female') : L('男性', 'male'));

interface Shared { id: number; rural: number; job: string; name: string; country: string; sex: 'F' | 'M'; age: number; cause: string; line: string; message: string; candles: number; createdAt: string }

async function fetchShared(): Promise<Shared[]> {
  try {
    const r = await fetch(`/api/memorial?lang=${lang}`);
    const j = await r.json();
    return j.success ? (j.data as Shared[]) : [];
  } catch {
    return [];
  }
}

const sharedCard = (m: Shared) => {
  const c = COUNTRIES.find((x) => x.code === m.country);
  const scene = c ? `<canvas class="pixscene" data-scene="${sceneAttr(toData(sceneFromSummary({ id: m.id, country: m.country, sex: m.sex, age: m.age, rural: !!m.rural, job: m.job })))}"></canvas>` : '';
  return `<li>${scene}<p><b>${esc(m.name || L('ある人', 'Someone'))}</b>　<small>${esc(c?.name ?? m.country)}${L('・', ', ')}${sexWord(m.sex)}${L('・', ', ')}${L(`${Number(m.age)}歳`, `age ${Number(m.age)}`)}</small></p>
    <p class="note">${esc(m.line)}</p>${m.message ? `<p class="message">${L('「', '"')}${esc(m.message)}${L('」', '"')}</p>` : ''}
    <button data-candle="${Number(m.id)}">${L('ろうそくを灯す', 'Light a candle')} ${Number(m.candles)}</button></li>`;
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
  const opts = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, lang))
    .map((c) => `<option value="${c.code}" ${c.code === real ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  app.onclick = null;
  app.innerHTML = `
  <main class="home wide">
    <div class="langsw"><span class="seg"><button data-lang="ja" class="${lang === 'ja' ? 'on' : ''}" lang="ja">日本語</button><button data-lang="en" class="${lang === 'en' ? 'on' : ''}" lang="en">English</button></span></div>
    <div class="hero">
      <div>
        <p class="kicker">${L(`β版・無料の人生シミュレーション・${COUNTRIES.length}か国の実際の統計にもとづく`, `Beta. A free life simulator built on real statistics from ${COUNTRIES.length} countries.`)}</p>
        <h1 class="title">Un<span>chosen</span></h1><p class="subtitle">${L('生まれは、選べない。', 'You don’t choose where you’re born.')}</p>
        <p class="lead">${L('今この瞬間にも、1秒に4人ほどの赤ちゃんが生まれている。そのひとりになって、一度きりの人生を最後まで生きる。どこで、誰の子として生まれるかは選べない。あなたがそうだったように。', 'Right now, about four babies are born every second. Become one of them and live a single life to the end. You don’t get to choose where, or to whom, you are born. Neither did you.')}</p>
        <div class="counters"><div><b id="cb">0</b><small>${L('このページを開いてから生まれた赤ちゃん', 'babies born since you opened this page')}</small></div><div><b id="cd">0</b><small>${L('同じ間に亡くなった人', 'people who died in the same time')}</small></div></div>
      </div>
      <div class="panel odds">
        <h3>${basis === 'births' ? L('今生まれる赤ちゃんなら', 'If you were born today') : L('今生きている80億人なら', 'Among the 8 billion alive today')} <small>${L('国連世界人口推計 2024', 'UN World Population Prospects 2024')}</small></h3>
        ${top.map((c) => `<div class="odd"><span>${esc(c.name)}</span><i style="width:${((c[basis] / total) * 100 / (top[0][basis] / total)).toFixed(1)}%"></i><b>${pct(c[basis] / total, 1)}</b></div>`).join('')}
        <div class="odd rest"><span>${L(`ほか${COUNTRIES.length - 9}か国`, `${COUNTRIES.length - 9} other countries`)}</span><i style="width:100%"></i><b>${pct(rest, 1)}</b></div>
      </div>
    </div>
    <div class="panel start">
      <div class="startgrid">
        <fieldset><legend>${L('生まれる国の決め方', 'How your country is drawn')}</legend>
          <div class="seg"><button data-basis="births" class="${basis === 'births' ? 'on' : ''}">${L('今生まれる赤ちゃん', 'Babies born today')}</button><button data-basis="pop" class="${basis === 'pop' ? 'on' : ''}">${L('今生きている80億人', 'All 8 billion alive')}</button></div>
          <p class="note">${L('出生数なら国ごとの年間出生数で、人口なら人口の割合で選ぶ。どちらでも0歳から始まる。', 'By births, weighted by each country’s annual births. By population, by its share of people alive. Either way you start at age 0.')}</p></fieldset>
        <label class="field">${L('あなたが実際に生まれた国(任意)', 'The country you were actually born in (optional)')}
          <select id="real"><option value="">${L('選ばない', 'Skip')}</option>${opts}</select>
          <span class="note">${L('選ぶと、この人生とあなたの人生を並べて比べる。この端末にだけ保存。', 'If set, this life is compared side by side with yours. Saved only on this device.')}</span></label>
      </div>
      <div class="choices">
        <button class="primary" data-go="born">${L('生まれる', 'Be born')}</button>
        ${saved ? `<button data-go="resume">${L(`続きから・${esc(byCode(saved.p.country).name)}、${saved.p.age}歳の${esc(saved.p.name)}`, `Continue: ${esc(saved.p.name)}, ${saved.p.age}, ${esc(byCode(saved.p.country).name)}`)}</button>` : ''}
      </div>
      <p class="note">${L('平均寿命まで生きると約30分(1倍速で1年 ≈ 26秒)。止めることも早送りもできる。途中で閉じても、この端末に保存される。乳幼児の死、児童婚、病気など重い出来事も統計どおりに起こる。15歳以上向け。', 'A life to average life expectancy takes about 30 minutes (1 year ≈ 26 seconds at 1x). You can pause or speed up. If you close the page, it is saved on this device. Hard events such as infant death, child marriage and illness happen at their real rates. For ages 15 and up.')}</p>
    </div>
    ${aiPanel()}
    <section><h2>${L('みんなの人生', 'Lives others lived')}</h2><p class="note">${L('それぞれが生きた人生と、その人への一言。プレイした人の名前や連絡先は残らない。', 'Lives that players lived, and a few words for each. No names or contact details of players are kept.')}</p><ul class="memorial" id="shared"><li>${L('読み込み中…', 'Loading…')}</li></ul></section>
    <nav class="homenav"><button data-go="past">${L('前世の記録', 'Past lives')}</button><button data-go="about">${L('データについて', 'About the data')}</button></nav>
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
    if (el) { el.innerHTML = list.length ? list.slice(0, 12).map(sharedCard).join('') : `<li>${L('まだ誰もいない。', 'No one yet.')}</li>`; paintScenes(el); }
  });
  $('#real').onchange = (e) => save('realCountry', (e.target as HTMLSelectElement).value || null);
  bindAiPanel();
  app.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (await handleAiClick(t)) return;
    const lg = t.closest<HTMLElement>('[data-lang]')?.dataset.lang;
    if ((lg === 'ja' || lg === 'en') && lg !== lang) { setLang(lg); return; }
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
    if (j.success) btn.textContent = `${L('ろうそくを灯した', 'Candle lit')} ${Number(j.data.candles)}`;
  } catch { btn.disabled = false; }
}

// ---- 生まれる国のくじ -----------------------------------------------------

function roll(p: Person, basis: BirthBasis): void {
  window.clearInterval(counterTimer);
  const total = totalOf(basis);
  app.innerHTML = `<main class="home roll"><p class="kicker">${L('生まれる場所を決めている', 'Choosing where you are born')}</p><h1 id="rollname"></h1><p id="rollodds" class="lead"></p></main>`;
  let i = 0;
  const steps = 18;
  const timer = window.setInterval(() => {
    const c = i < steps ? COUNTRIES[Math.floor(Math.random() * 40)] : byCode(p.birthCountry);
    $('#rollname').textContent = c.name;
    $('#rollodds').textContent = `${L('確率', 'Odds')} ${pct(c[basis] / total, 1)}`;
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
  const quint = Math.min(5, Math.floor(p.familyP * 5) + 1);
  const fields: [string, string][] = [
    [L('性別', 'Sex'), sexWord(p.sex)], [L('出生国', 'Country'), c.name], [L('出生地', 'Birthplace'), p.city ? L(`${p.city}(都市)`, `${p.city} (city)`) : L('農村', 'Rural')],
    [L('生まれた家', 'Family income'), `${'●'.repeat(quint)} ${L(`${quint}分位`, `quintile ${quint} of 5`)}`],
    [L('親の年齢', 'Parents’ ages'), L(`母 ${p.mother.age}歳・父 ${p.father.age}歳`, `mother ${p.mother.age}, father ${p.father.age}`)], [L('宗教', 'Religion'), religionName(p.religion)],
    [L('平均寿命', 'Life expectancy'), L(`${e0.toFixed(1)}歳`, e0.toFixed(1))], [L('5歳までに亡くなる確率', 'Chance of dying before 5'), pct(c.u5mr, 1)], [L('1人当たりGDP (PPP)', 'GDP per person (PPP)'), `$${Math.round(c.gdp).toLocaleString()}`],
  ];
  const perYear = Math.round(c.births / 1e4);
  const oneIn = Math.round(total('births') / c.births);
  const cmp: [string, (x: typeof c) => string][] = [
    [L('平均寿命', 'Life expectancy'), (x) => L(`${(p.sex === 'F' ? x.leF : x.leM).toFixed(1)}歳`, (p.sex === 'F' ? x.leF : x.leM).toFixed(1))],
    [L('5歳までに亡くなる確率', 'Chance of dying before 5'), (x) => pct(x.u5mr, 1)],
    [L('平均教育年数', 'Average years of school'), (x) => L(`${x.school.toFixed(1)}年`, x.school.toFixed(1))],
    [L('1人当たりGDP (PPP)', 'GDP per person (PPP)'), (x) => `$${Math.round(x.gdp).toLocaleString()}`],
  ];
  app.innerHTML = `
  <main class="home">
    <article class="cert">
      <header><span>${L('出生届', 'Birth record')}</span><span>No. ${c.code}-${p.birthYear}-${String(p.seed % 1e7).padStart(7, '0')}</span></header>
      <canvas class="pixscene" data-scene="${sceneAttr(toData(sceneOf(p)))}"></canvas>
      <p class="kicker">${L('名前', 'Name')}</p><h1>${esc(p.name)}</h1>
      <p class="lead">${esc(p.log[0].text)}</p>
      <p class="note">${L('平均寿命まで生きると約30分(1年 ≈ 26秒)。途中で閉じてもこの端末に保存され、続きから生きられる。', 'A life to average life expectancy takes about 30 minutes (1 year ≈ 26 seconds). If you close the page, it is saved on this device and you can continue later.')}</p>
      <dl class="fields">${fields.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="statbox">${isEn
        ? `${pct(c.births / total('births'), 1)} of babies born today are born in ${esc(c.name)}. About ${(Math.round(c.births / 1e3) * 1e3).toLocaleString()} a year, 1 in ${oneIn}.${share !== c.births / total('births') ? ` (By population: ${pct(share, 1)}.)` : ''}`
        : `今生まれる赤ちゃんの ${pct(c.births / total('births'), 1)} が${esc(c.name)}で生まれる。年に約${perYear.toLocaleString()}万人、${oneIn}人に1人。${share !== c.births / total('births') ? `(人口で数えると ${pct(share, 1)})` : ''}`}</p>
      ${r ? `<table class="cmp"><tr><th>${L('同じ日に生まれたら', 'Born the same day')}</th><th>${L(`あなたの${esc(r.name)}`, `Your ${esc(r.name)}`)}</th><th>${L(`この子の${esc(c.name)}`, `This child’s ${esc(c.name)}`)}</th></tr>${cmp.map(([k, f]) => `<tr><td>${k}</td><td>${f(r)}</td><td><b>${f(c)}</b></td></tr>`).join('')}</table>` : ''}
      <h3>${L('同じ1秒に、地球のどこかで生まれた人たち', 'Others born somewhere on Earth in the same second')}</h3>
      <ul class="certothers">${others.map((o) => `<li><b>${esc(o.name)}</b><span>${esc(byCode(o.birthCountry).name)}${o.city ? ` ${esc(o.city)}` : L('・農村', ', rural')}${L('・', ', ')}${o.sex === 'F' ? L('女', 'girl') : L('男', 'boy')}${L('・', ', ')}${o.familyP < 0.2 ? L('いちばん貧しい家', 'poorest family') : o.familyP < 0.4 ? L('余裕のない家', 'struggling family') : o.familyP < 0.8 ? L('ふつうの家', 'average family') : L('裕福な家', 'well-off family')}</span></li>`).join('')}</ul>
      <p class="note">${L('この人たちの人生も同じ統計にしたがって最後まで流れていく。あなたのそばで一緒に見ていく。', 'Their lives follow the same statistics to the end. You will see them alongside yours.')}</p>
      <p class="note">${L('所得の真ん中の人の年収', 'Median annual income')}: ${formatMoney(earnings(c, 0.5))}</p>
      <div class="choices">
        <button data-go="card">${L('出生カードを保存', 'Save birth card')}</button>
        <button class="primary" data-go="live">${L('人生を始める', 'Start this life')}</button>
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
        kicker: L(`出生届・${p.birthYear}年${p.birthMonth}月`, `Birth record, ${new Date(2000, p.birthMonth - 1).toLocaleString('en-US', { month: 'long' })} ${p.birthYear}`), title: p.name,
        lines: [p.log[0].text, L(`今生まれる赤ちゃんの ${pct(c.births / total('births'), 1)}・平均寿命 ${e0.toFixed(1)}歳`, `${pct(c.births / total('births'), 1)} of babies born today. Life expectancy ${e0.toFixed(1)}.`)],
        foot: L('Unchosen — 生まれは、選べない', 'Unchosen. You don’t choose where you’re born.'),
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
    <h1>${L('前世の記録', 'Past lives')}</h1>
    <p class="note">${L(`最近の${lives.length}つの人生(最大10)。この端末にだけ残っている。`, `Your last ${lives.length} ${lives.length === 1 ? 'life' : 'lives'} (up to 10). Kept only on this device.`)}</p>
    <ul class="pastlist">${lives.map((l, i) => `
      <li><button data-i="${i}"><b>${esc(l.name)}</b>　${esc(byCode(l.birthCountry).name)}${L('・', ', ')}${sexWord(l.sex)}${L('・', ', ')}${L(`${l.age}歳(${esc(l.cause)})`, `age ${l.age} (${esc(causeName(l.cause ?? ''))})`)}
      <small>${new Date(l.date).toLocaleDateString(isEn ? 'en-US' : 'ja-JP')}</small></button></li>`).join('') || `<li>${L('まだない。', 'None yet.')}</li>`}</ul>
    <div id="pastdetail"></div>
    <button data-go="home">${L('戻る', 'Back')}</button>
  </main>`;
  app.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const i = t.closest<HTMLElement>('[data-i]')?.dataset.i;
    if (i !== undefined) {
      $('#pastdetail').innerHTML = `${deathRecord(lives[Number(i)])}<div class="choices"><button data-card="${Number(i)}">${L('記録カードを保存', 'Save record card')}</button></div>`;
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
    <h1>${L('データについて', 'About the data')}</h1>
    ${isEn ? `
    <p>Country indicators (${COUNTRIES.length} countries with populations over 500,000): annual births and population, life expectancy by sex, infant and under-5 mortality, GDP per person (purchasing power parity), Gini index, mean years of schooling, tertiary enrollment, share of workers in agriculture, total fertility rate, maternal mortality, HIV prevalence, homicide rate, smoking rate, out-of-pocket share of health spending, share of women married before 18, and life satisfaction.</p>
    <p>Sources: UN World Population Prospects, UN IGME, World Bank WDI, WHO, UNESCO UIS, UNDP, ILO, UNAIDS, UNODC, UNICEF and the World Happiness Report, all via Our World in Data. The latest value up to 2024 is used.</p>
    <p>When people die: a life table is built for each country and sex to match infant and under-5 mortality and life expectancy by sex. Health, income, smoking, drinking and treatment of illness move a person's own risk up or down.</p>
    <p>Causes of death: the mix by age group (a rough shape from WHO and GBD) is weighted by the country's income, region and smoking. Homicide comes from the homicide rate. The weight of road deaths is estimated from income.</p>
    <p>Income: a person's family and job sit within the country's income distribution (a log-normal shaped by the Gini index). Amounts are shown in purchasing-power-parity dollars.</p>
    <p>Missing values are estimated from countries in the same region with similar GDP per person. Child marriage in high-income countries is set at 1%. Suicide is in reality one of the leading causes of death, but this game does not include it.</p>` : `
    <p>国ごとの指標(${COUNTRIES.length}か国、人口50万人以上): 年間出生数・人口、男女別の平均寿命、乳児死亡率・5歳未満死亡率、1人当たりGDP(購買力平価)、ジニ係数、平均教育年数、高等教育就学率、農業従事者の割合、合計特殊出生率、妊産婦死亡率、HIV陽性率、殺人発生率、喫煙率、医療費の自己負担割合、18歳未満で結婚した女性の割合、生活満足度。</p>
    <p>出典: 国連世界人口推計、UN IGME、世界銀行 WDI、WHO、UNESCO UIS、UNDP、ILO、UNAIDS、UNODC、UNICEF、World Happiness Report(いずれも Our World in Data 経由)。2024年以前で最新の値を使っている。</p>
    <p>亡くなる時期: 乳児・5歳未満死亡率と男女別の平均寿命に合うよう、国と性別ごとに生命表を組み立てている。健康・所得・喫煙・酒・病気の治療で、その人の死亡率は上下する。</p>
    <p>死因: 年齢帯ごとの構成(WHO・GBD のおおまかな形)を、国の豊かさや地域、喫煙で重み付けしている。他殺は殺人発生率から。交通事故の重みは所得からの推計。</p>
    <p>所得: 国ごとの所得分布(ジニ係数から決めた対数正規分布)の中で、家と仕事の位置が決まる。金額は購買力平価ドルと、日本の物価での円換算(1ドル≒95円)を並べている。</p>
    <p>欠けている値は、同じ地域で1人当たりGDPが近い国から推計している。高所得国の児童婚率は1%としている。自殺は実際には主要な死因の一つだが、このゲームでは扱わない。</p>`}
    <button data-go="home">${L('戻る', 'Back')}</button>
  </main>`;
  app.onclick = (e) => { if ((e.target as HTMLElement).closest('[data-go=home]')) home(); };
}

home();
