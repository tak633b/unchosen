import { describe, it, expect } from 'vitest';
import { createPerson, liveOut } from './life';

// 「なぜ」の一行: 人の死と本人の死には必ず付く。文に数字の壊れ (NaN・undefined・Infinity) が混ざらない
describe('出来事のなぜ', () => {
  it('死別と本人の死に why が付き、壊れた数字を含まない', () => {
    let deaths = 0, whys = 0;
    for (const code of ['NGA', 'IND', 'JPN']) {
      for (let s = 1; s <= 200; s++) {
        const p = liveOut(createPerson({ seed: s * 104729, basis: 'births', country: code, auto: true }));
        for (const e of p.log) {
          if (e.why) { whys++; expect(e.why).not.toMatch(/NaN|undefined|Infinity/); }
          if (e.kind === 'death' || (e.who?.length && /が.*亡くなった/.test(e.text))) { deaths++; expect(e.why, e.text).toBeTruthy(); }
        }
      }
    }
    console.log({ deaths, whys });
    expect(deaths).toBeGreaterThan(600);
  }, 60_000);
});
