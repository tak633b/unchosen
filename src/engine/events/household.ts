// 家の中の年々: 連れ合いの職、持ち寄った貯え、豊作、子の初めての一歩、七十・八十の誕生日、最後の数か月。
// 乱数は showRng (crisis.ts) で引き、人生の乱数の並びを変えない
import { L } from '../../i18n';
import { byCode } from '../countries';
import { isSuicide } from '../causes';
import { earnings, formatMoney } from '../economy';
import { isAcute, showRng } from '../crisis';
import { countryOf, log, type Person, type Relative } from '../person';
import { subsistence } from './common';

const roll = (p: Person, salt: number) => showRng(p.seed, p.age, salt)();
const her = (r: Relative) => (r.sex === 'F' ? 'her' : 'his');

// 家の中で働く人 (love.ts の newPartner・childMarriage、childhood.ts) は、職を失うことも貯えを持ち寄ることもない
const HOME_JOBS = new Set(['家の仕事', '家事と畑仕事', '畑と家畜の世話', '家の仕事と物売り']);
const spouseWorks = (p: Person): boolean => !!p.spouse?.alive && !!p.spouse.job && !HOME_JOBS.has(p.spouse.job);

// 毎年、finances() のあとに呼ぶ
export function household(p: Person): void {
  spouseJob(p);
  harvest(p);
  firstSteps(p);
  birthday(p);
}

// 連れ合いが職を失い、何年かして見つける。その間は自分の稼ぎと貯えで暮らす (家計には連れ合いの収入が無いので、少しだけ貯えを減らす)
function spouseJob(p: Person): void {
  const s = p.spouse;
  if (!s?.alive || !spouseWorks(p)) return;
  const key = `spouseOut:${s.id}`;
  const c = countryOf(p);
  if (p.recent[key] !== undefined) {
    p.wealth -= subsistence(c) * 0.2;
    if (roll(p, 0x5b01) >= 0.5) return;
    delete p.recent[key];
    log(p, L(`連れ合いの${s.name}が、また仕事を見つけた。`, `Spouse ${s.name} found work again.`), 'family', false, undefined, [s.id!]);
    return;
  }
  // 連れ合いが働いているあいだ、自分に稼ぎが無い年 (家にいる・失業中)。10年に一度まで
  if (p.age >= 20 && !p.retired && (!p.working || p.unemployed > 0) && (p.recent.spouseKept === undefined || p.age - p.recent.spouseKept >= 10) && roll(p, 0x5b03) < 0.3) {
    p.recent.spouseKept = p.age;
    log(p, L(`${s.name}の稼ぎで暮らした一年だった。`, `A year lived on ${s.name}'s earnings.`), 'family', false, undefined, [s.id!]);
  }
  if (s.age < 20 || s.age > 60 || roll(p, 0x5b02) >= 0.03) return;
  p.recent[key] = p.age;
  log(p, L(`連れ合いの${s.name}が仕事を失った。しばらくは自分の稼ぎと貯えで暮らすことになった。`, `Spouse ${s.name} lost ${her(s)} job. For a while the household lived on one income and the savings.`), 'hard', false, undefined, [s.id!]);
}

// 結婚のとき、相手が働いて貯めていたお金を持ち寄る。love.ts の marry() から呼ぶ。額は働いた年数で、年収の1〜4割ほど
export function spouseSavings(p: Person): void {
  const s = p.spouse;
  if (!s || s.age < 20 || !spouseWorks(p) || p.childMarriage) return;
  const c = countryOf(p);
  const amount = earnings(c, p.working ? p.incomeP : p.familyP) * (0.1 + 0.03 * Math.min(10, s.age - 20));
  p.wealth += amount;
  log(p, L(`${s.name}が働いて貯めていたお金を、二人の暮らしに持ち寄った(+${formatMoney(amount)})。`, `${s.name} brought the savings from years of work into the new household (+${formatMoney(amount)}).`), 'love', false, undefined, [s.id!]);
}

// 自分の畑を持つ人の豊作の年。余りを売って少し蓄える。3年に一度まで
function harvest(p: Person): void {
  if (!p.working || p.retired || p.unemployed > 0 || p.jobKind !== 'farm' || !p.selfEmployed || p.job === '漁師') return;
  if ((p.recent.goodHarvest !== undefined && p.age - p.recent.goodHarvest < 3) || roll(p, 0x6a01) >= 0.1) return;
  p.recent.goodHarvest = p.age;
  const gain = earnings(countryOf(p), p.incomeP) * 0.15;
  p.wealth += gain;
  log(p, L(`今年は豊作だった。余った分を売って、少し蓄えができた(+${formatMoney(gain)})。`, `A good harvest this year. Sold the surplus and put a little aside (+${formatMoney(gain)}).`), 'work');
}

// 子が1歳で初めて歩く
function firstSteps(p: Person): void {
  for (const k of p.children) {
    if (!k.alive || k.age !== 1) continue;
    log(p, L(`${k.name}が初めて歩いた。`, `${k.name} took ${her(k)} first steps.`), 'family', false, undefined, k.id ? [k.id] : undefined);
  }
}

// 七十歳・八十歳の誕生日。子や孫がいれば集まり、いなければ静かに過ぎる
function birthday(p: Person): void {
  if (p.age !== 70 && p.age !== 80) return;
  const nth = p.age === 70 ? L('七十歳', '70th') : L('八十歳', '80th');
  const kin: Relative[] = [...p.children.filter((k) => k.alive), ...(p.ties ?? []).filter((t) => t.role === 'grandchild' && t.alive)];
  if (kin.length) {
    const names = kin.slice(0, 3).map((k) => k.name).join(L('・', ', ')) + (kin.length > 3 ? L(`ほか${kin.length - 3}人`, ` and ${kin.length - 3} more`) : '');
    log(p, L(`${nth}の誕生日に、${names}が集まった。みんなで撮った写真の真ん中に、自分がいた。`, `On the ${nth} birthday, ${names} gathered. In the photo everyone took together, ${p.given} was in the middle.`), 'family', false, undefined, kin.map((k) => k.id!).filter(Boolean));
  } else if (p.spouse?.alive) {
    log(p, L(`${nth}の誕生日は、${p.spouse.name}と二人で静かに過ごした。`, `The ${nth} birthday passed quietly, just the two of them, ${p.given} and ${p.spouse.name}.`), 'family', false, undefined, [p.spouse.id!]);
  } else {
    log(p, L(`${nth}の誕生日は、誰も来ないまま静かに過ぎた。`, `The ${nth} birthday passed quietly, with no one to mark it.`), 'old');
  }
}

// ゆっくり進む病で亡くなる人の、最後の数か月。life.ts の settle() で、亡くなった記録の前に呼ぶ
export function lastMonths(p: Person): void {
  if (p.age < 50 || isAcute(p.cause) || roll(p, 0x7c01) >= 0.7) return;
  const near = p.spouse?.alive ? p.spouse : p.children.find((k) => k.alive && k.age >= 15);
  if (!near) return;
  const who = near === p.spouse ? L(`連れ合いの${near.name}`, `${p.sex === 'F' ? 'husband' : 'wife'} ${near.name}`) : L(`子どもの${near.name}`, `${near.sex === 'F' ? 'daughter' : 'son'} ${near.name}`);
  log(p, L(`最後の数か月を、${who}のそばで過ごした。伝えたかったことを話す時間があった。`, `Spent the last months near ${who}. There was time to say what needed saying.`), 'family', false, undefined, [near.id!]);
}

// 同じ1秒に生まれた人たち (lineage.ts の othersFor) が先に亡くなったとき、一行残す。ui/game.ts の tick で、全員の1年を進めたあとに呼ぶ
export function companionDeaths(p: Person, others: Person[]): void {
  if (!p.alive) return;
  for (const o of others) {
    const key = `comp:${o.seed}`;
    if (o.alive || p.recent[key] !== undefined) continue;
    p.recent[key] = p.age;
    const quiet = !o.cause || isSuicide(o.cause); // 自死は死因を書かない (life.ts の settle と同じ)
    log(p, L(`同じ1秒に生まれた${byCode(o.birthCountry).name}の${o.given}が、${o.age}歳で亡くなった${quiet ? '' : `(${o.cause})`}。`,
      `${o.given}, born in ${byCode(o.birthCountry).name} in the same second, died at ${o.age}${quiet ? '' : ` (${o.cause})`}.`), 'loss');
    if (quiet) p.log[p.log.length - 1].quiet = true;
  }
}
