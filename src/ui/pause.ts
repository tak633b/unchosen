// ひと息: 5・15・30・50・70歳で時間が止まり、問いが一つ出る。
// 問いは年齢ごとに数個ずつ用意し、どれが出るかは seed で決める (エンジンの乱数は使わない)。
// この人のことを問うものと、遊んでいるあなた自身のことを問うものが混ざる。
import type { Person } from '../engine/person';
import { L } from '../i18n';
import { hash } from './raster';

type Ask = (n: string) => string;

const POOL: Record<number, Ask[]> = {
  5: [
    () => L('この子に今いちばん必要なものは、何だろう？', 'What does this child need most right now?'),
    (n) => L(`${n}は5歳になった。あなたが覚えている、いちばん古い景色は？`, `${n} is five now. What is the oldest scene you can remember?`),
    () => L('5歳のころのあなたは、何がこわかった？', 'What frightened you when you were five?'),
    () => L('5歳のあなたのそばにいたのは、誰だった？', 'Who was around you when you were five?'),
    () => L('この子が大人になるころ、世界がどうなっていてほしい？', 'By the time this child grows up, what do you hope the world is like?'),
  ],
  15: [
    (n) => L(`${n}は15歳になった。あなたは15歳のころ、何をしていた？`, `${n} is fifteen now. What were you doing at fifteen?`),
    () => L('今、何になりたい？', 'What do you want to be?'),
    () => L('15歳のあなたが、いちばん欲しかったものは？', 'What did you want most at fifteen?'),
    () => L('15歳のころ、誰にも言えなかったことはある？', 'Was there something you could tell no one at fifteen?'),
  ],
  30: [
    () => L('ここまでで一番大きかった選択は？', 'What has been the biggest choice so far?'),
    (n) => L(`${n}は30歳。あなたは30歳のとき、どこにいた？(まだなら、どこにいたい？)`, `${n} is thirty. Where were you at thirty? (If not yet, where do you want to be?)`),
    () => L('この人生とあなたの人生、いちばん違うところはどこだろう？', 'Where does this life differ most from yours?'),
    () => L('30歳のあなたのそばには、誰がいた？(まだなら、誰にいてほしい？)', 'Who was beside you at thirty? (If not yet, who do you hope will be?)'),
  ],
  50: [
    () => L('20歳の自分に一言かけるとしたら？', 'What would you say to yourself at 20?'),
    () => L('やり直せるなら、何歳の年に戻りたい？', 'If you could go back, which year would you return to?'),
    (n) => L(`${n}は50歳になった。あなたの親が50歳だったころを覚えている？`, `${n} is fifty. Do you remember your parents at fifty?`),
    () => L('まだ間に合うことは、何だろう？', 'What is there still time for?'),
  ],
  70: [
    () => L('この人生で、幸せだった瞬間は？', 'When in this life were you happy?'),
    (n) => L(`${n}は70歳になった。誰に「ありがとう」を言いたい？`, `${n} is seventy. Who would you like to thank?`),
    () => L('あなたが70歳になったら、誰に会いに行きたい？', 'When you are seventy, who would you like to go and see?'),
    () => L('この人が残していくものは、何だろう？', 'What will this person leave behind?'),
  ],
};

// 学校に行っていない15歳には、それにふれた問いを出す
const NOT_IN_SCHOOL: Ask[] = [
  () => L('もう学校には通っていない15歳。あなたにとって15歳の学校は、どんな場所だった？', 'Fifteen, and no longer in school. What was school like for you at 15?'),
  (n) => L(`${n}は15歳で、もう学校に行っていない。あなたは15歳の毎日、どこへ通っていた？`, `${n} is fifteen and no longer at school. Where did you go each day at fifteen?`),
];
const WORKING: Ask[] = [
  () => L('学校の代わりに働いている15歳。あなたにとって15歳の学校は、どんな場所だった？', 'Fifteen, and working instead of going to school. What was school like for you at 15?'),
  (n) => L(`${n}は15歳でもう働いている。あなたは15歳のとき、何を背負っていた？`, `${n} is fifteen and already working. What were you carrying at fifteen?`),
];

export const PAUSE_POOL_AGES = Object.keys(POOL).map(Number);

// その年齢の問いの候補。年齢に問いが無ければ空
export function questionPool(p: Pick<Person, 'school' | 'working'>, age: number): Ask[] {
  if (age === 15 && !p.school.enrolled) return p.working ? WORKING : NOT_IN_SCHOOL;
  return POOL[age] ?? [];
}

// 同じ人生・同じ年齢なら同じ問い。年齢が違えば別の札から引く
export function pickQuestion(p: Pick<Person, 'seed' | 'given' | 'school' | 'working'>, age: number): string {
  const pool = questionPool(p, age);
  if (!pool.length) return '';
  return pool[hash(p.seed, age, 0x5a17) % pool.length](p.given);
}
