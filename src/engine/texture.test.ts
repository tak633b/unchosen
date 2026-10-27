import { describe, expect, it } from 'vitest';
import { createPerson, liveOut } from './life';
import { pickBirthYear } from './countries';
import { makeRng } from './rng';
import { degree, nameIndex, textureOf, type Vec } from './texture';

const life = (seed: number, tilt?: Vec) => {
  const p = createPerson({ seed, basis: 'births', auto: true, year: pickBirthYear(makeRng(seed ^ 0x5eed)) });
  if (tilt) p.tilt = tilt;
  return liveOut(p);
};

// 実測 (2026-10-27, 調整に使っていない seed の1867人): 名前のない人生 23.5%、名前のある人生のうち一番多い名前 13.2%・一番少ない名前 1.8%、
// 組ごとの半々は 21〜25%。ここでは300人で、その形が崩れていないかだけを見る
describe('この人生の手ざわり', () => {
  it('名前と度合いが一つに偏らない', () => {
    const names = new Map<number | undefined, number>();
    const even = [0, 0, 0, 0];
    let n = 0;
    for (let s = 1; s <= 300; s++) {
      const t = textureOf(life(s * 104729 + 7));
      if (!t) continue;
      n++;
      const i = nameIndex(t.z);
      names.set(i, (names.get(i) ?? 0) + 1);
      t.z.forEach((v, k) => { if (!degree(v)) even[k]++; });
    }
    const named = n - (names.get(undefined) ?? 0);
    expect((names.get(undefined) ?? 0) / n).toBeLessThan(0.4);
    expect(Math.max(...[...names].filter(([i]) => i !== undefined).map(([, c]) => c)) / named).toBeLessThan(0.25);
    expect([...names.keys()].filter((i) => i !== undefined).length).toBeGreaterThanOrEqual(12);
    for (const e of even) { expect(e / n).toBeGreaterThan(0.08); expect(e / n).toBeLessThan(0.45); }
  });

  it('18歳より前に終わった人生には出ない', () => {
    const p = Array.from({ length: 20 }, (_, s) => life(s + 1)).find((q) => q.age >= 30)!;
    expect(textureOf(p)).toBeDefined();
    expect(textureOf({ ...p, age: 17 })).toBeUndefined();
  });

  // 実測 (278人): 仕事のほうへ大きく傾けると、そば・仕事の傾きの平均は -0.02 から +1.40 へ
  it('手ざわりを決めると、おまかせが傾く', () => {
    const mean = (tilt?: Vec) => {
      const zs = Array.from({ length: 50 }, (_, s) => textureOf(life(s * 7919 + 3, tilt))?.z[0]).filter((z): z is number => z !== undefined);
      return zs.reduce((a, b) => a + b, 0) / zs.length;
    };
    expect(mean([2, 0, 0, 0]) - mean()).toBeGreaterThan(0.6);
  });
});
