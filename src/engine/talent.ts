// 生まれ持った向き不向き (勉強・体・絵・音楽・手先・人)。数字では見せず、子どものころの一行でそれとなく匂わせるだけ。
// 合う道ではほんの少し有利になる。
// seed から別の乱数で作るので、人生の乱数の流れを変えない (同じ seed で、これを足す前と同じ出来事が並ぶ)
import { L } from '../i18n';
import { log, type Person } from './person';
import { makeRng, normal } from './rng';

export type Talent = 'study' | 'body' | 'art' | 'music' | 'hands' | 'people';
export const TALENTS: Talent[] = ['study', 'body', 'art', 'music', 'hands', 'people'];

// 標準正規分布の値 (0 がふつう、1 で上位16%、2 で上位2%)
const memo = new Map<number, Record<Talent, number>>();
export function talents(p: Pick<Person, 'seed'>): Record<Talent, number> {
  const hit = memo.get(p.seed);
  if (hit) return hit;
  const r = makeRng(p.seed ^ 0x7a1e47);
  const t = Object.fromEntries(TALENTS.map((k) => [k, normal(r, 0, 1)])) as Record<Talent, number>;
  if (memo.size > 5000) memo.clear();
  memo.set(p.seed, t);
  return t;
}
export const talent = (p: Pick<Person, 'seed'>, k: Talent): number => talents(p)[k];
export const topTalent = (p: Pick<Person, 'seed'>): Talent => TALENTS.reduce((a, b) => (talent(p, b) > talent(p, a) ? b : a));

// 仕事に合う向き。名前の一部で見る (リーダーの付いた名前もそのまま渡せる)
const FIT: [RegExp, Talent][] = [
  [/スポーツ|ダンサー|舞踊|建設|農場|漁/, 'body'],
  [/音楽/, 'music'],
  [/デザイナー|美容師|記者/, 'art'],
  [/整備士|電気工|料理人|縫製|工員|大工/, 'hands'],
  [/教師|看護師|介護士|店員|販売員|営業|窓口|警察/, 'people'],
  [/医師|研究者|大学の教員|エンジニア|プログラマー|弁護士|会計/, 'study'],
];
export const jobTalent = (job: string): Talent | undefined => FIT.find(([re]) => re.test(job))?.[1];
// 合う仕事での所得の位置の上乗せ。上位2%の向きで +0.03 ほど
export const talentEdge = (p: Pick<Person, 'seed'>, job: string): number => {
  const k = jobTalent(job);
  return k ? Math.max(-0.015, Math.min(0.04, talent(p, k) * 0.015)) : 0;
};

// 子どものころの一行。いちばん強い向きが、はっきり人並み以上のときだけ
const HINT: Record<Talent, [string, string]> = {
  study: ['読めるはずのない看板の字を、いつのまにか声に出して読んでいた。', 'Was reading the words on shop signs aloud, though no one had taught them.'],
  body: ['かけっこでは、年上の子にも負けなかった。', 'In footraces, could outrun even the older kids.'],
  art: ['地面や壁に描いた絵を、大人たちが足を止めて見ていた。', 'Adults would stop to look at the drawings scratched on the ground and walls.'],
  music: ['一度聞いた歌を、節まで正しく歌い返した。', 'Could sing back a song after hearing it once, every note in place.'],
  hands: ['壊れたおもちゃを、ばらして自分で直してしまった。', 'Took a broken toy apart and fixed it alone.'],
  people: ['泣いている小さい子がいると、いつのまにかそばにいた。', 'Whenever a small child was crying, was somehow already at their side.'],
};

// 夢: いちばん強い向きに合う仕事
const DREAM: Record<Talent, string> = {
  study: '研究者', body: 'プロのスポーツ選手', art: 'デザイナー', music: '音楽家', hands: '整備士', people: '教師',
};

const DREAM_EN: Record<Talent, string> = {
  study: 'a researcher', body: 'a pro athlete', art: 'a designer', music: 'a musician', hands: 'a mechanic', people: 'a teacher',
};

export function childTalent(p: Person): void {
  if (p.age === 5) {
    const k = topTalent(p);
    if (talent(p, k) >= 1) log(p, L(...HINT[k]), 'child');
  }
  if (p.age === 9 && !p.dream) {
    const k = topTalent(p);
    p.dream = DREAM[k];
    log(p, L(`大きくなったら${DREAM[k]}になりたい、と言うようになった。`, `Started saying they wanted to be ${DREAM_EN[k]} when they grew up.`), 'child');
  }
}

// 夢の仕事に就いているか (リーダーの付いた名前も同じ仕事とみなす)
export const inDreamJob = (p: Person): boolean => !!p.dream && !!p.job && p.job.replace('(リーダー)', '') === p.dream;
