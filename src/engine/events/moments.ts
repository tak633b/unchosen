// 日常の小さな出来事 (src/data/moments.json) と、節目の生存率の記録。
import data from '../../data/moments.json';
import { petMoment } from '../pets';
import { bornTable } from '../lifetable';
import { countryAt } from '../countries';
import { bump, countryOf, log, place, yearOf, type Person, type Stats } from '../person';
import { techShare, type Tech } from '../tech';
import { pickWeighted } from '../rng';
import { isEn, L } from '../../i18n';
import { isPoor, isRich, scaleOf } from './common';
import { independent } from './money';
import { remember } from '../bonds';
import { because, deathWhy } from '../why';

type Wealth = 'poor' | 'middle' | 'rich';
type Income = 'low' | 'mid' | 'high';
const oneOf = <T>(want: T | T[], have: T) => (Array.isArray(want) ? want.includes(have) : want === have);

interface Moment {
  id: string;
  text: string;
  en?: { text: string; stat?: string };
  minAge: number;
  maxAge: number;
  weight: number;
  when?: {
    place?: 'rural' | 'urban';
    wealth?: Wealth | Wealth[];
    income?: Income | Income[];
    region?: string[];
    countries?: string[];
    religion?: string[];
    state?: 'school' | 'work' | 'retired' | 'child';
    sex?: 'F' | 'M';
    married?: boolean;
    hasChildren?: boolean;
    hasPet?: boolean;
    migrated?: boolean;
    youngChild?: boolean;
    parentAlive?: boolean;
    fatherAlive?: boolean;
    motherAlive?: boolean;
    sibling?: 'olderBrother' | 'olderSister' | 'younger'; // 文に出てくるきょうだいがいるときだけ
    teenChild?: boolean;
    livingAlone?: boolean;
    job?: 'office' | 'manual' | 'farm' | 'none';
  };
  effects?: Partial<Stats>;
  cost?: number;
  stat?: string;
  once?: boolean;
  tech?: Tech[];     // 要る道具。その国その年の普及率に比例して出やすくなる
  from?: number;     // 出てよい暦年の範囲
  to?: number;
}

const MOMENTS = (data as { moments: Moment[] }).moments;
const REPEAT_GAP = 6; // 同じ出来事は6年は繰り返さない

function stateOf(p: Person): 'school' | 'work' | 'retired' | 'child' | null {
  if (p.retired) return 'retired';
  if (p.school.enrolled || p.school.uni === 'studying' || p.school.grad === 'studying') return 'school';
  if (p.working) return 'work';
  return p.age < 6 ? 'child' : null;
}

function matches(p: Person, m: Moment): boolean {
  if (p.age < m.minAge || p.age > m.maxAge) return false;
  const year = yearOf(p);
  if ((m.from !== undefined && year < m.from) || (m.to !== undefined && year > m.to)) return false;
  const last = p.recent[m.id];
  if (last !== undefined && (m.once || p.age - last < REPEAT_GAP)) return false;
  const w = m.when;
  if (!w) return true;
  const c = countryOf(p);
  if (w.place && (w.place === 'rural') !== (p.city === null)) return false;
  if (w.wealth && !oneOf<Wealth>(w.wealth, isPoor(p) ? 'poor' : isRich(p) ? 'rich' : 'middle')) return false;
  if (w.income && !oneOf<Income>(w.income, c.gdp < 5000 ? 'low' : c.gdp <= 25000 ? 'mid' : 'high')) return false;
  if (w.region && !w.region.includes(c.region)) return false;
  if (w.countries && !w.countries.includes(c.code)) return false;
  if (w.religion && !w.religion.includes(p.religion)) return false;
  if (w.state && w.state !== stateOf(p)) return false;
  if (w.sex && w.sex !== p.sex) return false;
  if (w.married !== undefined && w.married !== !!p.spouse?.alive) return false;
  if (w.hasChildren && !p.children.some((k) => k.alive)) return false;
  if (w.hasPet && !p.pet) return false;
  if (w.migrated !== undefined && w.migrated !== !!p.migratedTo) return false;
  if (w.youngChild && !p.children.some((k) => k.alive && k.age < 4)) return false;
  if (w.parentAlive && !p.mother.alive && !p.father.alive) return false;
  if (w.fatherAlive && !p.father.alive) return false;
  if (w.motherAlive && !p.mother.alive) return false;
  if (w.sibling && !p.siblings.some((b) => b.alive && (w.sibling === 'younger' ? b.age >= 0 && b.age < p.age : b.age > p.age && b.sex === (w.sibling === 'olderBrother' ? 'M' : 'F')))) return false;
  if (w.teenChild && !p.children.some((k) => k.alive && k.age >= 13 && k.age <= 19)) return false;
  if (w.livingAlone && !(p.working && p.age >= 18 && !p.spouse?.alive)) return false;
  if (w.job && w.job !== (p.working && !p.retired && p.unemployed === 0 ? p.jobKind ?? 'manual' : 'none')) return false;
  return true;
}

const fill = (p: Person, text: string) => text
  .replaceAll('{name}', p.given)
  .replaceAll('{city}', place(p))
  .replaceAll('{country}', countryOf(p).name)
  .replaceAll('{friend}', p.friend ?? L('幼なじみ', 'a childhood friend'))
  .replaceAll('{pet}', p.pet?.name ?? '');

const textOf = (m: Moment) => (isEn ? m.en?.text ?? m.text : m.text);
// 注釈の統計は、その数字の年が出来事の年から15年以上離れていたら出さない (1965年の出来事に「2023年に世界で…」は添えない)
const STAT_SPAN = 15;
const statOf = (m: Moment, year: number) => {
  const s = isEn ? m.en?.stat ?? m.stat : m.stat;
  const y = Number(s?.match(/(?:19|20)\d\d(?!.*(?:19|20)\d\d)/)?.[0]);
  return s && (!y || Math.abs(year - y) <= STAT_SPAN) ? s : undefined;
};
// その出来事に要る道具が、この人の暮らしにどれだけありそうか (0–1)
const techWeight = (p: Person, m: Moment) => (m.tech ?? []).reduce((w, t) => w * techShare(countryOf(p), t, p.city === null), 1);

const FRIEND_DIES = 'old-friend-dies'; // 友だちの死を語る出来事。輪の上でも亡くなったことにする

// 1年に1〜3つ。土地や暮らしに合う出来事ほど選ばれやすい
export function moments(p: Person): void {
  // {friend} の出来事は、その友だちが生きているときだけ (亡くなった友だちと出かける話を出さない)
  const friend = (p.ties ?? []).find((t) => t.role === 'friend' && t.name === p.friend);
  const pool = MOMENTS.filter((m) => matches(p, m) && (!textOf(m).includes('{pet}') || p.pet) && (!textOf(m).includes('{friend}') || (p.friend && friend?.alive !== false)) && techWeight(p, m) > 0.005);
  const n = 1 + (p.rng() < 0.6 ? 1 : 0) + (p.rng() < 0.25 ? 1 : 0);
  for (let i = 0; i < n && pool.length; i++) {
    const m = pickWeighted(p.rng, pool, (x) => x.weight * (x.when ? 1.8 : 1) * techWeight(p, x));
    pool.splice(pool.indexOf(m), 1);
    p.recent[m.id] = p.age;
    const text = fill(p, textOf(m));
    // 子どもの出来事のお金は親の家計の話なので、本人の財布は動かさない
    if (m.cost && independent(p)) p.wealth += scaleOf(p) * m.cost;
    if (m.effects) bump(p, m.effects);
    // 同じ統計の注釈は一生に一度だけ
    const stat = m.stat && p.recent[`stat:${m.id}`] === undefined ? statOf(m, yearOf(p)) : undefined;
    if (stat) p.recent[`stat:${m.id}`] = p.age;
    log(p, text, m.cost && m.cost < -0.08 ? 'hard' : p.kinds[p.age] ?? 'family', false, stat);
    p.log[p.log.length - 1].tpl = true; // 用意した文から選んだもの (AI の出来事が届いた年は減らす)
    if (textOf(m).includes('{pet}')) petMoment(p, text); // ペットとの出来事は、ペットの記録にも残す
    const f = textOf(m).includes('{friend}') ? friend : undefined;
    if (f) { p.log[p.log.length - 1].who = [f.id!]; remember(p, f, text, 1, 'moment'); }
    if (f && m.id === FRIEND_DIES) { f.alive = false; f.diedAt = p.age; because(p, deathWhy(countryOf(p), f.sex, f.age));
      for (let j = pool.length - 1; j >= 0; j--) if (textOf(pool[j]).includes('{friend}')) pool.splice(j, 1);
    }
  }
}

// 1・5・15・30・50・65・80歳に、同じ年に生まれた人がどれだけ生きているかを記す
const MILESTONES = [1, 5, 15, 30, 50, 65, 80];
export function milestone(p: Person): void {
  if (!MILESTONES.includes(p.age)) return;
  // 同じ年・同じ国に生まれた人たちが、その後の各暦年の死亡率で生きた場合
  const born = countryAt(p.birthCountry, p.birthYear);
  const alive = bornTable(born, p.sex, p.birthYear).l[p.age];
  const u5 = 1 - bornTable(born, p.sex, p.birthYear).l[5];
  const who = p.gender === 'X' ? L('子ども', 'children') : p.sex === 'F' ? L('女の子', 'girls') : L('男の子', 'boys');
  const text = isEn
    ? (p.age === 5
      ? `Fifth birthday. About ${(u5 * 100).toFixed(1)}% of children born in ${born.name} die before age 5. This child made it past that point.`
      : `Age ${p.age}. Of the ${who} born in ${born.name} the same year, about ${Math.round(alive * 100)}% are still alive.`)
    : (p.age === 5
      ? `5歳の誕生日。${born.name}で生まれた子どものおよそ${(u5 * 100).toFixed(1)}%は、5歳になる前に亡くなる。この子はその時期を越えた。`
      : `${p.age}歳。同じ年に${born.name}で生まれた${who}のうち、約${Math.round(alive * 100)}%が今も生きている。`);
  log(p, text, p.kinds[p.age] ?? 'child');
}
