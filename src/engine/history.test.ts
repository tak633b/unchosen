import { describe, it, expect, beforeAll } from 'vitest';
import { createPerson, liveOut, advanceYear } from './life';
import { loadWorld } from './world';
import { byCode, COUNTRIES } from './countries';
import { layoffOf, marketReturn, phaseOf } from './market';
import { makeRng } from './rng';
import { uniK, visaRefused } from './history';
import { CHOICES } from './events/choices';
import type { Person } from './person';

beforeAll(() => loadWorld());

// その国・その年にいる人 (乱数だけ使う)
const at = (code: string, year: number, seed = 1): Person => {
  const p = createPerson({ seed, basis: 'births', auto: true, country: code, year: year - 30 });
  p.age = 30;
  return p;
};
const mean = (n: number, f: () => number) => Array.from({ length: n }, f).reduce((s, v) => s + v, 0) / n;

describe('相場の歴史', () => {
  it('過去の株は実際の年の値動きで動く (米国2008年 -39%、韓国1999年 +83%)', () => {
    const r = makeRng(1);
    expect(mean(4000, () => marketReturn('stock', 2008, byCode('USA'), r))).toBeCloseTo(-0.39, 2);
    expect(mean(4000, () => marketReturn('stock', 1999, byCode('KOR'), r))).toBeCloseTo(0.83, 2);
  });
  it('IMF危機の韓国では預金の利息が高く、2022年は世界中で預金が目減りした', () => {
    const dep = (code: string, year: number) => marketReturn('deposit', year, byCode(code), makeRng(1));
    expect(dep('KOR', 1998)).toBe(0.07);
    expect(dep('BRA', 2022)).toBe(-0.06);
    expect(dep('JPN', 2022)).toBe(-0.02);
    expect(dep('JPN', 2019)).toBe(0.005);
  });
});

describe('これから先の景気の波', () => {
  // 全162か国 × 2026〜2100年で実測: 不況 10.1%・金融危機 2.1%・失業の倍率の平均 0.999 (2026-10-11)
  it('不況と危機は歴史どおりの頻度で来て、失業の起きやすさの平均は今の統計のまま', () => {
    let rec = 0, cri = 0, lay = 0, n = 0;
    for (const c of COUNTRIES) for (let y = 2026; y <= 2100; y++) {
      const ph = phaseOf(c.code, y);
      n++; rec += +(ph === 'recession'); cri += +(ph === 'crisis'); lay += layoffOf(c.code, y);
    }
    expect(rec / n).toBeGreaterThan(0.08);
    expect(rec / n).toBeLessThan(0.13);
    expect(cri / n).toBeGreaterThan(0.015);
    expect(cri / n).toBeLessThan(0.027);
    expect(lay / n).toBeCloseTo(1, 1);
  });
  it('株の利回りの長い目で見た平均は、今の統計 (年6.5%、market.ts の LONG_RUN) のまま', () => {
    let s = 0, n = 0;
    for (const c of COUNTRIES) for (let y = 2026; y <= 2100; y++) { s += marketReturn('stock', y, c, makeRng(y)); n++; }
    expect(s / n).toBeCloseTo(0.065, 1);
  });
  it('同じ国・同じ年の景気は、誰が生きていても同じ', () => {
    expect(phaseOf('JPN', 2050)).toBe(phaseOf('JPN', 2050));
    expect(layoffOf('IND', 2077)).toBe(layoffOf('IND', 2077));
  });
});

describe('過去の世界の出来事', () => {
  it('歴史の分かれ道は、ふだんの分かれ道に混ざらず、need は決まった語だけ', () => {
    const hist = CHOICES.filter((c) => c.chance);
    expect(hist.length).toBeGreaterThan(5);
    for (const c of hist) for (const n of c.need ?? []) expect(['uni', 'educated', 'target', 'notDrafted']).toContain(n);
  });
  it('1966〜69年の中国では大学に入れない。チェコで親が職を追われた子は1989年まで入りにくい', () => {
    expect(uniK(at('CHN', 1967))).toBe(0);
    expect(uniK(at('CHN', 1978))).toBe(1);
    const p = at('CZE', 1975);
    p.recent['mark:cz-parent'] = 15;
    expect(uniK(p)).toBe(0.3);
  });
  it('カナダは2024年から学生ビザに上限 (35%減)', () => {
    const p = at('IND', 2024);
    expect(mean(4000, () => +visaRefused(p, 'CAN'))).toBeCloseTo(0.35, 1);
    expect(visaRefused(at('IND', 2015), 'CAN')).toBe(false);
  });
  it('1975年のカンボジアでは、町の人は地方へ追われ、お金はなくなる', () => {
    let seen = 0;
    for (let s = 1; s <= 40; s++) {
      const p = createPerson({ seed: s, basis: 'births', auto: true, country: 'KHM', year: 1950 });
      while (p.alive && p.birthYear + p.age < 1975) advanceYear(p);
      if (!p.alive) continue;
      advanceYear(p);
      if (!p.alive || p.countriesLived.length > 1) continue; // 国を出た人は除く
      seen++;
      expect(p.recent['hist:kh-1975'], `${s} ${p.country} ${p.age}`).toBeDefined();
      expect(p.city).toBeNull();
      expect(p.house).toBe(false);
    }
    expect(seen).toBeGreaterThan(10);
  });
  it('アルゼンチンで亡命した人は、民政移管のあとに帰るかどうかを聞かれる', () => {
    let exiled = 0;
    for (let s = 1; s <= 300; s++) {
      const p = liveOut(createPerson({ seed: s * 7919 + 1950, basis: 'births', auto: true, country: 'ARG', year: 1950 }));
      if (p.recent['mark:exile'] === undefined) continue;
      exiled++;
      expect(p.recent['hist:exile']).toBeDefined();
      const back = p.recent['hist:exile-back'];
      if (back !== undefined) expect(p.birthYear + back).toBeGreaterThanOrEqual(1984);
    }
    // 1950年生まれ300人で実測 (2026-10-11)。お金と仕事の出来事が加わって乱数の並びが変わり 13→8。2000人での割合は合流の前後で 59→62 人と変わらない
    // 2026-10-12: 犯罪と事故の出来事 (events/incidents.ts) が毎年の乱数を引くようになり 8→10
    // 2026-10-13: 親の葬儀の費用 (events/remember.ts) で財産が動き 10→11
    expect(exiled).toBe(11);
  });
});
