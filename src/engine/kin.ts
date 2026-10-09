// 輪の人それぞれの一生。主人公と同じ仕組み (createPerson / advanceYear) で、その人の国・性別・生まれ年の統計から生きる。
// 主人公の記録で決まっていること (関係の時期・一緒の出来事・亡くなった年と死因・結婚・子・きょうだいの家・親の年齢・国) は
// 手綱 (Anchor) で守る。乱数は主人公とは別に、seed と その人の id から作る。主人公の人生にも、その乱数にも触れない。
// 保存はしない。見るときに作り、同じ記録のあいだは覚えておく
import { causeName, pickCause } from './causes';
import { countryAt } from './countries';
import { advanceYear, birthStory, createPerson } from './life';
import { MAX_AGE, type Sex } from './lifetable';
import { childWord, countryOf, yearOf, type Anchor, type Fixed, type Person, type Relative, type Role, type Tie, type YearKind } from './person';
import { addTie, callName, circle, ensureBonds, mourn, newId, shared } from './bonds';
import { voice } from './kinvoice';
import { marry, newPartner } from './events/love';
import { keepLateSpouse } from './events/bonds';
import { qAt } from './events/common';
import { clamp, makeRng } from './rng';
import { because, deathWhy } from './why';
import { L } from '../i18n';

export interface KinEntry {
  age: number; year: number; text: string; kind: YearKind; big?: boolean; why?: string; stat?: string;
  shared?: boolean; // 主人公の記録にある、一緒の出来事
  voiced?: boolean; // その出来事を、その人の側の文に書き直した (書き直せなかった文は主人公の側の文のまま)
  after?: boolean;  // 主人公が亡くなった後
  me?: boolean;     // 主人公が出てくる、その人の側の出来事 (主人公の誕生・死など)
}
export interface KinLife {
  id: number; name: string; sex: Sex; born: number; country: string;
  age: number; alive: boolean; cause?: string;
  full: boolean;     // 亡くなるまで分かっている (主人公が生きている間は、今までのところまで)
  entries: KinEntry[];
  person: Person;
}

const mix = (a: number, b: number, salt: number) => {
  let h = Math.imul(a ^ salt, 0x85ebca6b) ^ Math.imul(b + 0x9e3779b9, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return h >>> 0;
};

interface Member { r: Relative | Tie; role: Role }

// 主人公の記録から読み取る、輪の全員の事実。一つの記録につき一度だけ作る
class Ledger {
  readonly byId = new Map<number, Member>();
  private fates = new Map<number, { dies?: number; cause?: string }>();
  constructor(readonly p: Person) {
    ensureBonds(p);
    for (const [r, role] of circle(p)) this.byId.set(r.id!, { r, role });
    for (const s of p.siblings) if (s.age < 0) this.byId.set(s.id!, { r: s, role: 'sibling' }); // まだ生まれていないきょうだい
  }
  // 主人公の年齢 ↔ 暦年
  year = (pa: number) => this.p.birthYear + pa;
  born(r: Relative): number { return this.p.birthYear + (r.alive ? this.p.age : r.diedAt ?? this.p.age) - r.age; }
  country(m: Member): string {
    return m.role === 'mother' || m.role === 'father' || m.role === 'sibling' ? this.p.birthCountry : m.r.country ?? this.p.birthCountry;
  }
  // 生きていると分かっている最後の年齢 (その人の年齢で)。連絡が途絶えた人は、途絶えた時まで
  known(m: Member): number {
    const t = m.r as Tie;
    return t.age - (t.until !== undefined && t.alive ? this.p.age - t.until : 0);
  }
  // 記録に残る死因。親と連れ合いの死は「(死因)」で書かれている (events/family.ts)
  private recordedCause(m: Member): string | undefined {
    if (m.role !== 'mother' && m.role !== 'father' && m.role !== 'spouse') return;
    const e = this.p.log.find((x) => x.kind === 'loss' && x.age === m.r.diedAt && x.who?.includes(m.r.id!));
    const hit = e?.text.match(/\(([^()]+)\)[。.]?$/);
    if (hit) return hit[1];
    if (m.role === 'spouse' && e?.stat) return causeName('出産時の合併症'); // events/love.ts の giveBirth
  }
  // いつ亡くなるか。記録にあればそれ、主人公が亡くなった後も生きていた人は、その人の国の生命表で先を引く。
  // 主人公が生きている間は、まだ決めない (この先の記録と食い違わないように)
  fate(id: number): { dies?: number; cause?: string } {
    const hit = this.fates.get(id);
    if (hit) return hit;
    const m = this.byId.get(id)!;
    const rng = makeRng(mix(this.p.seed, id, 0x51ed));
    const code = this.country(m);
    const born = this.born(m.r);
    const draw = (a: number) => { const c = countryAt(code, born + a); return pickCause(rng, c, m.r.sex, a, Math.max(1e-6, qAt(c, m.r.sex, a)), false); };
    let f: { dies?: number; cause?: string } = {};
    if (!m.r.alive) f = { dies: m.r.age, cause: this.recordedCause(m) ?? draw(m.r.age) };
    else if (!this.p.alive) {
      for (let a = Math.max(0, this.known(m) + 1); a <= MAX_AGE; a++) {
        if (a < MAX_AGE && rng() >= qAt(countryAt(code, born + a), m.r.sex, a)) continue;
        f = { dies: a, cause: draw(a) };
        break;
      }
    }
    this.fates.set(id, f);
    return f;
  }
  fixed(id: number): Fixed {
    if (id === 0) return { ref: 0, born: this.p.birthYear, ...(this.p.alive ? {} : { dies: this.p.age, cause: this.p.cause }) };
    return { ref: id, born: this.born(this.byId.get(id)!.r), ...this.fate(id) };
  }
  nameOf = (id: number) => (id === 0 ? this.p.given : this.byId.get(id)!.r.name ?? '');
  sexOf = (id: number): Sex => (id === 0 ? this.p.sex : this.byId.get(id)!.r.sex);
  // 主人公の記録の中で、a が出てくる主人公の年齢 pa の出来事 (b も出てくるもの)
  entry = (pa: number, a: number, b?: number) => this.p.log.find((e) => e.age === pa && e.who?.includes(a) && (b === undefined || e.who.includes(b)));
  // 子どものもう一人の親 (生まれた時の記録に一緒に出てくる人)
  otherParent(k: Relative): number | undefined {
    const e = this.p.log.find((x) => x.age === k.since && x.who?.includes(k.id!) && x.who.length > 1);
    return e?.who!.find((w) => w !== k.id) ?? this.p.spouse?.id;
  }
  // 結婚した年 (主人公の年齢)。結婚の記録は大きな出来事として残る (events/love.ts の marry と childMarriage)
  wedPa(t: Relative): number {
    return this.p.log.find((e) => e.big && (e.kind === 'love' || e.kind === 'hard') && e.who?.includes(t.id!))?.age ?? t.since ?? 0;
  }
  // 両親が結婚した暦年。一番上の子の生まれる1〜3年前 (父の一生と母の一生で同じ値を使う)
  parentsWed(): number {
    const p = this.p;
    const eldest = Math.min(p.birthYear, ...p.siblings.map((s) => this.born(s)));
    const mb = this.born(p.mother), fb = this.born(p.father);
    return Math.min(eldest, Math.max(eldest - 1 - (mix(p.seed, 7, 0x3ed) % 3), mb + 15, fb + 16));
  }
  // 生まれた家の暮らし向き。古いセーブには生まれた時の値が無いので、親を幼くして亡くした時の下げ (events/family.ts) を戻す
  homeP(): number {
    const p = this.p;
    const young = [p.mother, p.father].filter((r) => !r.alive && (r.diedAt ?? 99) < 18).length;
    return p.birthP ?? clamp(p.familyP + 0.12 * young, 0.01, 0.99);
  }
  // 主人公がずっと生まれた町にいたか (移住・留学をすると p.city は今いる町になる)
  get stayed() { return this.p.countriesLived.length === 1 && !this.p.school.abroad; }
}

// 記録で決まっている人を、その人の一生の中の Relative にする
function relOf(rec: Ledger, id: number, year: number): Relative {
  const fx = rec.fixed(id);
  const dead = fx.dies !== undefined && year > fx.born + fx.dies; // 同じ年の死は、足したあと fixedDeaths が記録する
  return { alive: !dead, age: dead ? fx.dies! : year - fx.born, sex: rec.sexOf(id), name: rec.nameOf(id), fixed: fx };
}

interface Wed { year: number; spouse?: number } // spouse が無ければ、乱数で選んだ相手と結婚する
interface Kid { id: number; year: number }
interface Grand extends Kid { parent: number }

const GRIEF: Partial<Record<Role, number>> = { mother: -8, father: -8, sibling: -10, spouse: -20, child: -25, grandchild: -15 };

// 決まった年に亡くなる人を、その人の一生の中で見送る
function fixedDeaths(rp: Person): void {
  const yr = yearOf(rp);
  for (const [rel, role] of circle(rp)) {
    const fx = rel.fixed;
    if (!fx || !rel.alive || fx.dies === undefined || yr < fx.born + fx.dies) continue;
    rel.alive = false;
    rel.age = fx.dies;
    const why = fx.cause ? L(`(${fx.cause})`, ` (${fx.cause})`) : '';
    const n = rel.name ?? '';
    const text = role === 'mother' || role === 'father'
      ? L(`${role === 'mother' ? '母' : '父'}が${rel.age}歳で亡くなった${why}。`, `${role === 'mother' ? 'Mother' : 'Father'} died at ${rel.age}${why}.`)
      : role === 'spouse' ? L(`連れ合いの${n}が${rel.age}歳で亡くなった${why}。`, `Spouse ${n} died at ${rel.age}${why}.`)
        : role === 'child' ? L(`子どもの${n}が${rel.age < 1 ? '1歳になる前に' : `${rel.age}歳で`}亡くなった${why}。`, `Child ${n} died ${rel.age < 1 ? 'before turning 1' : `at ${rel.age}`}${why}.`)
          : role === 'sibling' ? L(`きょうだいの${n}が${rel.age}歳で亡くなった${why}。`, `${rel.sex === 'F' ? 'Sister' : 'Brother'} ${n} died at ${rel.age}${why}.`)
            : L(`孫の${n}が${rel.age}歳で亡くなった${why}。`, `Grandchild ${n} died at ${rel.age}${why}.`);
    shared(rp, [rel], text, 'loss', 0, true, undefined, 'loss');
    because(rp, deathWhy(countryOf(rp), rel.sex, rel.age));
    rel.diedAt = rp.age;
    const young = (role === 'mother' || role === 'father') && rp.age < 18;
    mourn(rp, rel, young ? -18 : GRIEF[role] ?? -4);
    if (young) rp.familyP = clamp(rp.familyP - 0.12, 0.01, 0.99);
  }
}

// upto: この暦年より先は作らない (同じ1秒に生まれた人の輪を、主人公の今の年までで見るとき)
function build(rec: Ledger, id: number, upto = Infinity): KinLife | undefined {
  const p = rec.p;
  const m = rec.byId.get(id);
  if (!m || m.r.age < 0) return undefined;
  const t = m.r;
  const role = m.role;
  const born = rec.born(t);
  const code = rec.country(m);
  const sampled = rec.fate(id);
  const fate = sampled.dies !== undefined && born + sampled.dies > upto ? {} : sampled;
  const rp = createPerson({ seed: mix(p.seed, id, 0x4b1d), basis: 'births', auto: true, country: code, year: born, month: 1 + (mix(p.seed, id, 0x30a) % 12), gender: t.sex });
  rp.given = rp.name = t.name ?? rp.given;
  const pa = () => yearOf(rp) - p.birthYear; // 今の暦年での、主人公の年齢
  const pAlive = () => p.alive || pa() <= p.age;
  const end = p.alive ? Infinity : p.age;      // 主人公の記録が続いている最後の年齢

  // その人の側の文で書き直した、主人公の記録の出来事 (主人公の誕生・結婚・子の誕生)。一緒の出来事としては重ねて出さない
  const covered = new Set<object>();
  const cover = (e?: object) => { if (e) covered.add(e); };
  const weds: Wed[] = [];
  const kids: Kid[] = [];
  const grands: Grand[] = [];
  const childIds = (ofSpouse?: number) => p.children.filter((k) => ofSpouse === undefined || rec.otherParent(k) === ofSpouse).map((k) => k.id!);
  const grandsOf = (parents: number[]) => (p.ties ?? []).filter((g) => g.role === 'grandchild' && parents.includes(g.of ?? -1));
  let loveUntil = -Infinity; // 主人公の年齢でこの年まで、乱数の恋愛・結婚をしない
  let moveUntil = role === 'mother' || role === 'father' || role === 'sibling' || role === 'child' || role === 'grandchild' ? -Infinity : t.since ?? -Infinity;
  let job: string | undefined;

  if (role === 'mother' || role === 'father') {
    const other = role === 'mother' ? p.father.id! : p.mother.id!;
    const w = rec.parentsWed();
    weds.push({ year: w, spouse: other });
    loveUntil = w - p.birthYear - 1;
    moveUntil = end;
    cover(rec.entry(0, id)); // 主人公の生まれた時の記録 (主人公の側の文) は、母・父の側の文に置き換える
    kids.push({ id: 0, year: p.birthYear }, ...p.siblings.map((s) => ({ id: s.id!, year: rec.born(s) })));
    grands.push(...p.children.map((k) => ({ id: k.id!, year: rec.born(k), parent: 0 })));
  } else if (role === 'spouse' || role === 'partner' || role === 'ex') {
    const relEnd = (t as Tie).until ?? end;
    loveUntil = relEnd;
    moveUntil = relEnd;
    job = t.job;
    if (role === 'spouse') {
      const w = rec.wedPa(t);
      weds.push({ year: rec.year(w), spouse: 0 });
      cover(rec.p.log.find((e) => e.age === w && e.big && e.who?.includes(id)));
      const mine = childIds(id);
      kids.push(...mine.map((k) => { const r = rec.byId.get(k)!.r; cover(rec.entry(r.since!, id, k)); return { id: k, year: rec.born(r) }; }));
      grands.push(...grandsOf(mine).map((g) => ({ id: g.id!, year: rec.born(g), parent: g.of! })));
    }
  } else if (role === 'child') {
    const kw = p.recent[`kwed:${id}`];
    if (kw !== undefined) { weds.push({ year: rec.year(kw) }); loveUntil = kw - 1; }
    kids.push(...grandsOf([id]).map((g) => { cover(rec.entry(g.since, id, g.id!)); return { id: g.id!, year: rec.born(g) }; }));
  } else if (role === 'friend') {
    const fw = p.recent[`wed:${id}`];
    if (fw !== undefined) { weds.push({ year: rec.year(fw) }); loveUntil = fw - 1; }
  }

  // 生まれた家: 記録で決まっている親・きょうだい
  const parentsOf = (a: number, b: number) => {
    for (const x of [a, b]) {
      const r = relOf(rec, x, born);
      if (rec.sexOf(x) === 'F') rp.mother = r; else rp.father = r;
    }
  };
  if (role === 'sibling') {
    parentsOf(p.mother.id!, p.father.id!);
    rp.siblings = [0, ...p.siblings.filter((s) => s.id !== id).map((s) => s.id!)].map((x) => relOf(rec, x, born));
    Object.assign(rp, { familyP: rec.homeP(), religion: p.religion, pool: p.pool, familyIndex: p.familyIndex }, rec.stayed ? { rural: p.rural, city: p.city } : {});
    rp.incomeP = rp.familyP;
  } else if (role === 'child') {
    const other = rec.otherParent(t);
    if (other !== undefined && rec.byId.has(other)) parentsOf(0, other);
    else if (p.sex === 'F') rp.mother = relOf(rec, 0, born); else rp.father = relOf(rec, 0, born);
    rp.siblings = p.children.filter((k) => k.id !== id).map((k) => relOf(rec, k.id!, born));
    // ponytail: 子が生まれた時の主人公の暮らし向きは記録に無いので、主人公の生まれた家の位置を引き継ぐ (途中で見ても変わらない値)
    const home = rec.homeP();
    Object.assign(rp, { familyP: home, incomeP: home, religion: p.religion, pool: p.pool, familyIndex: p.familyIndex }, rec.stayed ? { city: p.city, rural: p.rural } : {});
  } else if (role === 'grandchild') {
    const of = (t as Tie).of;
    if (of !== undefined && rec.byId.has(of)) {
      const r = relOf(rec, of, born);
      if (r.sex === 'F') rp.mother = r; else rp.father = r;
      rp.siblings = grandsOf([of]).filter((g) => g.id !== id).map((g) => relOf(rec, g.id!, born));
    }
  }
  // 生まれた時の記録を、入れ替えた家族で書き直す
  ensureBonds(rp);
  rp.log[0] = { ...rp.log[0], text: birthStory(rp), who: [rp.mother.id!, rp.father.id!] };
  fixedDeaths(rp); // 生まれた年に亡くなった親 (出産で亡くなった母など)

  const kschool = role === 'child' && p.recent[`kschool:${id}`] !== undefined;
  const kgrad = role === 'child' && p.recent[`kgrad:${id}`] !== undefined;
  const romance = role === 'spouse' || role === 'partner' || role === 'ex';
  const anchor: Anchor = {
    dies: fate.dies ?? Infinity,
    cause: fate.cause,
    ...(kgrad ? { school: 12 } : kschool ? { school: 1 } : {}),
    hold: (q, what) => {
      if (what === 'love') return pa() <= loveUntil;
      if (what === 'move') return pa() <= moveUntil;
      // 記録で決まっている連れ合いとの子は記録どおりに足す。親と子の側は、主人公が生きている間の子・孫も記録どおり
      return !!q.spouse?.fixed || ((role === 'mother' || role === 'father' || role === 'child') && pAlive());
    },
    each: (q) => {
      const yr = yearOf(q);
      for (const w of weds) {
        if (w.year !== yr || q.spouse?.alive) continue;
        q.dating = undefined;
        if (w.spouse === undefined) { marry(q, newPartner(q)); continue; }
        keepLateSpouse(q);
        q.spouse = { ...relOf(rec, w.spouse, yr), id: newId(q), bond: 70, since: q.age };
        shared(q, [q.spouse], L(`${q.spouse.name}と結婚した。`, `Married ${q.spouse.name}.`), 'love', 10, true, undefined, 'wedding');
      }
      for (const k of kids) {
        if (k.year !== yr) continue;
        const kid: Relative = { ...relOf(rec, k.id, yr), id: newId(q), bond: 75, since: q.age };
        q.children.push(kid);
        const n = q.children.length;
        shared(q, [kid], L(`${n}人目の子ども、${childWord(kid.sex)}の${kid.name}が生まれた。`, `${n === 1 ? 'A first child was born' : `Child number ${n} was born`}: a ${kid.sex === 'F' ? 'daughter' : 'son'}, ${kid.name}.`), 'family', 3, n === 1, undefined, 'birth');
      }
      for (const g of grands) {
        if (g.year !== yr) continue;
        const parent = q.children.find((k) => k.fixed?.ref === g.parent);
        if (!parent) continue;
        const gr = addTie(q, { ...relOf(rec, g.id, yr), role: 'grandchild', since: q.age, of: parent.id });
        shared(q, [gr, parent], L(`孫が生まれた。${parent.name}の子で、名前は${gr.name}。`, `A grandchild was born: ${parent.name}'s ${gr.sex === 'F' ? 'daughter' : 'son'}, ${gr.name}.`), 'family', 3, false, undefined, 'grandbirth');
      }
      fixedDeaths(q);
      if (job && romance && pa() >= (t.since ?? 0) && pa() <= loveUntil && q.working && !q.retired) q.job = job;
    },
  };
  rp.anchor = anchor;
  // 主人公が生きている間は、今わかっているところまで
  const stop = fate.dies === undefined ? (p.alive ? rec.known(m) : upto - born) : Infinity;
  for (let i = 0; rp.alive && rp.age < stop && i <= MAX_AGE + 1; i++) advanceYear(rp);
  rp.anchor = undefined;

  // その人の記録と、主人公の記録にある一緒の出来事を、その人の年齢で並べる
  const off = born - p.birthYear;
  const meYear = p.alive ? Infinity : p.birthYear + p.age;
  const toMe = new Set(circle(rp).filter(([r]) => r.fixed?.ref === 0).map(([r]) => r.id!));
  const own: KinEntry[] = rp.log.map((e) => ({
    age: e.age, year: born + e.age, text: e.text, kind: e.kind, big: e.big, why: e.why, stat: e.stat,
    ...(e.who?.some((w) => toMe.has(w)) ? { me: true } : {}),
  }));
  const deathAge = rp.alive ? undefined : rp.age;
  const withMe: KinEntry[] = p.log
    .filter((e) => e.who?.includes(id) && !covered.has(e) && !(e.kind === 'loss' && e.age - off === deathAge && e.who.length === 1))
    .map((e) => ({ e, text: voice(e.text, { role, rName: t.name ?? '', rCall: callName(t, role), pGiven: p.given, pSex: p.sex }) }))
    .filter(({ text }) => text !== null)
    .map(({ e, text }) => ({ age: e.age - off, year: p.birthYear + e.age, text: text ?? e.text, kind: e.kind, big: e.big, why: e.why, stat: e.stat, shared: true, ...(text ? { voiced: true } : {}) }));
  const entries = [...own, ...withMe]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.age - b.e.age || Number(!!a.e.shared) - Number(!!b.e.shared) || a.i - b.i)
    .map(({ e }) => (e.year > meYear ? { ...e, after: true } : e));
  return { id, name: t.name ?? '', sex: t.sex, born, country: code, age: rp.age, alive: rp.alive, cause: rp.cause, full: !rp.alive, entries, person: rp };
}

// 同じ記録 (同じ人生の同じ年) のあいだは作り直さない
const cache = new WeakMap<Person, { key: string; rec: Ledger; lives: Map<string, KinLife | undefined> }>();

function recordOf(p: Person) {
  const key = `${p.age}|${p.alive}|${p.log.length}`;
  let hit = cache.get(p);
  if (hit?.key !== key) {
    hit = { key, rec: new Ledger(p), lives: new Map() };
    cache.set(p, hit);
  }
  return hit;
}

export function lifeOf(p: Person, id: number, upto?: number): KinLife | undefined {
  const hit = recordOf(p);
  const key = `${id}|${upto ?? ''}`;
  if (!hit.lives.has(key)) hit.lives.set(key, build(hit.rec, id, upto));
  return hit.lives.get(key);
}

// 輪の全員の一生 (テストと計測用)
export function allLives(p: Person): KinLife[] {
  const hit = recordOf(p);
  return [...hit.rec.byId.keys()].map((id) => lifeOf(p, id)).filter((x): x is KinLife => !!x);
}
