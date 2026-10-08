import './style.css';
import { COUNTRIES, byCode, totalOf, type BirthBasis } from './engine/countries';
import { earnings, formatMoney } from './engine/economy';
import { createPerson } from './engine/life';
import type { Person } from './engine/person';
import { randomSeed } from './engine/rng';
import { drawCard, shareCard } from './ui/cards';
import { $, esc, load, pct, save } from './ui/dom';
import { deathCard, deathSummary, pastLives, startGame } from './ui/game';

const app = $('#app');

// ---- トップ ---------------------------------------------------------------

function home(): void {
  const basis = load<BirthBasis>('basis', 'births');
  const real = load<string | null>('realCountry', null);
  const opts = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((c) => `<option value="${c.code}" ${c.code === real ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  app.onclick = null;
  app.innerHTML = `
  <main class="home">
    <p class="kicker">β版・${COUNTRIES.length}か国の実際の統計にもとづく人生シミュレーション</p>
    <h1>80億分の1</h1>
    <p class="lead">ランダムに生まれ、一度きりの人生を最後まで生きる。<br>生まれる場所も親も、選べない。</p>
    <div class="panel start">
      <fieldset>
        <legend>どこに生まれるかの決め方</legend>
        <label><input type="radio" name="basis" value="births" ${basis === 'births' ? 'checked' : ''}> いま生まれている赤ちゃんの数で(年間出生数)</label>
        <label><input type="radio" name="basis" value="pop" ${basis === 'pop' ? 'checked' : ''}> 人口の割合で</label>
      </fieldset>
      <label class="field">名前(出生カードに載る。空欄なら「あなた」)<input id="name" maxlength="20" autocomplete="off"></label>
      <button class="primary" data-go="born">生まれる</button>
      <p class="note">0歳から始まり、平均寿命まで30分〜1時間半ほど。乳幼児の死、児童婚、病気など重い出来事も統計どおりに起こります。15歳以上向け。</p>
    </div>
    <div class="panel">
      <label class="field">あなたが実際に生まれた国(任意・この端末にだけ保存)
        <select id="real"><option value="">選ばない</option>${opts}</select></label>
    </div>
    <nav class="homenav">
      <button data-go="past">前世の記録</button>
      <button data-go="memorial">追悼館</button>
      <button data-go="about">データについて</button>
    </nav>
  </main>`;
  $('#real').onchange = (e) => save('realCountry', (e.target as HTMLSelectElement).value || null);
  app.onclick = (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'born') {
      const b = (document.querySelector<HTMLInputElement>('input[name=basis]:checked')?.value ?? 'births') as BirthBasis;
      save('basis', b);
      born(createPerson({ seed: randomSeed(), basis: b, name: $<HTMLInputElement>('#name').value }), b);
    }
    if (go === 'past') past();
    if (go === 'memorial') void memorial();
    if (go === 'about') about();
  };
}

// ---- 誕生 -----------------------------------------------------------------

function born(p: Person, basis: BirthBasis): void {
  const c = byCode(p.birthCountry);
  const share = c[basis] / totalOf(basis);
  const e0 = p.sex === 'F' ? c.leF : c.leM;
  const facts: [string, string][] = [
    ['平均寿命', `${e0.toFixed(1)}歳`],
    ['5歳までに亡くなる子ども', pct(c.u5mr, 1)],
    ['所得の真ん中の人の年収', formatMoney(earnings(c, 0.5))],
    ['大人の平均教育年数', `${c.school.toFixed(1)}年`],
  ];
  app.innerHTML = `
  <main class="home born">
    <p class="kicker">${new Date().toLocaleDateString('ja-JP')}　世界で${basis === 'births' ? '生まれる赤ちゃん' : '暮らす人'}の ${pct(share, 1)} がこの国</p>
    <h1>${esc(p.name)}は、${esc(c.name)}に生まれた</h1>
    <p class="lead">${esc(p.log[0].text)}</p>
    <dl class="kv facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${c.est?.length ? `<p class="note">この国の一部の値(${c.est.length}項目)は近い国から推計しています。</p>` : ''}
    <div class="choices">
      <button class="primary" data-go="live">人生を始める</button>
      <button data-go="card">出生カードを保存</button>
      <button data-go="home">戻る</button>
    </div>
  </main>`;
  app.onclick = async (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go === 'live') startGame(p, basis, home);
    if (go === 'home') home();
    if (go === 'card') {
      await shareCard(drawCard({
        kicker: new Date().toLocaleDateString('ja-JP'),
        title: `${p.name}は、${c.name}に生まれた`,
        lines: [p.log[0].text, `世界の${basis === 'births' ? '新生児' : '人口'}の ${pct(share, 1)}　平均寿命 ${e0.toFixed(1)}歳`],
        foot: '80億分の1 — 一度きりの人生',
      }), 'birth.png');
    }
  };
}

// ---- 前世の記録 -----------------------------------------------------------

function past(): void {
  const lives = pastLives();
  app.innerHTML = `
  <main class="home">
    <h1>前世の記録</h1>
    <p class="note">最近の${lives.length}つの人生(最大10)。この端末にだけ残っています。</p>
    <ul class="pastlist">${lives.map((l, i) => `
      <li><button data-i="${i}"><b>${esc(l.name)}</b>　${esc(byCode(l.birthCountry).name)}・${l.sex === 'F' ? '女性' : '男性'}・${l.age}歳(${esc(l.cause)})
      <small>${new Date(l.date).toLocaleDateString('ja-JP')}</small></button></li>`).join('') || '<li>まだありません。</li>'}</ul>
    <div id="pastdetail"></div>
    <button data-go="home">戻る</button>
  </main>`;
  app.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const i = t.closest<HTMLElement>('[data-i]')?.dataset.i;
    if (i !== undefined) {
      const l = lives[Number(i)];
      $('#pastdetail').innerHTML = `<div class="panel">${deathSummary(l)}<div class="choices"><button data-card="${i}">記録カードを保存</button></div></div>`;
    }
    const card = t.closest<HTMLElement>('[data-card]')?.dataset.card;
    if (card !== undefined) await shareCard(deathCard(lives[Number(card)]), 'life.png');
    if (t.closest('[data-go=home]')) home();
  };
}

// ---- 追悼館 ---------------------------------------------------------------

interface Memorial { id: number; country: string; sex: 'F' | 'M'; age: number; cause: string; line: string; message: string; candles: number; createdAt: string }

async function memorial(): Promise<void> {
  app.innerHTML = `<main class="home"><h1>追悼館</h1><p class="lead">最後まで生きた人生が、ここに眠っている。</p><div id="mem">読み込み中…</div><button data-go="home">戻る</button></main>`;
  app.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-go=home]')) return home();
    const btn = t.closest<HTMLButtonElement>('[data-candle]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      const r = await fetch(`/api/memorial/${btn.dataset.candle}/candle`, { method: 'POST' });
      const j = await r.json();
      if (j.success) btn.textContent = `🕯 ${j.data.candles}`;
    } catch { btn.disabled = false; }
  };
  try {
    const r = await fetch('/api/memorial');
    const j = await r.json();
    if (!j.success) throw new Error(j.error);
    const list = j.data as Memorial[];
    $('#mem').innerHTML = list.length ? `<ul class="memorial">${list.map((m) => {
      const c = COUNTRIES.find((x) => x.code === m.country);
      return `<li><p><b>${esc(c?.name ?? m.country)}の${m.sex === 'F' ? '女性' : '男性'}、${Number(m.age)}歳</b>　<small>${esc(m.cause)}</small></p>
        ${m.line ? `<p class="note">${esc(m.line)}</p>` : ''}${m.message ? `<p class="message">「${esc(m.message)}」</p>` : ''}
        <button data-candle="${Number(m.id)}">🕯 ${Number(m.candles)}</button></li>`;
    }).join('')}</ul>` : '<p>まだ誰もいない。</p>';
  } catch {
    $('#mem').textContent = '追悼館に接続できませんでした。';
  }
}

// ---- データについて -------------------------------------------------------

function about(): void {
  app.innerHTML = `
  <main class="home about">
    <h1>データについて</h1>
    <p>国ごとの指標(${COUNTRIES.length}か国、人口50万人以上): 年間出生数・人口、男女別の平均寿命、乳児死亡率・5歳未満死亡率、1人当たりGDP(購買力平価)、ジニ係数、平均教育年数、高等教育就学率、農業従事者の割合、合計特殊出生率、妊産婦死亡率、HIV有病率、殺人発生率、喫煙率、医療費の自己負担割合、18歳未満で結婚した女性の割合、生活満足度。</p>
    <p>出典: 国連世界人口推計、UN IGME、世界銀行 WDI、WHO、UNESCO UIS、UNDP、ILO、UNAIDS、UNODC、UNICEF、World Happiness Report(いずれも Our World in Data 経由)。2024年以前で最新の値を使っています。</p>
    <p>亡くなる時期: 乳児・5歳未満死亡率と男女別の平均寿命に合うよう、国と性別ごとに生命表を組み立てています。健康・所得・喫煙・病気の治療で、その人の死亡率は上下します。</p>
    <p>死因: 年齢帯ごとの構成(WHO・GBD のおおまかな形)を、国の豊かさや地域、喫煙で重み付けしています。他殺は殺人発生率から。交通事故の重みは所得からの推計です。</p>
    <p>所得: 国ごとの所得分布(ジニ係数から決めた対数正規分布)の中で、家の位置が決まります。金額は購買力平価ドルと、日本の物価での円換算(1ドル≒95円)を並べています。</p>
    <p>欠けている値は、同じ地域で1人当たりGDPが近い国から推計しています。高所得国の児童婚率は1%としています。自殺は実際には主要な死因の一つですが、このゲームでは扱いません。</p>
    <button data-go="home">戻る</button>
  </main>`;
  app.onclick = (e) => { if ((e.target as HTMLElement).closest('[data-go=home]')) home(); };
}

home();
