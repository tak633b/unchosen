import { describe, it, expect } from 'vitest';
import { advanceYear, createPerson, riskParts } from './life';
import { causeShares, isSuicide, pickCause, SUICIDE } from './causes';
import { countryAt } from './countries';
import { makeRng } from './rng';
import { lifeStory, nowLine } from './summary';
import { lineEntry } from './lineage';
import { storyPrompt } from '../ai/prompts';
import type { Person } from './person';
import { people } from './bonds';

// 自死の率の高い国で一生を走らせ、毎年の死亡率の内訳も集める
function run(code: string, n: number, seedOff: number) {
  const ps: Person[] = [];
  let q = 0, add = 0, outside = 0;
  for (let s = 1; s <= n; s++) {
    const p = createPerson({ seed: s * 7919 + seedOff, basis: 'births', country: code, auto: true, year: 1980 });
    while (p.alive) {
      const r = riskParts(p);
      q += r.q; add += r.strainAdd;
      if (!p.strain && r.strainAdd !== 0) outside++;
      advanceYear(p);
    }
    ps.push(p);
  }
  return { ps, q, add, outside };
}

const WORDS = /自死|自殺|suicide/i;

// 実測 (2026-10-11, 1980年生まれ 1500人): 自死で亡くなったのは 日本29・韓国40・米国17・ナイジェリア3・インド13人、最年少10歳 (インド)。
// つらい時期の倍率で動いた死亡率は、全体の 0.002〜0.004%
const kor = run('KOR', 1500, 5);

describe('自死', () => {
  it('10歳未満には起きない (本人も家族も)', () => {
    const rng = makeRng(1);
    for (const code of ['KOR', 'LSO', 'JPN', 'IND']) {
      for (let age = 0; age < 10; age++) {
        const c = countryAt(code, 2000);
        for (const sex of ['F', 'M'] as const) {
          expect(causeShares(c, sex, age, 1e-6, false, 1000).find(([n]) => n === SUICIDE)![1]).toBe(0);
          for (let i = 0; i < 200; i++) expect(isSuicide(pickCause(rng, c, sex, age, 1e-6, false, 1000))).toBe(false);
        }
      }
    }
    const died = kor.ps.filter((p) => isSuicide(p.cause));
    expect(died.length).toBeGreaterThan(0);
    for (const p of died) expect(p.age).toBeGreaterThanOrEqual(10);
    // 家族を自死で亡くした記録 (quiet) に出てくる人は、みな10歳以上だった
    let seen = 0;
    for (const p of kor.ps) for (const e of p.log.filter((x) => x.quiet && x.who?.length)) {
      const r = people(p).find((x) => x.id === e.who![0]);
      expect(r).toBeDefined();
      expect(r!.age).toBeGreaterThanOrEqual(10);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('共有・追悼・家系・AI に渡す文に、死因として出てこない', () => {
    const died = kor.ps.filter((p) => isSuicide(p.cause));
    for (const p of died) {
      const death = p.log.find((e) => e.kind === 'death')!;
      for (const text of [lifeStory(p), nowLine(p), lineEntry(p).cause, death.text, ...storyPrompt(p).filter((m) => m.role !== 'system').map((m) => m.content)]) expect(text).not.toMatch(WORDS);
      // 死亡記録には相談先を置く
      expect(death.why).toContain('いのちSOS 0120-061-338');
    }
    // どの人生の記録にも、自死という言葉は出てこない (家族を亡くした記録も、理由や方法も書かない)
    for (const p of kor.ps) for (const e of p.log) expect(e.text).not.toMatch(WORDS);
  });

  it('全体の死亡率は変わらない', () => {
    // つらい時期の外では、死亡率に何も足さない
    expect(kor.outside).toBe(0);
    // 時期の中で上下するぶんも、全体ではごくわずか (実測 0.003%)
    expect(Math.abs(kor.add / kor.q)).toBeLessThan(0.001);
    // 死因の内訳は、自死を取り分けても合計1のまま (ほかの死因から取り分けるだけ)
    for (const code of ['KOR', 'JPN', 'NGA']) for (const age of [12, 30, 60, 85]) {
      const c = countryAt(code, 2000);
      const shares = causeShares(c, 'M', age, 0.01, false);
      expect(shares.reduce((t, [, w]) => t + w, 0)).toBeCloseTo(1, 9);
      expect(shares.find(([n]) => n === SUICIDE)![1]).toBeGreaterThan(0);
    }
  });

  it('助けを求めた・打ち明けた・立ち直った年とその翌年には自死で終わらず、つらい行のすぐ次に死の行が来ない', () => {
    // 実測 (1990年生まれ 3000人生、国はくじ): 自死 22件 → 20件 (-9%、±20%のうち)。防いだ2件のほかは同じ人が同じ年に亡くなった
    const died = kor.ps.filter((p) => isSuicide(p.cause));
    expect(died.length).toBeGreaterThan(0);
    for (const p of died) {
      expect(p.age - (p.recent.heldOn ?? -99)).toBeGreaterThan(1);
      const i = p.log.findIndex((e) => e.kind === 'death');
      const prev = p.log[i - 1];
      if (prev && p.age - prev.age <= 1) expect(['hard', 'loss', 'ill']).not.toContain(prev.kind); // 間に静かな一行が入る (life.ts の settle)
    }
    // 打ち明けた・頼った・抜けた人がいる (印が付く経路が生きている)
    expect(kor.ps.filter((p) => p.recent.heldOn !== undefined).length).toBeGreaterThan(10);
  });

  it('前科は決まった年に消える', () => {
    for (const p of kor.ps) if (p.record) expect(p.age).toBeLessThan(p.record.until);
  });
});
