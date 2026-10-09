// 同じ1秒に生まれた人の詳しい記録: 生まれ・家・学校・仕事・結婚・子・移住・死、主人公との比べ、その人の輪、その人の一生。
// 遊んでいる間は今の年まで (この人たちは主人公と同じ年ずつ進む)。亡くなった後の記録では一生のすべて
import { byCode } from '../engine/countries';
import { currentIncome } from '../engine/events/common';
import { causeName } from '../engine/causes';
import { jobName } from '../engine/jobs';
import { homeWord } from '../engine/life';
import { EDU_LABEL, eduLevel, type Person } from '../engine/person';
import { nowLine } from '../engine/summary';
import { esc } from './dom';
import { recordHtml } from './lifeview';
import { personCard } from './ring';
import { L } from '../i18n';

// 比べるための要約。前世の記録には Person が残らないので、主人公の分はこの形で残す (death.ts)
export interface Brief { given: string; age: number; alive: boolean; edu: number; school: number; peak: number; kids: number; countries: string[]; familyP: number }
// 学校に通った年数。大学は専攻で4年か6年 (医学)、大学院は2年 (events/school.ts)
const uniLen = (p: Person) => (p.school.major === '医学' ? 6 : 4);
export const schoolYears = (p: Person): number => p.school.years
  + (p.school.uni === 'done' ? uniLen(p) : p.school.uni === 'studying' ? p.school.uniYears : 0)
  + (p.school.grad === 'done' ? 2 : p.school.grad === 'studying' ? p.school.uniYears : 0);
export const briefOf = (p: Person): Brief => ({
  given: p.given, age: p.age, alive: p.alive, edu: p.age < 6 ? -1 : eduLevel(p), school: schoolYears(p), peak: Math.round(p.peakIncome),
  kids: p.children.length, countries: p.countriesLived, familyP: p.birthP ?? p.familyP,
});

const money = (v: number) => (v ? `$${Math.round(v).toLocaleString()}` : '—');
const lived = (b: Brief) => (b.alive ? L(`今${b.age}歳`, `${b.age} now`) : L(`${b.age}歳で亡くなった`, `Died at ${b.age}`));
const eduWord = (b: Brief) => (b.edu < 0 ? L('就学前', 'Preschool') : EDU_LABEL[b.edu]);

// 生まれた国の中での家の位置
const rank = (familyP: number, country: string) => {
  const n = Math.round(familyP * 100);
  return n <= 50 ? L(`${country}の下から${Math.max(1, n)}%`, `bottom ${Math.max(1, n)}% of ${country}`) : L(`${country}の上から${Math.max(1, 100 - n)}%`, `top ${Math.max(1, 100 - n)}% of ${country}`);
};

function facts(o: Person): [string, string][] {
  const born = { ...o, familyP: o.birthP ?? o.familyP };
  const spouses = [...(o.spouse ? [o.spouse] : []), ...(o.ties ?? []).filter((t) => t.role === 'spouse')];
  const lost = o.children.filter((k) => !k.alive).length;
  const income = o.alive ? currentIncome(o) : 0;
  const death = [...o.log].reverse().find((e) => e.kind === 'death');
  return [
    [L('生まれた家', 'Family'), `${homeWord(born.familyP)} (${rank(born.familyP, byCode(o.birthCountry).name)})`],
    [L('学校', 'School'), o.age < 6 ? L('就学前', 'Preschool') : o.school.enrolled ? L(`在学中(${o.school.years + 1}年目)`, `In school (year ${o.school.years + 1})`) : `${EDU_LABEL[eduLevel(o)]}${L(`・${schoolYears(o)}年`, `, ${schoolYears(o)} years`)}`],
    [L('仕事', 'Work'), o.job ? `${jobName(o.job)}${o.retired ? L('・引退', ', retired') : !o.working ? L('・今は働いていない', ', not working now') : ''}` : L('なし', 'None')],
    [L('収入', 'Income'), `${o.alive ? `${L('今', 'Now')} ${money(income)}${L('・', ' · ')}` : ''}${L('いちばん稼いだ年', 'Best year')} ${money(o.peakIncome)}`],
    [L('結婚', 'Marriage'), spouses.length ? spouses.map((s) => `${s.name ?? ''}${s.alive ? '' : L('(他界)', ' (deceased)')}`).join(L('、', ', ')) + (o.childMarriage ? L('・18歳前に結婚', ', married before 18') : '') : L('していない', 'Never married')],
    [L('子ども', 'Children'), o.children.length ? L(`${o.children.length}人${lost ? `(うち${lost}人が他界)` : ''}`, `${o.children.length}${lost ? ` (${lost} died)` : ''}`) : L('いない', 'None')],
    [L('暮らした国', 'Countries'), o.countriesLived.map((c) => byCode(c).name).join(' → ')],
    ...(o.alive ? (nowLine(o) === jobName(o.job ?? '') ? [] : [[L('いま', 'Now'), nowLine(o)] as [string, string]])
      : [[L('死', 'Death'), `${L(`${o.age}歳`, `At ${o.age}`)}${L('・死因 ', ', ')}${causeName(o.cause ?? '')}${death?.why ? `${L('。', '. ')}${death.why}` : ''}`] as [string, string]]),
  ];
}

function compare(o: Brief, me: Brief): string {
  const rows: [string, (b: Brief) => string][] = [
    [L('生きた年', 'Lifespan'), lived],
    [L('学歴', 'Education'), eduWord],
    [L('学校に通った年数', 'Years in school'), (b) => L(`${b.school}年`, `${b.school}`)],
    [L('いちばん稼いだ年', 'Best year income'), (b) => money(b.peak)],
    [L('子ども', 'Children'), (b) => L(`${b.kids}人`, `${b.kids}`)],
    [L('生まれた家', 'Family'), (b) => homeWord(b.familyP)],
    [L('暮らした国', 'Countries'), (b) => b.countries.map((c) => byCode(c).name).join(' → ')],
  ];
  return `<table class="cmp ocmp"><tr><th></th><th>${esc(o.given)}</th><th>${esc(me.given)}<small>${L('この人生', 'this life')}</small></th></tr>
    ${rows.map(([k, f]) => `<tr><td>${k}</td><td>${esc(f(o))}</td><td>${esc(f(me))}</td></tr>`).join('')}</table>`;
}

// sel: その人の輪で選んでいる人。life: その人の一生を開いているか。upto: この暦年より先の輪の人の一生は作らない (遊んでいる間)
export function otherHtml(o: Person, me: Brief, opts: { sel?: number; life?: boolean; upto?: number } = {}): string {
  const c = byCode(o.birthCountry).name;
  return `<section class="other">
    <div class="ohead"><div><p class="kicker">${L('同じ1秒に生まれた人', 'Born in the same second')}${L('・', ' · ')}${esc(c)}</p><h3 class="pname">${esc(o.name)}</h3>
      <p class="note">${esc(o.alive ? L(`${o.birthYear}年生まれ・今${o.age}歳`, `Born ${o.birthYear} · ${o.age} now`) : L(`${o.birthYear}–${o.birthYear + o.age}・享年${o.age}歳`, `${o.birthYear}–${o.birthYear + o.age} · died at ${o.age}`))}</p></div>
      <button class="link close" data-act="other" data-v="" aria-label="${L('閉じる', 'Close')}">×</button></div>
    <p class="obirth">${esc(o.log[0]?.text ?? '')}</p>
    <dl class="kv small ofacts">${facts(o).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <h3>${L(`${esc(me.given)}と比べる`, `Compared with ${esc(me.given)}`)}</h3>${compare(briefOf(o), me)}
    <h3>${L('この人の輪', 'Their circle')} <small>${L('顔を押すと、その人の一生が読める', 'tap a face to read that life')}</small></h3>
    <div class="oring"></div>
    ${opts.sel !== undefined ? `<div class="opcard">${personCard(o, opts.sel, opts.life ?? false, opts.upto)}</div>` : ''}
    <h3>${L('この人の記録', 'Their record')} <small>${L('古い順', 'oldest first')}</small></h3>${recordHtml(o)}
  </section>`;
}

