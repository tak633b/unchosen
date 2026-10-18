import { describe, it, expect } from 'vitest';
import { createPerson, liveOut } from './life';
import { circle } from './bonds';
import eras from '../data/name-eras.json';

// 人の輪 (家族・友だち・恋人・恩師・ライバル・孫) の中で、同じ名前の人が出ない (根拠: きょうだいと友だちが同じ名前だったという報告)
describe('人の輪の名前', () => {
  it('輪の全員の名が記録され、重ならない', () => {
    for (let s = 1; s <= 300; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', auto: true }));
      const keys = p.nameKeys ?? [];
      // 本人 + 輪の全員 (亡くなった人・離れた人も含む) が記録されている。まだ生まれていないきょうだいのぶん多いことはある
      expect(keys.length, `seed ${s * 7919}`).toBeGreaterThanOrEqual(circle(p).length + 1);
      expect(new Set(keys).size, `seed ${s * 7919}: ${keys.join(',')}`).toBe(keys.length);
    }
  }, 120_000);
});

// 名は、その人が生まれた年の名から引く (根拠: 1918年生まれの英国人が Jayden、1960年生まれの人の親が陽翔だった)
describe('生まれた年の名', () => {
  it('1910年生まれの日本人と親の名は、大正以前の名から引く', () => {
    const [[until, old]] = eras.japanese as [number, { male: string[]; female: string[] }][];
    expect(until).toBe(1926);
    for (let s = 1; s <= 200; s++) {
      const p = createPerson({ seed: s * 104729, basis: 'births', country: 'JPN', year: 1910 });
      expect(old[p.sex === 'F' ? 'female' : 'male'], `seed ${s}`).toContain(p.given);
      expect(old.female, `seed ${s} 母`).toContain(p.mother.name);
      expect(old.male, `seed ${s} 父`).toContain(p.father.name);
    }
  });
});
