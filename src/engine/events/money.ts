// お金の流れ: 毎年の収入と暮らしの費用、貯金と借金、投資・家・車。
import { L } from '../../i18n';
import type { Country } from '../countries';
import { yen } from '../economy';
import { capitalGainsTax, debtRate, fundReturn, marketReturn, SWITCH_FEE, type Holding } from '../market';
import { annuity, balanceOf, buyCost, houseAging, ltv, mortgageRate, ownershipTarget } from '../property';
import { bump, countryOf, decide, log, type Person, yearOf } from '../person';
import { currentIncome, subsistence } from './common';
import { insuranceOffer, premium } from './insurance';
import { rentalEquity, rentalOffer, rentalYear } from './rental';
import { kidSupport } from './grown';

const DEBT_RATE = 0.03; // 借金の多くは家族・親族や奨学金からなので低めに

// 住宅ローンの残り元本。金利を持たない古いセーブは、25年で総額1.25倍 (年1.8%ほど) として数える
export const mortgageLeft = (m: NonNullable<Person['mortgage']>) => balanceOf(m.pay, m.rate ?? 0.018, m.years);

// 純資産 = 手元のお金 + 家の値打ち - 残っている住宅ローン + 貸している家の持ち分
export const netWorth = (p: Person) =>
  p.wealth + (p.mortgage ? p.mortgage.value - mortgageLeft(p.mortgage) : 0) + (p.homeValue ?? 0) + rentalEquity(p);

// 自分の財布で暮らしているか。働いていない人は、連れ合いか親の家計に入っている
export const independent = (p: Person) => p.working || p.retired || !!p.school.abroad;

export function finances(p: Person): void {
  if (!independent(p)) return;
  const c = countryOf(p);
  const r = p.rng;
  const year = yearOf(p);
  const income = currentIncome(p);
  if (income > p.peakIncome) { p.peakIncome = income; p.peakYear = year; }
  const floor = subsistence(c);
  const owner = !!(p.mortgage || p.house);
  const before = { worth: netWorth(p), house: houseWorth(p), owed: p.mortgage ? mortgageLeft(p.mortgage) : 0 };
  // 貯められる割合は、国の中での位置と、暮らしの絶対的な余裕の両方で決まる
  // 貧しい家でも、土地や家畜などの形で少しは蓄える (最低5%)
  const saveRate = Math.max(0.05, 0.15 * p.incomeP * Math.min(1, income / 30000)) + (p.wealth < 0 ? 0.05 : 0);
  // 家を持てば家賃がいらない
  let living = Math.max(floor, income * (1 - saveRate)) * (owner ? 0.78 : 1);
  const rentSaved = owner && !p.retired ? living / 0.78 * 0.22 : 0;
  // 引退後は、年金と貯えの取り崩しで暮らす。崩す割合は残りの年数 (95歳まで) で割り、はじめは年4%から (Bengen 1994 の4%ルール)
  // 足りない分は子や親族が支える
  if (p.retired) {
    const draw = Math.min(0.1, Math.max(0.04, 1 / Math.max(10, 95 - p.age)));
    const spend = income + Math.max(0, p.wealth) * draw;
    const kids = p.children.some((k) => k.alive && k.age >= 20);
    living = Math.max(spend, kids ? 0 : floor * (owner ? 0.4 : 0.5));
  }
  // 収入のない年は、家族や親族に頼って食いつなぐ。頼れる子がいなければ少しずつ借りる
  if (income === 0 && (!p.retired || p.wealth <= 0)) living = p.unemployed > 0 || p.children.some((k) => k.alive && k.age >= 20) ? 0 : floor * 0.3;
  const kids = p.children.filter((k) => k.alive && k.age < 18).length;
  const kidCost = Math.max(income, floor) * 0.07 * kids;
  living += kidCost;
  if (p.car) living += 1200;
  if (p.insured) living += premium(p, c);
  p.wealth += income - living;
  const support = kidSupport(p);
  p.wealth += support;
  // 子どもがいず家を借りていたら残った分。子育てと浮いた家賃は内訳に別に出す
  const kept = income - living + kidCost - rentSaved;

  let interest = 0;
  if (p.mortgage) {
    const m = p.mortgage;
    p.wealth -= m.pay;
    interest = m.pay - (before.owed - (m.years > 1 ? balanceOf(m.pay, m.rate ?? 0.018, m.years - 1) : 0));
    m.value *= 1 + marketReturn('house', year, c, r) - houseAging(p.age - (m.since ?? p.age));
    if (--m.years <= 0) {
      log(p, L('住宅ローンを払い終えた。家は自分のものになった。', 'Paid off the mortgage. The house is now fully owned.'), 'family');
      p.homeValue = m.value;
      p.homeSince = m.since ?? p.age - 25;
      p.mortgage = undefined;
      p.house = true;
    }
  } else if (p.homeValue) {
    p.homeValue *= 1 + marketReturn('house', year, c, r) - houseAging(p.age - (p.homeSince ?? p.age));
  }
  rentalYear(p, c, income);
  let last = 0;
  if (p.wealth > 0) {
    last = fundReturn(p.invest ?? 'deposit', year, c, r);
    if (p.invest === 'stock' || p.invest === 'picker') stockMove(p, last);
    p.wealth *= 1 + last;
    if (p.invest && p.invest !== 'deposit') p.gain = (p.gain ?? 0) + (p.wealth * last) / (1 + last);
  } else {
    // 家を担保にした借金は、無担保よりずっと安い (住宅ローン金利に1%ほど上乗せ)
    // 経済危機の年は、その年の金利になる (market.ts の SHOCKS)
    const w = p.wealth;
    p.wealth *= 1 + debtRate(p, owner ? Math.min(DEBT_RATE, mortgageRate(c) + 0.01) : DEBT_RATE);
    interest += w - p.wealth;
  }
  // 借金が膨らみすぎたら、取り立てと切り詰めで暮らしを縮める
  const cap = -3 * Math.max(income, floor);
  if (p.wealth < cap) {
    p.wealth = cap;
    const last = p.recent.debtSqueeze;
    if ((last === undefined || p.age - last >= 5) && r() < 0.3) { p.recent.debtSqueeze = p.age; log(p, L('借金の返済に追われ、食べる物を減らして暮らした。', 'Struggling with debt repayments, cut back on food.'), 'hard'); bump(p, { happy: -6, health: -2 }); }
  }
  yearInMoney(p, income, before.worth, [
    [kept >= 0 ? L('働いて残したお金', 'saved from work') : L('貯えの取り崩し', 'drawn from savings'), kept],
    [L('住宅価格の変動', 'house prices'), houseWorth(p) - before.house],
    [L('子どもからの生活費', 'from the children'), support],
    [L('借金の利息', 'interest'), -interest],
    [L('子育て費用', 'raising children'), -kidCost],
    [L('持ち家に住んで浮いた家賃', 'rent saved by owning'), rentSaved],
    [L('投資の値動き', 'investments'), p.wealth > 0 ? (p.wealth * last) / (1 + last) : 0],
  ]);
  // クメール・ルージュの時代 (1975〜78年) は私有の財産も市場もない (history.ts の kh-1975)
  if (p.recent['hist:kh-1975'] !== undefined && year < 1979) return;
  investOffer(p, income);
  switchOffer(p, c, last);
  houseOffer(p, income);
  selfBuild(p, c);
  carOffer(p, income);
  rentalOffer(p, c, income);
  insuranceOffer(p, c, income);
}

// 財産が大きく動いた年は、何で動いたかを一行で残す (本家の「今年、財産が31万円減りました。住宅価格の変動 −20万円 · …」)
// 収入の半分以上動いた年だけ、5年に1度まで。内訳は大きいものから4つ
function yearInMoney(p: Person, income: number, worth0: number, parts: [string, number][]): void {
  const delta = netWorth(p) - worth0;
  const last = p.recent.moneyYear;
  if (Math.abs(delta) < 0.5 * Math.max(income, subsistence(countryOf(p))) || (last !== undefined && p.age - last < 5)) return;
  const shown = parts.filter(([, v]) => Math.abs(v) >= Math.abs(delta) * 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4);
  if (!shown.length) return;
  p.recent.moneyYear = p.age;
  const sign = (v: number) => `${v < 0 ? '−' : '+'}${yen(Math.abs(v))}`;
  const list = shown.map(([k, v]) => `${k} ${sign(v)}`).join(' · ');
  log(p, L(`今年、財産が${yen(Math.abs(delta))}${delta < 0 ? '減った' : '増えた'}。${list}`, `Net worth ${delta < 0 ? 'fell' : 'rose'} by ${yen(Math.abs(delta))} this year: ${list}.`), 'work');
}

const houseWorth = (p: Person) => (p.mortgage?.value ?? 0) + (p.homeValue ?? 0);

// ---- 預け先 --------------------------------------------------------------------------

const HOLD_LABEL: Record<Holding, [string, string, string, string]> = {
  deposit: ['預金', 'Bank deposit', '年0.5%ほど・ほぼ安全', 'About 0.5%/yr, nearly safe'],
  bond: ['債券', 'Bonds', '平均年2%ほど・少し上下する', 'About 2%/yr, mild swings'],
  balanced: ['株と債券を半々のファンド', '50/50 balanced fund', '平均年4%ほど・ほどほどに上下', 'About 4%/yr, moderate swings'],
  stock: ['株価指数のインデックスファンド', 'Stock index fund', '平均年5%ほど・大きく下がる年もある', 'About 5%/yr, some years fall hard'],
  realestate: ['不動産ファンド', 'Real-estate fund', '平均年4%ほど・家賃が支える', 'About 4%/yr, rents hold it up'],
  picker: ['自分で株を選ぶ', 'Pick stocks yourself', '当たれば大きいが、多くは指数に負ける', 'Big wins possible, but most trail the index'],
};
const holdName = (h: Holding) => L(HOLD_LABEL[h][0], HOLD_LABEL[h][1]);

// 株を持っている人には、大きく動いた年を一行残す
function stockMove(p: Person, ret: number): number {
  if (ret <= -0.25) log(p, L(`持っている株の値打ちが、1年で${Math.round(-ret * 100)}%下がった。`, `The shares ${p.given} held lost ${Math.round(-ret * 100)}% of their value in a year.`), 'hard');
  else if (ret >= 0.35) log(p, L(`持っている株が、1年で${Math.round(ret * 100)}%値上がりした。`, `The shares ${p.given} held rose ${Math.round(ret * 100)}% in a year.`), 'family');
  return ret;
}

function investOffer(p: Person, income: number): void {
  if (p.invest || p.age < 24 || p.age > 65 || p.wealth < Math.max(income, 1000) * 0.8) return;
  const order: Holding[] = ['deposit', 'bond', 'balanced', 'stock', 'realestate', 'picker'];
  // 自動で決めるときの重み: 多くの家計は預金のまま。株を持つ人のうち個別株を自分で選ぶ人も多い
  const autoW = [0.45, 0.05, 0.12, 0.18, 0.08, 0.12];
  decide(p, {
    title: L('貯めたお金をどうする？', 'What to do with savings?'),
    text: L(`貯金が${yen(p.wealth)}(日本の物価での感覚)になった。手元に置いておくお金をどこに預ける？`, `Savings have reached ${yen(p.wealth)}. Where to keep the money?`),
    stat: L('1900年から2022年の世界の実質利回りは年率で株5.0%・債券1.7%・短期金利0.8% (UBS Global Investment Returns Yearbook 2023)。個別株を売り買いする個人は、平均すると市場に年1.5%ほど負ける (Barber & Odean 2000)',
      'Real returns worldwide from 1900 to 2022: stocks 5.0% a year, bonds 1.7%, short-term bills 0.8% (UBS Global Investment Returns Yearbook 2023). Individuals who trade their own stocks trail the market by about 1.5% a year on average (Barber & Odean 2000)'),
    options: order.map((h) => ({
      label: holdName(h), hint: L(HOLD_LABEL[h][2], HOLD_LABEL[h][3]),
      apply: (q: Person) => { q.invest = h; q.gain = 0; },
    })),
    auto: (q) => {
      let x = q.rng();
      for (let i = 0; i < autoW.length; i++) if ((x -= autoW[i]) < 0) return i;
      return 0;
    },
  });
}

// 置き場所を替えるのは、一度売ってから買い直すこと。手数料と、値上がり益への税がかかる
export function switchTo(p: Person, to: Holding): number {
  const c = countryOf(p);
  const fee = Math.max(0, p.wealth) * SWITCH_FEE;
  const tax = Math.max(0, p.gain ?? 0) * capitalGainsTax(c);
  p.wealth -= fee + tax;
  p.invest = to;
  p.gain = 0;
  return fee + tax;
}

function switchOffer(p: Person, c: Country, last: number): void {
  // 大きく下がった年は売りたくなる。そうでなければ、ときどき見直す
  if (!p.invest || p.age > 65 || p.wealth <= 0 || p.rng() > (last < -0.15 ? 0.5 : 0.015)) return;
  const crash = last < -0.15;
  const to = (['deposit', 'stock', 'balanced'] as Holding[]).filter((h) => h !== p.invest);
  const taxRate = capitalGainsTax(c);
  decide(p, {
    title: crash ? L('相場が大きく下がった', 'The market fell hard') : L('預け先を見直す？', 'Rethink the savings?'),
    text: crash
      ? L(`${holdName(p.invest)}の値打ちが今年${Math.round(-last * 100)}%下がった。売ってしまう？`, `${holdName(p.invest)} lost ${Math.round(-last * 100)}% this year. Sell?`)
      : L(`今は${holdName(p.invest)}に預けている。替えるなら一度売ることになる。`, `The money is in: ${holdName(p.invest)}. Switching means selling first.`),
    stat: L(`売買の手数料は1%ほど。${c.name}の売却益への税はおよそ${Math.round(taxRate * 100)}% (各国の税制の目安)`,
      `Trading costs about 1%. Capital-gains tax in ${c.name} is roughly ${Math.round(taxRate * 100)}% (approximate, by country)`),
    options: [
      { label: L('そのまま持つ', 'Hold'), apply: () => {} },
      ...to.map((h) => ({
        label: L(`売って${HOLD_LABEL[h][0]}に替える`, `Sell and move to: ${HOLD_LABEL[h][1]}`),
        hint: (p.gain ?? 0) > 0 && taxRate > 0 ? L('値上がり益に税がかかる', 'Gains are taxed') : L('手数料がかかる', 'Fees apply'),
        apply: (q: Person) => {
          const cost = switchTo(q, h);
          log(q, L(`預け先を${HOLD_LABEL[h][0]}に替えた。手数料と税で${yen(cost)}かかった。`, `Moved the savings to: ${HOLD_LABEL[h][1]}. Fees and taxes came to ${yen(cost)}.`), 'work');
        },
      })),
    ],
    // 下げた年に売ってしまう人は少なくない (2008年や2020年3月の投資信託の大量解約)
    auto: (q) => (crash ? (q.rng() < 0.25 ? 1 : 0) : q.rng() < 0.3 ? 1 : 0),
  });
}

// ---- 家 --------------------------------------------------------------------------------

// ローンの年数。日本は35年 (フラット35)、米国・韓国は30年が多い
const TERM: Record<string, number> = { JPN: 35, USA: 30, KOR: 30, CAN: 25, GBR: 25 };
const termOf = (c: Country) => TERM[c.code] ?? 25;

function houseOffer(p: Person, income: number): void {
  const c = countryOf(p);
  // 持ち家率を国ごとの統計に寄せる。0.45 は以前の版の45歳の持ち家率 (日米の実測)
  if (p.house || p.mortgage || p.age < 26 || p.age > 55 || p.rng() > Math.min(0.3, 0.12 * ownershipTarget(c) / 0.45)) return;
  // 家の値段は年収の5〜6年分ほど
  const price = Math.max(income, subsistence(c)) * (c.gdp > 25000 ? 6 : 5);
  const extra = price * buyCost(c);
  const down = price * (1 - ltv(c, false)) + extra;
  // 頭金の足りない分は親や親族が助ける (豊かな家ほど多く)
  if (p.wealth + price * 0.1 * p.familyP < down * 0.3) return;
  const cash = p.wealth >= price + extra;
  const rate = mortgageRate(c);
  const years = termOf(c);
  const pay = annuity(price - (down - extra), rate, years);
  // 返済が年収の4割を超えるなら銀行が貸さない (返済比率の上限。韓国の DSR 40% など)
  if (!cash && pay > Math.max(income, subsistence(c)) * 0.4) return;
  decide(p, {
    title: L('家を買う？', 'Buy a house?'),
    text: L(`${p.city ?? '村'}で家を探している。値段は${yen(price)}ほど(日本の物価での感覚)。税と手数料が${yen(extra)}。`, `Looking for a house ${p.city ? `in ${p.city}` : 'in the village'}. Around ${yen(price)}, plus ${yen(extra)} in taxes and fees.`),
    stat: L(`${c.name}の住宅ローンは実質金利で年${(rate * 100).toFixed(1)}%ほど、借りられるのは価格の${Math.round(ltv(c, false) * 100)}%まで (各国の中央銀行・規制の目安)`,
      `Mortgages in ${c.name} cost about ${(rate * 100).toFixed(1)}% a year after inflation, and lend up to ${Math.round(ltv(c, false) * 100)}% of the price (approximate, from central banks and regulators)`),
    options: [
      ...(cash ? [{ label: L('一括で買う', 'Pay in full'), apply: (q: Person) => { q.wealth -= price + extra; q.house = true; q.homeValue = price; q.homeSince = q.age; log(q, L('家を買った。', 'Bought a house.'), 'family', true); bump(q, { happy: 8 }); } }] : []),
      {
        label: L('ローンを組んで買う', 'Take a mortgage'), hint: L(`頭金と諸費用${yen(down)}・毎年${yen(pay)}を${years}年`, `${yen(down)} down with fees, ${yen(pay)}/yr for ${years} years`),
        apply: (q) => {
          q.wealth -= down;
          q.mortgage = { years, pay, value: price, rate, since: q.age };
          log(q, q.wealth < 0 ? L('親の助けも借りて、ローンで家を買った。', 'Bought a house with a mortgage and help from parents.') : L('ローンを組んで家を買った。', 'Bought a house with a mortgage.'), 'family', true);
          bump(q, { happy: 8 });
        },
      },
      { label: L('まだ借りて暮らす', 'Keep renting'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.55 ? 0 : cash ? 2 : 1),
  });
}

// 貧しい国や農村では、家はローンで買うより、家族の手で建てるか受け継ぐもの (UN-Habitat: 途上国の住宅の多くは自分で少しずつ建てる)。
// 決まりきったことなので選ぶ場面は出さず、一行だけ残す
function selfBuild(p: Person, c: Country): void {
  if (p.house || p.mortgage || p.age < 24 || p.age > 55 || !(c.gdp < 8000 || (p.rural && c.gdp < 20000))) return;
  // 45歳までに持ち家率の目安に届くくらいの年ごとの確率 (24〜45歳の22年)
  if (p.rng() > 1 - (1 - ownershipTarget(c) * 0.9) ** (1 / 22)) return;
  const cost = subsistence(c) * 1.5;
  p.wealth -= cost;
  p.house = true;
  p.homeValue = cost * 2;
  p.homeSince = p.age;
  log(p, p.rural
    ? L('家族や近所の人と、自分たちの家を建てた。', 'Built a house of their own with family and neighbors.')
    : L('少しずつ部屋を足してきた家が、ようやく自分のものになった。', 'The house built room by room over the years was finally their own.'), 'family');
}

function carOffer(p: Person, income: number): void {
  const c = countryOf(p);
  const price = c.gdp < 10000 ? 16000 : 12000;
  if (p.car || p.age < 22 || p.age > 65 || income < price * 0.6 || p.wealth < price * 0.3 || p.rng() > 0.08) return;
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
