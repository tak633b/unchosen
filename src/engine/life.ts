// 一つの人生を、1年ずつ進める。
import { byCode, pickBirthCountry, type BirthBasis } from './countries';
import { homicideHazard, pickCause } from './causes';
import { births, childhood, childMarriage, crime, drift, family, habits, hiv, illness, love, migration, moneyScore, schooling, work } from './events';
import { lifeTable, type Sex } from './lifetable';
import { bump, childWord, countryOf, log, type Person } from './person';
import { clamp, makeRng, normal, poisson } from './rng';

// 5, 15, 30, 50, 70 歳で時間が止まり、問いが一つ出る
export const PAUSE_QUESTIONS: Record<number, string> = {
  5: 'いちばん古い記憶は何だろう？',
  15: '今、何になりたい？',
  30: 'ここまでで一番大きかった選択は？',
  50: '20歳の自分に一言かけるとしたら？',
  70: 'この人生で、幸せだった瞬間は？',
};

export interface BirthOptions { seed: number; basis: BirthBasis; name?: string; auto?: boolean; country?: string }

export function createPerson(o: BirthOptions): Person {
  const rng = makeRng(o.seed);
  const c = o.country ? byCode(o.country) : pickBirthCountry(rng, o.basis);
  const sex: Sex = rng() < 0.512 ? 'M' : 'F';
  const familyP = clamp(rng(), 0.01, 0.99);
  // 農業で働く人が多い国ほど、貧しい家ほど農村に生まれやすい
  const rural = rng() < clamp(c.agri * 1.3 * (1.4 - familyP * 0.8), 0.02, 0.95);
  const motherAge = Math.round(clamp(normal(rng, c.tfr > 4 ? 24 : 29, 5), 15, 45));
  const fatherAge = Math.round(clamp(motherAge + normal(rng, 4, 3), 16, 70));
  const older = poisson(rng, Math.max(0, (c.tfr - 1) * 0.5));
  const younger = poisson(rng, Math.max(0, (c.tfr - 1) * 0.5));
  const siblings = [
    ...Array.from({ length: older }, (_, i) => ({ alive: true, age: 2 + i * 2 + Math.floor(rng() * 2), sex: (rng() < 0.5 ? 'M' : 'F') as Sex })),
    ...Array.from({ length: younger }, (_, i) => ({ alive: true, age: -(2 + i * 2 + Math.floor(rng() * 2)), sex: (rng() < 0.5 ? 'M' : 'F') as Sex })),
  ];
  const p: Person = {
    seed: o.seed, rng, name: o.name?.trim() || 'あなた', sex,
    birthCountry: c.code, country: c.code, age: 0, alive: true,
    rural, familyP, incomeP: familyP, working: false, retired: false, unemployed: 0,
    mother: { alive: true, age: motherAge, sex: 'F' },
    father: { alive: true, age: fatherAge, sex: 'M' },
    siblings,
    school: { years: 0, target: 0, enrolled: false, uni: 'no' },
    childMarriage: false, children: [], hiv: 'none', hivYears: 0,
    stats: { health: clamp(normal(rng, 75, 8), 30, 95), happy: c.happiness * 10, money: familyP * 100, learn: 5, bond: 60 },
    focus: 'family', log: [], kinds: [], pending: [], questions: [], auto: o.auto ?? false,
  };
  if (c.u5mr > 0.05 && familyP < 0.3) bump(p, { health: -10 });
  const place = rural ? '農村' : '町';
  const home = familyP < 0.2 ? 'とても貧しい家' : familyP < 0.45 ? '暮らし向きの苦しい家' : familyP < 0.8 ? 'ふつうの家' : '裕福な家';
  const sib = older ? `${older}人のきょうだいがいる` : '最初の子ども';
  log(p, `${c.name}の${place}の、${home}に${childWord(sex)}として生まれた。${sib}。`, 'child', true);
  p.stats.money = moneyScore(p);
  return p;
}

// 生命表は病気や喫煙をすでに含むので、個人の倍率を重ねたぶんを全体で割り戻す。
// 自動で生きた人生の平均死亡年齢が平均寿命に合うよう実測で決めた値 (life.test.ts)
const CALIBRATION = 0.85;

// その年に亡くなる確率。生命表の値に、健康・所得・喫煙・病気の倍率をかける
export function deathRisk(p: Person): number {
  const c = countryOf(p);
  const base = lifeTable(c, p.sex).q[Math.min(110, p.age)];
  // その年齢のふつうの健康 (drift で何もしなかった場合) より悪ければ死亡率が上がる
  const usual = p.age < 45 ? 80 : 80 - 0.7 * (Math.min(p.age, 70) - 45) - 1.4 * Math.max(0, p.age - 70);
  const healthK = 1.4 ** ((usual - p.stats.health) / 25);
  const wealth = p.working ? p.incomeP : p.familyP;
  const wealthK = wealth < 0.2 ? 1.3 : wealth > 0.8 ? 0.8 : 1;
  const smokeK = p.age < 35 ? 1 : p.smoker ? (p.age >= 55 ? 2 : 1.5) : 0.92;
  const illK = p.illness?.mult ?? 1;
  const hivAdd = p.hiv === 'untreated' && p.hivYears >= 3 ? 0.1 : p.hiv === 'treated' ? 0.003 : 0;
  return Math.min(1, CALIBRATION * base * healthK * wealthK * smokeK * illK + hivAdd);
}

function die(p: Person, cause: string): void {
  p.alive = false;
  p.cause = cause;
  settle(p);
}

// 出産のように意思決定の中で亡くなることもあるので、死亡の記録はここで一度だけ付ける
export function settle(p: Person): void {
  if (p.alive || p.log.at(-1)?.kind === 'death') return;
  log(p, `${p.age}歳で亡くなった。死因: ${p.cause}。`, 'death', true);
}

export function advanceYear(p: Person): void {
  if (!p.alive) return;
  const c = countryOf(p);
  const q = deathRisk(p);
  if (p.rng() < q) {
    let cause: string;
    if (p.hiv === 'untreated' && p.hivYears >= 3 && p.rng() < 0.1 / q) cause = 'エイズ関連の病気';
    else if (p.illness && p.rng() < 0.85) cause = p.illness.name;
    else cause = pickCause(p.rng, c, p.sex, p.age, Math.max(q, homicideHazard(c, p.sex, p.age)), !!p.smoker);
    die(p, cause);
    return;
  }
  p.age++;
  family(p);
  childhood(p);
  childMarriage(p);
  schooling(p);
  work(p);
  love(p);
  births(p);
  if (!p.alive) { settle(p); return; }
  habits(p);
  hiv(p);
  illness(p);
  migration(p);
  crime(p);
  drift(p);
  if (!p.kinds[p.age]) p.kinds[p.age] = baseKind(p);
  const qText = PAUSE_QUESTIONS[p.age];
  if (qText && p.reflect) p.questions.push({ age: p.age, q: qText });
}

function baseKind(p: Person) {
  if (p.age < 6) return 'child' as const;
  if (p.school.enrolled || p.school.uni === 'studying') return 'school' as const;
  if (p.retired) return 'old' as const;
  if (p.working) return 'work' as const;
  return 'family' as const;
}

// 自動で一生を走らせる (テストと「同じ1秒に生まれた人たち」用)
export function liveOut(p: Person, maxYears = 120): Person {
  for (let i = 0; i < maxYears && p.alive; i++) advanceYear(p);
  return p;
}
