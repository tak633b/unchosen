import { describe, it, expect } from 'vitest';
import { createPerson, fromSaved, liveOut, toSaved } from './life';
import { closest, MEM_MAX, people } from './bonds';

// 実測 (2026-10-08, 1000人): id の重複 0 / mem の最大 12 / diedAt の抜け 0。
// 60歳以上まで生きた788人の友だちの数: 1人 45 / 2人 129 / 3人 206 / 4人 196 / 5人 126 / 6人 86 (平均 3.62)
describe('人の輪 (1000人)', () => {
  const lives = Array.from({ length: 1000 }, (_, i) => liveOut(createPerson({ seed: (i + 1) * 7919, basis: 'births', auto: true })));

  it('全員の id が一意', () => {
    for (const p of lives) {
      const ids = people(p).map((t) => t.id);
      expect(ids.every((i) => typeof i === 'number')).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('友だちの数は控えめ (一生で6人まで、60歳まで生きた人の平均は3〜4人台)', () => {
    const old = lives.filter((p) => p.age >= 60);
    const counts = old.map((p) => (p.ties ?? []).filter((t) => t.role === 'friend').length);
    expect(Math.max(...counts)).toBeLessThanOrEqual(6);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(4.2);
    expect(Math.max(...old.map((p) => (p.ties ?? []).filter((t) => t.role === 'mentor' || t.role === 'rival').length))).toBeLessThanOrEqual(2);
  });

  // 以前は孫の名前を毎回自由に引いていて、同じ子の孫に同じ名前が並んだ (1000人中46人)。実測で0になった
  it('主人公・きょうだい・子・孫の名前は家の中でかぶらない', () => {
    for (const p of lives) {
      const names = [{ name: p.given }, ...p.siblings, ...p.children, ...(p.ties ?? []).filter((t) => t.role === 'grandchild')].map((x) => x.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it(`mem は1人 ${MEM_MAX} 件まで`, () => {
    for (const p of lives) for (const t of people(p)) expect(t.mem?.length ?? 0).toBeLessThanOrEqual(MEM_MAX);
  });

  it('亡くなった人には diedAt が入り、log の who は輪の中の人を指す', () => {
    for (const p of lives) {
      const all = people(p);
      for (const t of all) if (!t.alive) expect(t.diedAt).toBeTypeOf('number');
      const ids = new Set(all.map((t) => t.id));
      for (const e of p.log) for (const w of e.who ?? []) expect(ids.has(w)).toBe(true);
    }
  });

  it('closest は生きていて連絡のある人を近い順に返す', () => {
    for (const p of lives.slice(0, 200)) {
      const c = closest(p, 3);
      expect(c.every((t) => t.alive && t.until === undefined && t.role !== 'ex')).toBe(true);
      for (let i = 1; i < c.length; i++) expect(c[i - 1].bond ?? 0).toBeGreaterThanOrEqual(c[i].bond ?? 0);
    }
  });
});

describe('古いセーブ (id・bond が無い) を読んでも動く', () => {
  it('fromSaved で補われ、その先も生きられる', () => {
    const p = createPerson({ seed: 11, basis: 'births', auto: true });
    while (p.alive && p.age < 20) liveOut(p, 1);
    const s = JSON.parse(JSON.stringify(toSaved(p)));
    for (const r of [s.mother, s.father, ...s.siblings, ...s.children, s.spouse].filter(Boolean)) { delete r.id; delete r.bond; delete r.mem; }
    delete s.ties; delete s.nextId;
    s.friend = 'Old Friend';
    const q = fromSaved(s);
    const all = people(q);
    expect(all.every((t) => typeof t.id === 'number' && typeof t.bond === 'number')).toBe(true);
    expect(all.some((t) => t.role === 'friend' && t.name === 'Old Friend')).toBe(true);
    liveOut(q);
    expect(q.alive).toBe(false);
  });
});
