import { describe, it, expect } from 'vitest';
import { advanceYear, createPerson, liveOut } from './life';
import { countryAt } from './countries';
import { macAt } from './events/parents';
import type { Person } from './person';

const born = (n: number, country: string, year: number, extra = {}) =>
  Array.from({ length: n }, (_, i) => createPerson({ seed: i * 7919 + year, basis: 'births', country, year, auto: true, ...extra }));
const upTo = (p: Person, age: number) => { while (p.alive && p.age < age) advanceYear(p); return p; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('生まれ順と母の年齢', () => {
  // 実測 (1500人): 米国2010年 平均28.5 (WPP 28.3〜29.8 の間)、第1子27.0・2人目以降30.8。ナイジェリア 29.5、第1子22.6
  it('平均は国の値に近く、第1子の母は後の子の母より若い', () => {
    for (const [code, year] of [['USA', 2010], ['JPN', 2010], ['NGA', 2010], ['IND', 1960]] as const) {
      const ps = born(1500, code, year);
      const m = mean(ps.map((p) => p.mother.age));
      expect(Math.abs(m - macAt(countryAt(code, year)))).toBeLessThan(1);
      const first = mean(ps.filter((p) => !p.siblings.some((s) => s.age > 0)).map((p) => p.mother.age));
      const later = mean(ps.filter((p) => p.siblings.some((s) => s.age > 0)).map((p) => p.mother.age));
      expect(later - first).toBeGreaterThan(2);
    }
  });
  it('いちばん上のきょうだいも、母が15歳になってから生まれている', () => {
    for (const p of born(800, 'NGA', 1960)) {
      const oldest = Math.max(0, ...p.siblings.map((s) => s.age));
      expect(p.mother.age - oldest).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('育つあいだに両親が別れる', () => {
  // 実測 (400人): 米国1990年生まれ 40.7% (目安40%)、1930年生まれ 14.2%、インド1990年 1.5%、日本2010年 13.3%
  const by15 = (code: string, year: number) => {
    const ps = born(400, code, year).map((p) => upTo(p, 15)).filter((p) => p.alive);
    return ps.filter((p) => p.split).length / ps.length;
  };
  it('国と時代の割合で起きる', () => {
    expect(by15('USA', 1990)).toBeGreaterThan(0.32);
    expect(by15('USA', 1990)).toBeLessThan(0.5);
    expect(by15('USA', 1930)).toBeLessThan(0.22);
    expect(by15('IND', 1990)).toBeLessThan(0.05);
  }, 120_000);
  it('離れた親より、一緒に暮らす親と近い。継親には名前と仕事がある', () => {
    const ps = born(300, 'USA', 1995).map((p) => upTo(p, 16)).filter((p) => p.alive && p.split && p.split.age <= 8);
    expect(ps.length).toBeGreaterThan(30);
    const gap = mean(ps.map((p) => (p.split!.with === 'mother' ? (p.mother.bond ?? 0) - (p.father.bond ?? 0) : (p.father.bond ?? 0) - (p.mother.bond ?? 0))));
    expect(gap).toBeGreaterThan(5);
    for (const p of ps) for (const t of (p.ties ?? []).filter((x) => x.role === 'step')) {
      expect(t.name).toBeTruthy();
      expect(t.job).toBeTruthy();
    }
  }, 120_000);
});

describe('結婚せずに一緒に暮らす', () => {
  // 実測 (400人、25〜34歳で連れ合いのいる年): スウェーデン2010年生まれ 49%、フランス 49%、米国 32%、日本・韓国 0%
  const share = (code: string, year: number) => {
    let all = 0, co = 0;
    for (const p of born(300, code, year)) {
      for (let a = 0; a < 35 && p.alive; a++) {
        advanceYear(p);
        if (p.age >= 25 && p.spouse?.alive) { all++; if (p.spouse.cohab) co++; }
      }
    }
    return co / all;
  };
  it('北欧で多く、日本ではまれ', () => {
    expect(share('SWE', 2000)).toBeGreaterThan(0.3);
    expect(share('JPN', 2000)).toBeLessThan(0.03);
  }, 180_000);
  it('一緒に暮らす相手を「連れ合い」「Spouse」と書かない', () => {
    let seen = 0;
    for (const p of born(400, 'FRA', 1990).map((q) => liveOut(q))) {
      const s = p.spouse;
      if (!s?.cohab) continue;
      seen++;
      for (const e of p.log) expect(e.text).not.toContain(`連れ合いの${s.name}`);
    }
    // 実測: 200人で5人 (2026-10)。2026-10-31 に時代のゲート (era.ts) で乱数がずれて 200人で3人になったので、400人 (実測 6人) で数える
    expect(seen).toBeGreaterThan(3);
  }, 180_000);
});

describe('結婚と姓', () => {
  // 実測 (各140人前後の妻): 日本95〜97%、トルコ100%、米国79〜82%、スウェーデン0% (表に無い国は変えない)
  const renamed = (code: string, year: number) => {
    const wives = born(250, code, year, { gender: 'F' }).map((p) => upTo(p, 40)).filter((p) => p.spouse && !p.spouse.cohab);
    // もともと同じ姓の二人 (トルコの Yılmaz、日本の佐藤など) は姓が変わらないので、夫の姓を名のった側に数える
    const took = (p: Person) => !!p.maiden || p.log.some((e) => e.text.includes('もともと同じ姓'));
    return { share: wives.filter(took).length / wives.length, wives };
  };
  it('国ごとの割合で夫の姓になり、身分の記録に旧姓名が残る', () => {
    const jp = renamed('JPN', 1980);
    expect(jp.share).toBeGreaterThan(0.88);
    for (const p of jp.wives.filter((q) => q.maiden)) {
      expect(p.maiden).not.toBe(p.name);
      expect(p.name.endsWith(p.given)).toBe(true); // 日本の名は姓・名の順。名は変わらない
    }
    expect(renamed('TUR', 1980).share).toBe(1);
    const us = renamed('USA', 1980).share;
    expect(us).toBeGreaterThan(0.65);
    expect(us).toBeLessThan(0.92);
    expect(renamed('SWE', 1980).share).toBe(0);
  }, 180_000);
});
