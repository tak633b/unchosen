// 世界全体で見た所得の位置 (死亡記録と自分の欄)
import { ERA_NOW, countriesAt } from '../engine/countries';

// 世界全体で見た所得の位置 (購買力平価ドル)。世界銀行の分布 (今の時代) をおおまかに折れ線で近似。
// ほかの年は、世界の1人当たりGDP (人口加重) の比で今の時代に直してから当てる
const worldGdp = (year: number) => { const list = countriesAt(year); return list.reduce((s, c) => s + c.gdp * c.pop, 0) / list.reduce((s, c) => s + c.pop, 0); };
export const worldIncomeTopAt = (ppp: number, year: number) => worldIncomeTop(ppp * worldGdp(ERA_NOW) / worldGdp(year));
function worldIncomeTop(ppp: number): number {
  const pts: [number, number][] = [[500, 0.95], [1500, 0.8], [3000, 0.6], [6000, 0.4], [12000, 0.22], [25000, 0.1], [45000, 0.04], [80000, 0.01]];
  if (ppp <= pts[0][0]) return 0.97;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (ppp <= x1) return y0 + ((y1 - y0) * (Math.log(ppp) - Math.log(x0))) / (Math.log(x1) - Math.log(x0));
  }
  return 0.005;
}

