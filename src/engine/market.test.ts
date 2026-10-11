import { afterEach, describe, expect, it } from 'vitest';
import { byCode } from './countries';
import { capitalGainsTax, fundReturn, longRunReturn, marketReturn, setMarketReturn } from './market';
import { annuity, balanceOf } from './property';
import { makeRng } from './rng';
import { createPerson } from './life';
import { switchTo } from './events/money';

const USA = byCode('USA');

// 20年の複利。同じ seed の乱数で、指数と個別株を並べる
function paths(n: number): { beat: number; idx: number; pick: number } {
  let beat = 0, gi = 0, gp = 0;
  for (let i = 0; i < n; i++) {
    const r1 = makeRng(i + 1), r2 = makeRng(i + 1);
    let a = 1, b = 1;
    for (let y = 0; y < 20; y++) { a *= 1 + fundReturn('stock', 2000 + y, USA, r1); b *= 1 + fundReturn('picker', 2000 + y, USA, r2); }
    if (b > a) beat++;
    gi += Math.log(a) / 20; gp += Math.log(b) / 20;
  }
  return { beat: beat / n, idx: Math.exp(gi / n) - 1, pick: Math.exp(gp / n) - 1 };
}

describe('市場の値動き', () => {
  afterEach(() => setMarketReturn(null));

  // 実測 (2026-10-11): 指数 年4.9%、自分で選んだ株 年2.9%、20年で指数に勝ったのは2000本中 27.6%
  it('自分で株を選ぶ人の多くは、指数に負ける', () => {
    const r = paths(2000);
    expect(r.beat).toBeCloseTo(0.2755, 3);
    expect(r.pick).toBeLessThan(r.idx);
  });

  // 実測: 2万年ぶんの複利で 株5.3%・債券1.8%・預金0.5% (UBS Yearbook の 5.0%・1.7%・0.8% に近い)
  it('長い目で見た利回りは統計に近い', () => {
    const geo = (h: 'stock' | 'bond' | 'deposit') => {
      const r = makeRng(99);
      let g = 0;
      for (let i = 0; i < 20000; i++) g += Math.log(1 + fundReturn(h, 2000, USA, r));
      return Math.exp(g / 20000) - 1;
    };
    expect(geo('stock')).toBeCloseTo(0.0528, 3);
    expect(geo('bond')).toBeCloseTo(0.0181, 3);
    expect(geo('deposit')).toBeCloseTo(0.005, 12);
  });

  it('年ごとの相場をつなぐと、その値が使われ、つながない年と資産は統計に戻る', () => {
    setMarketReturn((asset, year) => (asset === 'stock' && year === 2008 ? -0.4 : undefined));
    expect(marketReturn('stock', 2008, USA, makeRng(1))).toBe(-0.4);
    expect(marketReturn('stock', 2009, USA, makeRng(1))).toBe(longRunReturn('stock', 2009, USA, makeRng(1)));
    // バランス型は株と債券の平均
    const r1 = makeRng(5), r2 = makeRng(5);
    expect(fundReturn('balanced', 2008, USA, r1)).toBeCloseTo((-0.4 + longRunReturn('bond', 2008, USA, r2)) / 2, 12);
    setMarketReturn(null);
    expect(marketReturn('stock', 2008, USA, makeRng(1))).toBe(longRunReturn('stock', 2008, USA, makeRng(1)));
  });

  it('乗り換えは売ることなので、手数料と売却益の税がかかる (税の無い国もある)', () => {
    expect(capitalGainsTax(byCode('JPN'))).toBe(0.20315);
    expect(capitalGainsTax(byCode('KOR'))).toBe(0);
    const p = createPerson({ seed: 4242, basis: 'births', country: 'JPN', year: 2000, auto: true });
    p.wealth = 100000; p.invest = 'stock'; p.gain = 20000;
    expect(switchTo(p, 'deposit')).toBeCloseTo(1000 + 20000 * 0.20315, 6);
    expect(p.invest).toBe('deposit');
    expect(p.gain).toBe(0);
    const k = createPerson({ seed: 4242, basis: 'births', country: 'KOR', year: 2000, auto: true });
    k.wealth = 100000; k.invest = 'picker'; k.gain = 20000;
    expect(switchTo(k, 'stock')).toBeCloseTo(1000, 6);
  });
});

describe('ローンの返済', () => {
  it('元利均等: 払い始めの残りは借りた額、払い終えると0', () => {
    expect(annuity(100000, 0, 25)).toBe(4000);
    const pay = annuity(100000, 0.015, 30);
    expect(balanceOf(pay, 0.015, 30)).toBeCloseTo(100000, 6);
    expect(balanceOf(pay, 0.015, 0)).toBe(0);
    expect(balanceOf(pay, 0.015, 15)).toBeLessThan(60000);
  });
});
