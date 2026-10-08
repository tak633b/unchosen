import { byCode, type Country } from './countries';
import type { Sex } from './lifetable';
import { clamp, type Rng } from './rng';

export type Focus = 'health' | 'learn' | 'work' | 'family' | 'rest';
export type YearKind = 'child' | 'school' | 'work' | 'family' | 'love' | 'loss' | 'ill' | 'move' | 'old' | 'hard' | 'death';

export interface LogEntry { age: number; text: string; kind: YearKind; big?: boolean; stat?: string }
export interface Stats { health: number; happy: number; money: number; learn: number; bond: number }

export interface Option {
  label: string;
  hint?: string;
  apply: (p: Person) => void;
}
export interface Decision {
  title: string;
  text: string;
  stat?: string;
  options: Option[];
  // 自動決定のときに選ぶ選択肢の番号
  auto: (p: Person) => number;
}
export interface Question { age: number; q: string; context?: string; a?: string }

export interface Relative { alive: boolean; age: number; sex: Sex; name?: string; job?: string }
export interface Illness { name: string; years: number; mult: number }
export interface Pet { kind: '犬' | '猫'; name: string; age: number; life: number }

// 学歴の段階: 0 なし / 1 小学校 / 2 中学校 / 3 高校 / 4 大学 / 5 大学院
export type EduLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface Person {
  seed: number;
  rng: Rng;
  given: string;
  name: string;      // 姓名
  pool: string;      // 命名の伝統 (identity.json の pools)
  familyIndex: number;
  sex: Sex;
  birthCountry: string;
  country: string;
  city: string | null; // null は農村
  religion: string;
  birthYear: number;
  birthMonth: number;
  age: number;
  alive: boolean;
  cause?: string;
  rural: boolean;
  familyP: number;   // 生まれた家の所得分位 0–1
  incomeP: number;   // 自分の所得分位 0–1
  working: boolean;
  job?: string;
  jobKind?: 'office' | 'manual' | 'farm';
  homemaker?: boolean;   // 外で働かず家のことをすると決めた
  selfEmployed?: boolean; // 自分の畑・露店・家の仕事など、雇い主のいない働き方
  jobYears: number;
  formal: boolean;   // 正規の雇用か (年金・保険あり)
  retired: boolean;
  unemployed: number;
  wealth: number;    // 純資産 (購買力平価ドル)。マイナスは借金
  peakIncome: number;
  house: boolean;
  car: boolean;
  mortgage?: { years: number; pay: number; value: number };
  invest?: 'deposit' | 'stock' | 'realestate';
  mother: Relative;
  father: Relative;
  siblings: Relative[];
  school: {
    years: number; target: number; enrolled: boolean;
    track?: 'general' | 'vocational';
    uni: 'no' | 'studying' | 'done'; uniYears: number;
    grad: 'no' | 'studying' | 'done';
    major?: string;
    abroad?: string; // 留学先の国コード
  };
  military: 'none' | 'serving' | 'done' | 'deferred';
  serviceEnd?: number;
  spouse?: Relative;
  dating?: Relative & { years: number };
  childMarriage: boolean;
  children: Relative[];
  pet?: Pet;
  petsHad: number;
  temperament?: string;
  hobbies: string[];
  friend?: string;
  smoker?: boolean;
  drinker?: boolean;
  hiv: 'none' | 'untreated' | 'treated';
  hivYears: number;
  illness?: Illness;
  migratedTo?: string;
  countriesLived: string[];
  stats: Stats;
  focus: Focus;
  decisions: number;
  log: LogEntry[];
  kinds: YearKind[];
  happyByAge: number[];
  pending: Decision[];
  questions: Question[];
  auto: boolean;
  reflect?: boolean; // 5・15・30・50・70歳の問いを出すか (プレイヤーだけ)
  recent: Record<string, number>; // 日常の出来事を最後に見た年齢 (同じ話の繰り返しを避ける)
}

export const countryOf = (p: Person): Country => byCode(p.country);

export function log(p: Person, text: string, kind: YearKind, big = false, stat?: string): void {
  p.log.push({ age: p.age, text, kind, big, ...(stat ? { stat } : {}) });
  // その年を一番よく表す出来事で人生地図の色を決める
  const rank: YearKind[] = ['child', 'school', 'work', 'old', 'family', 'love', 'move', 'hard', 'ill', 'loss', 'death'];
  const cur = p.kinds[p.age];
  if (!cur || rank.indexOf(kind) > rank.indexOf(cur)) p.kinds[p.age] = kind;
}

export function bump(p: Person, d: Partial<Stats>): void {
  for (const [k, v] of Object.entries(d) as [keyof Stats, number][]) p.stats[k] = clamp(p.stats[k] + v, 0, 100);
}

// 意思決定を積む。自動決定の人生はその場で決めてしまう
export function decide(p: Person, d: Decision): void {
  if (p.auto && !p.reflect) {
    choose(p, d, d.auto(p));
  } else {
    p.pending.push(d);
  }
}

export function choose(p: Person, d: Decision, i: number): void {
  p.decisions++;
  if (p.reflect) log(p, `決めたこと: ${d.options[i].label}`, p.kinds[p.age] ?? 'family');
  d.options[i].apply(p);
}

export const he = (p: Person) => (p.sex === 'F' ? '彼女' : '彼');
export const childWord = (sex: Sex) => (sex === 'F' ? '女の子' : '男の子');
export const place = (p: Person) => p.city ?? '村';

export function eduLevel(p: Person): EduLevel {
  if (p.school.grad === 'done') return 5;
  if (p.school.uni === 'done') return 4;
  const y = p.school.years;
  return y >= 12 ? 3 : y >= 9 ? 2 : y >= 6 ? 1 : 0;
}

export const EDU_LABEL = ['学校に通えなかった', '小学校', '中学校', '高校', '大学', '大学院'];
