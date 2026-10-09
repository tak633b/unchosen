// テストで使う、輪の人の一生と主人公の記録の食い違いの数え方 (kin.test.ts と lineage.test.ts)
import { allLives, type KinLife } from './kin';
import { circle, people } from './bonds';
import type { Person, Relative, Tie } from './person';

// 輪の人の一生が、主人公の記録と食い違っていないかを数える。食い違いごとに一行
export function contradictions(p: Person): string[] {
  const bad: string[] = [];
  const say = (t: Tie, s: string) => bad.push(`seed ${p.seed} ${t.role} ${t.name} #${t.id}: ${s}`);
  const lives = new Map(allLives(p).map((l) => [l.id, l]));
  // 子と孫は、生まれた時の主人公の年齢 (since) から。ほかは今の年齢から
  const bornOf = (t: Relative & { role?: string }) => t.role === 'child' || t.role === 'grandchild' ? p.birthYear + t.since! : p.birthYear + (t.alive ? p.age : t.diedAt ?? p.age) - t.age;
  const pEnd = p.birthYear + p.age;
  for (const t of people(p)) {
    const l = lives.get(t.id!) as KinLife;
    if (!l) { say(t, 'no life'); continue; }
    const rp = l.person;
    if (l.born !== bornOf(t)) say(t, `born ${l.born} != ${bornOf(t)}`);
    if (l.sex !== t.sex) say(t, 'sex');
    const country = t.role === 'mother' || t.role === 'father' || t.role === 'sibling' ? p.birthCountry : t.country ?? p.birthCountry;
    if (rp.birthCountry !== country) say(t, `country ${rp.birthCountry} != ${country}`);
    // 死: 記録で亡くなった人は同じ年齢で、生きていた人は記録の終わりより後まで
    const deaths = rp.log.filter((e) => e.kind === 'death').length;
    if (deaths !== (rp.alive ? 0 : 1)) say(t, `${deaths} deaths`);
    if (!t.alive) {
      const age = l.born + l.age - p.birthYear === t.diedAt ? l.age : -1; // 亡くなった暦年が記録と同じか
      if (l.alive || age < 0 || (t.role !== 'grandchild' && age !== t.age)) say(t, `died at ${l.age} in ${l.born + l.age} (alive ${l.alive}), record ${t.age} at pa ${t.diedAt}`);
      const e = p.log.find((x) => x.kind === 'loss' && x.age === t.diedAt && x.who?.includes(t.id!));
      const cause = (t.role === 'mother' || t.role === 'father' || t.role === 'spouse') && e?.text.match(/\(([^()]+)\)[。.]?$/)?.[1];
      if (cause && l.cause !== cause) say(t, `cause ${l.cause} != ${cause}`);
    } else {
      const knownYear = t.until !== undefined ? p.birthYear + t.until : pEnd;
      if (!l.alive && l.born + l.age <= knownYear && p.alive === false) say(t, `died ${l.born + l.age} before known ${knownYear}`);
      if (p.alive && (!l.alive || l.born + l.age !== knownYear)) say(t, `mid-life: ${l.alive} ${l.born + l.age} != ${knownYear}`);
    }
    // 結婚: 連れ合いは結婚の年から主人公と。主人公が生きている間、ほかの人とは結婚していない
    const spouses = [...(rp.spouse ? [rp.spouse] : []), ...(rp.ties ?? []).filter((x) => x.role === 'spouse')];
    const offPa = l.born - p.birthYear; // その人の年齢 + offPa = 主人公の年齢
    const meEnd = p.alive ? Infinity : p.age;
    if (t.role === 'spouse') {
      const me = spouses.filter((s) => s.fixed?.ref === 0);
      if (me.length !== 1) say(t, `${me.length} protagonist marriages`);
      const wedPa = p.log.find((e) => e.big && (e.kind === 'love' || e.kind === 'hard') && e.who?.includes(t.id!))?.age;
      if (me[0] && wedPa !== undefined && me[0].since! + offPa !== wedPa) say(t, `wed at pa ${me[0].since! + offPa} != ${wedPa}`);
    }
    if (t.role === 'spouse' || t.role === 'partner' || t.role === 'ex') {
      const relEnd = t.until ?? meEnd;
      for (const s of spouses) if (s.fixed?.ref !== 0 && s.since! + offPa <= relEnd) say(t, `other spouse ${s.name} since pa ${s.since! + offPa} <= ${relEnd}`);
    }
    // 子: 主人公との子は、その人の子の中にいる。主人公が生きている間に、記録にない子はいない
    const kidsOf = (ids: number[]) => ids.forEach((k) => {
      const kid = rp.children.find((x) => x.fixed?.ref === k);
      const want = k === 0 ? p.birthYear : bornOf(people(p).find((x) => x.id === k) ?? { ...p.siblings.find((x) => x.id === k)!, role: 'sibling' });
      if (!kid) { if (want < l.born + l.age || l.alive) say(t, `missing child ${k} born ${want}`); return; }
      if (l.born + kid.since! !== want) say(t, `child ${k} born ${l.born + kid.since!} != ${want}`);
    });
    if (t.role === 'spouse') kidsOf(p.children.filter((k) => p.log.some((e) => e.age === k.since && e.who?.includes(k.id!) && e.who.includes(t.id!))).map((k) => k.id!));
    if (t.role === 'mother' || t.role === 'father') {
      kidsOf([0, ...p.siblings.filter((s) => s.age >= 0 || !p.alive).map((s) => s.id!)]);
      const meKid = rp.children.find((x) => x.fixed?.ref === 0);
      const parentAge = t.age - (t.alive ? p.age : t.diedAt!);
      if (meKid && meKid.since !== parentAge) say(t, `age at protagonist birth ${meKid.since} != ${parentAge}`);
    }
    if (t.role === 'mother' || t.role === 'father' || t.role === 'spouse' || t.role === 'child') {
      for (const k of rp.children) if (!k.fixed && l.born + k.since! <= Math.min(pEnd, p.alive ? Infinity : pEnd)) say(t, `unrecorded child ${k.name} born ${l.born + k.since!}`);
    }
    // きょうだい: 同じ両親、同じ家
    if (t.role === 'sibling') {
      if (rp.mother.fixed?.ref !== p.mother.id || rp.father.fixed?.ref !== p.father.id) say(t, 'parents');
      if (!rp.siblings.some((s) => s.fixed?.ref === 0)) say(t, 'protagonist not a sibling');
      if (rp.religion !== p.religion || rp.pool !== p.pool || rp.familyIndex !== p.familyIndex) say(t, 'family');
    }
    if (t.role === 'child' && ![rp.mother, rp.father].some((x) => x.fixed?.ref === 0)) say(t, 'protagonist not a parent');
    // ほかの人の一生に出てくる記録の人は、その人自身の一生と同じ年に生まれ、同じ年に亡くなる
    for (const [r] of circle(rp)) {
      const fx = r.fixed;
      if (!fx) continue;
      const dies = fx.ref === 0 ? (p.alive ? undefined : p.age) : (() => { const o = lives.get(fx.ref); return o && !o.alive ? o.age : undefined; })();
      const born = fx.ref === 0 ? p.birthYear : lives.get(fx.ref)?.born ?? fx.born;
      if (fx.born !== born) say(t, `fixed #${fx.ref} born ${fx.born} != ${born}`);
      if (lives.has(fx.ref) || fx.ref === 0) if (fx.dies !== dies) say(t, `fixed #${fx.ref} dies ${fx.dies} != ${dies}`);
      if (!r.alive && r.age !== fx.dies) say(t, `fixed #${fx.ref} died at ${r.age} != ${fx.dies}`);
      if (r.alive && fx.dies !== undefined && fx.born + fx.dies <= l.born + l.age) say(t, `fixed #${fx.ref} outlived ${fx.born + fx.dies}`);
    }
  }
  return bad;
}

