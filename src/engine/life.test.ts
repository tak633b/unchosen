import { describe, it, expect } from 'vitest';
import { countryAt } from './countries';
import { createPerson, liveOut } from './life';
import { bornTable, lifeTable, MAX_AGE } from './lifetable';

// 生まれた年の人たちは、その後の各暦年の死亡率 (国連 WPP 2024。2024年以降は中位推計) で生きる。
// 比べる相手は、同じ年に生まれた人の生命表 (コホート) の平均寿命・5歳までの死亡・15歳の年の児童婚の割合。
// 実測 (2026-10-09, 1500人, seed を s*7919 + off*104729 で2セット, JPN/IND/NGA × 1960/2000/2050):
// 平均寿命の差は -0.7〜+1.3年、5歳未満の死亡の差は最大 0.019 (NGA 2000)、児童婚の差は最大 0.041 (NGA 1960)
describe('自動で生きた人生の集計が、生まれた年の統計と合う', () => {
  for (const [code, year] of [['JPN', 1960], ['JPN', 2050], ['IND', 1960], ['IND', 2000], ['NGA', 2000], ['NGA', 2050]] as const) {
    it(`${code} ${year}年生まれ`, () => {
      const n = 1500;
      let sum = 0, u5 = 0, cm = 0, women = 0;
      for (let s = 1; s <= n; s++) {
        const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', country: code, auto: true, year }));
        sum += p.age + 0.5;
        if (p.age < 5) u5++;
        if (p.sex === 'F' && p.age >= 18) { women++; if (p.childMarriage) cm++; }
      }
      const c = countryAt(code, year);
      const f = bornTable(c, 'F', year), m = bornTable(c, 'M', year);
      expect(Math.abs(sum / n - (f.e0 + m.e0) / 2)).toBeLessThan(2.5);
      expect(Math.abs(u5 / n - (1 - (f.l[5] + m.l[5]) / 2))).toBeLessThan(0.025);
      expect(Math.abs(cm / women - countryAt(code, year + 15).childMarriage)).toBeLessThan(0.06);
    }, 60_000);
  }
});

// 許容幅 = 1 + 2.5 × 標本誤差。1 は平均のずれの目標 (±1ポイント)、2.5 × 標本誤差は乱数の並びによる揺れ
const tolerance = (pct: number, n: number) => 1 + 2.5 * 100 * Math.sqrt((pct / 100) * (1 - pct / 100) / n);
// 実測 (2026-10-09, 2500人): 1960年生まれ 女 +0.6/-0.4/-0.7 男 +1.0/+1.7/+1.5、2000年生まれ 女 +1.5/-0.5/0.0 男 +1.0/+1.1/+0.6
describe('日本の高齢まで生きる割合が、生まれた年の生命表と合う', () => {
  for (const year of [1960, 2000]) {
    it(`${year}年生まれの90・95・100歳到達率`, () => {
      const ages = { M: [] as number[], F: [] as number[] };
      for (let s = 1; s <= 2500; s++) {
        const p = liveOut(createPerson({ seed: s * 7919 + 13, basis: 'births', country: 'JPN', auto: true, year }));
        ages[p.sex].push(p.age);
      }
      for (const sex of ['M', 'F'] as const) {
        const a = ages[sex];
        const l = bornTable(countryAt('JPN', year), sex, year).l;
        for (const x of [90, 95, 100]) {
          const pct = (100 * a.filter((v) => v >= x).length) / a.length;
          expect(Math.abs(pct - 100 * l[x]), `${sex} ${x}歳 ${pct.toFixed(1)}%`).toBeLessThan(tolerance(100 * l[x], a.length));
        }
        expect(Math.max(...a)).toBeLessThanOrEqual(MAX_AGE);
      }
    }, 120_000);
  }
});

// 国連の表そのものの確かめ: 2023年の日本の表から、厚労省 令和6年簡易生命表 (表3) の 90/95/100歳到達率 (%) に近いか。
// 実測: 国連の表は 女 52.5/27.6/7.9 男 28.0/10.4/1.9 で、厚労省より 0.4〜2.3ポイント高い (国連は推計で値をならす)
const JPN_REACH = { M: { 90: 25.8, 95: 9.3, 100: 1.5 }, F: { 90: 50.2, 95: 25.6, 100: 6.5 } };
describe('国連の生命表が厚労省の生命表と大きくずれない', () => {
  it('2023年の日本', () => {
    for (const sex of ['M', 'F'] as const) {
      const l = lifeTable(countryAt('JPN', 2023), sex).l;
      for (const x of [90, 95, 100] as const) expect(Math.abs(100 * l[x] - JPN_REACH[sex][x]), `${sex} ${x}`).toBeLessThan(3);
    }
  });
});

describe('同じ seed からは同じ人生', () => {
  it('ログが一致する', () => {
    const a = liveOut(createPerson({ seed: 42, basis: 'births', auto: true }));
    const b = liveOut(createPerson({ seed: 42, basis: 'births', auto: true }));
    expect(a.log).toEqual(b.log);
  });
});

describe('途中で保存して再開しても同じ人生になる', () => {
  it('30歳で保存・復元したあとのログが一致する', async () => {
    const { toSaved, fromSaved, advanceYear } = await import('./life');
    const a = createPerson({ seed: 7, basis: 'births', auto: true });
    while (a.alive && a.age < 30) advanceYear(a);
    const b = fromSaved(JSON.parse(JSON.stringify(toSaved(a))));
    liveOut(a);
    liveOut(b);
    expect(b.log).toEqual(a.log);
    expect(b.age).toBe(a.age);
  });
});
