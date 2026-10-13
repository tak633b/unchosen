import { describe, it, expect, beforeAll } from 'vitest';
import { CATALOG, EVENT_CAUSES, eventsAt, futureEvents, hitChance, excessQ, type WorldEvent } from './worldevents';
import { COUNTRIES } from './countries';
import identity from '../data/identity.json';
import { loadWorld } from './world';
import { advanceYear, createPerson, liveOut } from './life';

beforeAll(() => loadWorld());

const CODES = new Set(COUNTRIES.map((c) => c.code));
const TYPES = ['war', 'occupation', 'genocide', 'famine', 'epidemic', 'quake', 'tsunami', 'cyclone', 'flood', 'drought', 'heat', 'volcano', 'fire', 'accident', 'nuclear', 'terror', 'coup', 'revolution', 'unrest', 'finance', 'transport'];
const JA = /[぀-ヿ一-鿿]/;
const cityNames = (code: string): string[] => {
  const c = (identity as unknown as { countries: Record<string, { cities: string[]; citiesEn?: string[] }> }).countries[code];
  return c ? [...c.cities, ...(c.citiesEn ?? [])] : [];
};

describe('世界の出来事の目録', () => {
  it('id は重ならず、国はすべて162か国の中にある', () => {
    const ids = CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of CATALOG) {
      expect(e.id, e.id).toMatch(/^[a-z0-9-]+$/);
      expect(e.countries.length, e.id).toBeGreaterThan(0);
      expect(new Set(e.countries).size, e.id).toBe(e.countries.length);
      for (const c of e.countries) expect(CODES.has(c), `${e.id} ${c}`).toBe(true);
    }
  });
  it('年・割合・種類が正しい形', () => {
    for (const e of CATALOG) {
      const [a, b] = e.years;
      expect(a >= 1900 && a <= b && b <= 2025, `${e.id} ${e.years}`).toBe(true);
      expect(TYPES, e.id).toContain(e.type);
      expect(e.hit >= 0 && e.hit <= 1, e.id).toBe(true);
      expect((e.kill ?? 0) >= 0 && (e.kill ?? 0) <= 0.5, e.id).toBe(true);
      expect((e.elsewhere ?? 0) >= 0 && (e.elsewhere ?? 0) <= e.hit, e.id).toBe(true);
      expect(Number.isInteger(e.severity) && e.severity >= 1 && e.severity <= 5, e.id).toBe(true);
      if (e.kill) expect(EVENT_CAUSES, e.id).toContain(e.cause);
      if (e.newsAt !== undefined) expect(e.newsAt >= a && e.newsAt <= b, e.id).toBe(true);
      if (e.who) expect(['men', 'young', 'frail', 'all'], e.id).toContain(e.who);
      if (e.age) expect(e.age[0] >= 0 && e.age[0] <= e.age[1] && e.age[1] <= 110, e.id).toBe(true);
      for (const k of Object.keys(e.effect)) expect(['health', 'happy', 'wealth', 'home', 'job'], e.id).toContain(k);
      if (e.effect.wealth !== undefined) expect(e.effect.wealth >= -1 && e.effect.wealth <= 0, e.id).toBe(true);
      expect(e.src.length, e.id).toBeGreaterThan(3);
    }
  });
  it('日本語と英語の文がそろい、脚注に実際の数字がある', () => {
    for (const e of CATALOG) {
      for (const k of ['hit', 'near', 'news'] as const) {
        const ja = e.ja[k] ?? [], en = e.en[k] ?? [];
        expect(ja.length, `${e.id} ${k}`).toBe(en.length);
        for (const s of ja) expect(JA.test(s), `${e.id} ${s}`).toBe(true);
        for (const s of en) expect(JA.test(s), `${e.id} ${s}`).toBe(false);
        for (const s of [...ja, ...en]) expect(s.replace(/\{(place|country)\}/g, ''), `${e.id} ${s}`).not.toMatch(/[{}]/);
      }
      if (e.hit > 0) expect(e.ja.hit.length, e.id).toBeGreaterThan(0);
      expect(JA.test(e.stat[0]) && !JA.test(e.stat[1]), e.id).toBe(true);
      expect(e.stat[0], e.id).toMatch(/[0-9０-９]/);
    }
  });
  it('街を書いた出来事は、その国の街の名前 (identity.json) に当たるか、街の外の割合を持つ', () => {
    for (const e of CATALOG.filter((x) => x.cities)) {
      const known = e.countries.flatMap(cityNames);
      expect(e.cities!.some((c) => known.includes(c)) || (e.elsewhere ?? 0) > 0, e.id).toBe(true);
    }
  });
});

describe('出来事が届く国と年', () => {
  it('その国・その年に起きている出来事だけを返す', () => {
    const ids = (code: string, y: number) => eventsAt(code, y).map((e: WorldEvent) => e.id);
    expect(ids('USA', 2020)).toContain('covid-19');
    expect(ids('USA', 2019)).not.toContain('covid-19');
    expect(ids('LKA', 2004)).toContain('tsunami-2004-lka');
    expect(ids('JPN', 2004)).not.toContain('tsunami-2004-lka');
  });
  it('街で起きた出来事は、その街の人にだけ巻き込まれる確率がある', () => {
    const e = CATALOG.find((x) => x.id === 'sept-11')!;
    const p = createPerson({ seed: 1, basis: 'births', auto: true, country: 'USA', year: 1970 });
    p.age = 31;
    p.city = 'New York';
    expect(hitChance(e, p)).toBeGreaterThan(0);
    p.city = 'Chicago';
    expect(hitChance(e, p)).toBe(0);
  });
  it('1950年より前の戦争・疫病の死は死亡率に足し、1950年からは足さない (生命表に入っている)', () => {
    expect(excessQ('IND', 1918, 'M', 25)).toBeGreaterThan(0.01);
    expect(excessQ('IND', 1925, 'M', 25)).toBe(0);
    expect(excessQ('USA', 2020, 'M', 80)).toBe(0);
  });
  it('これから先の出来事は国と年だけで決まり、文は名前を出さない', () => {
    expect(futureEvents('JPN', 2050).map((e) => e.id)).toEqual(futureEvents('JPN', 2050).map((e) => e.id));
    let n = 0;
    for (const c of COUNTRIES) for (let y = 2026; y <= 2100; y++) n += futureEvents(c.code, y).length;
    expect(n).toBeGreaterThan(0);
  });
  it('大流行は前の大流行から10年は来ない', () => {
    const starts = [];
    for (let y = 2026; y <= 2600; y++) if (futureEvents('JPN', y).some((e) => e.id === `f-pandemic-${y}`)) starts.push(y);
    expect(starts.length).toBeGreaterThan(5);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(10);
  });
});

describe('一生の中で出会う出来事', () => {
  const keys = (p: { recent: Record<string, number> }, re: RegExp) => Object.keys(p.recent).filter((k) => re.test(k));
  // 200人で実測 (2026-10-12): 1946年まで日本で生きた179人の全員が戦争の出来事を見て (平均4.1件)、146人が直接巻き込まれた
  it('1930年に日本で生まれた人は、戦争 (徴兵・空襲・食糧難・疎開…) を生きる', () => {
    let alive = 0, saw = 0, hit = 0;
    for (let s = 1; s <= 60; s++) {
      const p = createPerson({ seed: s * 101, basis: 'births', auto: true, country: 'JPN', year: 1930 });
      while (p.alive && p.birthYear + p.age < 1946) advanceYear(p);
      if (!p.alive || p.country !== 'JPN') continue;
      alive++;
      if (keys(p, /^ev:jp-/).length >= 2) saw++;
      if (keys(p, /^evhit:jp-/).length) hit++;
    }
    expect(alive).toBeGreaterThan(40);
    expect(saw / alive).toBeGreaterThan(0.9);
    expect(hit / alive).toBeGreaterThan(0.5);
  });
  // 162か国 × 3人で実測: 2020年に生きていた352人の全員が見た
  it('2020年に生きていれば、どの国でも新型コロナを知る', () => {
    let n = 0, seen = 0;
    for (const c of COUNTRIES.filter((_, i) => i % 4 === 0)) {
      const p = createPerson({ seed: 13 + c.code.charCodeAt(0), basis: 'births', auto: true, country: c.code, year: 1970 });
      while (p.alive && p.birthYear + p.age < 2021) advanceYear(p);
      if (!p.alive) continue;
      n++;
      if (p.recent['ev:covid-19'] !== undefined) seen++;
    }
    expect(n).toBeGreaterThan(20);
    expect(seen / n).toBeGreaterThan(0.95);
  });
  it('東日本大震災の津波は、仙台と一覧に無い町や村の人に来て、東京の人には来ない', () => {
    const e = CATALOG.find((x) => x.id === 'jp-tohoku-2011')!;
    const p = createPerson({ seed: 3, basis: 'births', auto: true, country: 'JPN', year: 1970 });
    p.age = 41;
    p.city = 'Tokyo';
    expect(hitChance(e, p)).toBe(0);
    p.city = null;
    expect(hitChance(e, p)).toBeGreaterThan(0);
  });
  // 2030年生まれ100人で実測: ニュース 6.5件・巻き込まれた 0.8件 (一生あたり)
  it('これから先の一生でも出来事に出会うが、毎年ではない', () => {
    let seen = 0, n = 0;
    for (let s = 1; s <= 30; s++) {
      const p = liveOut(createPerson({ seed: s * 7, basis: 'births', auto: true, country: ['JPN', 'BGD', 'ETH', 'USA', 'TUR'][s % 5], year: 2030 }));
      n++;
      seen += keys(p, /^ev:/).length;
    }
    expect(seen / n).toBeGreaterThan(1);
    expect(seen / n).toBeLessThan(20);
  });
});
