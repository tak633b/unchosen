// ゲーム画面の各パネル。どれも Person を受け取って HTML を返すだけ。
import { byCode, type Country } from '../engine/countries';
import { perDay, yen } from '../engine/economy';
import { currentIncome } from '../engine/events/common';
import { netWorth } from '../engine/events/money';
import { EDU_LABEL, eduLevel, type Focus, type Person } from '../engine/person';
import { nowLine } from '../engine/summary';
import { esc, load, pct } from './dom';

export const FOCUS: [Focus, string, string][] = [
  ['health', '健康', '体をいたわる'],
  ['learn', '学び', '知識や技術を身につける'],
  ['work', '仕事', '稼ぎを増やす。体と家族の時間は減る'],
  ['family', '家族・人', '家族や友人と過ごす'],
  ['rest', '休む', '心を休める'],
];

const dots = (p: number) => {
  const n = Math.min(5, Math.floor(p * 5) + 1);
  return '●'.repeat(n) + '○'.repeat(5 - n);
};

// パスポート下部の機械読み取り欄のような飾り
const mrz = (p: Person) => {
  const ascii = (s: string) => s.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  const nm = ascii(p.name) || 'X';
  const l1 = `I<${p.birthCountry}${nm}`.padEnd(36, '<').slice(0, 36);
  const l2 = `${String(p.birthYear).slice(2)}${String(p.birthMonth).padStart(2, '0')}01${p.sex}${p.birthCountry}<${String(p.seed % 1000).padStart(3, '0')}`.padEnd(36, '<');
  return `${l1}\n${l2}`;
};

export function idCard(p: Person): string {
  const c = byCode(p.country);
  const rows: [string, string][] = [
    ['性別', p.sex === 'F' ? '女性' : '男性'],
    ['出生', `${byCode(p.birthCountry).name}・${p.birthYear}年${p.birthMonth}月`],
    ['住まい', `${p.city ?? '農村'}、${c.name}`],
    ['宗教', p.religion],
    ['生まれた家', dots(p.familyP)],
    ['学歴', p.age < 6 ? '就学前' : p.school.enrolled ? `在学中(${p.school.years + 1}年目)` : p.school.uni === 'studying' ? `大学在学中${p.school.major ? `・${p.school.major}` : ''}` : EDU_LABEL[eduLevel(p)]],
  ];
  return `<div class="idhead"><span>身分の記録・${p.birthCountry}</span><span>${p.birthYear}</span></div>
    <div class="idbody"><canvas class="portrait pix" id="portraitcv" aria-hidden="true"></canvas>
    <div><div class="idname">${esc(p.name)}</div><dl class="kv small">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div></div>
    <pre class="mrz">${esc(mrz(p))}</pre>`;
}

const bar = (label: string, v: number, cls: string) =>
  `<div class="stat"><span>${label}</span><div class="meter"><i class="${cls}" style="width:${v.toFixed(0)}%"></i></div><b>${v.toFixed(0)}</b></div>`;

export function statsPanel(p: Person): string {
  const income = currentIncome(p);
  const independent = p.working || p.retired || p.age >= 25 || !!p.school.abroad;
  const worth = netWorth(p);
  return `<h3>状態 <small>0–100</small></h3>
    ${bar('健康', p.stats.health, 'm-health')}${bar('幸福', p.stats.happy, 'm-happy')}${bar('学び', p.stats.learn, 'm-learn')}${bar('つながり', p.stats.bond, 'm-bond')}
    <div class="money2">
      <div><small>純資産(日本の物価で)</small><b class="${worth < 0 ? 'neg' : ''}">${independent ? yen(worth) : '—'}</b><small>${independent ? (worth < 0 ? '借金がある' : p.house || p.mortgage ? '持ち家あり' : '') : 'まだ親の家で暮らしている'}</small></div>
      <div><small>年収</small><b>${income ? `$${Math.round(income).toLocaleString()}` : '—'}</b><small>${income ? `${perDay(income)}・${p.retired ? '年金' : p.formal ? '正規' : '非正規'}` : `生まれた家 ${dots(p.familyP)}`}</small></div>
    </div>`;
}

export function familyPanel(p: Person): string {
  const rel = (alive: boolean, age: number) => (alive ? `${age}歳` : '他界');
  const sibs = p.siblings.filter((s) => s.age >= 0);
  const sibDead = sibs.filter((s) => !s.alive).length;
  const rows: [string, string][] = [
    [`母 ${p.mother.name ?? ''}`, rel(p.mother.alive, p.mother.age)],
    [`父 ${p.father.name ?? ''}`, rel(p.father.alive, p.father.age)],
    ['きょうだい', sibs.length ? `${sibs.length}人${sibDead ? `(うち${sibDead}人が他界)` : ''}` : 'なし'],
  ];
  if (p.spouse) rows.push([`連れ合い ${p.spouse.name ?? ''}`, p.spouse.alive ? `${p.spouse.age}歳・${p.spouse.job ?? ''}` : '他界']);
  else if (p.dating) rows.push([`恋人 ${p.dating.name}`, `${p.dating.age}歳`]);
  for (const k of p.children) rows.push([`子ども ${k.name ?? ''}`, k.alive ? `${k.age}歳` : '他界']);
  if (p.pet) rows.push([`${p.pet.kind} ${p.pet.name}`, `${p.pet.age}歳`]);
  if (p.working && !p.retired) rows.push(['仕事', p.unemployed ? '求職中' : p.job ?? '']);
  if (p.military === 'serving') rows.push(['兵役', '服務中']);
  if (p.smoker) rows.push(['タバコ', '吸う']);
  if (p.illness) rows.push(['病気', p.illness.name]);
  if (p.hiv === 'treated') rows.push(['HIV', '治療中']);
  if (p.hobbies.length) rows.push(['好きなこと', p.hobbies.join('・')]);
  return `<h3>家族と暮らし</h3><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

export function scenePanel(p: Person): string {
  const c = byCode(p.country);
  const home = p.age < 18 && !p.working ? '親と暮らす' : p.spouse?.alive ? '家族と暮らす' : p.mortgage || p.house ? '持ち家で暮らす' : 'ひとり暮らし';
  return `<canvas class="pixscene" id="scenecv" role="img" aria-label="${esc(p.city ?? '農村')}の風景"></canvas>
    <p class="scenecap">${esc(p.city ?? '農村')}、${esc(c.name)}・${home}</p>`;
}

export function focusPanel(p: Person): string {
  if (p.age < 6) {
    return `<h3>今年の焦点</h3><p class="note">まだ幼い。親が育てている。2歳ごろに性格が見えてきて、6歳から1年の焦点を選べる。この時期は8倍速で進めてもいい。</p>`;
  }
  return `<h3>今年の焦点 <small>いつでも変えられる</small></h3><div class="focus">${FOCUS.map(([k, label, hint]) =>
    `<button data-act="focus" data-v="${k}" class="${p.focus === k ? 'on' : ''}" title="${hint}">${label}</button>`).join('')}</div>`;
}

export function logPanel(p: Person, open: boolean): string {
  const items = [...p.log].reverse();
  const shown = open ? items : items.slice(0, 14);
  return `<h3>人生の記録 <small>新しい順</small></h3><ol class="log">${shown.map((e) =>
    `<li class="k-${e.kind}${e.big ? ' big' : ''}"><span class="age">${e.age}歳</span><span>${esc(e.text)}${e.stat ? `<small class="stat">${esc(e.stat)}</small>` : ''}</span></li>`).join('')}</ol>
    ${items.length > 14 ? `<button class="link" data-act="logmore">${open ? '閉じる' : `もっと見る(${items.length})`}</button>` : ''}`;
}

export function othersPanel(others: Person[]): string {
  return `<h3>同じ1秒に生まれた人たち <small>いまのこの人たち</small></h3><ul class="others">${others.map((o) => `
    <li class="${o.alive ? '' : 'gone'}"><div><b>${esc(o.name)}</b><small>${esc(byCode(o.birthCountry).name)}・${o.sex === 'F' ? '女' : '男'}</small></div>
    <span>${esc(nowLine(o))}</span></li>`).join('')}</ul>`;
}

export function comparePanel(p: Person): string {
  const real = load<string | null>('realCountry', null);
  const b = byCode(p.birthCountry);
  if (!real) return `<h3>あなたの出生地と比べる</h3><p class="note">トップ画面で実際に生まれた国を選ぶと、ここで並べて比べられる(この端末にだけ保存)。</p>`;
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

export function countryPanel(p: Person): string {
  const c = byCode(p.country);
  const rows: [string, string][] = [
    ['年間の出生数', `${Math.round(c.births / 1e4).toLocaleString()}万人`],
    ['人口', `${(c.pop / 1e6).toFixed(1)}百万人`],
    ['平均寿命 女/男', `${c.leF.toFixed(1)} / ${c.leM.toFixed(1)}歳`],
    ['5歳未満死亡率', `1,000人あたり${(c.u5mr * 1000).toFixed(1)}`],
    ['1人当たりGDP (PPP)', `$${Math.round(c.gdp).toLocaleString()}`],
    ['所得のジニ係数', c.gini.toFixed(2)],
    ['農業で働く人', pct(c.agri)],
    ['平均教育年数', `${c.school.toFixed(1)}年`],
    ['高等教育の就学率', pct(Math.min(1, c.tertiary))],
    ['合計特殊出生率', `${c.tfr.toFixed(2)}人`],
    ['妊産婦死亡 (出生10万あたり)', `${Math.round(c.mmr)}`],
    ['HIV陽性率 (15–49歳)', pct(c.hiv, 2)],
    ['殺人発生率 (10万人あたり)', c.homicide.toFixed(1)],
    ['喫煙率', pct(c.smoke)],
    ['医療費の自己負担', pct(c.oop)],
    ['18歳未満で結婚した女性', pct(c.childMarriage)],
    ['生活満足度 (0–10)', c.happiness.toFixed(2)],
  ];
  return `<h3>${esc(c.name)}</h3><dl class="kv small ctry">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${c.est?.length ? `<p class="note">一部の値(${c.est.length}項目)は近い国から推計。</p>` : ''}
    <p class="note">出典: 国連世界人口推計2024、UN IGME、世界銀行WDI、WHO、UNESCO、UNAIDS、UNODC、UNICEF、World Happiness Report 2024 (主に Our World in Data 経由)</p>`;
}
