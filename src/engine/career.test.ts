import { describe, expect, it } from 'vitest';
import { advanceYear, createPerson, liveOut, riskParts } from './life';
import { byCode, countryAt } from './countries';
import { earnings } from './economy';
import { currentIncome, minimumWage } from './events/common';
import { DEEP_SEA, legalAge } from './events/career';
import { lifePayout, outOfPocket } from './events/insurance';
import { destinations } from './abroad';
import { CHOICE_MAX_AGE } from './events/choices';
import { talents } from './talent';

const born = (country: string, seed = 4242, year = 1990) => createPerson({ seed, basis: 'births', country, year, auto: true });

describe('生まれ持った向き', () => {
  it('seed で決まり、人生の乱数の流れを変えない', () => {
    const a = born('JPN');
    const t = talents(a);
    expect(talents(born('JPN'))).toEqual(t);
    // 向きを何度読んでも、その後の人生は同じ
    const b = born('JPN');
    talents(b); talents(b);
    expect(liveOut(b).log.map((e) => e.text)).toEqual(liveOut(born('JPN')).log.map((e) => e.text));
  });
});

describe('お金の決まり', () => {
  it('最低賃金のある国では、雇われて正規で働く人の年収はそれを下回らない', () => {
    const p = born('KOR');
    for (let y = 0; y < 30; y++) advanceYear(p);
    const c = countryAt('KOR', p.birthYear + p.age);
    Object.assign(p, { working: true, retired: false, unemployed: 0, selfEmployed: false, incomeP: 0.01 });
    p.formal = true;
    expect(currentIncome(p)).toBeCloseTo(minimumWage(c), 6);
    expect(minimumWage(c)).toBeGreaterThan(earnings(c, 0.01));
    p.formal = false; // 非正規には届かない
    expect(currentIncome(p)).toBeCloseTo(earnings(c, 0.01), 6);
    expect(minimumWage(byCode('SWE'))).toBe(0); // 協約で決める国
  });

  it('保険は自己負担を3割にし、70歳より前に亡くなれば家族に出る', () => {
    const p = born('JPN');
    expect(outOfPocket(p, 1000)).toBe(1000);
    p.insured = true;
    expect(outOfPocket(p, 1000)).toBeCloseTo(300, 9);
    const c = byCode('JPN');
    p.age = 50;
    expect(lifePayout(p, c)).toBe(0); // 家族がいない
    p.children = [{ alive: true, age: 20, sex: 'F' }];
    expect(lifePayout(p, c)).toBeCloseTo(earnings(c, p.incomeP) * 3, 6);
    p.age = 70;
    expect(lifePayout(p, c)).toBe(0);
  });
});

describe('仕事の決まり', () => {
  it('日本の公務員の定年は2023年から2年ごとに1歳上がり、2031年に65歳', () => {
    const p = born('JPN', 4242, 1960);
    p.job = '公務員';
    const at = (year: number) => { p.age = year - p.birthYear; return legalAge(p, byCode('JPN')); };
    expect(at(2020)).toBe(60);
    expect(at(2023)).toBe(61);
    expect(at(2025)).toBe(62);
    expect(at(2031)).toBe(65);
    expect(at(2040)).toBe(65);
    p.job = '陸軍の将校';
    expect(legalAge(p, byCode('KOR'))).toBe(55);
    p.job = '教師';
    expect(legalAge(p, byCode('KOR'))).toBeUndefined();
  });

  it('遠洋の漁船で働く年は、事故の分だけ死亡率が上がる', () => {
    const p = born('KOR');
    for (let y = 0; y < 30; y++) advanceYear(p);
    p.working = true; p.retired = false; p.job = '店員';
    const q0 = riskParts(p).q;
    p.job = DEEP_SEA;
    expect(riskParts(p).q - q0).toBeCloseTo(0.0013, 9);
  });

  it('留学先は、その国の学生が実際によく行く3か国', () => {
    expect(destinations(born('KOR'), 2010).map((c) => c.code)).toEqual(['USA', 'CHN', 'JPN']);
    expect(destinations(born('VNM'), 2010).map((c) => c.code)).toEqual(['JPN', 'USA', 'AUS']);
    expect(destinations(born('PER'), 2010)).toHaveLength(3); // 表に無い国は豊かな受け入れ国から
  });
});

describe('カードの数', () => {
  // 実測 (2026-10-11): 200人で分かれ道778回、65歳を過ぎて出たのは0回
  it('65歳を過ぎたら小さな分かれ道は出ない', () => {
    for (let s = 1; s <= 200; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', auto: true }));
      for (const [k, a] of Object.entries(p.recent)) if (k.startsWith('choice:')) expect(a, `${k} seed ${s * 7919}`).toBeLessThanOrEqual(CHOICE_MAX_AGE);
    }
  }, 120_000);

  // 実測 (2026-10-11, 1980年生まれ300人の45歳): 日本0.66 (以前0.45)・米国0.72 (以前0.45)・ドイツ0.45 (以前0.38)。
  // 目安は日本6割台・米国6〜7割・ドイツ4割台
  it('45歳の持ち家率が統計の目安に近い', () => {
    const own = (country: string) => {
      let alive = 0, owners = 0;
      for (let s = 1; s <= 300; s++) {
        const p = createPerson({ seed: s * 7919, basis: 'births', country, year: 1980, auto: true });
        while (p.alive && p.age < 45) advanceYear(p);
        if (!p.alive) continue;
        alive++;
        if (p.house || p.mortgage) owners++;
      }
      return owners / alive;
    };
    expect(own('JPN')).toBeGreaterThan(0.55);
    expect(own('JPN')).toBeLessThan(0.75);
    expect(own('DEU')).toBeGreaterThan(0.35);
    expect(own('DEU')).toBeLessThan(0.55);
  }, 120_000);
});
