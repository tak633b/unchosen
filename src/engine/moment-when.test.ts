import { describe, it, expect } from 'vitest';
import { advanceYear, createPerson, liveOut } from './life';

// 文に出てくるきょうだい (兄・姉・下のきょうだい) がいない人には、その出来事が起きない (根拠: 長男に「兄のお下がり」が出たという報告)
describe('きょうだいの出てくる出来事', () => {
  it('兄・姉・下のきょうだいがいないと起きず、いれば起きることもある', () => {
    const NEED = { 'handmedown-uniform': 'olderBrother', 'first-motorbike-ride': 'olderBrother', 'first-period-sister': 'olderSister', 'baby-sitting-siblings': 'younger' } as const;
    const seen: Record<string, number> = {};
    for (let s = 1; s <= 600; s++) {
      const p = createPerson({ seed: s * 7919, basis: 'births', auto: true });
      // 亡くなったきょうだいの年は止まるので、1年ずつ進めて、その年の前に生きていたきょうだいで確かめる
      for (let y = 0; y < 120 && p.alive; y++) {
        const before = p.siblings.filter((b) => b.alive).map((b) => ({ ...b, rel: b.age - p.age }));
        const last = { ...p.recent };
        advanceYear(p);
        for (const [id, need] of Object.entries(NEED)) {
          if (p.recent[id] === undefined || p.recent[id] === last[id]) continue;
          seen[id] = (seen[id] ?? 0) + 1;
          const ok = before.some((b) => need === 'younger' ? b.rel < 0 && b.age >= 0 : b.rel > 0 && b.sex === (need === 'olderBrother' ? 'M' : 'F'));
          expect(ok, `${id} seed ${s * 7919}`).toBe(true);
        }
      }
    }
    expect(seen['handmedown-uniform'] ?? 0, JSON.stringify(seen)).toBeGreaterThan(0);
  }, 120_000);
});

// 病気の出来事は、その病気が実際にある国だけで起きる (根拠: 日本生まれの人がデング熱に2回かかったという報告)
describe('風土病の出来事', () => {
  it('日本ではデング熱と蚊帳が出ず、タイではデング熱が出ることもある', () => {
    const count = (country: string) => {
      let n = 0;
      for (let s = 1; s <= 300; s++) {
        const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', country, year: 1990, auto: true }));
        if (p.migratedTo) continue; // 移り住んだ先の国で起きることはある
        if (p.recent['dengue'] !== undefined || p.recent['mosquito-net'] !== undefined) n++;
      }
      return n;
    };
    expect(count('JPN')).toBe(0);
    expect(count('THA')).toBeGreaterThan(0);
  }, 120_000);
});
