// 親のこと: 出産時の母の年齢 (生まれ順で変わる) と、育つあいだに両親が別れること。
import type { Country } from '../countries';
import { byCode } from '../countries';
import { makeName } from '../identity';
import { JOBS, jobName } from '../jobs';
import { bump, countryOf, log, yearOf, type Person } from '../person';
import { clamp, normal, pick } from '../rng';
import { addTie, freshName, shared } from '../bonds';
import { yearly } from './common';
import { L } from '../../i18n';

// ---- 出産時の母の平均年齢 (すべての子の平均。第1子だけではない) ----
// 国連 WPP 2024 の mean age at childbearing を丸めた値 (1950・1975・1990・2010・2020年)。1950年より前は1950年、2020年より後は2020年の値。
// 子の多い時代は40代の出産まで含むので平均は高く (1950年の韓国30.5)、少子化の始まりで若くなり (1990年のロシア25.4)、晩産化で上がる (2020年の韓国33.0)
const MAC_YEARS = [1950, 1975, 1990, 2010, 2020];
const MAC: Record<string, number[]> = {
  USA: [27.0, 25.6, 27.2, 28.3, 29.8], GBR: [28.0, 26.4, 27.8, 29.6, 30.7], FRA: [28.3, 26.7, 28.3, 30.0, 30.8],
  DEU: [27.9, 26.5, 27.8, 30.3, 31.4], SWE: [28.0, 26.8, 28.9, 30.8, 31.3], ITA: [29.0, 27.5, 29.0, 31.6, 32.2],
  ESP: [29.5, 28.0, 28.9, 31.3, 32.4], JPN: [28.7, 27.4, 28.9, 31.2, 32.0], KOR: [30.5, 28.0, 27.7, 31.3, 33.0],
  CHN: [28.5, 27.5, 25.5, 27.5, 28.8], IND: [28.0, 27.5, 27.0, 26.7, 27.0], RUS: [28.0, 26.3, 25.4, 27.4, 28.9],
  BRA: [29.3, 28.3, 26.7, 26.8, 27.9], MEX: [28.5, 28.0, 26.8, 26.3, 27.0], COL: [29.0, 27.8, 26.5, 26.8, 27.0],
  NGA: [29.5, 29.5, 29.4, 29.4, 29.5], TUR: [28.5, 27.5, 26.5, 27.7, 28.9],
};
// 表に無い国は出生率と所得から推す: 子が多いほど高い年齢の出産が増え (合計特殊出生率7で約30歳)、
// 少子の豊かな国では1985年ごろから晩産化が進む (2020年に31〜32歳)。
// ponytail: 表に無い国は目安の式。国ごとの WPP の系列を era.json に足せば置き換えられる
export function macAt(c: Country): number {
  const y = c.year ?? 2020;
  const row = MAC[c.code];
  if (row) {
    if (y <= MAC_YEARS[0]) return row[0];
    const i = MAC_YEARS.findIndex((v, k) => y < (MAC_YEARS[k + 1] ?? Infinity));
    if (i === MAC_YEARS.length - 1) return row[i];
    return row[i] + ((row[i + 1] - row[i]) * (y - MAC_YEARS[i])) / (MAC_YEARS[i + 1] - MAC_YEARS[i]);
  }
  const young = 25.5 + 0.9 * Math.max(0, c.tfr - 2.2);
  const late = clamp((y - 1985) / 35, 0, 1) * clamp(Math.log(c.gdp / 8000) / Math.log(6), 0, 1) * 5.5;
  return young + (c.tfr < 3 ? late * clamp(3 - c.tfr, 0, 1) : 0);
}
// 次の子までの間 (年)。出生間隔の中央値は30〜36か月 (DHS)
export const BIRTH_GAP = 3;
// 生まれた時の母の年齢。上のきょうだいが多いほど母は年上で、平均が国の値になるよう、上のきょうだいの数の平均 (life.ts の poisson) との差でずらす
export const motherAgeAt = (c: Country, older: number, z: number): number =>
  Math.round(clamp(macAt(c) + BIRTH_GAP * (older - Math.max(0, (c.tfr - 1) * 0.5)) + 4 * z, 15 + BIRTH_GAP * older, 46));

// ---- 育つあいだに両親が別れる ----
// 15歳までに親の別離 (離婚・同棲の解消) を経験する子の割合。2000年前後に生まれた子の値。
// 欧米・ロシア: Andersson, Thomson & Duntava (2017, Demographic Research 37) の Harmonized Histories と米国の NSFG の生命表。
// 日本: 人口動態統計 (親が離婚した未成年の子は年に約20万人、出生の約2割)。韓国も同じ統計から。
// 中南米: Esteve ら (IPUMS) と各国の世帯調査。アフリカ・南アジア: DHS の「父が生きているのに一緒に住んでいない子」と結婚の解消の割合からの目安
const SPLIT15: Record<string, number> = {
  USA: 0.4, CAN: 0.3, GBR: 0.32, IRL: 0.15, FRA: 0.26, BEL: 0.25, NLD: 0.2, DEU: 0.22, AUT: 0.22, CHE: 0.2,
  SWE: 0.3, NOR: 0.3, DNK: 0.3, FIN: 0.28, ESP: 0.14, ITA: 0.1, PRT: 0.15, GRC: 0.08, POL: 0.1, CZE: 0.25, SVK: 0.15,
  HUN: 0.22, ROU: 0.1, BGR: 0.12, RUS: 0.35, UKR: 0.3, BLR: 0.3, EST: 0.35, LVA: 0.3, LTU: 0.25,
  AUS: 0.28, NZL: 0.3, JPN: 0.13, KOR: 0.1, CHN: 0.05, IND: 0.02, PAK: 0.02, BGD: 0.05, TUR: 0.05, IRN: 0.04,
  NGA: 0.1, GHA: 0.25, ZAF: 0.2, BRA: 0.25, COL: 0.35, MEX: 0.15, ARG: 0.25, CHL: 0.2, PER: 0.25,
};
const SPLIT_REGION: Record<string, number> = { アジア: 0.05, アフリカ: 0.15, 北アメリカ: 0.25, 南アメリカ: 0.25, ヨーロッパ: 0.18, オセアニア: 0.25 };
// 1970年ごろまでは離婚がずっと少なかった (米国の1930年代生まれで15歳までに約1割、1960年生まれで2割強。Bumpass & Sweet 1989)。
// アフリカと南アジアは、昔からの結婚の解消の多さ・少なさが続くとして時代で変えない
// ponytail: 日本のように明治の離婚が多かった国の昔の山は見ていない
const ERA_K: [number, number][] = [[1900, 0.3], [1945, 0.35], [1960, 0.55], [1975, 0.85], [1990, 1]];
function eraK(year: number): number {
  if (year <= ERA_K[0][0]) return ERA_K[0][1];
  for (let i = 1; i < ERA_K.length; i++) {
    const [y1, k1] = ERA_K[i], [y0, k0] = ERA_K[i - 1];
    if (year < y1) return k0 + ((k1 - k0) * (year - y0)) / (y1 - y0);
  }
  return 1;
}
export function splitBy15(code: string, birthYear: number): number {
  const c = byCode(code);
  const base = SPLIT15[code] ?? SPLIT_REGION[c.region] ?? 0.1;
  const steady = c.region === 'アフリカ' || ['IND', 'PAK', 'BGD', 'NPL', 'LKA', 'AFG'].includes(code);
  return base * (steady ? 1 : eraK(birthYear));
}

// 母と暮らすことが多い (米国の国勢調査で、子と暮らす親の約8割が母。欧州でも8〜9割)
const WITH_MOTHER = 0.85;
const STEP_TRAITS = [['物静かな', 'quiet'], ['よく笑う', 'cheerful'], ['料理の上手な', 'warm'], ['口数の少ない', 'taciturn'], ['世話好きな', 'attentive']] as const;

export function parents(p: Person): void {
  // 輪の人の一生 (kin.ts) は記録どおりに作るので、ここでは別れさせない
  if (p.anchor || p.age > 17) return;
  const r = p.rng;
  if (!p.split) {
    if (p.age < 1 || !p.mother.alive || !p.father.alive) return;
    if (r() >= yearly(splitBy15(p.birthCountry, p.birthYear), 15)) return;
    const withMom = r() < WITH_MOTHER;
    const c = countryOf(p);
    const rare = r() < (c.gdp < 10000 ? 0.45 : 0.25); // 離れた親とほとんど会わなくなる (米国で、別に住む父の約4分の1。貧しい国では出稼ぎで多い)
    const moved = r() < 0.6;
    p.split = { age: p.age, with: withMom ? 'mother' : 'father', ...(rare ? { rare } : {}) };
    const [stay, away] = withMom ? [p.mother, p.father] : [p.father, p.mother];
    const [sw, aw, swE, awE] = withMom ? ['母', '父', 'Mother', 'Father'] : ['父', '母', 'Father', 'Mother'];
    log(p, L(`${p.age}歳の年、両親が別れた。${sw}と暮らすことになり、${rare ? `${aw}とはそれきり、ほとんど会わなくなった。` : `${aw}とは週末に会うようになった。`}${moved ? `${sw}と一緒に、新しい家に移った。` : ''}`,
      `At ${p.age}, the parents separated. Lived with ${swE.toLowerCase()}; ${rare ? `after that, hardly ever saw ${awE.toLowerCase()}.` : `saw ${awE.toLowerCase()} on weekends.`}${moved ? ` Moved with ${swE.toLowerCase()} to a new home.` : ''}`), 'hard', true,
      L(`${c.name}では、15歳までに両親の別れを経験する子はおよそ${Math.round(splitBy15(p.birthCountry, 2000) * 100)}% (2000年前後の生まれ)`, `In ${c.name}, about ${Math.round(splitBy15(p.birthCountry, 2000) * 100)}% of children born around 2000 saw their parents separate by 15`), [stay.id!, away.id!]);
    away.bond = clamp((away.bond ?? 50) - (rare ? 20 : 10), 0, 100);
    bump(p, { happy: -8 });
    if (withMom) p.familyP = clamp(p.familyP - 0.06, 0.01, 0.99); // ひとり親の家は貧しくなりやすい
    return;
  }
  const s = p.split;
  const [stay, away] = s.with === 'mother' ? [p.mother, p.father] : [p.father, p.mother];
  const awayW = s.with === 'mother' ? L('父', 'Father') : L('母', 'Mother');
  // 会う日の一場面 (一度だけ)
  if (!s.rare && away.alive && p.recent.visit === undefined && p.age - s.age >= 1 && r() < 0.3) {
    p.recent.visit = p.age;
    shared(p, [away], L(`月に二度の週末は${awayW}の家で過ごした。帰りの車では、いつも少し黙りこんだ。`, `Two weekends a month were spent at ${awayW === 'Father' ? "Father's" : "Mother's"} place. The drive back was always a little quiet.`), 'family', 3, false, undefined, 'visit');
  }
  // 離れた親の新しい家庭 (一度だけ)
  if (away.alive && p.recent.awayNew === undefined && r() < 0.1) {
    p.recent.awayNew = p.age;
    shared(p, [away], s.with === 'mother'
      ? L('父が再婚し、新しい家庭を持った。父の家には、知らない小さな子がいた。', 'Father remarried and started a new family. There was a small child at his place now.')
      : L('母が再婚し、新しい家庭を持った。', 'Mother remarried and started a new family.'), 'family', -4, false, undefined, 'away_new');
    bump(p, { happy: -2 });
  }
  const step = (p.ties ?? []).find((t) => t.role === 'step');
  // 一緒に暮らす親の新しい相手 (継親)。名前と仕事があり、人の輪に入る
  if (!step && stay.alive && p.age <= 15 && r() < (byCode(p.birthCountry).region === 'アジア' ? 0.04 : 0.08)) {
    const sex = stay.sex === 'F' ? 'M' : 'F';
    const age = Math.max(20, Math.round(stay.age + normal(r, stay.sex === 'F' ? 2 : -2, 4)));
    const name = freshName(() => makeName(r, p.country, sex, undefined, undefined, yearOf(p) - age), (p.nameKeys ??= [])).full;
    const jobs = JOBS.filter((j) => j.edu <= 3 && !j.majors);
    const job = pick(r, jobs).name;
    const [tj, te] = pick(r, STEP_TRAITS);
    const t = addTie(p, { alive: true, age, sex, name, job, role: 'step', since: p.age });
    shared(p, [t, stay], L(`${s.with === 'mother' ? '母' : '父'}の新しい相手、${tj}${name}が一緒に暮らし始めた。仕事は${job}。`,
      `${s.with === 'mother' ? "Mother's" : "Father's"} new partner, ${name}, a ${te} ${sex === 'F' ? 'woman' : 'man'}, moved in. Works as: ${jobName(job)}.`), 'family', 0, false, undefined, 'step_in');
    return;
  }
  // 数年たつと、どれだけ打ち解けたかが決まる (一度だけ)
  if (step?.alive && p.age - step.since === 3) {
    const u = r();
    const [text, d] = u < 0.35
      ? [L(`${step.name}のことを、いつのまにか本当の家族のように思っていた。`, `Somewhere along the way, ${step.name} had become family.`), 30]
      : u < 0.75
        ? [L(`${step.name}とは、ほどよい距離のまま、うまくやっている。`, `Got along with ${step.name}, at a comfortable distance.`), 10]
        : [L(`${step.name}とは、最後まで打ち解けられなかった。`, `Never really warmed to ${step.name}.`), -15];
    shared(p, [step], text, 'family', d, false, undefined, 'step_close');
  }
}
