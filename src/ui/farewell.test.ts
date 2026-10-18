import { describe, it, expect } from 'vitest';
import { createPerson, liveOut } from '../engine/life';
import { crisisScript, declineScript } from './farewell';
import { reelOf } from './reel';
import { toPast } from './death';

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

describe('走馬灯 (reelOf)', () => {
  const TONES = ['dawn', 'day', 'dusk', 'night'];
  it('区切りは年の順で、場面はその区切りの年齢のもの。死の記録は入らない', () => {
    for (let s = 1; s <= 40; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', auto: true }));
      const r = reelOf(toPast(p, [], 'births', []));
      const tones = r.chapters.map((c) => TONES.indexOf(c.tone));
      expect(tones).toEqual([...tones].sort((a, b) => a - b));
      for (const c of r.chapters) {
        const ages = c.shots.map((x) => x.age);
        expect(ages).toEqual([...ages].sort((a, b) => a - b));
        expect(ages.every((a) => a >= 1 && a <= p.age)).toBe(true);
      }
      const texts = r.chapters.flatMap((c) => c.shots.map((x) => x.text));
      const death = p.log.filter((e) => e.kind === 'death').map((e) => e.text);
      expect(texts.some((t) => death.includes(t))).toBe(false);
      expect(r.birth.text).toContain(`${p.birthYear}年`);
      expect(r.last).toContain(`${p.age}歳`);
    }
  });

  it('☆を付けた瞬間と、自分で書いた一言は必ず流れる', () => {
    // 短命な seed では小さな出来事が足りないので、20歳を越えて生きる seed を順に探す
    let seed = 31337, p = liveOut(createPerson({ seed, basis: 'births', auto: true, year: 1960 }));
    while (p.age < 20) p = liveOut(createPerson({ seed: ++seed, basis: 'births', auto: true, year: 1960 }));
    const small = p.log.filter((e) => !e.big && e.kind !== 'death' && e.age >= 1);
    const starred = [small[0], small.at(-1)!];
    for (const e of starred) e.star = true;
    p.log.push({ age: Math.min(20, p.age), text: '「まだ何も決めていない」', kind: 'school', note: true });
    const r = reelOf(toPast(p, [], 'births', []));
    const shots = r.chapters.flatMap((c) => c.shots);
    for (const e of starred) expect(shots.some((x) => x.text === e.text && x.star)).toBe(true);
    expect(shots.find((x) => x.text === '「まだ何も決めていない」')?.mine).toBe(true);
  });
});
