import { describe, expect, it } from 'vitest';
import { advanceYear, createPerson, liveOut } from '../life';
import { othersFor } from '../lineage';
import { earnings } from '../economy';
import { countryOf } from '../person';
import { funeral } from './remember';
import { companionDeaths, household } from './household';

const N = 300;
const born = (country: string, year: number) => Array.from({ length: N }, (_, i) => liveOut(createPerson({ seed: (i + 1) * 7919 + 11, basis: 'births', auto: true, country, year })));
const per = (ps: { log: { text: string }[] }[], pat: string) => ps.reduce((s, p) => s + p.log.filter((e) => e.text.includes(pat)).length, 0) / ps.length;

describe('家の中の年々 (household / adopt)', () => {
  // 実測 (300人、2026-10-18): GBR 1990 生まれで 連れ合いの失職 0.90 / 再就職 0.89 / 稼ぎで暮らした年 0.66 / 持ち寄り 0.81 / 両親とも 0.94 / 最後の数か月 0.28 /
  // 七十・八十の誕生日 1.82 / 養子の相談 0.03 (迎えた 0.02・至らず 0.01)。IND 1960 で豊作 1.48 (自分の畑を持つ人が116人)
  it('GBR 1990: 頻度が実測の範囲にある', () => {
    const ps = born('GBR', 1990);
    expect(per(ps, '仕事を失った。しばらく')).toBeGreaterThan(0.5);
    expect(per(ps, '仕事を失った。しばらく')).toBeLessThan(1.5);
    expect(per(ps, 'また仕事を見つけた')).toBeLessThanOrEqual(per(ps, '仕事を失った。しばらく'));
    expect(per(ps, '持ち寄った')).toBeLessThanOrEqual(1);
    expect(per(ps, '両親とも、もういない')).toBeLessThanOrEqual(1);
    expect(per(ps, '十歳の誕生日')).toBeLessThanOrEqual(2);
    expect(per(ps, '相談を申し込んだ')).toBeLessThanOrEqual(0.04);
    expect(per(ps, '養子縁組が決まり')).toBeGreaterThan(0);
    expect(ps.flatMap((p) => p.children).filter((k) => k.adopted).length).toBeGreaterThan(0);
  });
  it('IND 1960: 豊作は自分の畑を持つ人だけ、3年に一度まで', () => {
    const ps = born('IND', 1960);
    expect(per(ps, '豊作')).toBeGreaterThan(0.5);
    expect(per(ps, '豊作')).toBeLessThan(2);
    for (const p of ps) {
      const ages = p.log.filter((e) => e.text.includes('豊作')).map((e) => e.age);
      for (let i = 1; i < ages.length; i++) expect(ages[i] - ages[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });
  it('同じ seed なら同じ記録 (showRng だけを使う)', () => {
    const a = liveOut(createPerson({ seed: 4242, basis: 'births', auto: true, country: 'USA', year: 1985 }));
    const b = liveOut(createPerson({ seed: 4242, basis: 'births', auto: true, country: 'USA', year: 1985 }));
    expect(a.log).toEqual(b.log);
  });
  it('親の葬儀の費用は、大人のきょうだいと頭数で分ける', () => {
    const p = createPerson({ seed: 7, basis: 'births', auto: true, country: 'IND', year: 1980 });
    p.age = 40;
    p.siblings = [{ alive: true, age: 42, sex: 'M' }, { alive: true, age: 36, sex: 'F' }, { alive: false, age: 30, sex: 'M' }, { alive: true, age: 10, sex: 'F' }];
    const w0 = p.wealth;
    funeral(p);
    expect(w0 - p.wealth).toBeCloseTo(earnings(countryOf(p), p.familyP) * 0.1 / 3, 6);
    expect(p.log.at(-1)!.text).toContain('きょうだいと分けて払った');
  });
  it('七十歳の誕生日: 子がいれば集まり、いなければ静かに過ぎる', () => {
    const p = createPerson({ seed: 8, basis: 'births', auto: true, country: 'JPN', year: 1950 });
    p.age = 70;
    household(p);
    expect(p.log.at(-1)!.text).toContain('七十歳の誕生日は、誰も来ないまま');
    p.children = [{ alive: true, age: 40, sex: 'F', name: '花子', id: 99 }];
    household(p);
    expect(p.log.at(-1)!.text).toContain('七十歳の誕生日に、花子が集まった');
  });
  // 実測 (60人、1975年生まれ、基準 births): 一生に 1.75 行、最大 4
  it('同じ1秒に生まれた人の死は、4人それぞれ一度だけ', () => {
    let total = 0;
    for (let s = 1; s <= 20; s++) {
      const p = createPerson({ seed: s * 104729 + 5, basis: 'births', auto: true, year: 1975 });
      const others = othersFor(p, 'births');
      while (p.alive) { advanceYear(p); for (const o of others) advanceYear(o); companionDeaths(p, others); }
      const lines = p.log.filter((e) => e.text.includes('同じ1秒に生まれた'));
      expect(lines.length).toBe(others.filter((o) => !o.alive && p.recent[`comp:${o.seed}`] !== undefined).length);
      expect(lines.length).toBeLessThanOrEqual(4);
      total += lines.length;
    }
    expect(total / 20).toBeGreaterThan(0.5);
  });
});
