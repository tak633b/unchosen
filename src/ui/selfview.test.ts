import { describe, expect, it } from 'vitest';
import { advanceYear, createPerson, liveOut } from '../engine/life';
import { continueAs, heirs } from '../engine/lineage';
import { selfCard } from './selfview';

// 自分の欄のどの欄にも、計算できなかった値 (NaN・undefined など) が出ない
const BAD = /NaN|undefined|null|Infinity|\[object/;
describe('自分の欄', () => {
  it('いろいろな人生・年齢で、どの欄も値が埋まる', () => {
    let cards = 0;
    for (let s = 1; s <= 120; s++) {
      const p = createPerson({ seed: s * 3571 + 9, basis: 'births', auto: true, year: [1950, 1975, 2000, 2030, 2070][s % 5], country: [undefined, 'JPN', 'IND', 'NGA', 'USA', 'BRA'][s % 6] });
      for (const stop of [0, 3, 15, 30, 50, 80]) {
        while (p.alive && p.age < stop) advanceYear(p);
        const html = selfCard(p);
        expect(html, `seed ${p.seed} age ${p.age}`).not.toMatch(BAD);
        cards++;
        if (!p.alive) break;
      }
      liveOut(p);
      expect(selfCard(p)).not.toMatch(BAD);
      const h = heirs(p)[0];
      if (h) expect(selfCard(continueAs(p, h.id!))).not.toMatch(BAD); // 続けた2世代目
      cards++;
    }
    expect(cards).toBeGreaterThan(500);
  }, 120_000);
  it('六つの欄がそろう', () => {
    const html = selfCard(liveOut(createPerson({ seed: 77, basis: 'births', auto: true, year: 1980 })));
    for (const h of ['身の上', '状態', '能力', '経験', 'お金', 'つながり']) expect(html).toContain(`<h4>${h}</h4>`);
  });
});
