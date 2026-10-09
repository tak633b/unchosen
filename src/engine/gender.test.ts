import { describe, it, expect } from 'vitest';
import { createPerson, liveOut } from './life';

describe('性別を選ぶ', () => {
  it('女・男を選ぶとその性別になり、ほかのくじ (生まれる国) は同じ seed なら変わらない', () => {
    for (let s = 1; s <= 30; s++) {
      const base = createPerson({ seed: s * 97, basis: 'births', year: 1990 });
      for (const g of ['F', 'M'] as const) {
        const p = createPerson({ seed: s * 97, basis: 'births', year: 1990, gender: g });
        expect(p.sex).toBe(g);
        expect(p.birthCountry).toBe(base.birthCountry);
      }
    }
  });
  // 「その他」の人の誕生と死の記録は、男女どちらでもない言い方になる (根拠: 画面で性別に「その他」を選んだ人には、男女を決めつける言葉を出さないという方針)
  it('その他を選ぶと、本人の誕生と死の文に男女の言葉が出ない', () => {
    for (let s = 1; s <= 40; s++) {
      const p = liveOut(createPerson({ seed: s * 131, basis: 'births', year: 1980, gender: 'X', auto: true }));
      expect(p.gender).toBe('X');
      const birth = p.log[0], death = p.log.at(-1)!;
      expect(birth.text).not.toMatch(/女の子|男の子/);
      expect(death.why ?? '').not.toMatch(/女性|男性/);
    }
  }, 60_000);
});
