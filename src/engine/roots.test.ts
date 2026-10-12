import { describe, expect, it } from 'vitest';
import { createPerson, liveOut } from './life';
import { adoptionRates, twinChance } from './roots';
import { defect, orphans, resettle } from './events/roots';
import { apostasyLaw, driftChance } from './events/faith';
import { contradictions } from './kin.testkit';
import { addTie } from './bonds';

const born = (n: number, country: string, year: number) =>
  Array.from({ length: n }, (_, i) => createPerson({ seed: (1 + i) * 7919 + 13, basis: 'births', auto: true, country, year }));
const share = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length / xs.length;

describe('生まれの区分', () => {
  it('同じ seed なら同じ区分・同じ人生', () => {
    for (const country of ['IND', 'NPL', 'CHN', 'KOR']) {
      const a = liveOut(createPerson({ seed: 777, basis: 'births', auto: true, country, year: 1985 }));
      const b = liveOut(createPerson({ seed: 777, basis: 'births', auto: true, country, year: 1985 }));
      expect(a.roots).toEqual(b.roots);
      expect(a.log).toEqual(b.log);
    }
  });
  // 実測 (20000人): SC 18.3%・ST 8.5%・OBC 41.4%・一般 31.7% (国勢調査 SC 16.6%・ST 8.6%、NSSO の OBC 約41%)
  it('インド: 区分の割合と、資産の差', () => {
    const ps = born(20000, 'IND', 2000);
    expect(share(ps, (p) => p.roots?.group === 'SC')).toBeCloseTo(0.183, 2);
    expect(share(ps, (p) => p.roots?.group === 'ST')).toBeCloseTo(0.085, 2);
    expect(share(ps, (p) => p.roots?.group === 'OBC')).toBeCloseTo(0.414, 2);
    const mean = (g: string) => { const xs = ps.filter((p) => p.roots?.group === g); return xs.reduce((s, p) => s + p.familyP, 0) / xs.length; };
    expect(mean('ST')).toBeLessThan(mean('SC'));
    expect(mean('SC')).toBeLessThan(mean('GEN'));
    // 指定カーストは法律でヒンドゥー・シク・仏教徒だけ
    expect(ps.some((p) => p.roots?.group === 'SC' && (p.religion === 'キリスト教' || p.religion === 'イスラム教'))).toBe(false);
  });
  it('ネパール: 集団と、宗教とのつじつま', () => {
    const ps = born(3000, 'NPL', 2000);
    expect(ps.every((p) => p.roots?.group && p.roots.lang)).toBe(true);
    expect(ps.filter((p) => p.religion === 'イスラム教').every((p) => p.roots!.group === 'muslimNP')).toBe(true);
    expect(share(ps, (p) => p.roots!.group === 'dalit')).toBeCloseTo(0.13, 1);
  });
  // 実測 (40000人): ウイグル族 0.84%・チベット族 0.55% (国勢調査 0.83%・0.50%)
  it('中国: ウイグル族・チベット族の名前・宗教・生まれの話', () => {
    const ps = born(40000, 'CHN', 1990);
    expect(share(ps, (p) => p.roots?.group === 'uyghur')).toBeCloseTo(0.0084, 3);
    expect(share(ps, (p) => p.roots?.group === 'tibetan')).toBeCloseTo(0.0055, 3);
    for (const p of ps.filter((x) => x.roots?.group === 'uyghur').slice(0, 20)) {
      expect(p.pool).toBe('uyghur');
      expect(p.log[0].text).toContain('イスラム教');
    }
  });
});

describe('双子と養子', () => {
  // 実測 (20000人): ナイジェリア 2000年 3.4%、韓国 1985年 1.7%
  it('双子の割合は地域と時代で違う', () => {
    expect(twinChance('NGA', 2000)).toBeCloseTo(0.0336, 3);
    expect(share(born(20000, 'NGA', 2000), (p) => p.roots?.twin !== undefined)).toBeCloseTo(0.034, 2);
    expect(share(born(20000, 'KOR', 1985), (p) => p.roots?.twin !== undefined)).toBeCloseTo(0.017, 2);
  });
  // 実測 (20000人): 韓国 1985年 外国へ 1.16% (表 1.2%)
  it('韓国から外国への養子は1985年に約1%、行き先の国で暮らす', () => {
    expect(adoptionRates('KOR', 1985).abroad).toBe(0.012);
    const ps = born(20000, 'KOR', 1985);
    const out = ps.filter((p) => p.roots?.adopted?.abroad);
    expect(out.length / ps.length).toBeCloseTo(0.0116, 3);
    for (const p of out) {
      expect(p.country).not.toBe('KOR'); // 外国へ養子に出たので、外国にいる
      expect(p.mother.country).toBe(p.country);
      expect(p.siblings).toEqual([]);
    }
  });
  it('養子・双子の輪の人の一生も、記録と食い違わない', () => {
    const ps = born(4000, 'KOR', 1985).filter((p) => p.roots?.adopted || p.roots?.twin !== undefined).slice(0, 40);
    expect(ps.length).toBe(40);
    const bad = ps.flatMap((p) => contradictions(liveOut(p)));
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});

describe('信仰', () => {
  it('静かに遠のく割合: 韓国は多く、インドは少なく、イスラエルはさらに少ない', () => {
    expect(driftChance('KOR')).toBeGreaterThan(driftChance('IND'));
    expect(driftChance('IND')).toBeGreaterThan(driftChance('ISR'));
    expect(apostasyLaw('SDN', 2019)).toBe(true);
    expect(apostasyLaw('SDN', 2021)).toBe(false);
  });
  // 実測 (2000人、1960年生まれ): イランでは 24% が心の中だけで手放し、改宗は 0.2%
  it('背教を罰する国では、心の中だけで手放す', () => {
    const ps = born(800, 'IRN', 1960).map((p) => liveOut(p)).filter((p) => p.faith);
    expect(ps.some((p) => p.faith!.hidden !== undefined)).toBe(true);
    // 外国に住んだ人は、その国で改宗することがある (例: 米国で改宗し、のちに帰国)。改宗しないのは国にいるあいだだけ
    expect(ps.filter((p) => p.countriesLived.length === 1 && p.faith!.converted !== undefined && p.faith!.from === 'イスラム教').length).toBe(0);
  }, 120_000);
});

describe('北朝鮮から韓国へ (北朝鮮が国の一覧に入るまで眠っている)', () => {
  it('仲介料を払って着き、世帯の人数に応じた定着基本金を受け取る', () => {
    const p = createPerson({ seed: 5, basis: 'births', auto: true, country: 'KOR', year: 1990 });
    while (p.age < 25) p.age++;
    p.birthCountry = 'PRK';
    p.country = 'PRK';
    p.wealth = 0;
    defect(p, Object.assign(() => 0, { state: 0 }));
    expect(p.country).toBe('KOR');
    expect(p.roots?.resettled).toBe(25);
    // 2015年: 仲介料 1500万ウォン、1人世帯の定着基本金 1000万ウォン (850ウォン = 1ドル)
    expect(p.wealth).toBeCloseTo((10_000_000 - 15_000_000) / 850, 0);
    const q = createPerson({ seed: 6, basis: 'births', auto: true, country: 'KOR', year: 1990 });
    q.wealth = 0;
    q.children = [{ alive: true, age: 3, sex: 'F' }, { alive: true, age: 5, sex: 'M' }];
    resettle(q);
    expect(q.wealth).toBeCloseTo(22_000_000 / 850, 0); // 3人世帯
  });
});

describe('子を亡くした後の孫', () => {
  it('誰が育てるかを記録する', () => {
    const p = createPerson({ seed: 9, basis: 'births', auto: true, country: 'JPN', year: 1950 });
    p.age = 60;
    const k = { alive: false, age: 35, sex: 'F' as const, id: 900, name: '花子' };
    p.children = [k];
    addTie(p, { alive: true, age: 4, sex: 'M', name: '太郎', role: 'grandchild', since: 56, of: 900 });
    const n = p.log.length;
    orphans(p, k);
    expect(p.log.length).toBe(n + 1);
    expect(p.log.at(-1)!.text).toContain('太郎');
  });
});
