import { countryAt, type Country } from './countries';
import type { Sex } from './lifetable';
import { clamp, type Rng } from './rng';
import { isEn, L } from '../i18n';

export type Focus = 'health' | 'learn' | 'work' | 'family' | 'rest';
export type YearKind = 'child' | 'school' | 'work' | 'family' | 'love' | 'loss' | 'ill' | 'move' | 'old' | 'hard' | 'death';

export interface LogEntry { age: number; text: string; kind: YearKind; big?: boolean; stat?: string; ai?: boolean; tpl?: boolean; who?: number[]; why?: string; crisis?: string } // crisis: 九死に一生の年 (engine/crisis.ts)。危うかった死因の日本語の名前
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

export interface Relative {
  alive: boolean; age: number; sex: Sex; name?: string; job?: string;
  id?: number;        // 人の輪で使う、この人生の中で一意の番号
  bond?: number;      // 主人公との近さ 0–100
  mem?: Memory[];     // 一緒に過ごした出来事 (新しいものほど後ろ)
  diedAt?: number;    // 亡くなった時の主人公の年齢
  since?: number;     // 輪に入った時の主人公の年齢 (Tie では必須)
  country?: string;   // 出会った時・生まれた時に主人公がいた国 (その人の一生を作るときの生まれた国)
  fixed?: Fixed;      // その人の一生の中に出てくる、主人公の記録で決まっている人
  pet?: '犬' | '猫';   // 人の輪に並べるペット (role 'pet') の種類
  gen?: number;       // 前の世代の主人公 (この人で続けた一つ前の人生)。その世代の番号
}
// 家系の一人。顔を描き、年と続き柄を出す分だけ持つ。rel は次の主人公がこの人から見て何にあたるか
export interface LineEntry { seed: number; name: string; given: string; sex: Sex; gender?: 'X'; birthYear: number; age: number; cause: string; birthCountry: string; country: string; religion: string; rel?: Role } // rel が無いのは家系の最後 (記録の本人)
// 主人公の輪の人の一生 (kin.ts) で、記録から決まっている人。乱数では死なず、決まった年に亡くなる
export interface Fixed { ref: number; born: number; dies?: number; cause?: string } // ref: 主人公の輪での id (0 は主人公)。born: 生まれた暦年。dies: 亡くなる年齢
// 輪の人の一生を、主人公の記録に合わせるための手綱。主人公の人生には付かない
export interface Anchor {
  dies: number;    // この年齢で亡くなる (分からない時は Infinity)
  cause?: string;
  school?: number; // 少なくともこの年数は学校に通う
  hold: (p: Person, what: 'love' | 'birth' | 'move') => boolean; // true の年は、その出来事を乱数で起こさない
  each: (p: Person) => void;                                       // 毎年、家族の時間のあとに: 決まった結婚・子・死
}
// 主人公から見た関係。family 系は Person の mother/father/siblings/spouse/children に、それ以外は ties に入る
export type Role = 'mother' | 'father' | 'sibling' | 'spouse' | 'partner' | 'child' | 'friend' | 'mentor' | 'rival' | 'ex' | 'grandchild' | 'grandparent' | 'pet'; // pet は飼った犬・猫 (人の輪に並べるだけ)。grandparent は、孫として一生を続けた人から見た前の主人公だけ
export interface Memory { age: number; text: string; d: number; k?: string } // d: その時の近さの変化。k: 出来事の種類 (最後の言葉を、語る人の目線で組むため)
export interface Tie extends Relative { role: Role; since: number; until?: number; of?: number } // since/until は主人公の年齢。of は孫の親 (子) の id
// 分かれ道の結果のうち、何年か後に起きるもの。age 歳で decisions/*.json の id・選択肢 o・結果 r が起きる。w は出てくる人の id
export interface Later { age: number; id: string; o: number; r: number; w?: number }
export interface Illness { name: string; years: number; mult: number }
export interface Pet { kind: '犬' | '猫'; name: string; age: number; life: number }
// 飼ったペットの記録 (pets.ts)。since・diedAt は主人公の年齢、age はペットの年齢
export interface PetLife { id: number; kind: '犬' | '猫'; name: string; since: number; age: number; alive: boolean; diedAt?: number; bond: number; mem: Memory[] }

// 学歴の段階: 0 なし / 1 小学校 / 2 中学校 / 3 高校 / 4 大学 / 5 大学院
export type EduLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface Person {
  seed: number;
  rng: Rng;
  given: string;
  name: string;      // 姓名
  pool: string;      // 命名の伝統 (identity.json の pools)
  familyIndex: number;
  sex: Sex;          // 生まれた時の性別 (統計はこれで引く)
  gender?: 'X';      // 性別に「その他」を選んだ人だけ
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
  birthP?: number;   // 生まれた時の familyP (familyP は親の早世や治療費で下がる)。古いセーブには無い
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
  peakYear?: number; // いちばん稼いだ暦年 (世界の中の位置をその年の世界と比べるため)
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
  pets?: PetLife[];  // 飼ったペット全員の記録 (人の輪に並べる分)。古いセーブには無い
  temperament?: string;
  hobbies: string[];
  friend?: string;
  ties?: Tie[];      // 家族以外の人 (友人・恩師・ライバル・元の相手・孫)
  nextId?: number;
  nameKeys?: string[]; // 主人公・きょうだい・子・孫に使った名 (Name.key)。家の中で同じ名前にしない
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
  later?: Later[];   // 分かれ道 (events/choices.ts) の、何年か後に起きる結果
  anchor?: Anchor;   // 輪の人の一生を作っている時だけ
  line?: LineEntry[]; // 家系: この人の前に続けてきた主人公たち (1世代目から順に)。1世代目には無い
}

export const yearOf = (p: Person): number => p.birthYear + p.age;
// その人がいる国の、今の暦年の値
export const countryOf = (p: Person): Country => countryAt(p.country, yearOf(p));

export function log(p: Person, text: string, kind: YearKind, big = false, stat?: string, who?: number[]): void {
  p.log.push({ age: p.age, text, kind, big, ...(stat ? { stat } : {}), ...(who?.length ? { who } : {}) });
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
  if (p.reflect) log(p, L(`決めたこと: ${d.options[i].label}`, `Decided: ${d.options[i].label}`), p.kinds[p.age] ?? 'family');
  d.options[i].apply(p);
}

// 性別。'X' は「その他」: 文と表示ではどちらでもない言い方にし、統計 (生命表・出産など) は生まれた時の性別 sex で引く
export type Gender = Sex | 'X';
export const genderOf = (p: { sex: Sex; gender?: 'X' }): Gender => p.gender ?? p.sex;
export const he = (p: Person) => (p.gender === 'X' ? p.given : p.sex === 'F' ? L('彼女', 'she') : L('彼', 'he'));
export const childWord = (g: Gender) => (g === 'X' ? L('子ども', 'child') : g === 'F' ? L('女の子', 'girl') : L('男の子', 'boy'));
export const genderWord = (g: Gender) => (g === 'X' ? L('その他', 'other') : g === 'F' ? L('女性', 'female') : L('男性', 'male'));
export const place = (p: Person) => p.city ?? L('村', 'the village');

export function eduLevel(p: Person): EduLevel {
  if (p.school.grad === 'done') return 5;
  if (p.school.uni === 'done') return 4;
  const y = p.school.years;
  return y >= 12 ? 3 : y >= 9 ? 2 : y >= 6 ? 1 : 0;
}

// 学校に通った年数。大学は専攻で4年か6年 (医学)、大学院は2年 (events/school.ts)
const uniLen = (p: Person) => (p.school.major === '医学' ? 6 : 4);
export const schoolYears = (p: Person): number => p.school.years
  + (p.school.uni === 'done' ? uniLen(p) : p.school.uni === 'studying' ? p.school.uniYears : 0)
  + (p.school.grad === 'done' ? 2 : p.school.grad === 'studying' ? p.school.uniYears : 0);
export const EDU_LABEL = isEn
  ? ['No schooling', 'Primary school', 'Middle school', 'High school', 'University', 'Graduate school']
  : ['学校に通えなかった', '小学校', '中学校', '高校', '大学', '大学院'];
