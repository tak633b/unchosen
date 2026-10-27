// 分かれていた国・農村の地方・空気と台所の煙・テレビの来た年・旅行の行き先・ロックダウンをしなかった国
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld } from './world';
import { advanceYear, createPerson } from './life';
import { yearOf } from './person';
import { bornIn, polityChange, polityName } from './polity';
import { sideDraft } from './divided';
import { dirtyShare, smokyKitchen } from './air';
import { REGIONS } from './regions';
import { techShare } from './tech';
import { countryAt } from './countries';
import { eventsAt } from './worldevents';
import { hasSpots } from './travel';
import moments from '../data/moments.json';

beforeAll(() => loadWorld());
const toYear = (p: ReturnType<typeof createPerson>, y: number) => { while (p.alive && yearOf(p) < y) advanceYear(p); return p; };

describe('分かれていた国', () => {
  it('側ごとの国の名前と、一つになった年の一行', () => {
    expect(polityName('DEU', 1970, 'E')).toBe('ドイツ民主共和国 (東ドイツ)');
    expect(polityName('DEU', 1970, 'W')).toBe('ドイツ連邦共和国 (西ドイツ)');
    expect(polityName('DEU', 1995, 'E')).toBeUndefined();
    expect(polityName('DEU', 1930, 'E')).toBeUndefined(); // 1918〜44年はドイツのまま
    expect(polityName('VNM', 1965, 'N')).toContain('北ベトナム');
    expect(polityName('VNM', 1965, 'S')).toContain('南ベトナム');
    expect(polityChange('DEU', 1990, 'E')).toContain('一つ');
    expect(bornIn('DEU', 1975, 'E')).toBe('ドイツ民主共和国 (東ドイツ)');
    expect(bornIn('DEU', 1975)).toBe('ドイツ');
  });
  // 実測 (2026-10-27, 8000人): 1950〜89年生まれの東の割合 25.1% (Destatis の出生の割合の平均は約25%)
  it('1950〜89年のドイツの出生の4分の1ほどが東', () => {
    let e = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) if (createPerson({ seed: 1000 + i, basis: 'births', auto: true, country: 'DEU', year: 1950 + (i % 40) }).side === 'E') e++;
    expect(e / N).toBeGreaterThan(0.22);
    expect(e / N).toBeLessThan(0.28);
    for (let i = 0; i < 50; i++) expect(createPerson({ seed: i, basis: 'births', auto: true, country: 'DEU', year: 1991 }).side).toBeUndefined();
  });
  // 実測 (2026-10-27): 1950年に東にいた人のうち1961年までに西へ移った人 13.9% (実際は約15%)。
  // 1990年に東で働いていた人のうち1993年までに職を失った人 30.5% (実際は仕事の3分の1ほどがなくなった)
  it('東から西へ逃れる人と、統一のあとの東の失業が実際の割合に近い', () => {
    let alive50 = 0, fled = 0, workers = 0, lost = 0;
    for (let i = 0; i < 2500; i++) {
      const p = createPerson({ seed: 5000 + i, basis: 'births', auto: true, country: 'DEU', year: 1925 + (i % 40) });
      if (p.side !== 'E') continue;
      let in50 = false, w90 = false;
      while (p.alive && yearOf(p) < 1994) {
        advanceYear(p);
        if (yearOf(p) === 1950 && p.alive && p.side === 'E') in50 = true;
        if (yearOf(p) === 1990 && p.alive && p.side === 'E' && p.country === 'DEU' && p.working && !p.retired) w90 = true;
      }
      if (in50) { alive50++; if (p.recent['mark:fled-west'] !== undefined && p.birthYear + p.recent['mark:fled-west'] <= 1961) fled++; }
      if (w90) { workers++; if (p.recent['evhit:deu-reunification-jobs'] !== undefined) lost++; }
    }
    expect(alive50).toBeGreaterThan(150);
    expect(fled / alive50).toBeGreaterThan(0.08);
    expect(fled / alive50).toBeLessThan(0.22);
    expect(lost / workers).toBeGreaterThan(0.18);
    expect(lost / workers).toBeLessThan(0.42);
  }, 120_000);
  it('南北ベトナムの兵役: 北は1960年から3人に2人、南は1957年から18か月、1968年からは戦争の終わるまで', () => {
    const at = (side: 'N' | 'S', y: number, seed: number) => {
      const p = createPerson({ seed, basis: 'births', auto: true, country: 'VNM', year: y - 19, gender: 'M' });
      p.side = side; p.age = 19;
      return sideDraft(p);
    };
    let called = 0;
    for (let s = 0; s < 1500; s++) if ((at('N', 1962, s) ?? 0) > 0) called++;
    expect(Math.abs(called / 1500 - 2 / 3)).toBeLessThan(0.05);
    expect(at('N', 1958, 1)).toBe(0);
    expect(at('S', 1958, 1)).toBe(18);
    expect(at('S', 1970, 1)).toBe(60);
    expect(at('S', 1955, 1)).toBe(0);
    expect(at('S', 1980, 1)).toBeUndefined(); // 一つになったあとは国の兵役
  });
});

describe('農村の地方', () => {
  it('大きな国の農村に生まれると地方が付き、農村の人口の多い地方ほど多い', () => {
    const c: Record<string, number> = {};
    let rural = 0;
    for (let i = 0; i < 1500; i++) {
      const p = createPerson({ seed: 80000 + i, basis: 'births', auto: true, country: 'IND', year: 2000 });
      if (p.city !== null) { expect(p.region).toBeUndefined(); continue; }
      rural++;
      c[p.region!] = (c[p.region!] ?? 0) + 1;
    }
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(rural);
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe('ウッタル・プラデーシュ州');
    expect(Object.keys(REGIONS).length).toBe(20); // 本家の21か国からイエメン (国の一覧に無い) を除いた数
  });
});

describe('空気と台所の煙', () => {
  // 実測 (2026-10-27): 煙の出る台所の家の割合 vs WHO の割合 (各800人) — インド 1995年 86.8/90.1・2005年 73.8/77.8・2015年 53.5/54.0、
  // ナイジェリア 2015年 93.4/94.7、中国 2005年 54.6/56.6
  it('煙の出る火で煮炊きする家の割合が、WHO の割合に近い', () => {
    for (const [code, y] of [['IND', 2005], ['CHN', 2005], ['NGA', 2015]] as const) {
      let n = 0, smoky = 0, real = 0;
      for (let i = 0; i < 500; i++) {
        const p = toYear(createPerson({ seed: 40000 + i, basis: 'births', auto: true, country: code, year: y - 10 + (i % 10) }), y);
        if (!p.alive || p.country !== code) continue;
        n++; if (smokyKitchen(p)) smoky++; real += dirtyShare(code, p.city === null, y)!;
      }
      expect(Math.abs(smoky - real) / n, code).toBeLessThan(0.07);
    }
  }, 60_000);
  it('データの前の年と、煙の少ない国では何も起きない', () => {
    expect(dirtyShare('IND', true, 1985)).toBeUndefined();
    expect(dirtyShare('JPN', false, 2010)!).toBeLessThan(0.02);
  });
});

describe('テレビと旅行', () => {
  it('テレビのある家の割合は実測に沿う (1960年のフランスはまだ少なく、日本は半分近い)', () => {
    expect(techShare(countryAt('FRA', 1960), 'tv')).toBeLessThan(0.2);
    expect(techShare(countryAt('JPN', 1960), 'tv')).toBeGreaterThan(0.35);
    expect(techShare(countryAt('USA', 1970), 'tv')).toBeGreaterThan(0.9);
    expect(techShare(countryAt('CHN', 1990), 'tv', true)).toBeLessThan(techShare(countryAt('CHN', 1990), 'tv'));
  });
  it('国内旅行の出来事の国には、行き先の一覧がある', () => {
    const m = (moments as { moments: { id: string; when?: { countries?: string[] } }[] }).moments.find((x) => x.id === 'domestic-trip')!;
    for (const c of m.when!.countries!) expect(hasSpots(c), c).toBe(true);
  });
});

describe('ロックダウンをしなかった国', () => {
  it('2020年の韓国・日本・スウェーデンには、ロックダウンの代わりに客の減った店の話', () => {
    for (const c of ['KOR', 'JPN', 'SWE']) {
      const ids = eventsAt(c, 2020).map((e) => e.id);
      expect(ids, c).toContain('covid-19-open-work');
      // ロックダウンの文 (学校が閉まり…) と、8%の失業の出来事は来ない
      expect(ids, c).not.toContain('covid-19-work');
    }
    expect(eventsAt('USA', 2020).map((e) => e.id)).toContain('covid-19-work');
  });
});
