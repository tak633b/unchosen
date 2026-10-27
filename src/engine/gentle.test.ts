import { afterEach, describe, expect, it } from 'vitest';
import { advanceYear, createPerson, liveOut, riskParts } from './life';
import { causeName, causeShares, HOMICIDE, isSuicide, pickCause, SUICIDE } from './causes';
import { countryAt } from './countries';
import { makeRng } from './rng';
import { setGentle } from './gentle';
import type { Person } from './person';

// 怖い場面の印: 死因・自死での死別 (quiet)・九死に一生の「襲われて」・incidents.ts の HEAVY・justice.ts のけんか・decisions の heavy
const MARKS = ['inc:kidnap', 'inc:lure', 'inc:extort', 'inc:robbery', 'inc:assault', 'brawl', 'choice:y-extortion-shop'];
const WORDS = /殴|刃物|銃声|身代金|目隠し|胸ぐら|包みを届け|グループに入った|誰のせいでもなかった/;
function scenes(ps: Person[]): number {
  let n = 0;
  for (const p of ps) {
    if (isSuicide(p.cause) || p.cause === causeName(HOMICIDE)) n++;
    for (const e of p.log) if (e.quiet || e.crisis === HOMICIDE || WORDS.test(e.text)) n++;
    for (const k of MARKS) if (p.recent[k] !== undefined) n++;
  }
  return n;
}
// 暴力・自死の多い国で、1990年生まれを一生
function lives(on: boolean): Person[] {
  setGentle(on);
  const ps: Person[] = [];
  for (const code of ['MEX', 'ZAF', 'KOR', 'USA', 'BRA', 'RUS']) for (let s = 1; s <= 60; s++) ps.push(liveOut(createPerson({ seed: s * 7919 + code.charCodeAt(0), basis: 'births', country: code, year: 1990, auto: true })));
  setGentle(false);
  return ps;
}

describe('怖い場面を除く', () => {
  afterEach(() => setGentle(false));

  it('死因の内訳から他殺と自死が消え、ほかの死因が同じ比で埋める', () => {
    const rng = makeRng(3);
    for (const code of ['MEX', 'KOR', 'JPN', 'NGA']) for (const age of [12, 25, 45, 70]) for (const sex of ['F', 'M'] as const) {
      const c = countryAt(code, 2000);
      const off = causeShares(c, sex, age, 0.003, false, 1.8);
      setGentle(true);
      const on = causeShares(c, sex, age, 0.003, false, 1.8);
      for (let i = 0; i < 300; i++) {
        const cause = pickCause(rng, c, sex, age, 0.003, false, 1.8);
        // 契約: ON のあいだ、自死と他殺は死因として選ばれない (gentle.ts)
        expect(isSuicide(cause)).not.toBe(true);
        expect(cause).not.toBe(causeName(HOMICIDE));
      }
      setGentle(false);
      const share = (xs: [string, number][], n: string) => xs.find(([k]) => k === n)![1];
      expect(share(on, HOMICIDE) + share(on, SUICIDE)).toBe(0);
      expect(on.reduce((t, [, w]) => t + w, 0)).toBeCloseTo(1, 9);
      // ほかの死因は、外した分だけ同じ比で増える (どれかに寄せない)
      const rest = 1 - share(off, HOMICIDE) - share(off, SUICIDE);
      for (const [n, w] of off) if (n !== HOMICIDE && n !== SUICIDE) expect(share(on, n)).toBeCloseTo(w / rest, 9);
    }
  });

  it('亡くなる確率は変わらない (つらい時期の自死の上乗せだけが消える)', () => {
    let years = 0, strained = 0;
    for (let s = 1; s <= 40; s++) {
      const p = createPerson({ seed: s * 31 + 5, basis: 'births', country: 'KOR', year: 1985, auto: true });
      while (p.alive) {
        const off = riskParts(p);
        setGentle(true);
        const on = riskParts(p);
        setGentle(false);
        expect(on.q).toBeCloseTo(off.q - off.strainAdd, 12);
        expect(on.strainAdd).toBe(0);
        years++;
        if (off.strainAdd) strained++;
        advanceYear(p);
      }
    }
    expect(years).toBeGreaterThan(1000);
    expect(strained).toBeGreaterThan(0);
  });

  // 実測 (2026-10-27、6か国×60人): OFF で怖い場面の印は計473 (暴行・強盗・誘い・けんか・自死・他殺・自死での死別)、ON で 0。
  // 世界の出生のくじで2000人を走らせても ON で 0、平均寿命は 73.1 → 72.9 歳 (乱数の並びが変わる分の揺れ。亡くなる確率は上のとおり同じ)
  it('暴力の多い国でも、その場面は起きない', () => {
    expect(scenes(lives(false))).toBeGreaterThan(200); // OFF では起きている (確かめる側が空回りしていない)
    expect(scenes(lives(true))).toBe(0);
  }, 300000);
});
