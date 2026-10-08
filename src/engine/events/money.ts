// お金の流れ: 毎年の収入と暮らしの費用、貯金と借金、投資・家・車。
import { L } from '../../i18n';
import { yen } from '../economy';
import { bump, countryOf, decide, log, type Person } from '../person';
import { normal } from '../rng';
import { currentIncome, subsistence } from './common';

// 実質 (物価上昇を引いた) の利回り
const DEPOSIT = 0.005;
const DEBT_RATE = 0.03; // 借金の多くは家族・親族や奨学金からなので低めに

// 純資産 = 手元のお金 + 家の値打ち - 残っている住宅ローン
export const netWorth = (p: Person) =>
  p.wealth + (p.mortgage ? p.mortgage.value - p.mortgage.pay * p.mortgage.years * 0.75 : 0);

// 自分の財布で暮らしているか。働いていない人は、連れ合いか親の家計に入っている
export const independent = (p: Person) => p.working || p.retired || !!p.school.abroad;

export function finances(p: Person): void {
  if (!independent(p)) return;
  const c = countryOf(p);
  const r = p.rng;
  const income = currentIncome(p);
  p.peakIncome = Math.max(p.peakIncome, income);
  const floor = subsistence(c);
  // 貯められる割合は、国の中での位置と、暮らしの絶対的な余裕の両方で決まる
  // 貧しい家でも、土地や家畜などの形で少しは蓄える (最低5%)
  const saveRate = Math.max(0.05, 0.15 * p.incomeP * Math.min(1, income / 30000)) + (p.wealth < 0 ? 0.05 : 0);
  // 家を持てば家賃がいらない
  let living = Math.max(floor, income * (1 - saveRate)) * (p.mortgage || p.house ? 0.78 : 1);
  // 引退後は、年金と貯金の取り崩し(年6%)で暮らす。足りない分は子や親族が支える
  if (p.retired) {
    const spend = income + Math.max(0, p.wealth) * 0.06;
    const kids = p.children.some((k) => k.alive && k.age >= 20);
    living = Math.max(spend, kids ? 0 : floor * 0.5);
  }
  // 収入のない年は、家族や親族に頼って食いつなぐ。頼れる子がいなければ少しずつ借りる
  if (income === 0 && (!p.retired || p.wealth <= 0)) living = p.unemployed > 0 || p.children.some((k) => k.alive && k.age >= 20) ? 0 : floor * 0.3;
  const kids = p.children.filter((k) => k.alive && k.age < 18).length;
  living += Math.max(income, floor) * 0.07 * kids;
  if (p.car) living += 1200;
  p.wealth += income - living;

  if (p.mortgage) {
    p.wealth -= p.mortgage.pay;
    p.mortgage.value *= 1 + normal(r, 0.01, 0.05);
    if (--p.mortgage.years <= 0) {
      log(p, L('住宅ローンを払い終えた。家は自分のものになった。', 'Paid off the mortgage. The house is now fully owned.'), 'family');
      p.wealth += p.mortgage.value;
      p.mortgage = undefined;
      p.house = true;
    }
  }
  if (p.wealth > 0) p.wealth *= 1 + returnOf(p, c.gdp < 25000);
  else p.wealth *= 1 + DEBT_RATE;
  // 借金が膨らみすぎたら、取り立てと切り詰めで暮らしを縮める
  const cap = -3 * Math.max(income, floor);
  if (p.wealth < cap) {
    p.wealth = cap;
    if (r() < 0.3) { log(p, L('借金の返済に追われ、食べる物を減らして暮らした。', 'Struggling with debt repayments, cut back on food.'), 'hard'); bump(p, { happy: -6, health: -2 }); }
  }
  investOffer(p, income);
  houseOffer(p, income);
  carOffer(p, income);
}

function returnOf(p: Person, emerging: boolean): number {
  const r = p.rng;
  switch (p.invest) {
    case 'stock': return normal(r, 0.04, emerging ? 0.22 : 0.16);
    case 'realestate': return normal(r, 0.02, 0.07);
    default: return DEPOSIT;
  }
}

function investOffer(p: Person, income: number): void {
  if (p.invest || p.age < 24 || p.wealth < Math.max(income, 1000) * 0.8) return;
  decide(p, {
    title: L('貯めたお金をどうする？', 'What to do with savings?'),
    text: L(`貯金が${yen(p.wealth)}(日本の物価での感覚)になった。手元に置いておくお金をどこに預ける？`, `Savings have reached ${yen(p.wealth)}. Where to keep the money?`),
    stat: L('長い目で見た実質の利回りは、預金1〜2%、株式は年5%前後、住宅は3%前後。新興国の株は年に±22%ほど上下する (UBS Global Investment Returns Yearbook)', 'Long-run real returns: deposits 1-2%, stocks around 5% a year, housing around 3%. Emerging-market stocks swing about ±22% a year (UBS Global Investment Returns Yearbook)'),
    options: [
      { label: L('預金にする', 'Bank deposit'), hint: L('年1〜2%・ほぼ安全', '1-2%/yr, nearly safe'), apply: (q) => { q.invest = 'deposit'; } },
      { label: L('株に投資する', 'Stocks'), hint: L('平均年5%・大きく下がる年もある', 'Avg 5%/yr, some years fall hard'), apply: (q) => { q.invest = 'stock'; } },
      { label: L('不動産に投資する', 'Real estate'), hint: L('平均年3.5%・ほどほどに上下', 'Avg 3.5%/yr, moderate swings'), apply: (q) => { q.invest = 'realestate'; } },
    ],
    auto: (q) => (q.rng() < 0.5 ? 0 : q.rng() < 0.6 ? 1 : 2),
  });
}

function houseOffer(p: Person, income: number): void {
  if (p.house || p.mortgage || p.age < 28 || p.age > 50 || p.rng() > 0.12) return;
  const c = countryOf(p);
  // 家の値段は年収の5〜6年分ほど (ローン返済は年収の2割前後)
  const price = Math.max(income, subsistence(c)) * (c.gdp > 25000 ? 6 : 5);
  const down = price * 0.2;
  if (p.wealth < down * 0.5) return;
  const cash = p.wealth >= price;
  const loan = { years: 25, pay: (price * 0.8 * 1.25) / 25, value: price };
  decide(p, {
    title: L('家を買う？', 'Buy a house?'),
    text: L(`${p.city ?? '村'}で家を探している。値段は${yen(price)}ほど(日本の物価での感覚)。`, `Looking for a house ${p.city ? `in ${p.city}` : 'in the village'}. Around ${yen(price)}.`),
    options: [
      ...(cash ? [{ label: L('一括で買う', 'Pay in full'), apply: (q: Person) => { q.wealth -= price; q.house = true; log(q, L('家を買った。', 'Bought a house.'), 'family', true); bump(q, { happy: 8 }); } }] : []),
      {
        label: L('ローンを組んで買う', 'Take a mortgage'), hint: L(`頭金${yen(down)}・毎年${yen(loan.pay)}を25年`, `${yen(down)} down, ${yen(loan.pay)}/yr for 25 years`),
        apply: (q) => {
          q.wealth -= down;
          q.mortgage = { ...loan };
          log(q, q.wealth < 0 ? L('親の助けも借りて、ローンで家を買った。', 'Bought a house with a mortgage and help from parents.') : L('ローンを組んで家を買った。', 'Bought a house with a mortgage.'), 'family', true);
          bump(q, { happy: 8 });
        },
      },
      { label: L('まだ借りて暮らす', 'Keep renting'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.55 ? 0 : cash ? 2 : 1),
  });
}

function carOffer(p: Person, income: number): void {
  const c = countryOf(p);
  const price = c.gdp < 10000 ? 16000 : 12000;
  if (p.car || p.age < 22 || p.age > 70 || income < price * 0.6 || p.wealth < price * 0.3 || p.rng() > 0.08) return;
  decide(p, {
    title: L('車を買う？', 'Buy a car?'),
    text: L(`車があれば通勤も買い物も楽になる。${yen(price)}ほど(日本の物価での感覚)。`, `A car would make commuting and shopping easier. Around ${yen(price)}.`),
    options: [
      { label: L('買う', 'Buy'), hint: L('毎年の維持費もかかる', 'Yearly running costs too'), apply: (q) => { q.wealth -= price; q.car = true; log(q, L('車を買った。', 'Bought a car.'), 'family'); bump(q, { happy: 4 }); } },
      { label: L('買わない', 'Don\'t buy'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.5 ? 0 : 1),
  });
}
