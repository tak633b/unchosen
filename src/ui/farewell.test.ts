import { describe, it, expect } from 'vitest';
import { createPerson, liveOut } from '../engine/life';
import { crisisScript, declineScript, farewell, highlights } from './farewell';

describe('危うい場面の台本', () => {
  it('助かる場面と亡くなる場面は、最後の一拍まで同じ文', () => {
    const p = liveOut(createPerson({ seed: 4242, basis: 'births', auto: true }));
    const a = crisisScript(p, '心臓病', true, 50);
    const b = crisisScript(p, '心臓病', false, 50);
    expect(a.beats).toEqual(b.beats);
    expect(a.end.map((x) => x.text)).not.toEqual(b.end.map((x) => x.text));
    expect(b.end.at(-1)!.pulse).toBe('flat');
  });

  it('救急車は、その年その場所にあるときだけ', () => {
    const village = createPerson({ seed: 77, basis: 'births', country: 'IND', year: 1940, auto: true });
    village.city = null;
    expect(crisisScript(village, '交通事故', true, 20).beats.map((b) => b.text).join()).not.toContain('救急車');
    const city = createPerson({ seed: 77, basis: 'births', country: 'JPN', year: 1990, auto: true });
    city.city ??= '東京';
    expect(crisisScript(city, '交通事故', true, 25).beats.map((b) => b.text).join()).toContain('救急車');
  });

  it('病や老いの最期は静かな場面', () => {
    const p = liveOut(createPerson({ seed: 4242, basis: 'births', auto: true }));
    const s = declineScript(p);
    expect(s.survive).toBe(false);
    expect(s.beats.every((b) => b.pulse !== 'fast')).toBe(true);
  });
});

describe('最期のふりかえり', () => {
  it('大きかった出来事は5つまでで、死の記録は入らず、年の順', () => {
    for (let s = 1; s <= 60; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', auto: true }));
      const h = highlights(p.log);
      expect(h.length).toBeLessThanOrEqual(5);
      expect(h.every((e) => e.kind !== 'death' && e.big)).toBe(true);
      expect(h.map((e) => e.age)).toEqual([...h.map((e) => e.age)].sort((a, b) => a - b));
      const f = farewell(p);
      expect(f.last).toContain(`${p.age}歳`);
      expect(f.birth).toContain(`${p.birthYear}年`);
    }
  });
});
