// 自分の欄: 輪の真ん中の顔を押すと開く。身の上・状態・能力・経験・お金・つながり。
// 遊んでいる間は今の姿だけ (この先のことは出さない)。エンジンが持っていない数値は作らない
import { byCode, countryAt } from '../engine/countries';
import { closest, people } from '../engine/bonds';
import { causeName } from '../engine/causes';
import { formatMoney, monthlyYen, perDay, yen } from '../engine/economy';
import { currentIncome } from '../engine/events/common';
import { netWorth } from '../engine/events/money';
import { jobName, majorName } from '../engine/jobs';
import { homeWord, riskParts } from '../engine/life';
import { generation } from '../engine/lineage';
import { EDU_LABEL, eduLevel, genderOf, genderWord, schoolYears, yearOf, type Person, type YearKind } from '../engine/person';
import { petTies } from '../engine/pets';
import { esc } from './dom';
import { worldIncomeTopAt } from './worldrank';
import { L, religionName } from '../i18n';

const pct = (x: number) => `${(x * 100).toFixed(x >= 0.1 ? 0 : x >= 0.01 ? 1 : 2)}%`;
const years = (n: number) => L(`${n}年`, `${n} ${n === 1 ? 'year' : 'years'}`);
const at = (n: number) => L(`${n}歳`, `${n}`);
const off = (k: number) => Math.abs(k - 1) > 0.005; // 1 とみなせない倍率だけを書く
const bar = (label: string, v: number, cls: string) =>
  `<div class="stat"><span>${label}</span><div class="meter"><i class="${cls}" style="width:${Math.round(v)}%"></i></div><b>${Math.round(v)}</b></div>`;
const rows = (list: [string, string][]) => `<dl class="kv small selfkv">${list.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const sec = (title: string, body: string) => `<section class="selfsec"><h4>${title}</h4>${body}</section>`;

const rank = (familyP: number, country: string) => {
  const n = Math.round(familyP * 100);
  return n <= 50 ? L(`${country}の下から${Math.max(1, n)}%`, `bottom ${Math.max(1, n)}% of ${country}`) : L(`${country}の上から${Math.max(1, 100 - n)}%`, `top ${Math.max(1, 100 - n)}% of ${country}`);
};

function identity(p: Person): string {
  const born = p.birthP ?? p.familyP;
  const list: [string, string][] = [
    [L('性別', 'Gender'), genderWord(genderOf(p))],
    [L('生まれ', 'Born'), L(`${p.birthYear}年${p.birthMonth}月・${byCode(p.birthCountry).name}`, `${p.birthYear}/${p.birthMonth}, ${byCode(p.birthCountry).name}`)],
    [L('住まい', 'Lives'), `${p.city ?? L('農村', 'rural area')}${L('、', ', ')}${byCode(p.country).name}`],
    [L('宗教', 'Religion'), religionName(p.religion)],
    [L('生まれた家', 'Family'), `${homeWord(born)} (${rank(born, byCode(p.birthCountry).name)})`],
  ];
  if (generation(p) > 1) list.push([L('世代', 'Generation'), L(`第${generation(p)}世代`, `${generation(p)}`)]);
  return sec(L('身の上', 'Identity'), `<p class="note">${esc(p.log[0]?.text ?? '')}</p>${rows(list)}`);
}

// この1年で亡くなる確率と、その内訳 (life.ts の deathRisk と同じ計算)
function riskLine(p: Person): string {
  const r = riskParts(p);
  const c = countryAt(p.country, yearOf(p));
  const parts = [
    off(r.healthK) && L(`健康 ×${r.healthK.toFixed(2)}`, `health ×${r.healthK.toFixed(2)}`),
    off(r.wealthK) && L(`生まれた家 ×${r.wealthK.toFixed(2)}`, `family wealth ×${r.wealthK.toFixed(2)}`),
    off(r.smokeK) && L(`タバコ ×${r.smokeK.toFixed(2)}`, `smoking ×${r.smokeK.toFixed(2)}`),
    off(r.drinkK) && L(`お酒 ×${r.drinkK.toFixed(2)}`, `drinking ×${r.drinkK.toFixed(2)}`),
    off(r.illK) && L(`病気 ×${r.illK.toFixed(2)}`, `illness ×${r.illK.toFixed(2)}`),
    r.hivAdd > 0 && L(`HIV +${pct(r.hivAdd)}`, `HIV +${pct(r.hivAdd)}`),
    off(r.cal) && L(`統計に合わせる補正 ×${r.cal.toFixed(2)}`, `calibration to the statistics ×${r.cal.toFixed(2)}`),
  ].filter(Boolean);
  return L(`${c.name}で${p.age}歳の${p.sex === 'F' ? '女性' : '男性'}が1年で亡くなる確率は${pct(r.table)}。${parts.length ? `この人には${parts.join('、')}がかかる` : 'この人もほぼ同じ'}`,
    `For a ${p.age}-year-old ${p.sex === 'F' ? 'woman' : 'man'} in ${c.name}, the chance of dying within a year is ${pct(r.table)}. ${parts.length ? `For this person: ${parts.join(', ')}` : 'About the same for this person'}`);
}

function condition(p: Person): string {
  const list: [string, string][] = [
    [L('病気', 'Illness'), p.illness ? L(`${p.illness.name}・${p.illness.years}年目`, `${p.illness.name}, year ${p.illness.years}`) : L('なし', 'None')],
    [L('タバコ', 'Tobacco'), p.smoker ? L('吸う', 'Smokes') : L('吸わない', 'No')],
    [L('お酒', 'Alcohol'), p.drinker ? L('よく飲む', 'Drinks heavily') : L('ふつう', 'Moderate or none')],
  ];
  if (p.hiv !== 'none') list.push(['HIV', p.hiv === 'treated' ? L(`治療中・${p.hivYears}年`, `On treatment, ${years(p.hivYears)}`) : L(`治療を受けていない・${p.hivYears}年`, `Untreated, ${years(p.hivYears)}`)]);
  const death = [...p.log].reverse().find((e) => e.kind === 'death');
  const end = p.alive
    ? `<p class="why">${L('この1年で亡くなる確率', 'Chance of dying this year')} <b>${pct(riskParts(p).q)}</b>${L('。', '. ')}${esc(riskLine(p))}</p>`
    : `<p class="why">${esc(L(`${p.age}歳で亡くなった。死因: ${causeName(p.cause ?? '')}`, `Died at ${p.age}. Cause: ${causeName(p.cause ?? '')}`))}${death?.why ? `${L('。', '. ')}${esc(death.why)}` : ''}</p>`;
  return sec(L('状態', 'Condition'), `${bar(L('健康', 'Health'), p.stats.health, 'm-health')}${bar(L('幸福', 'Happiness'), p.stats.happy, 'm-happy')}${rows(list)}${end}`);
}

function abilities(p: Person): string {
  const list: [string, string][] = [];
  if (p.temperament) list.push([L('気質', 'Temperament'), p.temperament]);
  list.push([L('好きなこと', 'Likes'), p.hobbies.join(L('・', ', ')) || L('まだない', 'Nothing yet')]);
  return sec(L('能力', 'Abilities'), `${bar(L('学び', 'Learning'), p.stats.learn, 'm-learn')}${bar(L('つながり', 'Ties'), p.stats.bond, 'm-bond')}${bar(L('暮らし向き', 'Means'), p.stats.money, 'm-happy')}<p class="note">${L('学び = 知識と技術。つながり = 人との近さ。暮らし向き = 国の中での所得の位置。', 'Learning: knowledge and skills. Ties: closeness to people. Means: income rank in the country.')}</p>${rows(list)}`);
}

const KIND: Record<YearKind, [string, string]> = {
  child: ['幼い日々', 'childhood'], school: ['学校', 'school'], work: ['仕事', 'work'], family: ['家族', 'family'], love: ['恋愛', 'love'],
  loss: ['別れ', 'loss'], ill: ['病気', 'illness'], move: ['移住', 'moving'], old: ['老い', 'old age'], hard: ['苦しい時', 'hard times'], death: ['死', 'death'],
};

function experience(p: Person): string {
  const s = p.school;
  const edu = p.age < 6 ? L('就学前', 'Preschool') : s.enrolled ? L(`在学中 (${s.years + 1}年目)`, `In school (year ${s.years + 1})`) : EDU_LABEL[eduLevel(p)];
  const list: [string, string][] = [
    [L('学校', 'School'), `${edu}${L(`・通った年数 ${schoolYears(p)}年`, `, ${schoolYears(p)} years in school`)}${s.track ? L(`・${s.track === 'general' ? '普通科' : '職業科'}`, `, ${s.track === 'general' ? 'academic' : 'vocational'} track`) : ''}`],
  ];
  if (s.uni !== 'no') list.push([L('大学', 'University'), `${s.major ? majorName(s.major) : L('学士', "bachelor's")}${L('・', ', ')}${s.uni === 'done' ? L('卒業', 'graduated') : L('在学中', 'studying')}${s.grad !== 'no' ? L(`・大学院${s.grad === 'done' ? 'を修了' : 'に在学中'}`, `, graduate school ${s.grad === 'done' ? 'completed' : 'in progress'}`) : ''}`]);
  if (s.abroad) list.push([L('留学', 'Studied abroad'), byCode(s.abroad).name]);
  if (p.military !== 'none') list.push([L('兵役', 'Military'), p.military === 'serving' ? L('服務中', 'Serving') : p.military === 'done' ? L('終えた', 'Completed') : L('猶予', 'Deferred')]);
  list.push([L('仕事', 'Work'), p.job ? `${jobName(p.job)}${L(`・${p.jobYears}年`, `, ${years(p.jobYears)}`)}${L('・', ', ')}${p.selfEmployed ? L('自分で営む', 'self-employed') : p.formal ? L('正規', 'formal') : L('非正規', 'informal')}${p.retired ? L('・引退', ', retired') : p.unemployed ? L('・求職中', ', looking for work') : ''}` : L('まだない', 'None yet')]);
  list.push([L('暮らした国', 'Countries'), p.countriesLived.map((c) => byCode(c).name).join(' → ')]);
  const firstWork = p.log.find((e) => e.kind === 'work' && !e.tpl);
  const wed = p.log.find((e) => e.big && (e.kind === 'love' || e.kind === 'hard') && e.who?.length);
  const firsts = [
    firstWork && L(`初めての仕事 ${firstWork.age}歳`, `first job at ${firstWork.age}`),
    wed && L(`結婚 ${wed.age}歳`, `married at ${wed.age}`),
    p.children[0] && L(`最初の子 ${p.children[0].since}歳`, `first child at ${p.children[0].since}`),
  ].filter(Boolean) as string[];
  if (firsts.length) list.push([L('はじめて', 'Firsts'), firsts.join(L('・', ', '))]);
  const counts = new Map<YearKind, number>();
  for (const e of p.log) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  list.push([L('出来事の数', 'Moments by kind'), [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${L(...KIND[k])} ${n}`).join(L('・', ', '))]);
  // 仕事の記録: その年の色が「仕事」だった日常の出来事 (tpl) は除く
  const work = p.log.filter((e) => e.kind === 'work' && !e.tpl).slice(-6);
  return sec(L('経験', 'Experience'), `${rows(list)}${work.length ? `<p class="note">${L('仕事の記録 (新しい6つ)', 'Work record (latest 6)')}</p><ol class="log selfwork">${work.map((e) => `<li><span class="age">${at(e.age)}</span><span>${esc(e.text)}</span></li>`).join('')}</ol>` : ''}`);
}

function money(p: Person): string {
  const income = currentIncome(p);
  const list: [string, string][] = [
    [p.alive ? L('年収', 'Income') : L('最後の年収', 'Last income'), income ? `${formatMoney(income)}${L('・', ' · ')}${perDay(income)}${L('・日本の感覚で月', ' · ')}${monthlyYen(income)}` : L('なし', 'None')],
    p.wealth >= 0 ? [L('貯え', 'Savings'), `${yen(p.wealth)}`] : [L('借金', 'Debt'), `${yen(-p.wealth)}`],
  ];
  if (p.mortgage) list.push([L('家', 'Home'), L(`ローンで買った家 (価値 ${yen(p.mortgage.value)}・返済あと${p.mortgage.years}年)`, `Bought with a mortgage (worth ${yen(p.mortgage.value)}, ${years(p.mortgage.years)} left)`)]);
  else list.push([L('家', 'Home'), p.house ? L('持ち家', 'Owns a home') : L('持ち家はない', 'No home of their own')]);
  list.push([L('車', 'Car'), p.car ? L('ある', 'Yes') : L('ない', 'No')]);
  list.push([L('純資産', 'Net worth'), yen(netWorth(p))]);
  list.push([L('いちばん稼いだ年', 'Best year'), p.peakIncome ? `${formatMoney(p.peakIncome)}${p.peakYear ? L(` (${p.peakYear}年)`, ` (${p.peakYear})`) : ''}` : '—']);
  if (income) list.push([L('世界の中の所得', 'World income rank'), L(`${yearOf(p)}年の世界の上位${Math.max(1, Math.round(worldIncomeTopAt(income, yearOf(p)) * 100))}%`, `top ${Math.max(1, Math.round(worldIncomeTopAt(income, yearOf(p)) * 100))}% of the world in ${yearOf(p)}`)]);
  return sec(L('お金', 'Money'), `${rows(list)}<p class="note">${L('金額は購買力平価ドル。円は日本の物価に直した目安。', 'Amounts in purchasing-power dollars.')}</p>`);
}

function ties(p: Person): string {
  const all = people(p);
  const n = (f: (t: (typeof all)[number]) => boolean) => { const l = all.filter(f); return L(`${l.length}人 (生きている${l.filter((t) => t.alive).length}人)`, `${l.length} (${l.filter((t) => t.alive).length} living)`); };
  const pets = petTies(p);
  const best = closest(p, 1)[0];
  return sec(L('つながり', 'People'), rows([
    [L('家族', 'Family'), n((t) => ['mother', 'father', 'sibling', 'spouse', 'grandparent'].includes(t.role))],
    [L('子ども', 'Children'), n((t) => t.role === 'child')],
    [L('孫', 'Grandchildren'), n((t) => t.role === 'grandchild')],
    [L('友だち・恩師', 'Friends and mentors'), n((t) => t.role === 'friend' || t.role === 'mentor')],
    [L('恋人 (今と昔)', 'Partners (now and past)'), n((t) => t.role === 'partner' || t.role === 'ex' || (t.role === 'spouse'))],
    [L('ペット', 'Pets'), L(`${pets.length}匹 (今いる${pets.filter((t) => t.alive).length}匹)`, `${pets.length} (${pets.filter((t) => t.alive).length} now)`)],
    [L('いちばん近い人', 'Closest'), best ? `${best.name ?? ''}` : L('いない', 'No one')],
  ]));
}

export function selfCard(p: Person): string {
  return `<div class="pchead"><canvas class="pix big" data-face="0" aria-hidden="true"></canvas><div>
      <p class="kicker">${L('この人生のあなた', 'You, this life')}</p><h3 class="pname">${esc(p.name)}</h3>
      <p class="note">${p.alive ? L(`${p.age}歳・${yearOf(p)}年`, `Age ${p.age} · ${yearOf(p)}`) : L(`${p.birthYear}–${yearOf(p)}・享年${p.age}歳`, `${p.birthYear}–${yearOf(p)} · died at ${p.age}`)}</p></div>
      <button class="link close" data-act="person" data-v="" aria-label="${L('閉じる', 'Close')}">×</button></div>
    <div class="selfcard">${identity(p)}${condition(p)}${abilities(p)}${experience(p)}${money(p)}${ties(p)}</div>`;
}
