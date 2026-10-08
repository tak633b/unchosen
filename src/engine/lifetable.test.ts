import { describe, it, expect } from 'vitest';
import { COUNTRIES } from './countries';
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
