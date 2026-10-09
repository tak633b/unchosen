// 命が危うい場面と、最期の場面の台本。DOM に触らない (crisis.ts が再生する)。
// 文は seed と年齢で決まり、人生の乱数は使わない。助かる場面と亡くなる場面は、最後の一拍まで同じ文で進む
import { byCode, countryAt } from '../engine/countries';
import { acuteKey, showRng } from '../engine/crisis';
import { callName } from '../engine/bonds';
import { causeName } from '../engine/causes';
import { techShare } from '../engine/tech';
import { lastWords, type LastWord } from '../ai/words';
import { pick } from '../engine/rng';
import type { LogEntry, Person, Relative, Role } from '../engine/person';
import { isEn, L } from '../i18n';

export type Pulse = 'fast' | 'slow' | 'weak' | 'flat' | 'back' | 'none';
export interface Beat { text: string; ms: number; pulse: Pulse }
export interface CrisisScript { head: string; beats: Beat[]; end: Beat[]; survive: boolean }

const ACCIDENT = new Set(['交通事故', '溺水', '転落などの事故', '転倒', '他殺']);
// 倒れた瞬間の一行。[日本語, 英語] を2通りずつ
const ONSET: Record<string, [string, string][]> = {
  交通事故: [['ブレーキの音。そのあとのことは覚えていない。', 'The screech of brakes. Nothing after that.'], ['道に倒れていた。誰かが「動かすな」と叫んでいる。', 'Lying in the road. Someone is shouting not to move them.']],
  溺水: [['水の中で、上と下が分からなくなった。', 'Under the water, up and down stopped making sense.'], ['足がつかない。水を飲んだ。', 'No ground under the feet. A mouthful of water.']],
  '転落などの事故': [['足場が抜けた。', 'The footing gave way.'], ['地面が急に近づいてきた。', 'The ground came up fast.']],
  転倒: [['床が急に近づいてきた。', 'The floor came up fast.'], ['段差に気づかなかった。頭を打った。', 'Missed a step. Hit the head.']],
  他殺: [['暗い道で、後ろから殴られた。', 'On a dark road, a blow from behind.'], ['刃物が光った。', 'A blade flashed.']],
  心臓病: [['胸が締めつけられ、息ができない。', 'A crushing weight on the chest. No breath.'], ['左腕がしびれ、冷たい汗が出た。', 'The left arm went numb. A cold sweat.']],
  脳卒中: [['急に、言葉が出なくなった。手が動かない。', 'Suddenly the words would not come. The hand would not move.'], ['ひどい頭痛のあと、片側が動かなくなった。', 'A terrible headache, then one side went still.']],
  肺炎: [['熱が何日も下がらない。息が浅く速い。', 'The fever will not break. Breath comes shallow and fast.'], ['咳のたびに、胸が焼けるように痛む。', 'Every cough burns in the chest.']],
  髄膜炎: [['首が曲がらない。光がまぶしい。', 'The neck will not bend. The light hurts.'], ['熱と頭痛で、名前を呼ばれても答えられない。', 'Fever and headache. Cannot answer when called.']],
  マラリア: [['熱と震えが、交互に来る。', 'Fever and shaking, by turns.'], ['毛布を三枚かけても、歯が鳴る。', 'Three blankets, and the teeth still chatter.']],
  '下痢による脱水': [['水を飲んでも、すぐに出ていく。', 'Water goes straight through.'], ['目がくぼみ、泣いても涙が出ない。', 'Sunken eyes. Crying, but no tears.']],
  はしか: [['赤い発疹が全身に広がった。熱が高い。', 'A red rash all over. A high fever.'], ['発疹のあと、息が苦しくなった。', 'After the rash, breathing got hard.']],
  '生まれてすぐの重い感染症': [['小さな体が、ぐったりしている。', 'The small body has gone limp.'], ['お乳を飲まなくなった。', 'Stopped feeding.']],
  'お産のときの酸素不足': [['生まれたのに、泣き声が上がらない。', 'Born, but no cry.'], ['体が青い。', 'The skin is blue.']],
  出産時の合併症: [['お産のあと、血が止まらない。', 'After the birth, the bleeding will not stop.'], ['赤ん坊の声が遠くに聞こえる。', 'The baby\'s cry sounds far away.']],
};

// 助けの来かた。その年・その場所にあったものだけ
function helpLine(p: Person, age: number): string {
  const year = p.birthYear + age;
  const c = countryAt(p.country, year);
  const rural = p.city === null;
  if (!rural && (year >= 1995 || (year >= 1965 && c.gdp >= 6000))) return L('救急車のサイレンが近づいてくる。', 'An ambulance siren, getting closer.');
  if (techShare(c, 'car', rural, year) > 0.3) return L('家族が車で病院へ急いだ。', 'The family drove to the hospital as fast as they could.');
  if (rural) return age < 5
    ? L('母親が抱いて、夜道を走った。', 'Mother ran down the dark road, carrying the child.')
    : L(`近所の人が戸板に乗せて、${c.gdp < 3000 ? '町の診療所' : '病院'}まで運んだ。`, `Neighbors carried them on a door to the ${c.gdp < 3000 ? 'clinic in town' : 'hospital'}.`);
  return L('通りで車を止めて、病院へ向かった。', 'Someone flagged down a car and they headed for the hospital.');
}

// そばに駆けつける人。連れ合い、子ども、母、友だちの順に、生きている人
function kinLine(p: Person, age: number): string {
  const pickRel = (): [Relative, Role] | undefined => {
    if (p.spouse?.alive) return [p.spouse, 'spouse'];
    if (age < 18 && p.mother.alive) return [p.mother, 'mother'];
    const kid = p.children.find((k) => k.alive && k.age >= 15);
    if (kid) return [kid, 'child'];
    if (p.mother.alive) return [p.mother, 'mother'];
    const f = (p.ties ?? []).find((t) => t.role === 'friend' && t.alive && t.until === undefined);
    return f ? [f, 'friend'] : undefined;
  };
  const r = pickRel();
  if (!r) return L('誰かが名前を呼んでいる。', 'Someone is calling their name.');
  const who = callName(r[0], r[1]);
  return r[1] === 'mother' && age < 18 ? L('母が、ずっと手を握っている。', 'Mother has not let go of the hand.') : L(`${who}が駆けつけた。`, `${who} came running.`);
}

export function crisisScript(p: Person, cause: string, survive: boolean, age = p.age): CrisisScript {
  const key = acuteKey(cause) ?? cause;
  const r = showRng(p.seed, age, 1);
  const [ja, en] = pick(r, ONSET[key] ?? ONSET['肺炎']);
  const head = L(`${age}歳・${p.birthYear + age}年`, `Age ${age} · ${p.birthYear + age}`);
  const beats: Beat[] = [
    { text: isEn ? en : ja, ms: 1800, pulse: 'fast' },
    { text: helpLine(p, age), ms: 1600, pulse: 'fast' },
    { text: kinLine(p, age), ms: 1600, pulse: 'slow' },
    { text: ACCIDENT.has(key) ? L('声が遠くなっていく。', 'The voices drift away.') : L('天井の明かりが、にじんで見える。', 'The light overhead blurs.'), ms: 1600, pulse: 'weak' },
    { text: '……', ms: 1800, pulse: 'weak' },
  ];
  const end: Beat[] = survive
    ? [{ text: L('心臓が、また打ちはじめた。', 'The heart started again.'), ms: 1500, pulse: 'back' }, { text: L('助かった。', 'Pulled through.'), ms: 1600, pulse: 'slow' }]
    : [{ text: L('音が、止まった。', 'The sound stopped.'), ms: 2200, pulse: 'flat' }];
  return { head, beats, end, survive };
}

// 病や老いで、ゆっくり亡くなるときの静かな場面
export function declineScript(p: Person): CrisisScript {
  const cause = p.cause ?? '';
  const old = cause === causeName('老衰') || cause === causeName('認知症');
  const r = showRng(p.seed, p.age, 2);
  const first = p.age < 1
    ? L('小さな体で、何日か息をした。', 'A small body, breathing for a few days.')
    : old ? L('眠っている時間が、起きている時間より長くなった。', 'Sleep began to take up more of the day than waking.')
      : L(`${cause}で、体が少しずつ弱っていった。`, `${cause[0]?.toUpperCase() ?? ''}${cause.slice(1)} slowly wore the body down.`);
  const room = pick(r, isEn
    ? ['Through the window, the sounds of the street.', 'Someone left a cup of tea by the bed.', 'The light moved across the wall, day by day.']
    : ['窓の外から、通りの音が聞こえていた。', '枕もとに、誰かがお茶を置いていった。', '壁の日だまりが、毎日少しずつ動いた。']);
  return {
    head: L(`${p.age}歳・${p.birthYear + p.age}年`, `Age ${p.age} · ${p.birthYear + p.age}`),
    beats: [
      { text: first, ms: 2200, pulse: 'slow' },
      { text: room, ms: 2200, pulse: 'slow' },
      { text: p.age < 1 ? (p.mother.alive ? L('母の腕の中だった。', 'In Mother\'s arms.') : L('誰かの腕の中だった。', 'In someone\'s arms.')) : kinLine(p, p.age).replace(/駆けつけた。$/, 'そばにいた。').replace(/came running\.$/, 'was there.'), ms: 2200, pulse: 'weak' },
    ],
    end: [{ text: L('ある朝、静かに息をしなくなった。', 'One morning, quietly, the breathing stopped.'), ms: 2400, pulse: 'flat' }],
    survive: false,
  };
}

// ---- 最期のふりかえり -------------------------------------------------------

export interface Farewell { birth: string; highlights: { age: number; text: string; who: number[] }[]; words: LastWord[]; last: string }

const HIGH = 5;
// 人生で大きかった出来事: 太字の記録から死の記録を除き、年をならして最大5つ
export function highlights(log: LogEntry[], n = HIGH): LogEntry[] {
  const big = log.filter((e) => e.big && e.kind !== 'death');
  if (big.length <= n) return big;
  // 人の出てくる出来事を残しやすくし、生きた年にまんべんなく
  const scored = big.map((e, i) => ({ e, i, s: (e.who?.length ? 2 : 0) + (['love', 'family', 'loss', 'move'].includes(e.kind) ? 1 : 0) }));
  const out: LogEntry[] = [];
  for (let k = 0; k < n; k++) {
    const lo = Math.floor((k * big.length) / n), hi = Math.floor(((k + 1) * big.length) / n);
    const best = scored.slice(lo, hi).sort((a, b) => b.s - a.s || a.i - b.i)[0];
    if (best) out.push(best.e);
  }
  return out;
}

export function farewell(p: Person): Farewell {
  const b = byCode(p.birthCountry);
  const month = 1 + Math.floor(showRng(p.seed, p.age, 3)() * 12);
  const year = p.birthYear + p.age;
  const home = countryAt(p.country, year).name;
  return {
    birth: L(`${p.birthYear}年${p.birthMonth}月、${b.name}で生まれた。`, `Born in ${b.name}, ${p.birthYear}.`),
    highlights: highlights(p.log).map((e) => ({ age: e.age, text: e.text, who: e.who ?? [] })),
    words: lastWords(p),
    last: isEn ? `${p.given}. Age ${p.age}. ${p.city ? `${p.city}, ${home}` : `Rural ${home}`}. ${year}.` : `${p.given}、${p.age}歳。${p.city ? `${home}、${p.city}` : `${home}の農村`}。${year}年${month}月。`,
  };
}
