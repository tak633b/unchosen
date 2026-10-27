// 学制・年金・障害の手当・年を重ねた体・失業の長さ (2026-10-27、本家 v0.8.40〜57 に合わせた分)
import { describe, expect, it } from 'vitest';
import { advanceYear, createPerson } from './life';
import { byCode } from './countries';
import { earnings } from './economy';
import { gradeLabel, schoolSys, bachelorYears, masterYears } from './schoolsys';
import { pensionRule, PENSION_CAP } from './pension';
import { pension } from './events/common';
import { disabilityPay } from './events/disability';
import { unempK } from './events/work';
import type { Person } from './person';

const born = (country: string, seed: number, year: number) => createPerson({ seed, basis: 'births', country, year, auto: true });
const liveTo = (p: Person, age: number) => { while (p.alive && p.age < age) advanceYear(p); return p; };

describe('国ごとの学制 (UNESCO UIS)', () => {
  it('入学の年齢と各段階の年数', () => {
    expect(schoolSys('GBR')).toMatchObject({ entry: 5, total: 13, grade: 'year' });
    expect(schoolSys('DEU')).toMatchObject({ entry: 6, prim: 4, total: 13 });
    expect(schoolSys('FIN')).toMatchObject({ entry: 7, grade: 'basic' });
    expect(schoolSys('JPN')).toMatchObject({ entry: 6, prim: 6, lower: 3, upper: 3 });
    expect(bachelorYears('USA', 2010)).toBe(4);
    expect(bachelorYears('DEU', 2010)).toBe(3);
    expect(bachelorYears('DEU', 1990)).toBe(4); // ボローニャ・プロセスより前
    expect(masterYears('GBR')).toBe(1);
    expect(masterYears('JPN')).toBe(2);
  });

  it('学年はその国の数え方で表示する', () => {
    expect(gradeLabel(schoolSys('USA'), 7)).toBe('8年生（中学校）');
    expect(gradeLabel(schoolSys('GBR'), 8)).toBe('Year 9（中学校）');
    expect(gradeLabel(schoolSys('FIN'), 6)).toBe('基礎学校7年生');
    expect(gradeLabel(schoolSys('JPN'), 7)).toBe('中学校2年生');
  });

  it('入学と卒業の年齢が学制に沿う (英国は5歳で入り18歳で高校を終え、ドイツは10歳で小学校を終え19歳でアビトゥーア)', () => {
    // 実測 (2000年生まれ300人): 英国 入学5.0・高校18.0 / ドイツ 小学校10.0・高校19.0 / フィンランド 入学7.0・基礎学校16.0
    const at = (code: string, re: RegExp) => {
      const ages: number[] = [];
      for (let i = 0; i < 40; i++) { const e = liveTo(born(code, 1000 + i, 2000), 20).log.find((x) => re.test(x.text)); if (e) ages.push(e.age); }
      return ages;
    };
    expect(new Set(at('GBR', /入学した。$/))).toEqual(new Set([5]));
    expect(new Set(at('GBR', /^高校を卒業した/))).toEqual(new Set([18]));
    expect(new Set(at('DEU', /^小学校を卒業した/))).toEqual(new Set([10]));
    expect(new Set(at('DEU', /^高校を卒業した/))).toEqual(new Set([19]));
    expect(new Set(at('FIN', /^基礎学校を卒業した/))).toEqual(new Set([16]));
    // basic の国には「小学校を卒業した」は出ない (基礎学校が一つの学校なので)
    expect(at('FIN', /^小学校を卒業した/)).toEqual([]);
  });
});

describe('年金の決まり', () => {
  const at = (code: string, b: number, sex: 'M' | 'F', age: number, contrib?: number) => {
    const p = born(code, 7, b);
    Object.assign(p, { sex, age, contrib });
    return pensionRule(p, byCode(code));
  };
  it('受け取り始める年齢と、早めに受け取る道 (SSA・SGB VI・国民年金法)', () => {
    const us = at('USA', 1960, 'M', 62, 30);
    expect(us.age).toBe(67);
    expect(us.early?.age).toBe(62);
    expect(us.early?.cut).toBeCloseTo(0.3, 6); // 67歳満額の人が62歳で受け取ると30%減
    expect(at('DEU', 1964, 'M', 63, 30).age).toBe(67);
    expect(at('DEU', 1955, 'M', 63, 46).early?.cut).toBe(0); // 45年加入は減額なし
    expect(at('DEU', 1955, 'M', 63, 36).early?.cut).toBeGreaterThan(0);
    const jp = at('JPN', 1962, 'M', 60, 38); // 2022年に60歳: 月0.4%
    expect(jp.age).toBe(65);
    expect(jp.early?.cut).toBeCloseTo(0.24, 6);
    expect(at('FRA', 1955, 'M', 60, 44).early?.age).toBe(60); // 16歳から働いた長いキャリア
    expect(at('FRA', 1955, 'M', 60, 36).early).toBeUndefined(); // 24歳から: 早めの道はない
    expect(at('GBR', 1965, 'F', 60, 30).early).toBeUndefined();
  });

  it('上限のある国では、とても多く稼いだ人の年金は上限で止まる', () => {
    const p = liveTo(born('USA', 11, 1955), 66);
    const c = byCode('USA');
    Object.assign(p, { retired: true, business: false, formal: true, contrib: 40, pensionAt: 65, pensionCut: 0 });
    p.incomeP = 0.99;
    expect(pension(p, c)).toBeCloseTo(earnings(c, 0.5) * PENSION_CAP.USA * 0.55, 6);
    p.incomeP = 0.5;
    expect(pension(p, c)).toBeCloseTo(earnings(c, 0.5) * 0.55, 6);
    // 年金の年齢より前に辞めた人には、まだ出ない
    p.pensionAt = 67;
    expect(pension(p, c)).toBe(0);
    // 働いた年数が短ければ、そのぶん少ない
    Object.assign(p, { pensionAt: 65, contrib: 15 });
    expect(pension(p, c)).toBeCloseTo(earnings(c, 0.5) * 0.55 * 0.5, 6);
  });

  it('米国では62歳で早めに受け取る人がいて、ドイツでは63〜64歳が多い', () => {
    // 実測 (1955年生まれで50歳に働いていた人 約490人): 米国 62歳 38%・平均62.5歳 / ドイツ 63〜64歳 40%・平均63.3歳。
    // 前は どの国も60〜61歳が4割で、米国62歳は8%、ドイツ63〜64歳は7%だった
    const dist = (code: string) => {
      const ages: number[] = [];
      for (let i = 0; i < 150; i++) {
        const p = liveTo(born(code, 5000 + i, 1955), 50);
        if (!p.alive || p.retired || !p.working || p.homemaker) continue;
        while (p.alive && !p.retired && p.age < 85) advanceYear(p);
        if (p.retired) ages.push(p.age);
      }
      return (lo: number, hi: number) => ages.filter((a) => a >= lo && a <= hi).length / ages.length;
    };
    const us = dist('USA');
    expect(us(62, 62)).toBeGreaterThan(0.25);
    expect(us(62, 62)).toBeLessThan(0.55);
    const de = dist('DEU');
    expect(de(63, 64)).toBeGreaterThan(0.25);
  }, 120000);
});

describe('障害の手当', () => {
  it('診断 (認定) のあと、国の実際の額で出る', () => {
    const p = liveTo(born('JPN', 21, 1980), 40);
    const jp = byCode('JPN');
    expect(disabilityPay(p, jp, false)).toBe(0); // 認定の前
    p.disabled = 38;
    expect(disabilityPay(p, jp, true)).toBeCloseTo(816000 / 95 * jp.gdp / byCode('JPN').gdp, 6); // 働いていても出る
    const us = byCode('USA');
    expect(disabilityPay(p, us, true)).toBe(0); // SSI は働く人には出ない
    expect(disabilityPay(p, byCode('GBR'), true)).toBeGreaterThan(0); // PIP は働いていても
  });
});

describe('年を重ねた体', () => {
  it('50歳までの老眼鏡は、豊かな国ではほとんどの人が、貧しい国では一部の人だけ手に入る', () => {
    // 実測 (1960年生まれ): 日本 9割超、ナイジェリア 2〜5割 (家の暮らし向きで差)
    const share = (code: string) => {
      let n = 0, g = 0;
      for (let i = 0; i < 120; i++) {
        const p = liveTo(born(code, 9000 + i, 1960), 50);
        if (!p.alive) continue;
        n++;
        if (p.log.some((e) => /老眼鏡を作った/.test(e.text))) g++;
      }
      return g / n;
    };
    expect(share('JPN')).toBeGreaterThan(0.85);
    expect(share('NGA')).toBeLessThan(0.6);
  }, 120000);
});

describe('失業の長さ (ILO)', () => {
  it('失業率の高い国ほど倍率が大きい', () => {
    expect(unempK(byCode('ZAF'))).toBeGreaterThan(2.5);
    expect(unempK(byCode('JPN'))).toBeLessThan(0.8);
  });
});
