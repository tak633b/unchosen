import { describe, expect, it } from 'vitest';
import { createPerson } from './life';
import { treat } from './events/health';

// 治療費が年収を超えても、貯えで払えるなら「借金」の選択肢にしない
describe('treat', () => {
  const diagnose = (wealth: number) => {
    const p = createPerson({ seed: 4242, basis: 'births', year: 1990, country: 'NGA' });
    p.age = 40; p.wealth = wealth; p.pending = [];
    treat(p, 'test', 3, 5);
    return p.pending[0].options[0].label;
  };
  it('borrows only what savings cannot cover', () => {
    expect(diagnose(0)).toMatch(/借金|Borrow/);
    expect(diagnose(1e9)).not.toMatch(/借|Borrow|borrow/);
  });
});
