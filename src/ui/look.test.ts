import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../engine/countries';
import { advanceYear, createPerson } from '../engine/life';
import type { Person } from '../engine/person';
import { byCode } from '../engine/countries';
import { lookOfId, lookOfMe, lookOfRel } from './look';

// 国・生まれ年・年齢をばらして育てた人たち (決まった seed なので毎回同じ顔ぶれ)
function crowd(n: number): Person[] {
  const out: Person[] = [];
  for (let i = 0; i < n; i++) {
    const c = COUNTRIES[(i * 37) % COUNTRIES.length].code;
    const p = createPerson({ seed: 9000 + i, basis: 'births', country: c, year: 1910 + ((i * 53) % 170), auto: true });
    const age = (i * 29) % 80;
    for (let k = 0; k < age && p.alive; k++) advanceYear(p);
    out.push(p);
  }
  return out;
}

describe('ちびキャラの見た目のばらつき', () => {
  const people = crowd(150);
  const looks = people.flatMap((p) => [lookOfMe(p), lookOfRel(p, p.mother, 'mother'), lookOfRel(p, p.father, 'father')]);

  it('服・帽子・持ち物がいろいろ出る', () => {
    const wears = new Set(looks.map((l) => l.wear));
    const hats = new Set(looks.map((l) => l.hat).filter(Boolean));
    const items = new Set(looks.map((l) => l.item).filter(Boolean));
    const combos = new Set(looks.map((l) => `${l.wear}|${l.hat ?? ''}|${l.style}`));
    // 実測 (2026-10-12): 450人で 服25種・帽子15種・持ち物10種・服×帽子×髪型171通り。少し余裕を見て下限にする
    expect(wears.size).toBeGreaterThanOrEqual(20);
    expect(hats.size).toBeGreaterThanOrEqual(12);
    expect(items.size).toBeGreaterThanOrEqual(8);
    expect(combos.size).toBeGreaterThanOrEqual(140);
  });

  it('仕事や暮らしを渡しても、肌・髪・髪型は変わらない (前の記録の顔のまま)', () => {
    for (let id = 1; id < 40; id++) {
      const c = byCode(['JPN', 'NGA', 'IND', 'SAU', 'PER'][id % 5]);
      const a = lookOfId(id, c, id % 2 ? 'F' : 'M', 20 + id), b = lookOfId(id, c, id % 2 ? 'F' : 'M', 20 + id, 0, { job: '医師', rural: true, year: 1950 });
      expect([b.skin, b.hair, b.style, b.beard, b.glasses]).toEqual([a.skin, a.hair, a.style, a.beard, a.glasses]);
      expect(b.wear).toBe('coat');
    }
  });

  it('同じ人は何度作っても同じ見た目', () => {
    for (const p of people.slice(0, 20)) expect(lookOfMe(p)).toEqual(lookOfMe(p));
  });
});
