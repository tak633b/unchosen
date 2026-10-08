import { describe, it, expect } from 'vitest';
import { byCode } from './countries';
import { createPerson, liveOut } from './life';

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
