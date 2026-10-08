import { describe, it, expect } from 'vitest';
import { COUNTRIES, basisOf, countryAt } from './countries';
import era from '../data/era.json';
import { lifeTable } from './lifetable';

describe('lifeTable', () => {
  it('全ての国・性別で平均寿命が統計値に 0.1 年以内で一致する', () => {
    for (const c of COUNTRIES) {
      expect(Math.abs(lifeTable(c, 'F').e0 - c.leF)).toBeLessThan(0.1);
      expect(Math.abs(lifeTable(c, 'M').e0 - c.leM)).toBeLessThan(0.1);
    }
  });
  it('5歳までの生存率が5歳未満死亡率と整合する', () => {
    for (const c of COUNTRIES) {
      const l5 = (lifeTable(c, 'F').l[5] + lifeTable(c, 'M').l[5]) / 2;
      expect(Math.abs(1 - l5 - c.u5mr)).toBeLessThan(0.01);
    }
  });
});

// 国連 WPP 2024 の暦年の生命表 (1950〜2100年)。5年ごとの節目の年は、WPP の平均寿命そのものと比べられる。
// 実測 (2026-10-09): 全162か国・男女で最大のずれは 2100年の韓国女性 -0.32年 (100歳以上の扱いの差)
describe('暦年の生命表', () => {
  it('節目の年の平均寿命が WPP と 0.5年以内で合う', () => {
    const e = era as unknown as { years: number[]; countries: Record<string, { leF: number[]; leM: number[] }> };
    for (const c of COUNTRIES) for (const [i, y] of e.years.entries()) {
      const d = e.countries[c.code];
      expect(Math.abs(lifeTable(countryAt(c.code, y), 'F').e0 - d.leF[i]), `${c.code} ${y} F`).toBeLessThan(0.5);
      expect(Math.abs(lifeTable(countryAt(c.code, y), 'M').e0 - d.leM[i]), `${c.code} ${y} M`).toBeLessThan(0.5);
    }
  });
  it('戦争や虐殺の年の落ち込みが残る (1994年のルワンダ)', () => {
    expect(countryAt('RWA', 1994).leF).toBeLessThan(countryAt('RWA', 1990).leF - 20);
  });
  it('2024年より先は予測、実測の範囲の外は推定', () => {
    expect(basisOf('JPN', 'leF', 2050)).toBe('proj');
    expect(basisOf('JPN', 'leF', 1960)).toBe('obs');
    expect(basisOf('JPN', 'smoke', 1960)).toBe('est'); // 喫煙率の実測は2000年から
  });
});
