import { describe, it, expect } from 'vitest';
import { byCode } from './countries';
import { createPerson, liveOut } from './life';
import { MAX_AGE } from './lifetable';

// 実測 (2026-10-08 第2版, 2000人, CALIBRATION=0.78): 平均死亡年齢と平均寿命の差は JPN +0.3 / USA -0.3 / IND -2.1 / NGA -0.3〜-2 / BRA -1。
// 本家も国によって+2〜+5年ずれる (治療を選ぶ人が多いため)。ここでは±3年を許す
describe('自動で生きた人生の集計が統計と合う', () => {
  for (const code of ['JPN', 'IND', 'NGA']) {
    it(code, () => {
      const c = byCode(code);
      const n = 1500;
      let sum = 0, u5 = 0, cm = 0, women = 0;
      for (let s = 1; s <= n; s++) {
        const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', country: code, auto: true }));
        sum += p.age + 0.5;
        if (p.age < 5) u5++;
        if (p.sex === 'F' && p.age >= 18) { women++; if (p.childMarriage) cm++; }
      }
      expect(Math.abs(sum / n - (c.leF + c.leM) / 2)).toBeLessThan(3);
      expect(Math.abs(u5 / n - c.u5mr)).toBeLessThan(0.02);
      expect(Math.abs(cm / women - c.childMarriage)).toBeLessThan(0.06);
    }, 60_000);
  }
});

// 厚労省 令和6年簡易生命表 (表3, 男・女) の生存数 lx から: 出生10万人のうち x 歳まで生きる割合 (%)
const JPN_REACH = { M: { 90: 25.8, 95: 9.3, 100: 1.5 }, F: { 90: 50.2, 95: 25.6, 100: 6.5 } };
// 許容幅 = 1 + 2.5 × 標本誤差。1 は平均のずれの目標 (±1ポイント)、2.5 × 標本誤差は乱数の並びによる揺れ
// (男女各2000人ほどなので、90歳で標本誤差は 女1.1・男1.0 ポイント)。90歳で 女3.8・男3.4、100歳で 女2.4・男1.7 になる。
// 実測 (2026-10-09, seed を s*7919 + off*104729 で8セット): 実際との差の平均 女 +0.65/-0.41/-0.80  男 +0.73/+0.33/-0.29、
// 差の最大 女90歳 +3.3 (off=2)。一つ前の形 (±3 固定) では、出来事を足して乱数の並びが変わっただけで落ちた
const tolerance = (realPct: number, n: number) => 1 + 2.5 * 100 * Math.sqrt((realPct / 100) * (1 - realPct / 100) / n);
// 修正前 (傾き0.09のまま) は 女 46.8/32.7/19.6・最高齢113歳 だった
describe('日本の高齢まで生きる割合が生命表と合う', () => {
  it('90・95・100歳到達率が実際に近く、MAX_AGE を超えない', () => {
    const ages = { M: [] as number[], F: [] as number[] };
    for (let s = 1; s <= 4000; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', country: 'JPN', auto: true }));
      ages[p.sex].push(p.age);
    }
    for (const sex of ['M', 'F'] as const) {
      const a = ages[sex];
      for (const x of [90, 95, 100] as const) {
        const pct = (100 * a.filter((v) => v >= x).length) / a.length;
        expect(Math.abs(pct - JPN_REACH[sex][x]), `${sex} ${x}歳 ${pct.toFixed(1)}%`).toBeLessThan(tolerance(JPN_REACH[sex][x], a.length));
      }
      expect(Math.max(...a)).toBeLessThanOrEqual(MAX_AGE);
    }
  }, 120_000);
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
