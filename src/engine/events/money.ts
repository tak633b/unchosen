// お金の流れ: 毎年の収入と暮らしの費用、貯金と借金、投資・家・車。
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
      log(p, '住宅ローンを払い終えた。家は自分のものになった。', 'family');
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
    if (r() < 0.3) { log(p, '借金の返済に追われ、食べる物を減らして暮らした。', 'hard'); bump(p, { happy: -6, health: -2 }); }
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
    title: '貯めたお金をどうする？',
    text: `貯金が${yen(p.wealth)}(日本の物価での感覚)になった。手元に置いておくお金をどこに預ける？`,
    stat: '長い目で見た実質の利回りは、預金1〜2%、株式は年5%前後、住宅は3%前後。新興国の株は年に±22%ほど上下する (UBS Global Investment Returns Yearbook)',
    options: [
      { label: '預金にする', hint: '年1〜2%・ほぼ安全', apply: (q) => { q.invest = 'deposit'; } },
      { label: '株に投資する', hint: '平均年5%・大きく下がる年もある', apply: (q) => { q.invest = 'stock'; } },
      { label: '不動産に投資する', hint: '平均年3.5%・ほどほどに上下', apply: (q) => { q.invest = 'realestate'; } },
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
    title: '家を買う？',
    text: `${p.city ?? '村'}で家を探している。値段は${yen(price)}ほど(日本の物価での感覚)。`,
    options: [
      ...(cash ? [{ label: '一括で買う', apply: (q: Person) => { q.wealth -= price; q.house = true; log(q, '家を買った。', 'family', true); bump(q, { happy: 8 }); } }] : []),
      {
        label: 'ローンを組んで買う', hint: `頭金${yen(down)}・毎年${yen(loan.pay)}を25年`,
        apply: (q) => {
          q.wealth -= down;
          q.mortgage = { ...loan };
          log(q, q.wealth < 0 ? '親の助けも借りて、ローンで家を買った。' : 'ローンを組んで家を買った。', 'family', true);
          bump(q, { happy: 8 });
        },
      },
      { label: 'まだ借りて暮らす', apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.55 ? 0 : cash ? 2 : 1),
  });
}

function carOffer(p: Person, income: number): void {
  const c = countryOf(p);
  const price = c.gdp < 10000 ? 16000 : 12000;
  if (p.car || p.age < 22 || p.age > 70 || income < price * 0.6 || p.wealth < price * 0.3 || p.rng() > 0.08) return;
  decide(p, {
    title: '車を買う？',
    text: `車があれば通勤も買い物も楽になる。${yen(price)}ほど(日本の物価での感覚)。`,
    options: [
      { label: '買う', hint: '毎年の維持費もかかる', apply: (q) => { q.wealth -= price; q.car = true; log(q, '車を買った。', 'family'); bump(q, { happy: 4 }); } },
      { label: '買わない', apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.5 ? 0 : 1),
  });
}
