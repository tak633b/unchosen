// 主人公の記録にある一緒の出来事を、輪の人の側の文に書き直す。
// 「宮崎友美と付き合い始めた」は、宮崎友美の一生では「碧と付き合い始めた」になる。
// 向きのある出来事 (泊めた・泊まった、貸した・借りた、教えた・教わった) は文ごとに書き直す。
// 書き直せない文は undefined (主人公の側の文として印を付けて出す)、その人の一生にもう書いてある出来事は null (出さない)
import type { Sex } from './lifetable';
import type { Role } from './person';
import { isEn } from '../i18n';

export interface Voice {
  role: Role;
  rName: string;  // その人の名前
  rCall: string;  // 主人公の記録での呼び方 (bonds.ts の callName。「友だちの宮崎友美」「母」)
  pGiven: string; // 主人公の名
  pSex: Sex;
}

// その人から見た主人公の呼び方
function pCall(v: Voice): string {
  const p = v.pGiven;
  const f = v.pSex === 'F';
  if (isEn) {
    if (v.role === 'child') return f ? 'Mother' : 'Father';
    if (v.role === 'grandchild') return f ? 'Grandmother' : 'Grandfather';
    return p;
  }
  switch (v.role) {
    case 'mother': case 'father': return `子どもの${p}`;
    case 'child': return f ? '母' : '父';
    case 'grandchild': return f ? '祖母' : '祖父';
    case 'grandparent': return `孫の${p}`;
    case 'pet': return p;
    case 'sibling': return `きょうだいの${p}`;
    case 'spouse': return `連れ合いの${p}`;
    case 'partner': return `恋人の${p}`;
    case 'ex': return `昔の恋人の${p}`;
    case 'mentor': return `教え子の${p}`;
    case 'rival': return `ライバルの${p}`;
    case 'friend': return `友だちの${p}`;
  }
}

// {R}: その人 (呼び方か名前)。{P}: 主人公の呼び方。{p}: 主人公の名。{X}: そのまま写す部分。null は出さない
type Rule = [string, string | null];
const JA: Rule[] = [
  ['{R}が学校に上がった。', null],
  ['{R}の卒業式に出た。', null],
  ['{R}の結婚式に出た。', null],
  ['{R}の結婚式に招かれ、お祝いを包んだ。', null],
  ['{X}人目の子ども、{X}の{R}が生まれた。', null],
  ['{X}のきょうだい、{R}が生まれた。', null],
  ['孫が生まれた。{X}の子で、名前は{R}。', null],
  ['{X}{R}が亡くなった。{X}', null],
  ['{R}が家を出て、自分の暮らしを始めた。', '家を出て、自分の暮らしを始めた。'],
  ['{R}が初めての給料で、家族に食事をごちそうしてくれた。', '初めての給料で、家族に食事をごちそうした。'],
  ['{R}の家を訪ね、数日泊まった。', '{P}が訪ねてきて、数日泊まっていった。'],
  ['{R}が、仕事のことで相談しに来た。', '{P}に、仕事のことで相談しに行った。'],
  ['{R}が看病に来てくれた。', '{P}の看病に行った。'],
  ['{R}が、買い物や通院に付き添ってくれるようになった。', '{P}の買い物や通院に、付き添うようになった。'],
  ['{R}が見舞いに来てくれた。', '{P}の見舞いに行った。'],
  ['{X}に頼まれて、孫の{R}をしばらく預かった。', 'しばらく{P}のところに預けられた。'],
  ['{R}に頼まれて、孫の{X}をしばらく預かった。', '{P}に、子どもの{X}をしばらく預かってもらった。'],
  ['{R}に頼まれて、引っ越しを手伝った。', '{P}に、引っ越しを手伝ってもらった。'],
  ['{R}に頼まれて、しばらく子どもを預かった。', '{P}に、しばらく子どもを預かってもらった。'],
  ['{R}先生に「続けなさい」と言われた。', '{P}に「続けなさい」と言った。'],
  ['{R}先生が、{p}の書いたものを熱心に読んでくれた。', '{P}の書いたものを、熱心に読んだ。'],
  ['職場の先輩の{R}が、仕事を一から教えてくれた。', '職場の後輩の{p}に、仕事を一から教えた。'],
  ['久しぶりに{R}に会い、これからのことを相談した。', '久しぶりに{P}が訪ねてきて、これからのことを相談された。'],
  ['{R}に、また先を越された。', 'また{P}の先を越した。'],
  ['{R}は少しずつお金を返してくれた。', '{P}に借りたお金を、少しずつ返した。'],
  ['{R}に貸したお金は返ってこなかった。', '{P}に借りたお金を、返せなかった。'],
  ['{R}の家に泊まり、明け方まで話しこんだ。', '{P}が家に泊まりに来て、明け方まで話しこんだ。'],
  ['{R}に、昔の話をしてもらった。', '{P}に、昔の話をした。'],
  ['{R}の家で、一緒に食事をした。', '{P}が家に来て、一緒に食事をした。'],
  ['遠くから{R}に電話をした。', '遠くにいる{P}から電話があった。'],
  ['{X}歳になった{R}の世話をするようになった。', '{X}歳になり、{P}が世話をしてくれるようになった。'],
];
const EN: Rule[] = [
  ['{R} started school.', null],
  ["Went to {R}'s graduation.", null],
  ["Went to {R}'s wedding.", null],
  ["Was invited to {R}'s wedding and brought a gift of money.", null],
  ['{X}: a {X}, {R}.', null],
  ['A baby {X}, {R}, was born.', null],
  ["A grandchild was born: {X}'s {X}, {R}.", null],
  ['{R}, a close friend since youth, died.{X}', null],
  ['{R} left home to start {X} own life.', 'Left home to start {X} own life.'],
  ['{R} treated the family to a meal with a first paycheck.', 'Treated the family to a meal with a first paycheck.'],
  ["Stayed a few days at {R}'s home.", '{P} came to stay for a few days.'],
  ['{R} came by to talk over a problem at work.', 'Went to talk over a problem at work with {P}.'],
  ['{R} came to help with the illness.', 'Went to help {P} through an illness.'],
  ['{R} started coming along to the shops and the doctor.', 'Started going along with {P} to the shops and the doctor.'],
  ['{R} came to visit while {X} was ill.', 'Visited {P}, who was ill.'],
  ["Looked after {R}, {X}'s child, for a while.", 'Stayed with {P} for a while.'],
  ["Looked after {X}, {R}'s child, for a while.", '{P} looked after {X} for a while.'],
  ['Helped {R} move house.', '{P} helped with the move.'],
  ["Looked after {R}'s children for a while.", '{P} looked after the children for a while.'],
  ['{R} said, "Keep going."', 'Told {P}, "Keep going."'],
  ["{R}, a teacher, read {p}'s work closely and took it seriously.", "Read {P}'s work closely and took it seriously."],
  ['{R}, an older coworker, taught the work from the ground up.', 'Taught {P}, a newer coworker, the work from the ground up.'],
  ['{R} got ahead again.', 'Got ahead of {P} again.'],
  ['{R} paid the money back, little by little.', 'Paid {P} back, little by little.'],
  ['The money lent to {R} never came back.', 'Never paid back the money borrowed from {P}.'],
  ["Stayed over at {R}'s house and talked until dawn.", '{P} stayed over and the two talked until dawn.'],
  ['{R} told stories about the old days.', 'Told {P} stories about the old days.'],
  ['Called {R} from far away.', '{P} called from far away.'],
  ['Began looking after {R}, now {X}.', 'Now {X}, began to be looked after by {P}.'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 型は一度だけ正規表現にする。{R} と {p} は、文の側で印 (\u0001・\u0002) に置き換えてから比べる
const compiled = new Map<string, RegExp>();
function match(tpl: string, text: string): string[] | null {
  let re = compiled.get(tpl);
  if (!re) {
    re = new RegExp(`^${tpl.split(/(\{[RXp]\})/).map((part) =>
      part === '{R}' ? '\u0001' : part === '{X}' ? '(.*?)' : part === '{p}' ? '\u0002' : escape(part)).join('')}$`, 's');
    compiled.set(tpl, re);
  }
  const m = text.match(re);
  return m ? m.slice(1) : null;
}
const mark = (text: string, v: Voice) => [v.rCall, v.rName].filter(Boolean).reduce((t, n) => t.split(n).join('\u0001'), text).split(v.pGiven).join('\u0002');
const unmark = (s: string, v: Voice) => s.replaceAll('\u0001', v.rName).replaceAll('\u0002', v.pGiven);

// 向きのない出来事 (けんか・仲直り・出会い・再会・付き合い・別れ) は、名前を入れ替えるだけで読める
function swap(text: string, v: Voice): string | undefined {
  const P = pCall(v);
  const parent = v.role === 'mother' || v.role === 'father';
  if (isEn) {
    const re = new RegExp(`\\b${escape(parent ? v.rCall : v.rName)}\\b`, 'g');
    if (!re.test(text)) return undefined;
    return text.replace(re, '\u0001').replace(new RegExp(`\\b${escape(v.pGiven)}\\b`, 'g'), v.rName).replaceAll('\u0001', P);
  }
  // 「母」は「母親」などの中にもあるので、親は文の頭の呼び方だけを入れ替える
  if (parent) return text.startsWith(`${v.rCall}と`) ? P + text.slice(v.rCall.length) : undefined;
  if (!text.includes(v.rName)) return undefined;
  return text.split(v.rCall).join('\u0001').split(v.rName).join('\u0002').split(v.pGiven).join(v.rName)
    .replaceAll('\u0001', P).replaceAll('\u0002', v.pGiven);
}

export function voice(text: string, v: Voice): string | null | undefined {
  const marked = mark(text, v);
  for (const [tpl, out] of isEn ? EN : JA) {
    const got = match(tpl, marked)?.map((x) => unmark(x, v));
    if (!got) continue;
    if (out === null) return null;
    let i = 0;
    return out.replace(/\{[XPp]\}/g, (k) => (k === '{P}' ? pCall(v) : k === '{p}' ? v.pGiven : got[i++] ?? ''));
  }
  return swap(text, v);
}
