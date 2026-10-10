import './style.css';
import { COUNTRIES, ERA_FROM, ERA_NOW, ERA_TO, byCode, countriesAcrossYears, countriesAt, countryAt, pickBirthYear, totalOf, type BirthBasis } from './engine/countries';
import { loadWorld } from './engine/world';
import { bornTable } from './engine/lifetable';
import { earnings, formatMoney } from './engine/economy';
import { causeName } from './engine/causes';
import { createPerson, homeWord } from './engine/life';
import { genderOf, genderWord, type Gender, type Person } from './engine/person';
import { makeRng, pickWeighted, randomSeed } from './engine/rng';
import { drawCard, shareCard } from './ui/cards';
import { deathCard, deathRecord, paintLife, pastLives } from './ui/death';
import { $, esc, load, pct, save } from './ui/dom';
import { clearSaved, hasSaved, resumeGame, sameSecondOthers, startWithOthers } from './ui/game';
import { aiPanel, bindAiPanel, handleAiClick } from './ui/aipanel';
import { paintScenes, sceneAttr, sceneFromSummary, sceneOf, toData } from './ui/pixel';
import { paintOtherFaces } from './ui/portrait';
import { isEn, L, lang, religionName, setLang } from './i18n';
import { TRACKS, musicScene, setMusic, sfx } from './ui/music';

const app = $('#app');
// 世界では1秒に約4.2人が生まれ、約2人が亡くなる (国連世界人口推計 2024)
const BIRTHS_PER_SEC = 4.2;
const DEATHS_PER_SEC = 2.0;
let counterTimer: number | undefined;
document.documentElement.lang = lang;
if (isEn) document.title = 'Unchosen. You don’t choose where you’re born.';
const sexWord = (s: 'F' | 'M' | 'X') => genderWord(s);

interface Shared { id: number; rural: number; job: string; name: string; country: string; sex: 'F' | 'M' | 'X'; age: number; cause: string; line: string; message: string; candles: number; createdAt: string; gen?: number; family?: string }

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
  const scene = c ? `<canvas class="pixscene" data-scene="${sceneAttr(toData(sceneFromSummary({ id: m.id, country: m.country, sex: m.sex === 'X' ? (m.id % 2 ? 'F' : 'M') : m.sex, age: m.age, rural: !!m.rural, job: m.job })))}"></canvas>` : '';
  return `<li>${scene}<p><b>${esc(m.name || L('ある人', 'Someone'))}</b>　<small>${esc(c?.name ?? m.country)}${L('・', ', ')}${sexWord(m.sex)}${L('・', ', ')}${L(`${Number(m.age)}歳`, `age ${Number(m.age)}`)}</small></p>
    ${Number(m.gen) > 1 ? `<p class="note family">${L(`第${Number(m.gen)}世代`, `Generation ${Number(m.gen)}`)}${m.family ? `${L('・', ' · ')}${esc(m.family)}` : ''}</p>` : ''}<p class="note">${esc(m.line)}</p>${m.message ? `<p class="message">${L('「', '"')}${esc(m.message)}${L('」', '"')}</p>` : ''}
    <button data-candle="${Number(m.id)}">${L('ろうそくを灯す', 'Light a candle')} ${Number(m.candles)}</button></li>`;
};

// ---- トップ ---------------------------------------------------------------

// 生まれる年と国は、選ばなければくじで決まる (年は1950〜2100年の出生数に比例)。選んだ値はこの端末に残す
const THIS_YEAR = new Date().getFullYear();
const chosenYear = (): number | null => { const y = load<number | null>('birthYear', null); return y === null ? null : Math.min(ERA_TO, Math.max(ERA_FROM, y)); };
const chosenGender = (): Gender | null => { const g = load<Gender | null>('gender', null); return g === 'F' || g === 'M' || g === 'X' ? g : null; };
const chosenCountry = (): string | null => { const c = load<string | null>('birthCountry', null); return c && COUNTRIES.some((x) => x.code === c) ? c : null; };
// 「今生まれる」「1980年に生まれる」のように、年を入れた言い方
const bornWhen = (y: number) => (y === THIS_YEAR ? L('今生まれる', 'born today') : L(`${y}年に生まれる`, `born in ${y}`));

function home(): void {
  window.clearInterval(counterTimer);
  musicScene('title');
  if (load('music', false)) setMusic(true); // 自動再生が止められていれば、最初に触れたときに鳴る
  const basis = load<BirthBasis>('basis', 'births');
  const real = load<string | null>('realCountry', null);
  const saved = hasSaved();
  const year = chosenYear();
  const country = chosenCountry();
  const list = year === null ? countriesAcrossYears(basis) : countriesAt(year);
  const total = list.reduce((s, c) => s + c[basis], 0);
  const top = [...list].sort((a, b) => b[basis] - a[basis]).slice(0, 9);
  const rest = 1 - top.reduce((s, c) => s + c[basis], 0) / total;
  const sorted = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, lang));
  const opts = (sel: string | null) => sorted.map((c) => `<option value="${c.code}" ${c.code === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const gender = chosenGender();
  const custom = year !== null || country !== null || gender !== null;
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
        <h3>${year === null ? L(`${ERA_FROM}〜${ERA_TO}年に生まれる人なら`, `If you are born between ${ERA_FROM} and ${ERA_TO}`) : basis === 'births' ? L(`${bornWhen(year)}赤ちゃんなら`, `If you were ${bornWhen(year)}`) : year === THIS_YEAR ? L('今生きている80億人なら', 'Among the 8 billion alive today') : L(`${year}年に生きている人なら`, `Among people alive in ${year}`)} <small>${L('国連世界人口推計 2024', 'UN World Population Prospects 2024')}${year === null || year > ERA_NOW ? L('・予測を含む', ', incl. projections') : ''}</small></h3>
        ${top.map((c) => `<div class="odd"><span>${esc(c.name)}</span><i style="width:${((c[basis] / total) * 100 / (top[0][basis] / total)).toFixed(1)}%"></i><b>${pct(c[basis] / total, 1)}</b></div>`).join('')}
        <div class="odd rest"><span>${L(`ほか${COUNTRIES.length - 9}か国`, `${COUNTRIES.length - 9} other countries`)}</span><i style="width:100%"></i><b>${pct(rest, 1)}</b></div>
      </div>
    </div>
    <div class="panel start">
      <p class="lead">${country || year !== null
        ? L(`${country ? esc(byCode(country).name) : 'どこかの国'}に、${year !== null ? `${year}年` : 'いつか'}生まれる。`, `You will be born in ${country ? esc(byCode(country).name) : 'some country'}, ${year !== null ? `in ${year}` : 'in some year'}.`)
        : L(`いつ、どこに生まれるかは選べない。${ERA_FROM}年から${ERA_TO}年までに生まれる人のなかから、くじで1人になる。`, `You don’t choose when or where. You become one person drawn from everyone born between ${ERA_FROM} and ${ERA_TO}.`)}</p>
      <div class="choices">
        <button class="primary" data-go="born">${L('生まれる', 'Be born')}</button>
        ${saved ? `<button data-go="resume">${L(`続きから・${esc(byCode(saved.p.country).name)}、${saved.p.age}歳の${esc(saved.p.name)}`, `Continue: ${esc(saved.p.name)}, ${saved.p.age}, ${esc(byCode(saved.p.country).name)}`)}</button>` : ''}
      </div>
      <details class="opts" ${custom ? 'open' : ''}><summary>${L('細かく選ぶ(任意)', 'Choose details (optional)')}</summary>
      <div class="startgrid">
        <fieldset><legend>${L('生まれる年', 'Year of birth')}</legend>
          <div class="seg"><button data-year="random" class="${year === null ? 'on' : ''}">${L('くじで決める', 'Leave it to chance')}</button><button data-year="pick" class="${year !== null ? 'on' : ''}">${L('年を選ぶ', 'Pick a year')}</button></div>
          ${year !== null ? `<div class="yearpick"><input type="range" id="year" min="${ERA_FROM}" max="${ERA_TO}" step="1" value="${year}" aria-label="${L('生まれる年', 'Year of birth')}"><b id="yearv">${year}</b><button data-year="now" class="${year === THIS_YEAR ? 'on' : ''}">${L('今年', 'This year')}</button></div>` : ''}
          <p class="note" id="yearnote">${year === null ? L('年ごとの世界の出生数に比例して決まる。赤ちゃんの多い年ほど当たりやすい。', 'Drawn in proportion to the world’s births each year. Years with more babies are more likely.') : yearNote(year)}</p></fieldset>
        <label class="field">${L('生まれる国', 'Country of birth')}
          <select id="bcountry"><option value="">${L('くじで決める', 'Leave it to chance')}</option>${opts(country)}</select>
          <span class="note">${L('選ぶと、その国に生まれる。家や性別はくじのまま。', 'If set, you are born there. Family and sex are still drawn.')}</span></label>
        <fieldset><legend>${L('性別', 'Gender')}</legend>
          <div class="seg">${([[null, L('くじで決める', 'Leave it to chance')], ['F', L('女', 'Female')], ['M', L('男', 'Male')], ['X', L('その他', 'Other')]] as [Gender | null, string][]).map(([g, label]) => `<button data-gender="${g ?? ''}" class="${gender === g ? 'on' : ''}">${label}</button>`).join('')}</div>
          <p class="note">${L('くじなら、生まれた時の男女の比で決まる。その他を選ぶと、文はどちらでもない言い方になる (寿命などの統計は、くじで決まる生まれた時の性別で引く)。', 'By chance, by the sex ratio at birth. Other uses neutral wording; statistics such as lifespan still follow a sex at birth drawn by chance.')}</p></fieldset>
        <fieldset><legend>${L('くじの重み', 'How the draw is weighted')}</legend>
          <div class="seg"><button data-basis="births" class="${basis === 'births' ? 'on' : ''}">${L('出生数', 'Births')}</button><button data-basis="pop" class="${basis === 'pop' ? 'on' : ''}">${L('人口', 'Population')}</button></div>
          <p class="note">${L('出生数なら国ごとのその年の出生数で、人口ならその年の人口の割合で国を選ぶ。どちらでも0歳から始まる。', 'By births, weighted by each country’s births that year. By population, by its share of people alive that year. Either way you start at age 0.')}</p></fieldset>
        <label class="field">${L('あなたが実際に生まれた国', 'The country you were actually born in')}
          <select id="real"><option value="">${L('選ばない', 'Skip')}</option>${opts(real)}</select>
          <span class="note">${L('選ぶと、この人生とあなたの人生を並べて比べる。この端末にだけ保存。', 'If set, this life is compared side by side with yours. Saved only on this device.')}</span></label>
      </div></details>
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
  $('#bcountry').onchange = (e) => { save('birthCountry', (e.target as HTMLSelectElement).value || null); home(); };
  const yr = document.getElementById('year') as HTMLInputElement | null;
  if (yr) {
    yr.oninput = () => { $('#yearv').textContent = yr.value; $('#yearnote').textContent = yearNote(+yr.value); };
    yr.onchange = () => { save('birthYear', +yr.value); home(); };
  }
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
    const gb = t.closest<HTMLElement>('[data-gender]');
    if (gb) { save('gender', gb.dataset.gender || null); home(); return; }
    const ym = t.closest<HTMLElement>('[data-year]')?.dataset.year;
    if (ym) { save('birthYear', ym === 'random' ? null : ym === 'now' ? THIS_YEAR : chosenYear() ?? THIS_YEAR); home(); return; }
    if (go === 'born') {
      if (saved) clearSaved();
      await newBirth(basis);
    }
    if (go === 'resume') { await loadWorld(); resumeGame(home); }
    if (go === 'past') past();
    if (go === 'about') about();
  };
}

// 新しい人生をくじで引く (トップの「生まれる」と、出生届の「引き直す」)
async function newBirth(basis: BirthBasis): Promise<void> {
  await loadWorld();
  const seed = randomSeed();
  const year = chosenYear() ?? pickBirthYear(makeRng(seed ^ 0x5eed));
  roll(createPerson({ seed, basis, year, country: chosenCountry() ?? undefined, gender: chosenGender() ?? undefined }), basis);
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

// 選んだ年が、記録の時代か予測の時代か
function yearNote(y: number): string {
  if (y <= ERA_NOW) return L(`${y}年の統計で生まれ、その後の年もその時々の統計で生きる。`, `Born into the statistics of ${y}, and lives each later year by that year's figures.`);
  return L(`${ERA_NOW}年より先は、国連の予測(中位推計)と、それを延ばした推定で生きる。起きることは予測であって、決まった未来ではない。`, `After ${ERA_NOW}, life follows the UN projections (medium variant) and estimates extended from them. It is a projection, not a fixed future.`);
}

// 生まれる瞬間の演出。暗い画面に「1秒に4人」→ 年が回って止まる → 国の名前が速く入れ替わり、遅くなって止まる
// → 家と性別が1行ずつ → 白い光と産声 → 出生届。押せば飛ばせる。動きを減らす設定なら4倍速
function roll(p: Person, basis: BirthBasis): void {
  window.clearInterval(counterTimer);
  const year = p.birthYear;
  const list = countriesAt(year);
  const total = totalOf(basis, year);
  const c = countryAt(p.birthCountry, year);
  const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
  app.innerHTML = `<main class="birth">
    <p class="b-line" id="b0"></p><div class="b-year" id="byear"></div><p class="b-sub" id="bsub"></p>
    <h1 class="b-country" id="bcountry"></h1><p class="b-sub" id="bodds"></p><ul class="b-facts" id="bfacts"></ul>
    <p class="b-cry" id="bcry"></p><div class="b-flash" id="bflash"></div>
    <span class="b-skip">${L('押すと飛ばせる', 'Tap to skip')}</span></main>`;
  const timers: number[] = [];
  setMusic(false); // 鼓動だけを聞かせる
  const beat = load('music', false) ? heartbeat() : null;
  let done = false;
  const finish = () => { if (done) return; done = true; timers.forEach((t) => window.clearTimeout(t)); beat?.stop(); born(p, basis); };
  app.onclick = finish;
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, quick ? ms / 4 : ms));
  const show = (id: string, text: string) => { const el = $(id); el.textContent = text; el.classList.add('on'); };

  show('#b0', L('1秒に、4人。', 'Four every second.'));
  at(1600, () => $('#b0').classList.remove('on'));
  // 年: 速く回って、だんだん遅くなって止まる
  let t = 0, wait = 40;
  for (let i = 0; wait < 260; i++, wait *= 1.13) {
    t += wait;
    const last = wait * 1.13 >= 260;
    at(1900 + t, () => {
      $('#byear').textContent = String(last ? year : ERA_FROM + Math.floor(Math.random() * (ERA_TO - ERA_FROM + 1)));
      $('#byear').classList.add('on');
      if (last) { $('#byear').classList.add('land'); beat?.faster(); }
    });
  }
  const yearDone = 1900 + t;
  at(yearDone + 700, () => show('#bsub', L(`この年、世界で${bigNumber(totalOf('births', year))}が生まれる。`, `That year, ${bigNumber(totalOf('births', year))} are born.`) + (year > ERA_NOW ? L('(予測)', ' (projected)') : '')));
  // 国: 生まれやすい国ほど多く顔を出す (演出だけの乱数。人生の seed とは別)
  const spin = makeRng(p.seed ^ 0x2b1f);
  let u = 0; wait = 45;
  const steps: number[] = [];
  for (; wait < 420; wait *= 1.1) { u += wait; steps.push(u); }
  const from = yearDone + 1700;
  steps.forEach((ms, i) => at(from + ms, () => {
    const last = i === steps.length - 1;
    const x = last ? c : pickWeighted(spin, list, (k) => k[basis]);
    $('#bcountry').textContent = x.name;
    $('#bcountry').classList.add('on');
    if (last) { $('#bcountry').classList.add('land'); beat?.faster(); }
  }));
  const landed = from + u;
  at(landed + 800, () => show('#bodds', L(`${pct(c[basis] / total, 1)}・${Math.round(total / c[basis]).toLocaleString()}人に1人`, `${pct(c[basis] / total, 1)}, 1 in ${Math.round(total / c[basis]).toLocaleString()}`)));
  const facts = [
    p.city ? L(`${p.city}の街で`, `In the city of ${p.city}`) : L('農村で', 'In a rural village'),
    L(`${homeWord(p.familyP)}に`, `Into a ${homeWord(p.familyP)}`),
    p.gender === 'X' ? L('ひとりの子として', 'A child') : p.sex === 'F' ? L('女の子として', 'A girl') : L('男の子として', 'A boy'),
  ];
  facts.forEach((f, i) => at(landed + 1500 + i * 800, () => {
    const li = document.createElement('li');
    li.textContent = f;
    $('#bfacts').append(li);
    requestAnimationFrame(() => li.classList.add('on'));
  }));
  const cry = landed + 1500 + facts.length * 800 + 700;
  at(cry, () => { $('#bflash').classList.add('on'); beat?.stop(); });
  at(cry + 500, () => show('#bcry', L('産声。', 'A first cry.')));
  at(cry + 2200, finish);
}

// 1億3,400万人 / 134 million
function bigNumber(n: number): string {
  if (isEn) return `${Math.round(n / 1e6).toLocaleString()} million`;
  return n >= 1e8 ? `${Math.floor(n / 1e8)}億${Math.round((n % 1e8) / 1e4).toLocaleString()}万人` : `${Math.round(n / 1e4).toLocaleString()}万人`;
}

// 低い鼓動。音楽を入れている人だけ。止まった国で少し速くなる
function heartbeat(): { stop: () => void; faster: () => void } {
  const ctx = new AudioContext();
  let gap = 950, on = true, timer = 0;
  const thump = (at: number, vol: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(58, at); o.frequency.exponentialRampToValueAtTime(38, at + 0.18);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sfx()), at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + 0.25);
  };
  const loop = () => { if (!on) return; const t = ctx.currentTime; thump(t, 0.5); thump(t + 0.24, 0.32); timer = window.setTimeout(loop, gap); };
  loop();
  return { stop: () => { on = false; window.clearTimeout(timer); void ctx.close(); }, faster: () => { gap = Math.max(520, gap * 0.8); } };
}

// ---- 出生届 ---------------------------------------------------------------

function born(p: Person, basis: BirthBasis): void {
  const c = countryAt(p.birthCountry, p.birthYear);
  const total = (b: BirthBasis) => totalOf(b, p.birthYear);
  const share = c[basis] / total(basis);
  const e0 = p.sex === 'F' ? c.leF : c.leM;
  // この子と同じ年に生まれた人たちが、その後の各暦年の死亡率で生きた場合
  const bornL = bornTable(c, p.sex, p.birthYear);
  const bornE0 = bornL.e0, bornU5 = 1 - bornL.l[5];
  const others = sameSecondOthers(basis, p.birthYear);
  const real = load<string | null>('realCountry', null);
  const r = real ? countryAt(real, p.birthYear) : null;
  const quint = Math.min(5, Math.floor(p.familyP * 5) + 1);
  const fields: [string, string][] = [
    [L('性別', 'Gender'), sexWord(genderOf(p))], [L('出生国', 'Country'), c.name], [L('出生地', 'Birthplace'), p.city ? L(`${p.city}(都市)`, `${p.city} (city)`) : L('農村', 'Rural')],
    [L('生まれた家', 'Family income'), `${'●'.repeat(quint)} ${L(`${quint}分位`, `quintile ${quint} of 5`)}`],
    [L('親の年齢', 'Parents’ ages'), L(`母 ${p.mother.age}歳・父 ${p.father.age}歳`, `mother ${p.mother.age}, father ${p.father.age}`)], [L('宗教', 'Religion'), religionName(p.religion)],
    [L('同じ年に生まれた人の平均寿命', 'Expected lifespan of this birth year'), L(`${bornE0.toFixed(1)}歳`, bornE0.toFixed(1))], [L('5歳までに亡くなる確率', 'Chance of dying before 5'), pct(bornU5, 1)],
    [L(`${p.birthYear}年の平均寿命`, `Life expectancy in ${p.birthYear}`), L(`${e0.toFixed(1)}歳`, e0.toFixed(1))], [L('1人当たりGDP (PPP)', 'GDP per person (PPP)'), `$${Math.round(c.gdp).toLocaleString()}`],
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
        ? `${pct(c.births / total('births'), 1)} of babies ${bornWhen(p.birthYear)} are born in ${esc(c.name)}. About ${(Math.round(c.births / 1e3) * 1e3).toLocaleString()} a year, 1 in ${oneIn}.${share !== c.births / total('births') ? ` (By population: ${pct(share, 1)}.)` : ''}`
        : `${bornWhen(p.birthYear)}赤ちゃんの ${pct(c.births / total('births'), 1)} が${esc(c.name)}で生まれる。年に約${perYear.toLocaleString()}万人、${oneIn}人に1人。${share !== c.births / total('births') ? `(人口で数えると ${pct(share, 1)})` : ''}`}</p>
      ${r ? `<table class="cmp"><tr><th>${L('同じ日に生まれたら', 'Born the same day')}</th><th>${L(`あなたの${esc(r.name)}`, `Your ${esc(r.name)}`)}</th><th>${L(`この子の${esc(c.name)}`, `This child’s ${esc(c.name)}`)}</th></tr>${cmp.map(([k, f]) => `<tr><td>${k}</td><td>${f(r)}</td><td><b>${f(c)}</b></td></tr>`).join('')}</table>` : ''}
      <h3>${L('同じ1秒に、地球のどこかで生まれた人たち', 'Others born somewhere on Earth in the same second')}</h3>
      <ul class="certothers">${others.map((o, i) => `<li><b><canvas class="pix mini" data-oface="${i}" aria-hidden="true"></canvas>${esc(o.name)}</b><span>${esc(byCode(o.birthCountry).name)}${o.city ? ` ${esc(o.city)}` : L('・農村', ', rural')}${L('・', ', ')}${o.sex === 'F' ? L('女', 'girl') : L('男', 'boy')}${L('・', ', ')}${o.familyP < 0.2 ? L('いちばん貧しい家', 'poorest family') : o.familyP < 0.4 ? L('余裕のない家', 'struggling family') : o.familyP < 0.8 ? L('ふつうの家', 'average family') : L('裕福な家', 'well-off family')}</span></li>`).join('')}</ul>
      <p class="note">${L('この人たちの人生も同じ統計にしたがって最後まで流れていく。あなたのそばで一緒に見ていく。', 'Their lives follow the same statistics to the end. You will see them alongside yours.')}</p>
      <p class="note">${L('所得の真ん中の人の年収', 'Median annual income')}: ${formatMoney(earnings(c, 0.5))}</p>
      <div class="choices">
        <button data-go="card">${L('出生カードを保存', 'Save birth card')}</button>
        <button data-go="reroll">${L('別の人生を引き直す', 'Draw another life')}</button>
        <button class="primary" data-go="live">${L('人生を始める', 'Start this life')}</button>
      </div>
    </article>
  </main>`;
  window.scrollTo(0, 0);
  paintScenes(app);
  paintOtherFaces(app, others);
  app.onclick = async (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'live') startWithOthers(p, others, basis, home);
    if (go === 'reroll') await newBirth(basis);
    if (go === 'card') {
      await shareCard(drawCard({
        kicker: L(`出生届・${p.birthYear}年${p.birthMonth}月`, `Birth record, ${new Date(2000, p.birthMonth - 1).toLocaleString('en-US', { month: 'long' })} ${p.birthYear}`), title: p.name,
        lines: [p.log[0].text, L(`${bornWhen(p.birthYear)}赤ちゃんの ${pct(c.births / total('births'), 1)}・平均寿命 ${e0.toFixed(1)}歳`, `${pct(c.births / total('births'), 1)} of babies ${bornWhen(p.birthYear)}. Life expectancy ${e0.toFixed(1)}.`)],
        foot: L('Unchosen — 生まれは、選べない', 'Unchosen. You don’t choose where you’re born.'),
        scene: toData(sceneOf(p)),
      }), 'birth.png');
    }
  };
}


// ---- 前世の記録 -----------------------------------------------------------

function past(): void {
  const lives = pastLives();
  app.innerHTML = `
  <main class="home wide">
    <h1>${L('前世の記録', 'Past lives')}</h1>
    <p class="note">${L(`最近の${lives.length}つの人生(最大10)。この端末にだけ残っている。`, `Your last ${lives.length} ${lives.length === 1 ? 'life' : 'lives'} (up to 10). Kept only on this device.`)}</p>
    <ul class="pastlist">${lives.map((l, i) => `
      <li><button data-i="${i}"><b>${esc(l.name)}</b>　${esc(byCode(l.birthCountry).name)}${L('・', ', ')}${sexWord(genderOf(l))}${L('・', ', ')}${L(`${l.age}歳(${esc(l.cause)})`, `age ${l.age} (${esc(causeName(l.cause ?? ''))})`)}
      <small>${new Date(l.date).toLocaleDateString(isEn ? 'en-US' : 'ja-JP')}</small></button></li>`).join('') || `<li>${L('まだない。', 'None yet.')}</li>`}</ul>
    <div id="pastdetail"></div>
    <button data-go="home">${L('戻る', 'Back')}</button>
  </main>`;
  app.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const i = t.closest<HTMLElement>('[data-i]')?.dataset.i;
    if (i !== undefined) {
      $('#pastdetail').innerHTML = `${deathRecord(lives[Number(i)])}<div class="choices"><button data-card="${Number(i)}">${L('記録カードを保存', 'Save record card')}</button></div>`;
      paintLife($('#pastdetail'), lives[Number(i)]);
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
    <h2>${L('音楽', 'Music')}</h2>
    <ul>${Object.values(TRACKS).map((t) => `<li>“<a href="${t.url}" rel="noopener">${t.title}</a>” ${t.artist} (incompetech.com), <a href="${t.licenseUrl}" rel="noopener">${t.license}</a></li>`).join('')}</ul>
    <button data-go="home">${L('戻る', 'Back')}</button>
  </main>`;
  app.onclick = (e) => { if ((e.target as HTMLElement).closest('[data-go=home]')) home(); };
}

home();
// 暦年の統計を読み終えたら、トップの表をその年の値で描き直す
void loadWorld().then(() => { if (document.querySelector('.home .odds') && document.activeElement?.tagName !== 'SELECT' && document.activeElement?.id !== 'year') home(); });
