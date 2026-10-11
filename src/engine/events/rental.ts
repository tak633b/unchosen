// 人に貸す家: ローンで買い、家賃から返す。空室・維持費・固定資産税・売買の税がかかり、
// 返せなくなれば急いで安く売る。
import { L } from '../../i18n';
import type { Country } from '../countries';
import { earnings, yen } from '../economy';
import { marketReturn } from '../market';
import { annuity, balanceOf, buyCost, FIRE_SALE, houseAging, ltv, mortgageRate, propertyTax, rentalYield, SELL_COST, transferTax, UPKEEP, vacancy } from '../property';
import { bump, decide, log, type Person, yearOf } from '../person';

const TERM = 25;

// 貸している家の値打ちから残りのローンを引いた持ち分
export const rentalEquity = (p: Person): number => (p.rental ? p.rental.value - balanceOf(p.rental.pay, p.rental.rate, p.rental.years) : 0);

// 1年分の家賃と出費。p.wealth に足し引きする
export function rentalYear(p: Person, c: Country, income: number): void {
  const h = p.rental;
  if (!h) return;
  const r = p.rng;
  const empty = r() < vacancy(c);
  const rent = empty ? 0 : h.value * rentalYield(c);
  const cost = h.value * (UPKEEP + propertyTax(c));
  const pay = h.years > 0 ? h.pay : 0;
  p.wealth += rent - cost - pay;
  if (h.years > 0) h.years--;
  if (empty && r() < 0.5) log(p, L('貸している家に、一年じゅう借り手がつかなかった。', 'The rental house sat empty all year.'), 'hard');
  h.value *= 1 + marketReturn('house', yearOf(p), c, r) - houseAging(p.age - h.since);
  // 家賃で返済をまかなえず、手元の借金が年収を超えたら手放す。働いている人は急いで安く、引退した人は時間をかけて相場で
  if (rent - cost - pay < 0 && p.wealth < -Math.max(income, 1)) sellRental(p, c, !p.retired);
}

// 売る: 手数料と譲渡益の税を払い、残りのローンを返す。急げば買い叩かれる
export function sellRental(p: Person, c: Country, hurry: boolean): number {
  const h = p.rental!;
  const sale = h.value * (hurry ? FIRE_SALE : 1);
  const gain = Math.max(0, sale - h.price);
  const tax = gain * transferTax(c, p.age - h.since);
  const net = sale * (1 - SELL_COST) - tax - balanceOf(h.pay, h.rate, h.years);
  p.wealth += net;
  p.rental = undefined;
  const left = yen(Math.max(0, net));
  if (hurry) {
    log(p, L(`返済が追いつかず、貸していた家を急いで売った。相場より安く、手元に残ったのは${left}。`,
      `Could not keep up with the payments and sold the rental house in a hurry, below market. ${left} was left after the loan.`), 'hard', true);
    bump(p, { happy: -6 });
  } else {
    log(p, L(`貸していた家を売り、老後の暮らしにあてた。手元に残ったのは${left}。`, `Sold the rental house to pay for life in retirement. ${left} was left after the loan.`), 'old');
  }
  return net;
}

export function rentalOffer(p: Person, c: Country, income: number): void {
  if (p.rental || !p.working || p.age < 35 || p.age > 60 || c.gdp < 8000 || p.rng() > 0.02) return;
  // 小さな部屋一つ。その国のふつうの年収の5年分ほど
  const price = earnings(c, 0.5) * 5;
  const loan = price * ltv(c, true);
  const fees = price * buyCost(c);
  const down = price - loan + fees;
  const rate = mortgageRate(c);
  const pay = annuity(loan, rate, TERM);
  const net = price * rentalYield(c) * (1 - vacancy(c)) - price * (UPKEEP + propertyTax(c)) - pay;
  // 銀行は、頭金に加えて家賃で足りない分の5年分の蓄えを見る
  if (p.wealth < down + Math.max(0, -net) * 5) return;
  decide(p, {
    title: L('貸すための家を買う？', 'Buy a house to rent out?'),
    text: L(`${yen(price)}の部屋を、頭金と諸費用${yen(down)}・残りはローンで買える。家賃からローンと税・修繕を払うと、ふつうの年で年${yen(net)}ほど${net >= 0 ? '残る' : '足りない'}。`,
      `A flat for ${yen(price)}: ${yen(down)} down with fees, the rest on a loan. After the loan, taxes and repairs, a normal year ${net >= 0 ? `leaves about ${yen(net)}` : `runs about ${yen(-net)} short`}.`),
    stat: L(`${c.name}の家賃の表面利回りはおよそ${(rentalYield(c) * 100).toFixed(1)}%、貸す家に借りられるのは価格の${Math.round(ltv(c, true) * 100)}%まで (Global Property Guide・各国の規制の目安)`,
      `Gross rental yields in ${c.name} are about ${(rentalYield(c) * 100).toFixed(1)}%, and banks lend up to ${Math.round(ltv(c, true) * 100)}% for a rental (Global Property Guide, national rules; approximate)`),
    options: [
      {
        label: L('買って貸す', 'Buy and rent it out'), hint: L('空室や値下がりの年もある', 'Empty years and price drops happen'),
        apply: (q) => {
          q.wealth -= down;
          q.rental = { value: price, price, years: TERM, pay, rate, since: q.age };
          log(q, L('ローンを組んで部屋を買い、人に貸し始めた。', 'Bought a flat on a loan and started renting it out.'), 'work', true);
        },
      },
      { label: L('やめておく', 'Pass'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < (net > 0 ? 0.4 : 0.2) ? 0 : 1),
  });
}
