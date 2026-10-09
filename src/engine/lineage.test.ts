import { describe, expect, it } from 'vitest';
import { advanceYear, createPerson, fromSaved, liveOut, toSaved } from './life';
import { continueAs, heirs } from './lineage';
import { lifeOf } from './kin';
import { circle } from './bonds';
import { contradictions } from './kin.testkit';
import type { Person, Role } from './person';

// 次の主人公から見た前の主人公の続き柄
const BACK: Record<string, (p: Person) => Role> = {
  child: (p) => (p.sex === 'F' ? 'mother' : 'father'), spouse: () => 'spouse', partner: () => 'partner',
  sibling: () => 'sibling', grandchild: () => 'grandparent', friend: () => 'friend',
};

// 前の主人公から次の主人公へ続けたときの食い違いを数える
export function handoff(p: Person, id: number): { q: Person; bad: string[] } {
  const bad: string[] = [];
  const say = (s: string) => bad.push(`seed ${p.seed} gen ${(p.line?.length ?? 0) + 1} -> #${id}: ${s}`);
  const t = heirs(p).find((x) => x.id === id)!;
  const l = lifeOf(p, id, p.birthYear + p.age)!;
  const q = continueAs(p, id);
  if (!q.alive) say('not alive');
  if (q.birthYear !== l.born || q.birthYear + q.age !== p.birthYear + p.age) say(`born ${q.birthYear} age ${q.age}`);
  if (q.log.map((e) => e.text).join('\n') !== l.entries.map((e) => e.text).join('\n')) say('log differs from the anchored life');
  if (q.log.some((e) => e.kind === 'death')) say('death in the past');
  if (circle(q).some(([r]) => r.fixed) || q.siblings.some((s) => s.fixed)) say('fixed left');
  const prev = circle(q).filter(([r]) => r.gen === (p.line?.length ?? 0) + 1);
  if (prev.length !== 1) say(`${prev.length} previous protagonists in the circle`);
  else {
    const [r, role] = prev[0];
    if (r.alive || r.name !== p.given || r.diedAt !== q.age) say(`previous: alive ${r.alive} ${r.name} diedAt ${r.diedAt}`);
    if (role !== BACK[t.role](p)) say(`role ${role} != ${BACK[t.role](p)}`);
  }
  if (q.line?.length !== (p.line?.length ?? 0) + 1) say('line');
  return { q, bad };
}

const sample = (n: number, from = 1) => Array.from({ length: n }, (_, i) => {
  const s = from + i;
  return { seed: s * 7121 + 3, year: [1950, 1970, 1990, 2020][s % 4], country: [undefined, 'JPN', 'IND', 'NGA', 'BRA'][s % 5] };
});

describe('この人で続ける', () => {
  it('3世代まで続けても、前の記録と食い違わない', () => {
    const bad: string[] = [];
    let gens = 0;
    for (const o of sample(60)) {
      let p = liveOut(createPerson({ ...o, basis: 'births', auto: true }));
      for (let g = 0; g < 2; g++) {
        const hs = heirs(p);
        if (!hs.length) break;
        const { q, bad: b } = handoff(p, hs[(o.seed + g) % hs.length].id!);
        bad.push(...b);
        // 続けた時に亡くなっていた人は、そのまま
        const dead = new Map(circle(q).filter(([r]) => !r.alive).map(([r]) => [r.id!, r.diedAt]));
        q.auto = true;
        liveOut(q);
        for (const [r] of circle(q)) if (dead.has(r.id!) && (r.alive || r.diedAt !== dead.get(r.id!))) bad.push(`seed ${o.seed} #${r.id} came back`);
        if (q.log.filter((e) => e.kind === 'death').length !== 1) bad.push(`seed ${o.seed} deaths`);
        bad.push(...contradictions(q));
        p = q;
        gens++;
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(gens).toBeGreaterThan(60);
  }, 300_000);

  it('続けた人生は、途中で保存して戻しても同じ', () => {
    for (const o of sample(15, 200)) {
      const p = liveOut(createPerson({ ...o, basis: 'births', auto: true }));
      const hs = heirs(p);
      if (!hs.length) continue;
      const a = continueAs(p, hs[0].id!);
      const b = continueAs(p, hs[0].id!);
      a.auto = b.auto = true;
      for (let i = 0; i < 10; i++) { advanceYear(a); advanceYear(b); }
      const c = fromSaved(JSON.parse(JSON.stringify(toSaved(a))));
      liveOut(b);
      liveOut(c);
      expect(c.log).toEqual(b.log);
      expect(c.line).toEqual(b.line);
    }
  }, 120_000);
});
