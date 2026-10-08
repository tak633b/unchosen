import { describe, it, expect } from 'vitest';
import { byCode } from './countries';
import { createPerson, liveOut } from './life';

// 実測 (2026-10-08, 4000人, CALIBRATION=0.85): 平均死亡年齢と平均寿命の差は JPN -0.6 / USA -0.5 / IND -0.7 / NGA -0.3 / BRA -0.6
describe('自動で生きた人生の集計が統計と合う', () => {
  for (const code of ['JPN', 'IND', 'NGA']) {
    it(code, () => {
      const c = byCode(code);
      const n = 3000;
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
    });
  }
});

describe('同じ seed からは同じ人生', () => {
  it('ログが一致する', () => {
    const a = liveOut(createPerson({ seed: 42, basis: 'births', auto: true }));
    const b = liveOut(createPerson({ seed: 42, basis: 'births', auto: true }));
    expect(a.log).toEqual(b.log);
  });
});
