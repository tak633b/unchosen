// この人で続ける: 主人公が亡くなったあと、輪の誰かを次の主人公にする。
// その人のここまでは、記録に合わせた一生 (kin.ts) そのもの。ここから先は手綱を外した、ふつうの人生として進む
import { addTie, circle, MEM_MAX, people } from './bonds';
import { lifeOf } from './kin';
import { PET_ID, petRec } from './pets';
import { createPerson, fromSaved, toSaved } from './life';
import type { BirthBasis } from './countries';
import { advanceYear } from './life';
import type { LineEntry, LogEntry, Person, Relative, Role, Tie } from './person';

// 続けられる人: 主人公が亡くなった年に生きていて、連絡のある、家族か近しい人
const HEIRS: Role[] = ['child', 'spouse', 'partner', 'sibling', 'grandchild', 'friend'];
// その人の一生に前の主人公がもともと出てこない続き柄では、輪に足す。値はその人から見た前の主人公
const BACK: Partial<Record<Role, Role>> = { friend: 'friend', partner: 'partner', grandchild: 'grandparent' };

const deathYear = (p: Person) => p.birthYear + p.age;

export function heirs(p: Person): Tie[] {
  if (p.alive) return [];
  return people(p).filter((t) => HEIRS.includes(t.role) && t.alive && t.until === undefined && lifeOf(p, t.id!, deathYear(p))?.alive === true);
}

export const generation = (p: Person) => (p.line?.length ?? 0) + 1;

export function lineEntry(p: Person, rel?: Role): LineEntry {
  return {
    seed: p.seed, name: p.name, given: p.given, sex: p.sex, ...(p.gender ? { gender: p.gender } : {}), birthYear: p.birthYear, age: p.age,
    cause: p.cause ?? '', birthCountry: p.birthCountry, country: p.country, religion: p.religion, ...(rel ? { rel } : {}),
  };
}

export function continueAs(p: Person, id: number): Person {
  const t = people(p).find((x) => x.id === id);
  const l = t && lifeOf(p, id, deathYear(p));
  if (!t || !l?.alive) throw new Error(`cannot continue as #${id}`);
  // 覚えている一生には手を付けない (保存の形で写す)
  const q = fromSaved(structuredClone(toSaved(l.person)));
  const off = l.born - p.birthYear; // 前の主人公の年齢 - off = この人の年齢
  // 前の主人公: 家族ならその人の一生にもう亡くなった人として出てくる。友だち・恋人・孫の側では足す
  let prev: Relative | undefined = circle(q).find(([r]) => r.fixed?.ref === 0)?.[0];
  const back = BACK[t.role];
  if (!prev && back) {
    prev = addTie(q, { alive: false, age: p.age, sex: p.sex, name: p.given, role: back, since: Math.max(0, t.since - off), diedAt: q.age, country: p.country });
  }
  const shared = l.entries.filter((e) => e.shared);
  if (prev) {
    prev.gen = generation(p);
    prev.bond = t.bond;
    prev.mem = shared.slice(-MEM_MAX).map((e) => ({ age: e.age, text: e.text, d: 0 }));
  }
  // その人の記録に、主人公の記録にあった一緒の出来事 (その人の側の文) を差し込む。順番は一生の欄と同じ
  const own = q.log;
  let i = 0;
  q.log = l.entries.map((e): LogEntry => (e.shared
    ? { age: e.age, text: e.text, kind: e.kind, ...(e.big ? { big: true } : {}), ...(e.stat ? { stat: e.stat } : {}), ...(e.why ? { why: e.why } : {}), ...(prev ? { who: [prev.id!] } : {}) }
    : own[i++]));
  // ここから先は手綱なし: 記録で決まっていた人も、ふつうに歳をとり、亡くなる
  for (const [r] of circle(q)) delete r.fixed;
  for (const s of q.siblings) delete s.fixed;
  // 同じ家で暮らしていた連れ合いと、まだ家にいる子には、生きているペットも引き継ぐ
  const pet = petRec(p);
  if (p.pet && pet && !q.pet && (t.role === 'spouse' || (t.role === 'child' && q.age < 18))) {
    q.pet = { ...p.pet };
    q.pets = [...(q.pets ?? []), { ...pet, id: PET_ID + (q.pets?.length ?? 0), since: Math.max(0, pet.since - off), mem: pet.mem.map((m) => ({ ...m, age: Math.max(0, m.age - off) })) }];
    q.petsHad++;
  }
  q.auto = false;
  q.questions = [];
  q.decisions = 0;
  q.line = [...(p.line ?? []), lineEntry(p, t.role)];
  return q;
}

// 次の主人公と同じ1秒に生まれた人たち。seed はその人から決めるので、作り直しても同じ
export function othersFor(q: Person, basis: BirthBasis, n = 4): Person[] {
  return Array.from({ length: n }, (_, i) => {
    const o = createPerson({ seed: (Math.imul(q.seed ^ 0x5eed5eed, i + 1) + 0x9e3779b9 * (i + 1)) >>> 0, basis, auto: true, year: q.birthYear, month: q.birthMonth });
    while (o.alive && o.age < q.age) advanceYear(o);
    return o;
  });
}
