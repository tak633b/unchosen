import { COUNTRIES, byCode } from '../engine/countries';
import { lifeTable, MAX_AGE, type Sex } from '../engine/lifetable';
import type { Person, YearKind } from '../engine/person';
import { esc } from './dom';

export const KIND_LABEL: Record<YearKind, string> = {
  child: '幼い日々', school: '学び', work: '仕事', family: '家族', love: '恋愛・結婚',
  move: '移住', hard: '苦しい出来事', ill: '病気', loss: '別れ', old: '老後', death: '死',
};

// 人生地図: 1マス = 1年。色は出来事、濃さはその年の幸福。平均寿命の年に枠
export function lifeMap(p: Person): string {
  const born = byCode(p.birthCountry);
  const e0 = Math.round(p.sex === 'F' ? born.leF : born.leM);
  const years = Math.max(90, Math.ceil((p.age + 1) / 10) * 10);
  const cells = Array.from({ length: years }, (_, a) => {
    const k = p.kinds[a];
    const cls = a > p.age ? 'future' : k ?? 'child';
    const h = p.happyByAge[a];
    const op = a > p.age || h === undefined ? '' : ` style="opacity:${(0.35 + (h / 100) * 0.65).toFixed(2)}"`;
    const mark = (a === p.age && p.alive ? ' now' : '') + (a === e0 ? ' e0' : '');
    return `<i class="cell k-${cls}${mark}"${op} title="${a}歳${k ? ` · ${KIND_LABEL[k]}` : ''}"></i>`;
  }).join('');
  const used = new Set(p.kinds.filter(Boolean));
  const legend = (Object.keys(KIND_LABEL) as YearKind[])
    .filter((k) => used.has(k))
    .map((k) => `<span><i class="cell k-${k}"></i>${KIND_LABEL[k]}</span>`)
    .join('');
  return `<div class="map">${cells}</div><div class="legend">${legend}</div>
    <p class="note">濃いほど幸せだった年。枠のマス = ${esc(born.name)}の${p.sex === 'F' ? '女性' : '男性'}の平均寿命 ${e0}歳</p>`;
}

// 出生数で重み付けした世界全体の生存曲線
let worldCache: Partial<Record<Sex, number[]>> = {};
function worldCurve(sex: Sex): number[] {
  if (worldCache[sex]) return worldCache[sex]!;
  const total = COUNTRIES.reduce((s, c) => s + c.births, 0);
  const l = Array.from({ length: MAX_AGE + 1 }, (_, x) =>
    COUNTRIES.reduce((s, c) => s + lifeTable(c, sex).l[x] * c.births, 0) / total);
  worldCache = { ...worldCache, [sex]: l };
  return l;
}

export function survivalChart(p: Person): string {
  const c = byCode(p.birthCountry);
  const W = 320, H = 150, maxX = 100;
  const x = (a: number) => (a / maxX) * W;
  const y = (v: number) => H - v * H;
  const path = (l: number[]) => l.slice(0, maxX + 1).map((v, a) => `${a ? 'L' : 'M'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const mine = lifeTable(c, p.sex).l;
  const world = worldCurve(p.sex);
  const age = Math.min(p.age, maxX);
  const alive = mine[age];
  const ticks = [0, 20, 40, 60, 80, 100].map((a) => `<text x="${x(a)}" y="${H + 14}" text-anchor="middle">${a}</text>`).join('');
  return `
  <svg viewBox="-12 -6 ${W + 24} ${H + 22}" class="survival" role="img" aria-label="生存曲線">
    <line x1="0" y1="${H}" x2="${W}" y2="${H}" class="axis"/>
    <line x1="0" y1="${y(0.5)}" x2="${W}" y2="${y(0.5)}" class="grid"/>
    <path d="${path(world)}" class="world"/>
    <path d="${path(mine)}" class="mine"/>
    <line x1="${x(age)}" y1="0" x2="${x(age)}" y2="${H}" class="nowline"/>
    <circle cx="${x(age)}" cy="${y(alive)}" r="4" class="dot ${p.alive ? '' : 'dead'}"/>
    ${ticks}
  </svg>
  <p class="note"><span class="sw mine"></span>${esc(c.name)}の${p.sex === 'F' ? '女性' : '男性'}　<span class="sw world"></span>世界全体</p>
  <p>同じ年に${esc(c.name)}で生まれた${p.sex === 'F' ? '女の子' : '男の子'}のうち、<b>${(alive * 100).toFixed(1)}%</b> が${age}歳まで生きる。</p>`;
}
