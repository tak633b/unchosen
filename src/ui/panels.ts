// ゲーム画面の各パネル。どれも Person を受け取って HTML を返すだけ。
import { byCode, type Country } from '../engine/countries';
import { perDay, yen } from '../engine/economy';
import { currentIncome } from '../engine/events/common';
import { netWorth } from '../engine/events/money';
import { EDU_LABEL, eduLevel, type Focus, type Person } from '../engine/person';
import { nowLine } from '../engine/summary';
import { esc, load, pct } from './dom';
import { isEn, L, religionName } from '../i18n';
import { jobName, majorName } from '../engine/jobs';
import { face } from './ring';

export const FOCUS: [Focus, string, string][] = [
  ['health', L('健康', 'Health'), L('体をいたわる', 'Look after your body')],
  ['learn', L('学び', 'Learn'), L('知識や技術を身につける', 'Gain knowledge and skills')],
  ['work', L('仕事', 'Work'), L('稼ぎを増やす。体と家族の時間は減る', 'Earn more. Less time for health and family')],
  ['family', L('家族・人', 'People'), L('家族や友人と過ごす', 'Time with family and friends')],
  ['rest', L('休む', 'Rest'), L('心を休める', 'Rest your mind')],
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
    [L('性別', 'Sex'), p.sex === 'F' ? L('女性', 'Female') : L('男性', 'Male')],
    [L('出生', 'Born'), isEn
      ? `${byCode(p.birthCountry).name}, ${new Date(p.birthYear, p.birthMonth - 1).toLocaleString('en', { month: 'short' })} ${p.birthYear}`
      : `${byCode(p.birthCountry).name}・${p.birthYear}年${p.birthMonth}月`],
    [L('住まい', 'Lives'), `${p.city ?? L('農村', 'Rural area')}${L('、', ', ')}${c.name}`],
    [L('宗教', 'Religion'), religionName(p.religion)],
    [L('生まれた家', 'Family'), dots(p.familyP)],
    [L('学歴', 'School'), p.age < 6 ? L('就学前', 'Preschool') : p.school.enrolled ? L(`在学中(${p.school.years + 1}年目)`, `In school (year ${p.school.years + 1})`) : p.school.uni === 'studying' ? `${L('大学在学中', 'At university')}${p.school.major ? `${L('・', ', ')}${majorName(p.school.major)}` : ''}` : EDU_LABEL[eduLevel(p)]],
  ];
  return `<div class="idhead"><span>${L('身分の記録', 'Identity record')}${L('・', ' · ')}${p.birthCountry}</span><span>${p.birthYear}</span></div>
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
  return `<h3>${L('状態', 'Status')} <small>0–100</small></h3>
    ${bar(L('健康', 'Health'), p.stats.health, 'm-health')}${bar(L('幸福', 'Happy'), p.stats.happy, 'm-happy')}${bar(L('学び', 'Learn'), p.stats.learn, 'm-learn')}${bar(L('つながり', 'Ties'), p.stats.bond, 'm-bond')}
    <div class="money2">
      <div><small>${L('純資産(日本の物価で)', 'Net worth')}</small><b class="${worth < 0 ? 'neg' : ''}">${independent ? yen(worth) : '—'}</b><small>${independent ? (worth < 0 ? L('借金がある', 'In debt') : p.house || p.mortgage ? L('持ち家あり', 'Owns a home') : '') : L('まだ親の家で暮らしている', 'Still lives with parents')}</small></div>
      <div><small>${L('年収', 'Income')}</small><b>${income ? `$${Math.round(income).toLocaleString()}` : '—'}</b><small>${income ? `${perDay(income)}${L('・', ' · ')}${p.retired ? L('年金', 'pension') : p.formal ? L('正規', 'formal') : L('非正規', 'informal')}` : `${L('生まれた家', 'Family')} ${dots(p.familyP)}`}</small></div>
    </div>`;
}

export function familyPanel(p: Person): string {
  const yrs = (age: number) => L(`${age}歳`, `${age}`);
  const rel = (alive: boolean, age: number) => (alive ? yrs(age) : L('他界', 'Deceased'));
  const sibs = p.siblings.filter((s) => s.age >= 0);
  const sibDead = sibs.filter((s) => !s.alive).length;
  const rows: [string, string][] = [
    [`${L('母', 'Mother')} ${p.mother.name ?? ''}`, rel(p.mother.alive, p.mother.age)],
    [`${L('父', 'Father')} ${p.father.name ?? ''}`, rel(p.father.alive, p.father.age)],
    [L('きょうだい', 'Siblings'), sibs.length ? L(`${sibs.length}人${sibDead ? `(うち${sibDead}人が他界)` : ''}`, `${sibs.length}${sibDead ? ` (${sibDead} deceased)` : ''}`) : L('なし', 'None')],
  ];
  if (p.spouse) rows.push([`${L('連れ合い', 'Spouse')} ${p.spouse.name ?? ''}`, p.spouse.alive ? `${yrs(p.spouse.age)}${p.spouse.job ? `${L('・', ', ')}${jobName(p.spouse.job)}` : ''}` : L('他界', 'Deceased')]);
  else if (p.dating) rows.push([`${L('恋人', 'Partner')} ${p.dating.name}`, yrs(p.dating.age)]);
  for (const k of p.children) rows.push([`${L('子ども', 'Child')} ${k.name ?? ''}`, k.alive ? yrs(k.age) : L('他界', 'Deceased')]);
  if (p.pet) rows.push([`${L(p.pet.kind, p.pet.kind === '犬' ? 'Dog' : 'Cat')} ${p.pet.name}`, yrs(p.pet.age)]);
  if (p.working && !p.retired) rows.push([L('仕事', 'Job'), p.unemployed ? L('求職中', 'Looking for work') : p.job ? jobName(p.job) : '']);
  if (p.military === 'serving') rows.push([L('兵役', 'Military'), L('服務中', 'Serving')]);
  if (p.smoker) rows.push([L('タバコ', 'Tobacco'), L('吸う', 'Smokes')]);
  if (p.illness) rows.push([L('病気', 'Illness'), p.illness.name]);
  if (p.hiv === 'treated') rows.push(['HIV', L('治療中', 'On treatment')]);
  if (p.hobbies.length) rows.push([L('好きなこと', 'Likes'), p.hobbies.join(L('・', ', '))]);
  return `<h3>${L('家族と暮らし', 'Family and life')}</h3><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

export function scenePanel(p: Person): string {
  const c = byCode(p.country);
  const home = p.age < 18 && !p.working ? L('親と暮らす', 'with parents') : p.spouse?.alive ? L('家族と暮らす', 'with family') : p.mortgage || p.house ? L('持ち家で暮らす', 'in own home') : L('ひとり暮らし', 'alone');
  const place = p.city ?? L('農村', 'Rural area');
  return `<canvas class="pixscene" id="scenecv" role="img" aria-label="${esc(L(`${place}の風景`, `View of ${place}`))}"></canvas>
    <p class="scenecap">${esc(place)}${L('、', ', ')}${esc(c.name)}${L('・', ' · ')}${home}</p>`;
}

export function focusPanel(p: Person): string {
  if (p.age < 6) {
    return `<h3>${L('今年の焦点', 'This year\'s focus')}</h3><p class="note">${L('まだ幼い。親が育てている。2歳ごろに性格が見えてきて、6歳から1年の焦点を選べる。この時期は8倍速で進めてもいい。', 'Still small. The parents are raising the child. Personality shows around age 2, and from age 6 you choose a focus for each year. Feel free to run this stretch at 8×.')}</p>`;
  }
  return `<h3>${L('今年の焦点', 'This year\'s focus')} <small>${L('いつでも変えられる', 'change anytime')}</small></h3><div class="focus">${FOCUS.map(([k, label, hint]) =>
    `<button data-act="focus" data-v="${k}" class="${p.focus === k ? 'on' : ''}" title="${hint}">${label}</button>`).join('')}</div>`;
}

export function logPanel(p: Person, open: boolean): string {
  const items = [...p.log].reverse();
  const shown = open ? items : items.slice(0, 14);
  return `<h3>${L('人生の記録', 'Life record')} <small>${L('新しい順', 'newest first')}</small></h3><ol class="log">${shown.map((e) =>
    `<li class="k-${e.kind}${e.big ? ' big' : ''}"><span class="age">${L(`${e.age}歳`, `${e.age}`)}</span><span>${e.ai ? '<i class="aitag">AI</i>' : ''}${esc(e.text)}${e.stat ? `<small class="stat">${esc(e.stat)}</small>` : ''}${e.why ? `<small class="why">${esc(e.why)}</small>` : ''}</span></li>`).join('')}</ol>
    ${items.length > 14 ? `<button class="link" data-act="logmore">${open ? L('閉じる', 'Close') : L(`もっと見る(${items.length})`, `More (${items.length})`)}</button>` : ''}`;
}

export function othersPanel(others: Person[], aiLines: string[] = []): string {
  return `<h3>${L('同じ1秒に生まれた人たち', 'Born in the same second')} <small>${L('いまのこの人たち', 'where they are now')}</small></h3><ul class="others">${others.map((o) => `
    <li class="${o.alive ? '' : 'gone'}"><div><b>${esc(o.name)}</b><small>${esc(byCode(o.birthCountry).name)}${L('・', ' · ')}${o.sex === 'F' ? L('女', 'F') : L('男', 'M')}</small></div>
    <span>${esc(nowLine(o))}${aiLines[others.indexOf(o)] ? `<small class="ailine">${esc(aiLines[others.indexOf(o)])}</small>` : ''}</span></li>`).join('')}</ul>`;
}

export function comparePanel(p: Person): string {
  const real = load<string | null>('realCountry', null);
  const b = byCode(p.birthCountry);
  if (!real) return `<h3>${L('あなたの出生地と比べる', 'Compare with your birthplace')}</h3><p class="note">${L('トップ画面で実際に生まれた国を選ぶと、ここで並べて比べられる(この端末にだけ保存)。', 'Pick the country you were actually born in on the start screen to compare it here (saved only on this device).')}</p>`;
  const r = byCode(real);
  const le = (c: Country) => `${(p.sex === 'F' ? c.leF : c.leM).toFixed(1)}${L('歳', '')}`;
  const rows: [string, (c: Country) => string][] = [
    [L('平均寿命', 'Life expectancy'), le],
    [L('5歳までに亡くなる子', 'Die before 5'), (c) => pct(c.u5mr, 1)],
    [L('1人当たりGDP', 'GDP per person'), (c) => `$${Math.round(c.gdp).toLocaleString()}`],
    [L('平均教育年数', 'Years of school'), (c) => L(`${c.school.toFixed(1)}年`, `${c.school.toFixed(1)}`)],
    [L('大学進学率', 'Go to university'), (c) => pct(Math.min(1, c.tertiary))],
    [L('18歳未満で結婚する女性', 'Girls married before 18'), (c) => pct(c.childMarriage)],
    [L('生活満足度 (0–10)', 'Life satisfaction (0–10)'), (c) => c.happiness.toFixed(1)],
  ];
  return `<h3>${L('あなたの出生地と比べる', 'Compare with your birthplace')}</h3><table class="cmp"><tr><th></th><th>${esc(b.name)}<small>${L('この人生', 'this life')}</small></th><th>${esc(r.name)}<small>${L('あなた', 'you')}</small></th></tr>
    ${rows.map(([k, f]) => `<tr><td>${k}</td><td>${f(b)}</td><td>${f(r)}</td></tr>`).join('')}</table>`;
}

export function countryPanel(p: Person): string {
  const c = byCode(p.country);
  const rows: [string, string][] = [
    [L('年間の出生数', 'Births per year'), isEn ? Math.round(c.births).toLocaleString() : `${Math.round(c.births / 1e4).toLocaleString()}万人`],
    [L('人口', 'Population'), L(`${(c.pop / 1e6).toFixed(1)}百万人`, `${(c.pop / 1e6).toFixed(1)} million`)],
    [L('平均寿命 女/男', 'Life exp. F/M'), `${c.leF.toFixed(1)} / ${c.leM.toFixed(1)}${L('歳', '')}`],
    [L('5歳未満死亡率', 'Under-5 deaths'), L(`1,000人あたり${(c.u5mr * 1000).toFixed(1)}`, `${(c.u5mr * 1000).toFixed(1)} per 1,000`)],
    [L('1人当たりGDP (PPP)', 'GDP per person (PPP)'), `$${Math.round(c.gdp).toLocaleString()}`],
    [L('所得のジニ係数', 'Income Gini'), c.gini.toFixed(2)],
    [L('農業で働く人', 'Work in farming'), pct(c.agri)],
    [L('平均教育年数', 'Years of school'), L(`${c.school.toFixed(1)}年`, `${c.school.toFixed(1)}`)],
    [L('高等教育の就学率', 'Tertiary enrollment'), pct(Math.min(1, c.tertiary))],
    [L('合計特殊出生率', 'Fertility rate'), L(`${c.tfr.toFixed(2)}人`, c.tfr.toFixed(2))],
    [L('妊産婦死亡 (出生10万あたり)', 'Maternal deaths (per 100k births)'), `${Math.round(c.mmr)}`],
    [L('HIV陽性率 (15–49歳)', 'HIV prevalence (15–49)'), pct(c.hiv, 2)],
    [L('殺人発生率 (10万人あたり)', 'Homicides (per 100k)'), c.homicide.toFixed(1)],
    [L('喫煙率', 'Smoking rate'), pct(c.smoke)],
    [L('医療費の自己負担', 'Out-of-pocket health'), pct(c.oop)],
    [L('18歳未満で結婚した女性', 'Women married before 18'), pct(c.childMarriage)],
    [L('生活満足度 (0–10)', 'Life satisfaction (0–10)'), c.happiness.toFixed(2)],
  ];
  return `<h3>${esc(c.name)}</h3><dl class="kv small ctry">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${c.est?.length ? `<p class="note">${L(`一部の値(${c.est.length}項目)は近い国から推計。`, `${c.est.length} values estimated from similar countries.`)}</p>` : ''}
    <p class="note">${L('出典: 国連世界人口推計2024、UN IGME、世界銀行WDI、WHO、UNESCO、UNAIDS、UNODC、UNICEF、World Happiness Report 2024 (主に Our World in Data 経由)', 'Sources: UN World Population Prospects 2024, UN IGME, World Bank WDI, WHO, UNESCO, UNAIDS, UNODC, UNICEF, World Happiness Report 2024 (mostly via Our World in Data)')}</p>`;
}

// 今年の出来事: 最近3年の記録を、関わった人の小さな顔つきで
export function yearPanel(p: Person): string {
  const recent = p.log.filter((e) => e.age >= p.age - 2).reverse();
  const ages = [...new Set(recent.map((e) => e.age))];
  return `<h3>${L('このごろ', 'Lately')} <small>${L('最近3年の出来事', 'the last three years')}</small></h3>${ages.map((a) => `<div class="yr"><span class="yrage">${L(`${a}歳`, `Age ${a}`)}</span><ol class="log">${recent.filter((e) => e.age === a).map((e) =>
    `<li class="k-${e.kind}${e.big ? ' big' : ''}"><span>${e.ai ? '<i class="aitag">AI</i>' : ''}${esc(e.text)}${e.stat ? `<small class="stat">${esc(e.stat)}</small>` : ''}${e.why ? `<small class="why">${esc(e.why)}</small>` : ''}</span>${e.who?.length ? `<span class="whos">${e.who.map((id) => `<button data-act="person" data-v="${id}">${face(id)}</button>`).join('')}</span>` : ''}</li>`).join('')}</ol></div>`).join('')}`;
}
