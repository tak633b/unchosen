import { describe, it, expect } from 'vitest';
import { advanceYear, createPerson } from '../life';
import { choose, type Person } from '../person';
import { context, incidentChance, lure } from './incidents';

// 自動で生きた一生で、巻き込まれた出来事 (recent の inc: 印) を数える。年あたりも出す (寿命の違う国を比べるため)
function run(code: string, year: number, n: number) {
  const counts: Record<string, number> = {};
  let total = 0, years = 0;
  const ps: Person[] = [];
  for (let s = 1; s <= n; s++) {
    const p = createPerson({ seed: s * 7919 + 3, basis: 'births', country: code, auto: true, year });
    p.recent = new Proxy(p.recent, {
      set(t, k, v) {
        const key = String(k);
        if (key.startsWith('inc:')) { counts[key.slice(4)] = (counts[key.slice(4)] ?? 0) + 1; total++; }
        t[key] = v;
        return true;
      },
    });
    while (p.alive) advanceYear(p);
    years += p.age;
    ps.push(p);
  }
  return { perLife: total / n, perYear: total / years, per: (k: string) => (counts[k] ?? 0) / n, ps };
}

// 18〜29歳で、貧しく、仕事も学校もない人をその年に置く
function youth(code: string, year: number, age = 22): Person {
  const p = createPerson({ seed: 42, basis: 'births', country: code, auto: true, year: year - age });
  p.age = age;
  p.familyP = p.incomeP = 0.1;
  p.working = false;
  p.school.enrolled = false;
  return p;
}
const at = (code: string, year: number, age: number, rich = false): Person => {
  const p = youth(code, year, age);
  if (rich) p.familyP = p.incomeP = 0.9;
  return p;
};

const N = 300;
const runs = Object.fromEntries(['JPN', 'USA', 'MEX', 'BRA', 'NGA', 'IND'].map((c) => [c, run(c, 1980, N)]));

describe('犯罪と事故に巻き込まれる', () => {
  // 実測 (2026-10-12, 1980年生まれ 300人): 一生あたり / 1年あたり%
  // JPN 2.03 / 2.30、IND 1.82 / 2.92、USA 3.37 / 4.14、MEX 3.67 / 5.25、NGA 2.53 / 5.48 (寿命が短い)、BRA 3.86 / 5.60
  // 強盗 JPN 0.003・IND 0.02・USA 0.18・NGA 0.24・MEX 0.42・BRA 0.43 回/一生
  it('一生で数回。日本は少なく、殺人の多い国ほど多い', () => {
    const bounds: Record<string, [number, number]> = { JPN: [1.2, 3], IND: [1.1, 2.7], USA: [2.4, 4.5], MEX: [2.6, 5], BRA: [2.7, 5], NGA: [1.6, 3.6] };
    for (const [c, [lo, hi]] of Object.entries(bounds)) {
      expect(runs[c].perLife, c).toBeGreaterThan(lo);
      expect(runs[c].perLife, c).toBeLessThan(hi);
    }
    for (const c of ['IND', 'USA', 'MEX', 'BRA', 'NGA']) expect(runs[c].perYear, c).toBeGreaterThan(runs.JPN.perYear);
    for (const c of ['MEX', 'BRA', 'NGA']) expect(runs[c].perYear, c).toBeGreaterThan(runs.USA.perYear);
    expect(runs.JPN.per('robbery')).toBeLessThan(0.03);
    expect(runs.MEX.per('robbery')).toBeGreaterThan(0.25);
    for (const p of Object.values(runs).flatMap((r) => r.ps)) for (const e of p.log) expect(e.text).not.toMatch(/NaN|undefined/);
  });

  it('JPN 2018年には闇バイトの誘いが来ず、2020年からは来る', () => {
    expect(incidentChance(youth('JPN', 2018), 'lure')).toBe(0);
    expect(incidentChance(youth('JPN', 2020), 'lure')).toBeGreaterThan(0);
  });

  it('ネットの詐欺はネットの前に起きない。暗号資産は2017年から', () => {
    expect(incidentChance(at('USA', 1990, 40), 'online')).toBe(0);
    expect(incidentChance(at('USA', 2010, 40), 'online')).toBeGreaterThan(0);
    for (const r of Object.values(runs)) for (const p of r.ps) for (const e of p.log) {
      const y = p.birthYear + e.age;
      if (/ネットで|SNS/.test(e.text)) expect(y, e.text).toBeGreaterThanOrEqual(1995);
      if (/暗号資産/.test(e.text)) expect(y).toBeGreaterThanOrEqual(2017);
    }
  });

  it('日本の電話の詐欺は2003年から。65歳からは多い', () => {
    expect(incidentChance(at('JPN', 2002, 70), 'phone')).toBe(0);
    expect(incidentChance(at('JPN', 2005, 70), 'phone')).toBeGreaterThan(incidentChance(at('JPN', 2005, 40), 'phone'));
  });

  it('誘拐は表にある国と時代だけ', () => {
    expect(incidentChance(at('JPN', 2015, 40), 'kidnap')).toBe(0);
    expect(incidentChance(at('MEX', 2000, 40), 'kidnap')).toBe(0);
    expect(incidentChance(at('MEX', 2015, 40, true), 'kidnap')).toBeGreaterThan(incidentChance(at('MEX', 2015, 40), 'kidnap'));
  });

  it('誘いを断れば前科はつかず、乗れば多くは捕まる (闇バイト: 7割)', () => {
    let rec = 0, refusedRec = 0, auto = 0;
    const n = 300;
    for (let s = 0; s < n; s++) {
      for (const pick of [0, 1]) {
        const p = createPerson({ seed: 1000 + s, basis: 'births', country: 'JPN', year: 2000, auto: false });
        p.age = 21; p.familyP = p.incomeP = 0.1;
        lure(p, context(p));
        const d = p.pending.pop()!;
        expect(d.options).toHaveLength(2);
        if (pick === 0) auto += d.auto(p);
        choose(p, d, pick);
        if (pick === 1 && p.record) rec++;
        if (pick === 0 && p.record) refusedRec++;
      }
    }
    expect(refusedRec).toBe(0);
    expect(rec / n).toBeGreaterThan(0.6);
    expect(rec / n).toBeLessThan(0.8);
    // 自動で決めると、乗るのは6%ほど
    expect(auto / n).toBeLessThan(0.15);
  });
});
