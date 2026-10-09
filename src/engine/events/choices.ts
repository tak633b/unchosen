// 分かれ道: 用意した選択 (src/data/decisions/*.json。どのファイルも同じ形で、全部まとめて読む) を、暮らしに合うものから年にまれに一つ出す。
// 同じ選択でも結果は一つに決まらない。選んだあと、重み付きの結果の中から一つが起きる。何年か後に起きる結果もある。
//
// ---- 書き方 (decisions/*.json の1件) ---------------------------------------------------------
// id        一意の英小文字とハイフン (ファイルをまたいでも重ねない)。一生に一度しか出ない
// minAge / maxAge / weight / when / tech / from / to
//           moments.json と同じ。when の語彙は moments.ts の When (place, wealth, income, region, countries,
//           religion, state, sex, married, widowed, hasChildren, hasPet, migrated, youngChild, parentAlive, fatherAlive,
//           motherAlive, sibling, teenChild, livingAlone, job)。国を限るときは countries に ISO3 を並べる
// who       選択に出てくる人の続柄: mother / father / sibling / spouse / partner / child / friend。
//           その人が生きているときだけ出る。child は whoAge: [最小, 最大] で子の年齢を絞れる
// amount    {money} に出す金額。暮らしの規模 (年収か最低生活費) に対する割合
// title / text / stat   日本語。en: { title, text, stat? } に英語。stat は数字の出典を括弧で添える
// options   2〜4個。それぞれ:
//   label / hint / en: { label, hint? }
//   auto     自動で決めるときの重み (省略は1)。0 なら自動では選ばない
//   text     選んだその年に残る一行 (省略可)。en.text に英語
//   effects  { health, happy, money, learn, bond } の増減。cost は暮らしの規模に対する割合 (マイナスで出費)
//   d        who との近さの増減
//   outcomes 1つ以上。重み付きで一つ起きる。それぞれ:
//     weight  起きやすさ (> 0)。統計があれば割合をそのまま使い、出典を note に書く
//     text / en.text   起きたことの一行。省略すると何も起きない結果になる
//     effects / cost / d   option と同じ
//     after   何年後に起きるか (省略は0 = その年)。その時 who が亡くなっていれば起きない
//     kind    人生地図の色 (hard, family, work, love, loss, ill, move …)。big: true で太字
//     note    出典や根拠のメモ (画面には出ない)
// 文に使える差し込み: {name} 主人公の名 / {city} 住んでいる街 (農村なら「村」) / {country} 国名 /
//   {friend} 幼なじみの名 / {who} 出てくる人の呼び方 (「母」「友だちのアミナ」) / {whoName} その人の名だけ /
//   {money} amount の金額
// 文の決まり: 起きたことを短く具体的に書く。気持ちの説明や教訓で締めない。英語は訳文ではなくそのまま読める文に
import { yen } from '../economy';
import { bump, decide, log, yearOf, type Person, type Relative, type Decision, type Stats, type YearKind } from '../person';
import { clamp, pickWeighted } from '../rng';
import { isEn } from '../../i18n';
import { callName, remember } from '../bonds';
import { scaleOf } from './common';
import { independent } from './money';
import { fill, fits, statOf, techWeight, type When } from './moments';
import type { Tech } from '../tech';

export type WhoRole = 'mother' | 'father' | 'sibling' | 'spouse' | 'partner' | 'child' | 'friend';
interface Effect { effects?: Partial<Stats>; cost?: number; d?: number }
export interface Outcome extends Effect { weight: number; text?: string; en?: { text: string }; after?: number; kind?: YearKind; big?: boolean; note?: string }
export interface ChoiceOption extends Effect { label: string; hint?: string; en: { label: string; hint?: string; text?: string }; auto?: number; text?: string; outcomes: Outcome[] }
export interface Choice {
  id: string; minAge: number; maxAge: number; weight: number;
  when?: When; tech?: Tech[]; from?: number; to?: number;
  who?: WhoRole; whoAge?: [number, number]; amount?: number;
  title: string; text: string; stat?: string;
  en: { title: string; text: string; stat?: string };
  options: ChoiceOption[];
}

const FILES = import.meta.glob<{ decisions: Choice[] }>('../../data/decisions/*.json', { eager: true, import: 'default' });
export const CHOICES = Object.values(FILES).flatMap((f) => f.decisions);
const BY_ID = new Map(CHOICES.map((c) => [c.id, c]));
// 1年に分かれ道が出る確率。既存の決定 (1人あたり約24回) に足して、多くても1.5倍に収まるように (choices.test.ts で実測)
export const RATE = 0.07;
const seenKey = (id: string) => `choice:${id}`;

// 出てくる人。複数いるときは近い人
function whoOf(p: Person, c: Pick<Choice, 'who' | 'whoAge'>): Relative | undefined {
  const near = (rs: Relative[]) => rs.filter((r) => r.alive).sort((a, b) => (b.bond ?? 0) - (a.bond ?? 0))[0];
  switch (c.who) {
    case 'mother': return p.mother.alive ? p.mother : undefined;
    case 'father': return p.father.alive ? p.father : undefined;
    case 'sibling': return near(p.siblings.filter((s) => s.age >= 0));
    case 'spouse': return p.spouse?.alive ? p.spouse : undefined;
    case 'partner': return p.dating?.alive ? p.dating : undefined;
    case 'child': return near(p.children.filter((k) => !c.whoAge || (k.age >= c.whoAge[0] && k.age <= c.whoAge[1])));
    case 'friend': return near((p.ties ?? []).filter((t) => t.role === 'friend' && t.until === undefined));
    default: return undefined;
  }
}
const byId = (p: Person, id: number) => [p.mother, p.father, ...p.siblings, p.spouse, p.dating, ...p.children, ...(p.ties ?? [])].find((r) => r?.id === id && r.alive);

export function eligible(p: Person, c: Choice): boolean {
  if (p.age < c.minAge || p.age > c.maxAge || p.recent[seenKey(c.id)] !== undefined) return false;
  const year = yearOf(p);
  if ((c.from !== undefined && year < c.from) || (c.to !== undefined && year > c.to)) return false;
  if (c.who && !whoOf(p, c)) return false;
  return !c.when || fits(p, c.when);
}

function say(p: Person, c: Choice, ja: string, en: string | undefined, who?: Relative): string {
  const call = who && c.who ? callName(who, c.who) : '';
  // 親は名前でなく「母」「父」と呼ぶ
  const bare = c.who === 'mother' || c.who === 'father' ? call : who?.name ?? call;
  return fill(p, isEn ? en ?? ja : ja)
    .replaceAll('{who}', call)
    .replaceAll('{whoName}', bare)
    .replaceAll('{money}', yen(scaleOf(p) * (c.amount ?? 0)));
}

// 起きたことを記す。who がいれば、その人の思い出にも残り、近さが d だけ動く
function apply(p: Person, c: Choice, e: Effect & { text?: string; kind?: YearKind; big?: boolean }, en: string | undefined, who?: Relative): void {
  if (e.effects) bump(p, e.effects);
  // 子どもの選択のお金は親の家計の話なので、本人の財布は動かさない (moments と同じ)
  if (e.cost && independent(p)) p.wealth += scaleOf(p) * e.cost;
  if (!e.text) { if (e.d && who) who.bond = clamp((who.bond ?? 50) + e.d, 0, 100); return; }
  const text = say(p, c, e.text, en, who);
  log(p, text, e.kind ?? (e.cost && e.cost < -0.08 ? 'hard' : p.kinds[p.age] ?? 'family'), !!e.big, undefined, who?.id !== undefined ? [who.id] : undefined);
  if (who) remember(p, who, text, e.d ?? 0, 'choice');
}

function pick(p: Person, c: Choice, i: number): void {
  const opt = c.options[i];
  const who = whoOf(p, c);
  apply(p, c, opt, opt.en.text, who);
  const r = pickWeighted(p.rng, opt.outcomes, (x) => x.weight);
  const at = opt.outcomes.indexOf(r);
  if (r.after) p.later = [...(p.later ?? []), { age: p.age + r.after, id: c.id, o: i, r: at, ...(who?.id !== undefined ? { w: who.id } : {}) }];
  else apply(p, c, r, r.en?.text, who);
}

// 何年か前の選択の結果が、今年届く
function due(p: Person): void {
  if (!p.later?.length) return;
  const now = p.later.filter((x) => x.age <= p.age);
  p.later = p.later.filter((x) => x.age > p.age);
  for (const x of now) {
    const c = BY_ID.get(x.id);
    const o = c?.options[x.o]?.outcomes[x.r];
    const who = x.w !== undefined ? byId(p, x.w) : undefined;
    if (!c || !o || (x.w !== undefined && !who)) continue;
    apply(p, c, o, o.en?.text, who);
  }
}

export function toDecision(p: Person, c: Choice): Decision {
  const who = whoOf(p, c);
  return {
    title: say(p, c, c.title, c.en.title, who),
    text: say(p, c, c.text, c.en.text, who),
    stat: statOf(c, yearOf(p)),
    options: c.options.map((o, i) => ({
      label: say(p, c, o.label, o.en.label, who),
      hint: o.hint ? say(p, c, o.hint, o.en.hint, who) : undefined,
      apply: (q: Person) => pick(q, c, i),
    })),
    auto: (q: Person) => c.options.indexOf(pickWeighted(q.rng, c.options, (o) => o.auto ?? 1)),
  };
}

export function choices(p: Person): void {
  due(p);
  if (p.rng() >= RATE) return;
  const pool = CHOICES.filter((c) => eligible(p, c) && techWeight(p, c) > 0.005);
  if (!pool.length) return;
  const c = pickWeighted(p.rng, pool, (x) => x.weight * (x.when ? 1.8 : 1) * techWeight(p, x));
  p.recent[seenKey(c.id)] = p.age;
  decide(p, toDecision(p, c));
}
