import { describe, it, expect } from 'vitest';
import { CHOOSE_FROM, ERA_FROM, basisOf, countryAt, pickBirthYear } from './countries';
import { lifeTable } from './lifetable';
import { makeRng } from './rng';
import { createPerson, liveOut } from './life';

// 年を選べば1900〜1949年にも生まれられる (国連 WPP の前。Gapminder の長い系列からの推定、build-era.mjs / build-mortality.mjs)

// 人生の中の数で、有限でないもの (NaN・Infinity) と、文に紛れた "NaN" / "undefined" を探す
function broken(v: unknown, path = ''): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [`${path}=${v}`];
  if (typeof v === 'string') return /NaN|undefined/.test(v) ? [`${path}: ${v.slice(0, 80)}`] : [];
  if (typeof v === 'function' || v === null || typeof v !== 'object') return [];
  return Object.entries(v).flatMap(([k, x]) => broken(x, `${path}.${k}`));
}

describe('1900〜1949年に生まれる', () => {
  // 実測 (2026-10-18): 10か国 × 3年 × 20人 = 600人で、壊れた数は0件
  it('いくつもの国で、死ぬまで生きても数が壊れない', () => {
    const bad: string[] = [];
    for (const code of ['JPN', 'IND', 'GBR', 'NGA', 'USA', 'BRA', 'CHN', 'DEU', 'RUS', 'EGY']) for (const year of [1900, 1920, 1945]) for (let s = 1; s <= 20; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', country: code, auto: true, year }));
      expect(p.alive).toBe(false);
      expect(p.birthYear).toBe(year);
      bad.push(...broken(p).map((b) => `${code} ${year} seed ${s * 7919} ${b}`));
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 300_000);

  // 1900年の男女の平均寿命の平均が、Gapminder の値 (lex、男女計) とおおむね合う。
  // Gapminder の1900年: 日本 38.54・英国 46.3・ナイジェリア 32.52・米国 49.07 (data/raw/gapminder/lex.csv)。
  // インドの1900年 (19.52) は飢饉の年なので、ふだんの年として1901年 (24.55) と比べる
  // 実測 (2026-10-18): 日本 38.56・英国 47.87・ナイジェリア 32.58・米国 49.18・インド 24.84
  it('1900年の平均寿命が Gapminder の値とおおむね合う', () => {
    const e0 = (code: string) => (lifeTable(countryAt(code, 1900), 'F').e0 + lifeTable(countryAt(code, 1900), 'M').e0) / 2;
    for (const [code, src] of [['JPN', 38.54], ['GBR', 46.3], ['NGA', 32.52], ['USA', 49.07], ['IND', 24.55]] as const) {
      expect(Math.abs(e0(code) - src), code).toBeLessThan(2);
    }
  });

  // 戦争の年の死は worldevents.ts が足すので、生命表 (ふだんの年の流れ) に戦争の落ち込みは入れない。
  // Gapminder では日本の1945年は 30.45年、ドイツの1945年は 29.33年、英国の1918年は 40.41年
  it('ふだんの年の流れには、戦争や疫病の落ち込みが入らない', () => {
    expect(countryAt('JPN', 1945).leF).toBeGreaterThan(countryAt('JPN', 1940).leF);
    expect(countryAt('DEU', 1945).leM).toBeGreaterThan(countryAt('DEU', 1938).leM);
    expect(countryAt('GBR', 1918).leM).toBeGreaterThan(countryAt('GBR', 1913).leM);
  });

  it('1900〜1949年の値は、その年の値で、推定と記される', () => {
    expect(countryAt('JPN', 1920).year).toBe(1920);
    expect(countryAt('JPN', 1920).leF).toBeLessThan(countryAt('JPN', 1950).leF - 10);
    expect(countryAt('JPN', 1850).year).toBe(CHOOSE_FROM); // 1900年より前はない
    expect(basisOf('JPN', 'leF', 1920)).toBe('est');
    expect(basisOf('JPN', 'gdp', 1949)).toBe('est');
    expect(basisOf('JPN', 'leF', 1950)).toBe('obs');
  });

  it('年を選ばないくじは1950年から', () => {
    const rng = makeRng(42);
    let min = Infinity;
    // 1回ごとに全151年 × 162か国の出生数を足すので重い。200回でも、1900〜1949年がくじに入っていれば何度かは出る
    for (let i = 0; i < 200; i++) min = Math.min(min, pickBirthYear(rng));
    expect(min).toBeGreaterThanOrEqual(ERA_FROM);
  });
});
