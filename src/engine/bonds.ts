// 人の輪: 家族と、家族以外の人 (ties) をひとつの一覧として扱う。
// id と bond (近さ 0–100) を全員に持たせ、出来事を mem に積む。乱数は使わない (保存・再開と同じ seed の人生を壊さないため)
import { bump, log, type Person, type Relative, type Role, type Tie, type YearKind } from './person';
import { clamp } from './rng';
import { L } from '../i18n';

export const MEM_MAX = 12;

export function newId(p: Person): number {
  p.nextId ??= 1;
  return p.nextId++;
}

// 出会った時の近さ。親は家の暮らし向きで、きょうだいは年の差で変わる
export function initialBond(p: Person, r: Relative, role: Role): number {
  switch (role) {
    case 'mother': return Math.round(68 + p.familyP * 10);
    case 'father': return Math.round(52 + p.familyP * 16); // 貧しい家の父親は出稼ぎや長時間労働で家にいないことが多い
    case 'sibling': return clamp(66 - 4 * Math.abs(r.age - p.age), 30, 66);
    case 'spouse': return p.childMarriage ? 25 : 70;
    case 'partner': return 55;
    case 'child': return 75;
    case 'grandchild': return 50;
    case 'friend': return 50;
    case 'mentor': return 45;
    case 'rival': return 25;
    case 'ex': return 30;
  }
}

// 本物の参照と役割の組。出来事で bond と mem を書き換えるときはこちらを使う
export function circle(p: Person): [Relative | Tie, Role][] {
  return [
    [p.mother, 'mother'],
    [p.father, 'father'],
    ...p.siblings.filter((s) => s.age >= 0).map((s) => [s, 'sibling'] as [Relative, Role]),
    ...(p.spouse ? [[p.spouse, 'spouse'] as [Relative, Role]] : []),
    ...(p.dating ? [[p.dating, 'partner'] as [Relative, Role]] : []),
    ...p.children.map((c) => [c, 'child'] as [Relative, Role]),
    ...(p.ties ?? []).map((t) => [t, t.role] as [Tie, Role]),
  ];
}

// id・bond・since が無い人に補う。古いセーブも、生まれたての人生もここを通る。何度呼んでも同じ
export function ensureBonds(p: Person): void {
  // 古いセーブには名の記録が無いので、表示の名前で代える
  p.nameKeys ??= [p.given, ...p.siblings, ...p.children, ...(p.ties ?? []).filter((t) => t.role === 'grandchild')].map((x) => (typeof x === 'string' ? x : x.name ?? ''));
  // 古いセーブの友だち (名前だけ) を人として起こす
  if (p.friend && !(p.ties ?? []).some((t) => t.role === 'friend')) {
    p.ties = [...(p.ties ?? []), { alive: true, age: p.age, sex: p.sex, name: p.friend, role: 'friend', since: Math.min(12, p.age) }];
  }
  const unborn = p.siblings.filter((s) => s.age < 0).map((s) => [s, 'sibling'] as [Relative, Role]);
  for (const [r, role] of [...circle(p), ...unborn]) {
    r.id ??= newId(p);
    r.bond ??= initialBond(p, r, role);
    if (role === 'sibling' || role === 'child') r.since ??= Math.max(0, p.age - r.age);
    if (r.alive === false && r.diedAt === undefined && r.age >= 0) r.diedAt = p.age; // 古いセーブ: いつ亡くなったかは分からないので今の年齢
  }
}

// 主人公から見た全員。亡くなった人・離れた人も含む (画面では薄く描く)。まだ生まれていないきょうだいは入れない
export function people(p: Person): Tie[] {
  ensureBonds(p);
  return circle(p).map(([r, role]) => ({ ...r, role, since: r.since ?? 0 }) as Tie);
}

// 最後にそばにいた人: 生きていて、今も連絡のある人を近い順に。主人公が亡くなった後に呼べば死の床の顔ぶれになる
export function closest(p: Person, n = 3): Tie[] {
  return people(p)
    .filter((t) => t.alive && t.until === undefined && t.role !== 'ex')
    .sort((a, b) => (b.bond ?? 0) - (a.bond ?? 0) || (a.id ?? 0) - (b.id ?? 0))
    .slice(0, n);
}

export function remember(p: Person, r: Relative, text: string, d: number, k?: string): void {
  r.id ??= newId(p);
  r.bond = Math.round(clamp((r.bond ?? 50) + d, 0, 100) * 10) / 10;
  r.mem = [...(r.mem ?? []), { age: p.age, text, d, ...(k ? { k } : {}) }].slice(-MEM_MAX);
}

// 人の出てくる出来事: log に who を付け、関わった人の mem に積む
export function shared(p: Person, rels: Relative[], text: string, kind: YearKind, d = 0, big = false, stat?: string, k?: string): void {
  for (const r of rels) r.id ??= newId(p);
  log(p, text, kind, big, stat, rels.map((r) => r.id!));
  for (const r of rels) remember(p, r, text, d, k);
}

// 死別。近かった人ほど幸福が大きく落ちる (bond 50 で元の重さ、90 で1.4倍、20 で0.7倍)
export function mourn(p: Person, r: Relative, happy: number, bond = 0): void {
  r.diedAt = p.age;
  bump(p, { happy: happy * (0.5 + (r.bond ?? 50) / 100), bond });
}

// 家族以外の人を輪に加える
export function addTie(p: Person, t: Omit<Tie, 'id' | 'bond'> & { bond?: number }): Tie {
  const tie: Tie = { ...t, id: newId(p), bond: t.bond ?? initialBond(p, t, t.role), country: t.country ?? p.country };
  p.ties = [...(p.ties ?? []), tie];
  return tie;
}

// 文の中での呼び方。英語は親だけ続柄、ほかは名前
export function callName(r: Relative, role: Role): string {
  const n = r.name ?? '';
  const ja: Record<Role, string> = {
    mother: '母', father: '父', sibling: `きょうだいの${n}`, spouse: `連れ合いの${n}`, partner: `恋人の${n}`, child: `子どもの${n}`,
    friend: `友だちの${n}`, mentor: `恩師の${n}`, rival: `ライバルの${n}`, ex: `昔の恋人の${n}`, grandchild: `孫の${n}`,
  };
  return L(ja[role], role === 'mother' ? 'Mother' : role === 'father' ? 'Father' : n);
}

// 人の輪 (家族・友だち・恋人・恩師など) の中で名前がかぶらないよう、空いている名前が出るまで引き直す (8回まで)。
// 比べるのは元の文字の名 (key) なので、引き直しの回数は日英で変わらない。使った key は keys に足す
export function freshName<N extends { key: string }>(draw: () => N, keys: string[]): N {
  let n = draw();
  for (let i = 0; i < 7 && keys.includes(n.key); i++) n = draw();
  keys.push(n.key);
  return n;
}
