import { countriesAt, countryAt } from '../engine/countries';
import { bornTable, MAX_AGE, type Sex } from '../engine/lifetable';
import type { Person, YearKind } from '../engine/person';
import { esc } from './dom';
import { L } from '../i18n';

export const KIND_LABEL: Record<YearKind, string> = {
  child: L('幼い日々', 'Childhood'), school: L('学び', 'School'), work: L('仕事', 'Work'), family: L('家族', 'Family'), love: L('恋愛・結婚', 'Love, marriage'),
  move: L('移住', 'Moving'), hard: L('苦しい出来事', 'Hardship'), ill: L('病気', 'Illness'), loss: L('別れ', 'Loss'), old: L('老後', 'Old age'), death: L('死', 'Death'),
};

// 人生の帯: 年が左から右へ並ぶ。色は出来事、高さはその年の幸福。平均寿命の年に印
export function lifeBand(p: Person): string {
  const born = countryAt(p.birthCountry, p.birthYear);
  const e0 = Math.round(p.sex === 'F' ? born.leF : born.leM);
  const years = Math.max(90, Math.ceil((p.age + 1) / 10) * 10);
  const bars = Array.from({ length: years }, (_, a) => {
    const k = p.kinds[a];
    const h = p.happyByAge[a];
    const future = a > p.age;
    const ht = future || h === undefined ? 12 : 18 + (h / 100) * 82;
    const mark = (a === p.age && p.alive ? ' now' : '') + (a === e0 ? ' e0' : '') + (a % 10 === 0 ? ' dec' : '');
    return `<i class="yb k-${future ? 'future' : k ?? 'child'}${mark}" style="height:${ht.toFixed(0)}%" title="${L(`${a}歳`, `Age ${a}`)}${k ? ` · ${KIND_LABEL[k]}` : ''}"></i>`;
  }).join('');
  const ticks = Array.from({ length: years / 10 + 1 }, (_, i) => `<span style="left:${((i * 10) / years) * 100}%">${i * 10}</span>`).join('');
  const used = new Set(p.kinds.filter(Boolean));
  const legend = (Object.keys(KIND_LABEL) as YearKind[])
    .filter((k) => used.has(k))
    .map((k) => `<span><i class="cell k-${k}"></i>${KIND_LABEL[k]}</span>`)
    .join('');
  return `<div class="band">${bars}</div><div class="bandticks">${ticks}</div><div class="legend">${legend}</div>
    <p class="note">${L(`高い年ほど幸せだった。印の年 = ${esc(born.name)}の${p.gender === 'X' ? '' : p.sex === 'F' ? '女性の' : '男性の'}平均寿命 ${e0}歳`, `Taller means a happier year. Marked year = life expectancy for ${p.gender === 'X' ? 'people' : p.sex === 'F' ? 'women' : 'men'} in ${esc(born.name)}, ${e0}`)}</p>`;
}

// 出生数で重み付けした、同じ年に世界で生まれた人の生存曲線
const worldCache = new Map<string, number[]>();
function worldCurve(sex: Sex, year: number): number[] {
  const key = sex + year;
  if (worldCache.has(key)) return worldCache.get(key)!;
  const list = countriesAt(year);
  const total = list.reduce((s, c) => s + c.births, 0);
  const tables = list.map((c) => bornTable(c, sex, year).l);
  const l = Array.from({ length: MAX_AGE + 1 }, (_, x) => list.reduce((s, c, i) => s + tables[i][x] * c.births, 0) / total);
  worldCache.set(key, l);
  return l;
}

export function survivalChart(p: Person): string {
  const c = countryAt(p.birthCountry, p.birthYear);
  const W = 320, H = 150, maxX = 100;
  const x = (a: number) => (a / maxX) * W;
  const y = (v: number) => H - v * H;
  const path = (l: number[]) => l.slice(0, maxX + 1).map((v, a) => `${a ? 'L' : 'M'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const mine = bornTable(c, p.sex, p.birthYear).l;
  const world = worldCurve(p.sex, p.birthYear);
  const age = Math.min(p.age, maxX);
  const alive = mine[age];
  const ticks = [0, 20, 40, 60, 80, 100].map((a) => `<text x="${x(a)}" y="${H + 14}" text-anchor="middle">${a}</text>`).join('');
  return `
  <svg viewBox="-12 -6 ${W + 24} ${H + 22}" class="survival" role="img" aria-label="${L('生存曲線', 'Survival curve')}">
    <line x1="0" y1="${H}" x2="${W}" y2="${H}" class="axis"/>
    <line x1="0" y1="${y(0.5)}" x2="${W}" y2="${y(0.5)}" class="grid"/>
    <path d="${path(world)}" class="world"/>
    <path d="${path(mine)}" class="mine"/>
    <line x1="${x(age)}" y1="0" x2="${x(age)}" y2="${H}" class="nowline"/>
    <circle cx="${x(age)}" cy="${y(alive)}" r="4" class="dot ${p.alive ? '' : 'dead'}"/>
    ${ticks}
  </svg>
  <p class="note"><span class="sw mine"></span>${L(`${esc(c.name)}${p.gender === 'X' ? 'で生まれた人' : p.sex === 'F' ? 'の女性' : 'の男性'}`, `${p.gender === 'X' ? 'People' : p.sex === 'F' ? 'Women' : 'Men'} in ${esc(c.name)}`)}　<span class="sw world"></span>${L('世界全体', 'World')}</p>
  <p>${L(`同じ年に${esc(c.name)}で生まれた${p.gender === 'X' ? '子ども' : p.sex === 'F' ? '女の子' : '男の子'}のうち、<b>${(alive * 100).toFixed(1)}%</b> が${age}歳まで生きる。`, `Of ${p.gender === 'X' ? 'children' : p.sex === 'F' ? 'girls' : 'boys'} born in ${esc(c.name)} the same year, <b>${(alive * 100).toFixed(1)}%</b> live to age ${age}.`)}</p>`;
}
