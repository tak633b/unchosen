import { describe, it, expect, vi } from 'vitest';
import { createPerson, liveOut } from './life';
import { isAcute, MAX_PER_LIFE } from './crisis';
import type { Person } from './person';

const lives = (mk: typeof createPerson, live: typeof liveOut, n: number) =>
  Array.from({ length: n }, (_, i) => live(mk({ seed: (i + 1) * 7919 + 13, basis: 'births', auto: true })));
// 一生の中身。九死に一生の行と、その年の人生地図の色 (行を足すと「病」の色になる) を除いて比べる
const body = (p: Person, near: number[]) => JSON.stringify({
  age: p.age, cause: p.cause, rng: p.rng.state, stats: p.stats, wealth: p.wealth, decisions: p.decisions, happy: p.happyByAge,
  log: p.log.filter((e) => !e.crisis), kinds: p.kinds.map((k, a) => (near.includes(a) ? null : k)),
});

describe('九死に一生', () => {
  // 実測 (2026-10-09, 400人): 1人あたり0.47回。0回264人・1回93人・2回33人・3回10人。心臓病と脳卒中が多い
  it('1人あたり多くても3回、平均は1回未満。急な死因だけ', () => {
    const ps = lives(createPerson, liveOut, 300);
    const counts = ps.map((p) => p.log.filter((e) => e.crisis).length);
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_PER_LIFE);
    const mean = counts.reduce((a, b) => a + b, 0) / ps.length;
    expect(mean).toBeGreaterThan(0.2);
    expect(mean).toBeLessThan(1);
    for (const p of ps) for (const e of p.log.filter((x) => x.crisis)) {
      expect(isAcute(e.crisis), e.crisis).toBe(true);
      expect(e.why).toMatch(/約\d/);
      expect(e.why).not.toMatch(/NaN|undefined|Infinity/);
    }
  }, 120_000);

  it('同じ seed なら同じ年に同じ死因', () => {
    const a = lives(createPerson, liveOut, 40).map((p) => p.log.filter((e) => e.crisis).map((e) => `${e.age}:${e.crisis}`));
    const b = lives(createPerson, liveOut, 40).map((p) => p.log.filter((e) => e.crisis).map((e) => `${e.age}:${e.crisis}`));
    expect(a).toEqual(b);
  });

  // 九死に一生を足しても、その人の一生 (出来事・数字・乱数の並び) は1行も変わらない
  it('九死に一生が無い場合と、行を足したこと以外は同じ一生', async () => {
    const withIt = lives(createPerson, liveOut, 400);
    vi.resetModules();
    vi.doMock('./crisis', async (orig) => ({ ...(await orig<typeof import('./crisis')>()), nearMiss: () => undefined }));
    await (await import('./world')).loadWorld(); // 読み込み直した国の表にも、暦年の値を入れる (vitest.setup.ts と同じ)
    const life = await import('./life');
    const without = lives(life.createPerson, life.liveOut, 400);
    vi.doUnmock('./crisis');
    expect(withIt.some((p) => p.log.some((e) => e.crisis))).toBe(true);
    expect(without.some((p) => p.log.some((e) => e.crisis))).toBe(false);
    const near = withIt.map((p) => p.log.filter((e) => e.crisis).map((e) => e.age));
    expect(withIt.map((p, i) => body(p, near[i]))).toEqual(without.map((p, i) => body(p, near[i])));
  }, 300_000);
});
