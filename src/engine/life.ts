// 一つの人生を、1年ずつ進める。
import { byCode, pickBirthCountry, type BirthBasis } from './countries';
import { causeName, homicideHazard, pickCause } from './causes';
import { isEn, L, religionName } from '../i18n';
import { makeName, pickCity, pickReligion } from './identity';
import { lifeTable, type Sex } from './lifetable';
import { bump, childWord, countryOf, log, type Person } from './person';
import { clamp, makeRng, normal, poisson } from './rng';
import { family } from './events/family';
import { adultPet, childhood, chooseHobby } from './events/childhood';
import { military, schooling } from './events/school';
import { work } from './events/work';
import { finances } from './events/money';
import { births, childMarriage, love } from './events/love';
import { drift, habits, hiv, illness } from './events/health';
import { migration } from './events/migration';
import { crime, dilemmas } from './events/social';
import { milestone, moments } from './events/moments';

// 5, 15, 30, 50, 70 歳で時間が止まり、問いが一つ出る
// 問いの文はその場の暮らしで変わるので、画面に出す時に作る
export const PAUSE_AGES = [5, 15, 30, 50, 70];
export function pauseQuestion(p: Person, age = p.age): string | null {
  switch (age) {
    case 5: return L('この子に今いちばん必要なものは、何だろう？', 'What does this child need most right now?');
    case 15: return !p.school.enrolled
      ? (p.working
        ? L('学校の代わりに働いている15歳。あなたにとって15歳の学校は、どんな場所だった？', 'Fifteen, and working instead of going to school. What was school like for you at 15?')
        : L('もう学校には通っていない15歳。あなたにとって15歳の学校は、どんな場所だった？', 'Fifteen, and no longer in school. What was school like for you at 15?'))
      : L('今、何になりたい？', 'What do you want to be?');
    case 30: return L('ここまでで一番大きかった選択は？', 'What has been the biggest choice so far?');
    case 50: return L('20歳の自分に一言かけるとしたら？', 'What would you say to yourself at 20?');
    case 70: return L('この人生で、幸せだった瞬間は？', 'When in this life were you happy?');
    default: return null;
  }
}

export interface BirthOptions { seed: number; basis: BirthBasis; auto?: boolean; country?: string; year?: number; month?: number }

export function createPerson(o: BirthOptions): Person {
  const rng = makeRng(o.seed);
  const c = o.country ? byCode(o.country) : pickBirthCountry(rng, o.basis);
  const sex: Sex = rng() < 0.512 ? 'M' : 'F';
  const familyP = clamp(rng(), 0.01, 0.99);
  // 農業で働く人が多い国ほど、貧しい家ほど農村に生まれやすい
  const rural = rng() < clamp(c.agri * 1.3 * (1.4 - familyP * 0.8), 0.02, 0.95);
  const name = makeName(rng, c.code, sex);
  const fam = { pool: name.pool, index: name.familyIndex };
  const motherAge = Math.round(clamp(normal(rng, c.tfr > 4 ? 24 : 29, 5), 15, 45));
  const fatherAge = Math.round(clamp(motherAge + normal(rng, 4, 3), 16, 70));
  const older = poisson(rng, Math.max(0, (c.tfr - 1) * 0.5));
  const younger = poisson(rng, Math.max(0, (c.tfr - 1) * 0.5));
  const sib = (age: number) => {
    const s: Sex = rng() < 0.5 ? 'M' : 'F';
    return { alive: true, age, sex: s, name: makeName(rng, c.code, s, fam).given };
  };
  const now = new Date();
  const p: Person = {
    seed: o.seed, rng, given: name.given, name: name.full, pool: name.pool, familyIndex: name.familyIndex, sex,
    birthCountry: c.code, country: c.code, city: rural ? null : pickCity(rng, c.code), religion: pickReligion(rng, c.code),
    birthYear: o.year ?? now.getFullYear(), birthMonth: o.month ?? now.getMonth() + 1,
    age: 0, alive: true, rural, familyP, incomeP: familyP,
    working: false, jobYears: 0, formal: false, retired: false, unemployed: 0,
    wealth: 0, peakIncome: 0, house: false, car: false,
    mother: { alive: true, age: motherAge, sex: 'F', name: makeName(rng, c.code, 'F', fam).given },
    father: { alive: true, age: fatherAge, sex: 'M', name: makeName(rng, c.code, 'M', fam).given },
    siblings: [
      ...Array.from({ length: older }, (_, i) => sib(2 + i * 2 + Math.floor(rng() * 2))),
      ...Array.from({ length: younger }, (_, i) => sib(-(2 + i * 2 + Math.floor(rng() * 2)))),
    ],
    school: { years: 0, target: 0, enrolled: false, uni: 'no', uniYears: 0, grad: 'no' },
    military: 'none', childMarriage: false, children: [], petsHad: 0, hobbies: [],
    hiv: 'none', hivYears: 0, countriesLived: [c.code],
    stats: { health: clamp(normal(rng, 75, 8), 30, 95), happy: c.happiness * 10, money: familyP * 100, learn: 5, bond: 60 },
    focus: 'family', decisions: 0, log: [], kinds: [], happyByAge: [], pending: [], questions: [],
    auto: o.auto ?? false, recent: {},
  };
  if (c.u5mr > 0.05 && familyP < 0.3) bump(p, { health: -10 });
  log(p, birthStory(p), 'child', true);
  return p;
}

export const homeWord = (familyP: number) => isEn
  ? (familyP < 0.2 ? 'very poor family' : familyP < 0.4 ? 'struggling family' : familyP < 0.8 ? 'ordinary family' : 'wealthy family')
  : (familyP < 0.2 ? 'とても貧しい家' : familyP < 0.4 ? '暮らし向きの苦しい家' : familyP < 0.8 ? 'ふつうの家' : '裕福な家');

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function birthStoryEn(p: Person, older: number): string {
  const c = byCode(p.birthCountry);
  const where = p.city ? `${p.city}, ${c.name}` : `a rural area of ${c.name}`;
  const home = p.familyP >= 0.8 ? 'a family in the top 20% of incomes' : `${p.familyP >= 0.4 && p.familyP < 0.8 ? 'an' : 'a'} ${homeWord(p.familyP)}`;
  const sibs = older ? `There ${older === 1 ? 'was 1 older sibling' : `were ${older} older siblings`}.` : 'The first child.';
  const faith = p.religion === '無宗教' ? 'The family followed no particular religion.' : `Family religion: ${religionName(p.religion)}.`;
  return `Born a ${childWord(p.sex)} in ${MONTHS_EN[p.birthMonth - 1]} ${p.birthYear}, in ${where}, into ${home}. ${sibs} ${faith}`;
}

export function birthStory(p: Person): string {
  const c = byCode(p.birthCountry);
  const older = p.siblings.filter((s) => s.age > 0).length;
  if (isEn) return birthStoryEn(p, older);
  const where = p.city ? `${c.name}の${p.city}` : `${c.name}の農村`;
  const top = p.familyP >= 0.8 ? 'で、所得の上位20%に入る家' : `の${homeWord(p.familyP)}`;
  return `${p.birthYear}年${p.birthMonth}月、${where}${top}に${childWord(p.sex)}として生まれた。${older ? `上に${older}人のきょうだいがいる。` : '最初の子どもだった。'}家は${p.religion === '無宗教' ? '特定の宗教を持たない' : `${p.religion}を信じている`}。`;
}

// 生命表は病気や喫煙をすでに含むので、個人の倍率を重ねたぶんを全体で割り戻す。
// 自動で生きた人生の平均死亡年齢が平均寿命に合うよう実測で決めた値 (life.test.ts)
const CALIBRATION = 0.78;

// その年に亡くなる確率。生命表の値に、健康・所得・喫煙・病気の倍率をかける
export function deathRisk(p: Person): number {
  const c = countryOf(p);
  const base = lifeTable(c, p.sex).q[Math.min(110, p.age)];
  // 5歳未満は生命表の値をそのまま使う (乳幼児死亡率を統計どおりに保つ)
  if (p.age < 5) return base;
  // その年齢のふつうの健康 (drift で何もしなかった場合) より悪ければ死亡率が上がる
  const usual = p.age < 45 ? 80 : 80 - 0.7 * (Math.min(p.age, 70) - 45) - 1.4 * Math.max(0, p.age - 70);
  const healthK = 1.4 ** ((usual - p.stats.health) / 25);
  const wealth = p.working ? p.incomeP : p.familyP;
  const wealthK = wealth < 0.2 ? 1.3 : wealth > 0.8 ? 0.8 : 1;
  const smokeK = p.age < 35 ? 1 : p.smoker ? (p.age >= 55 ? 2 : 1.5) : 0.92;
  const drinkK = p.drinker ? 1.25 : 1;
  const illK = p.illness?.mult ?? 1;
  const hivAdd = p.hiv === 'untreated' && p.hivYears >= 3 ? 0.1 : p.hiv === 'treated' ? 0.003 : 0;
  return Math.min(1, CALIBRATION * base * healthK * wealthK * smokeK * drinkK * illK + hivAdd);
}

function die(p: Person, cause: string): void {
  p.alive = false;
  p.cause = cause;
  settle(p);
}

// 出産のように意思決定の中で亡くなることもあるので、死亡の記録はここで一度だけ付ける
export function settle(p: Person): void {
  if (p.alive || p.log.at(-1)?.kind === 'death') return;
  log(p, L(`${p.age}歳で亡くなった。死因: ${p.cause}。`, `Died at ${p.age}. Cause of death: ${causeName(p.cause ?? '')}.`), 'death', true);
}

export function advanceYear(p: Person): void {
  if (!p.alive) return;
  const c = countryOf(p);
  const q = deathRisk(p);
  if (p.rng() < q) {
    let cause: string;
    if (p.hiv === 'untreated' && p.hivYears >= 3 && p.rng() < 0.1 / q) cause = causeName('エイズ関連の病気');
    else if (p.illness && p.rng() < 0.85) cause = p.illness.name;
    else cause = pickCause(p.rng, c, p.sex, p.age, Math.max(q, homicideHazard(c, p.sex, p.age)), !!p.smoker);
    die(p, cause);
    return;
  }
  p.age++;
  milestone(p);
  family(p);
  childhood(p);
  childMarriage(p);
  schooling(p);
  military(p);
  work(p);
  love(p);
  births(p);
  if (!p.alive) { settle(p); return; }
  habits(p);
  hiv(p);
  illness(p);
  migration(p);
  finances(p);
  crime(p);
  dilemmas(p);
  adultPet(p);
  moments(p);
  if (p.age === 12 && !p.friend) p.friend = makeName(p.rng, p.country, p.rng() < 0.5 ? 'F' : 'M').given;
  if (p.age === 62 && p.hobbies.length < 3 && p.rng() < 0.5) chooseHobby(p, L('新しい趣味を始める？', 'Take up a new hobby?'));
  drift(p);
  if (!p.kinds[p.age]) p.kinds[p.age] = baseKind(p);
  if (PAUSE_AGES.includes(p.age) && p.reflect) p.questions.push({ age: p.age, q: '' });
}

function baseKind(p: Person) {
  if (p.age < 6) return 'child' as const;
  if (p.school.enrolled || p.school.uni === 'studying' || p.school.grad === 'studying') return 'school' as const;
  if (p.retired) return 'old' as const;
  if (p.working) return 'work' as const;
  return 'family' as const;
}

// 自動で一生を走らせる (テストと「同じ1秒に生まれた人たち」用)
export function liveOut(p: Person, maxYears = 120): Person {
  for (let i = 0; i < maxYears && p.alive; i++) advanceYear(p);
  return p;
}

// ---- 保存と再開 -----------------------------------------------------------

export type SavedPerson = Omit<Person, 'rng' | 'pending'> & { rngState: number };

export function toSaved(p: Person): SavedPerson {
  const { rng, pending, ...rest } = p;
  void pending;
  return { ...structuredClone(rest), rngState: rng.state };
}

export function fromSaved(s: SavedPerson): Person {
  const { rngState, ...rest } = s;
  return { ...rest, rng: makeRng(s.seed, rngState), pending: [] };
}
