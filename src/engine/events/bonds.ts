// 人との間の時間: 出会い、近さの移ろい、けんかと仲直り、疎遠と再会。家族以外の人の死もここで。
import { addTie, callName, circle, freshName, mourn, shared } from '../bonds';
import { makeName } from '../identity';
import { bump, countryOf, log, type Person, type Relative, type Role, type Tie } from '../person';
import { clamp, normal, pick } from '../rng';
import { relDies } from './family';
import { L } from '../../i18n';
import { because, deathWhy } from '../why';

const inTouch = (t: Tie) => t.alive && t.until === undefined;
const tiesOf = (p: Person, role: Role) => (p.ties ?? []).filter((t) => t.role === role);
const studying = (p: Person) => p.school.enrolled || p.school.uni === 'studying' || p.school.grad === 'studying';

export function bonds(p: Person): void {
  meet(p);
  ageTies(p);
  drift(p);
  if (p.alive) happen(p);
  if (p.alive) childDays(p);
  // 頼みごとや思い出話に出てくる「友だち」は、今いちばん近い友だち
  const best = tiesOf(p, 'friend').filter(inTouch).sort((a, b) => (b.bond ?? 0) - (a.bond ?? 0))[0];
  p.friend = best?.name;
}

// 一生で友だち3〜6人ほど。学校と職場で出会いやすい
function meet(p: Person): void {
  const r = p.rng;
  const friends = tiesOf(p, 'friend');
  const name = (full = false) => {
    const sex = r() < 0.65 ? p.sex : p.sex === 'F' ? 'M' : 'F';
    const n = freshName(() => makeName(r, p.country, sex), (p.nameKeys ??= []));
    return { sex, name: full ? n.full : n.given } as const;
  };
  if (p.age === 12 && !friends.length) {
    const f = addTie(p, { ...name(), alive: true, age: p.age, role: 'friend', since: p.age });
    log(p, L(`${f.name}と仲良くなった。`, `Became friends with ${f.name}.`), 'child', false, undefined, [f.id!]);
    return;
  }
  const chance = studying(p) && p.age >= 6 ? 0.08 : p.working && !p.retired ? 0.05 : p.age >= 18 && p.age <= 75 ? 0.02 : 0;
  if (friends.length < 6 && friends.filter(inTouch).length < 4 && p.age !== 12 && r() < chance) {
    const f = addTie(p, { ...name(), alive: true, age: Math.max(5, p.age + Math.round(normal(r, 0, 2))), role: 'friend', since: p.age });
    log(p, studying(p) ? L(`学校で${f.name}と仲良くなった。`, `Became friends with ${f.name} at school.`)
      : p.working ? L(`職場の${f.name}と、仕事の後もよく話すようになった。`, `Started spending time with ${f.name} from work.`)
        : L(`近所の${f.name}と顔を合わせるうちに親しくなった。`, `Got to know ${f.name} from the neighborhood.`), p.kinds[p.age] ?? 'family', false, undefined, [f.id!]);
    return;
  }
  if (!tiesOf(p, 'mentor').length && p.age >= 10 && p.age <= 30 && (studying(p) || (p.working && p.jobYears < 5)) && r() < 0.025) {
    const m = addTie(p, { ...name(true), alive: true, age: p.age + 20 + Math.floor(r() * 16), role: 'mentor', since: p.age });
    log(p, studying(p) ? L(`${m.name}先生が、${p.given}の書いたものを熱心に読んでくれた。`, `${m.name}, a teacher, read ${p.given}'s work closely and took it seriously.`)
      : L(`職場の先輩の${m.name}が、仕事を一から教えてくれた。`, `${m.name}, an older coworker, taught the work from the ground up.`), p.kinds[p.age] ?? 'school', false, undefined, [m.id!]);
    return;
  }
  if (!tiesOf(p, 'rival').length && p.age >= 12 && p.age <= 35 && r() < 0.015) {
    const v = addTie(p, { ...name(), alive: true, age: Math.max(10, p.age + Math.round(normal(r, 0, 2))), role: 'rival', since: p.age });
    log(p, L(`何をしても${v.name}と比べられるようになった。`, `Everything started being a contest with ${v.name}.`), p.kinds[p.age] ?? 'school', false, undefined, [v.id!]);
  }
}

// 家族以外の人も歳をとる。連絡のある人が亡くなれば知らせが届く
const GRIEF: Partial<Record<Role, number>> = { friend: -7, mentor: -4, rival: -2, grandchild: -15 };
function ageTies(p: Person): void {
  for (const t of p.ties ?? []) {
    if (!t.alive) continue;
    // この年にもう歳をとった人は進めない: 今年生まれた孫 (family.ts で0歳で足す) と、今年別れた相手 (love.ts で恋人として歳をとった)
    if (!(t.role === 'grandchild' && t.since === p.age) && !(t.role === 'ex' && t.until === p.age)) t.age++;
    if (t.role === 'ex' || t.until !== undefined || !relDies(p, t)) continue;
    log(p, L(`${callName(t, t.role)}が${t.age}歳で亡くなった。`, `${t.name} died at ${t.age}.`), 'loss', (t.bond ?? 0) >= 60, undefined, [t.id!]);
    because(p, deathWhy(countryOf(p), t.sex, t.age));
    mourn(p, t, GRIEF[t.role] ?? -4);
  }
}

// 毎年の小さな変化。家族を大事にする年は近づき、離れて暮らせば遠のく。友だちは放っておくと疎遠になる
function drift(p: Person): void {
  const fam = p.focus === 'family' ? 0.6 : p.focus === 'work' ? -0.4 : 0;
  const away = p.country !== p.birthCountry ? -1.5 : 0;
  for (const [r, role] of circle(p)) {
    if (!r.alive || r.bond === undefined) continue;
    let d = 0;
    if (role === 'mother' || role === 'father' || role === 'sibling') d = ((role === 'sibling' ? 50 : 60) - r.bond) * 0.05 + fam + away;
    else if (role === 'spouse' || role === 'child' || role === 'grandchild') d = (65 - r.bond) * 0.05 + fam;
    else if (role === 'partner') d = 0.5;
    else if ((r as Tie).until === undefined && (role === 'friend' || role === 'mentor')) d = (role === 'friend' ? -1.2 : -0.5) + (p.focus === 'rest' ? 0.8 : 0);
    r.bond = Math.round(Math.min(100, Math.max(0, r.bond + d)) * 10) / 10;
    if (role === 'friend' && (r as Tie).until === undefined && r.bond < 15) {
      (r as Tie).until = p.age;
      shared(p, [r], L(`${r.name}とは、いつの間にか連絡を取らなくなった。`, `Lost touch with ${r.name} somewhere along the way.`), p.kinds[p.age] ?? 'family', 0, false, undefined, 'lost_touch');
    }
  }
}

type Happening = () => void;

// 1年に多くて1つ。起こりうる出来事を集めて1つ選ぶ
function happen(p: Person): void {
  const r = p.rng;
  if (p.age < 6 || r() >= 0.22) return;
  // 輪の人の一生 (kin.ts) では、主人公との出来事は主人公の記録にあるものだけにする
  const all = circle(p).filter(([x]) => x.alive && x.fixed?.ref !== 0);
  const close = all.filter(([x, role]) => (x.bond ?? 0) > 20 && role !== 'ex' && role !== 'rival' && (x as Tie).until === undefined && (role !== 'child' || x.age >= 12) && (role !== 'grandchild' || x.age >= 12));
  const list: Happening[] = [];

  // けんかは数年に一度まで
  if (close.length && p.age >= 10 && p.age - (p.recent.quarrel ?? -99) >= 4) list.push(() => {
    const [x, role] = pick(r, close);
    p.recent.quarrel = p.age;
    p.recent[`quarrel:${x.id}`] = p.age;
    shared(p, [x], L(`${callName(x, role)}とけんかをして、しばらく口をきかなかった。`, `Had a fight with ${callName(x, role)}. They did not speak for a while.`), p.kinds[p.age] ?? 'family', -10, false, undefined, 'quarrel');
    bump(p, { happy: -3 });
  });

  const sore = all.filter(([x]) => p.age - (p.recent[`quarrel:${x.id}`] ?? -99) <= 6 && p.recent[`quarrel:${x.id}`] !== p.age);
  if (sore.length) list.push(() => {
    const [x, role] = pick(r, sore);
    delete p.recent[`quarrel:${x.id}`];
    shared(p, [x], L(`${callName(x, role)}と仲直りした。`, `Made up with ${callName(x, role)}.`), p.kinds[p.age] ?? 'family', 8, false, undefined, 'makeup');
    bump(p, { happy: 2 });
  });

  const lost = tiesOf(p, 'friend').filter((t) => t.alive && t.until !== undefined && p.age - t.until >= 5);
  if (lost.length && p.age >= 25) list.push(() => {
    const t = pick(r, lost);
    t.until = undefined;
    shared(p, [t], L(`何年も会っていなかった${t.name}と、偶然再会した。`, `Ran into ${t.name} after years apart.`), p.kinds[p.age] ?? 'family', 15, false, undefined, 'reunion');
    bump(p, { happy: 3 });
  });

  const old = all.filter(([x, role]) => (role === 'mother' || role === 'father') && x.age >= 75 && p.recent[`care:${x.id}`] === undefined);
  if (old.length && p.age >= 30 && p.country === p.birthCountry) list.push(() => {
    const [x, role] = pick(r, old);
    p.recent[`care:${x.id}`] = p.age;
    shared(p, [x], L(`${x.age}歳になった${callName(x, role)}の世話をするようになった。`, `Began looking after ${callName(x, role)}, now ${x.age}.`), 'family', 6, false, undefined, 'parent_care');
    bump(p, { happy: -2, health: -1 });
  });

  const sibs = all.filter(([x, role]) => role === 'sibling' && x.age >= 18);
  if (sibs.length && p.age >= 18) list.push(() => {
    const [x, role] = pick(r, sibs);
    const move = r() < 0.5;
    shared(p, [x], move
      ? L(`${callName(x, role)}に頼まれて、引っ越しを手伝った。`, `Helped ${callName(x, role)} move house.`)
      : L(`${callName(x, role)}に頼まれて、しばらく子どもを預かった。`, `Looked after ${callName(x, role)}'s children for a while.`), 'family', 4, false, undefined, move ? 'sibling_move' : 'sibling_kids');
  });

  const kids = all.filter(([x, role]) => role === 'child' && x.age >= 25);
  if (kids.length && p.age >= 50) list.push(() => {
    const [x, role] = pick(r, kids);
    shared(p, [x], L(`${callName(x, role)}が、仕事のことで相談しに来た。`, `${callName(x, role)} came by to talk over a problem at work.`), 'family', 4, false, undefined, 'work_talk');
  });

  const single = tiesOf(p, 'friend').filter((t) => inTouch(t) && p.recent[`wed:${t.id}`] === undefined);
  if (single.length && p.age >= 20 && p.age <= 45) list.push(() => {
    const t = pick(r, single);
    p.recent[`wed:${t.id}`] = p.age;
    shared(p, [t], L(`${t.name}の結婚式に出た。`, `Went to ${t.name}'s wedding.`), p.kinds[p.age] ?? 'family', 5, false, undefined, 'friend_wedding');
    bump(p, { happy: 2 });
  });

  const mentors = tiesOf(p, 'mentor').filter(inTouch);
  if (mentors.length) list.push(() => {
    const t = mentors[0];
    shared(p, [t], p.age < 25
      ? L(`${t.name}先生に「続けなさい」と言われた。`, `${t.name} said, "Keep going."`)
      : L(`久しぶりに${t.name}に会い、これからのことを相談した。`, `Saw ${t.name} again and talked about what comes next.`), p.kinds[p.age] ?? 'school', 4, false, undefined, p.age < 25 ? 'mentor_word' : 'mentor_talk');
    bump(p, { learn: 1 });
  });

  const rivals = tiesOf(p, 'rival').filter(inTouch);
  if (rivals.length) list.push(() => {
    const t = rivals[0];
    if (p.age >= 30 && p.recent[`truce:${t.id}`] === undefined) {
      p.recent[`truce:${t.id}`] = p.age;
      shared(p, [t], L(`張り合ってきた${t.name}と、初めてゆっくり話した。`, `Had a long, quiet talk with ${t.name}, the old rival, for the first time.`), p.kinds[p.age] ?? 'family', 20, false, undefined, 'rival_peace');
    } else if (p.age < 30) {
      shared(p, [t], L(`${t.name}に、また先を越された。`, `${t.name} got ahead again.`), p.kinds[p.age] ?? 'school', -3, false, undefined, 'rival_lose');
      bump(p, { learn: 1 });
    }
  });

  const grown = all.filter(([x, role]) => role === 'child' && x.age >= 18);
  if (grown.length && p.age >= 45) list.push(() => {
    const [x, role] = pick(r, grown);
    shared(p, [x], L(`${callName(x, role)}の家を訪ね、数日泊まった。`, `Stayed a few days at ${callName(x, role)}'s home.`), 'family', 4, false, undefined, 'visit_child');
  });
  if (grown.length && (p.illness || p.age >= 75)) list.push(() => {
    const [x, role] = pick(r, grown);
    shared(p, [x], p.illness
      ? L(`${callName(x, role)}が看病に来てくれた。`, `${callName(x, role)} came to help with the illness.`)
      : L(`${callName(x, role)}が、買い物や通院に付き添ってくれるようになった。`, `${callName(x, role)} started coming along to the shops and the doctor.`), p.illness ? 'ill' : 'old', 6, false, undefined, p.illness ? 'nursing' : 'escort');
  });

  const little = tiesOf(p, 'grandchild').filter((t) => t.alive && t.age >= 1 && t.age <= 8)
    .map((t) => [t, p.children.find((k) => k.id === t.of && k.alive && k.fixed?.ref !== 0)] as const).filter(([, k]) => k);
  if (little.length) list.push(() => {
    const [g, k] = pick(r, little);
    shared(p, [g, k!], L(`${k!.name}に頼まれて、孫の${g.name}をしばらく預かった。`, `Looked after ${g.name}, ${k!.name}'s child, for a while.`), 'family', 4, false, undefined, 'babysit');
  });

  const parents = all.filter(([, role]) => role === 'mother' || role === 'father');
  if (parents.length) list.push(() => {
    const [x, role] = pick(r, parents);
    const n = callName(x, role);
    const story = p.age < 18 && r() < 0.5;
    const home = p.country === p.birthCountry;
    shared(p, [x], p.age < 18
      ? (story ? L(`${n}に、昔の話をしてもらった。`, `${n} told stories about the old days.`) : L(`${n}と二人で出かけた。`, `Spent a day out with ${n}.`))
      : home ? L(`${n}の家で、一緒に食事をした。`, `Had a meal with ${n}.`) : L(`遠くから${n}に電話をした。`, `Called ${n} from far away.`), p.kinds[p.age] ?? 'family', 3,
    false, undefined, p.age < 18 ? (story ? 'parent_story' : 'parent_outing') : home ? 'parent_meal' : 'parent_call');
  });

  if (p.spouse?.alive && p.spouse.fixed?.ref !== 0) list.push(() => {
    shared(p, [p.spouse!], L(`${callName(p.spouse!, 'spouse')}と二人で出かけた。`, `Spent a day out with ${p.spouse!.name}.`), p.kinds[p.age] ?? 'family', 3, false, undefined, 'outing_spouse');
  });

  const visitors = close.filter(([x, role]) => role !== 'child' || x.age >= 18);
  if (p.illness && visitors.length) list.push(() => {
    const [x, role] = pick(r, visitors);
    shared(p, [x], L(`${callName(x, role)}が見舞いに来てくれた。`, `${callName(x, role)} came to visit while ${p.given} was ill.`), 'ill', 6, false, undefined, 'sick_visit');
    bump(p, { happy: 2 });
  });

  if (list.length) pick(r, list)();
}

const MILESTONE: Record<string, string> = { kschool: 'school_start', kgrad: 'graduation', kjob: 'first_pay', kwed: 'wedding_child' };
// 子どもの節目: 入学・卒業・初めての給料・結婚式。それぞれ一度きりで、全員に起きるわけではない
function childDays(p: Person): void {
  const r = p.rng;
  const c = countryOf(p);
  for (const k of p.children) {
    if (!k.alive || k.fixed) continue; // 記録で決まっている子の節目は、その子自身の一生にある
    const once = (key: string, chance: number, text: string, d: number) => {
      if (p.recent[`${key}:${k.id}`] !== undefined || r() >= chance) return false;
      p.recent[`${key}:${k.id}`] = p.age;
      shared(p, [k], text, 'family', d, false, undefined, MILESTONE[key]);
      return true;
    };
    if (k.age === 6) once('kschool', clamp(c.school / 9, 0.1, 0.95), L(`${k.name}が学校に上がった。`, `${k.name} started school.`), 2);
    else if (k.age === 18 && p.recent[`kschool:${k.id}`] !== undefined) once('kgrad', clamp((c.school - 6) / 6, 0.05, 0.9), L(`${k.name}の卒業式に出た。`, `Went to ${k.name}'s graduation.`), 3);
    else if (k.age >= 16 && k.age <= 24) once('kjob', 0.12, L(`${k.name}が初めての給料で、家族に食事をごちそうしてくれた。`, `${k.name} treated the family to a meal with a first paycheck.`), 4);
    if (k.age >= 20 && k.age <= 35 && once('kwed', 0.07, L(`${k.name}の結婚式に出た。`, `Went to ${k.name}'s wedding.`), 5)) bump(p, { happy: 3 });
  }
}

// 恋人と別れたら、元の相手として輪に残す
export function breakUp(p: Person, d: Relative & { years: number }, text: string): void {
  shared(p, [d], text, 'love', -20, false, undefined, 'breakup');
  p.ties = [...(p.ties ?? []), { ...d, role: 'ex', since: d.since ?? p.age - d.years, until: p.age }];
  p.dating = undefined;
}

// 再婚の前に、亡くなった連れ合いを輪に残す
export function keepLateSpouse(p: Person): void {
  const s = p.spouse;
  if (!s || s.alive) return;
  p.ties = [...(p.ties ?? []), { ...s, role: 'spouse', since: s.since ?? 0, until: s.diedAt ?? p.age }];
}
