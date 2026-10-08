// 出来事の「なぜ」: その人の人生で、その出来事を引き寄せた数字を一行で。
// stat が国全体の注釈なのに対し、why はこの人に効いた要因 (家の暮らし向き・年齢・国の確率) を書く
import type { Country } from './countries';
import { bornTable, MAX_AGE, type Sex } from './lifetable';
import { countryAt } from './countries';
import type { Person } from './person';
import { qAt } from './events/common';
import { L } from '../i18n';

// 直前の出来事に why を付ける
export function because(p: Person, why: string): void {
  const e = p.log[p.log.length - 1];
  if (e) e.why = why.charAt(0).toUpperCase() + why.slice(1); // 英語は小文字で始まる部品を先頭に置くことがある
}

const pct = (x: number) => (x >= 0.1 ? Math.round(x * 100).toString() : (x * 100).toFixed(x >= 0.01 ? 1 : 2));
const sexJa = (s: Sex) => (s === 'F' ? '女性' : '男性');
const sexEn = (s: Sex) => (s === 'F' ? 'women' : 'men');

export function homeWhy(p: Person, c: Country): string {
  const n = Math.round(p.familyP * 100);
  return n <= 50
    ? L(`生まれた家の暮らし向きは${c.name}の下から${Math.max(1, n)}%`, `the family was in the bottom ${Math.max(1, n)}% of ${c.name}`)
    : L(`生まれた家の暮らし向きは${c.name}の上から${Math.max(1, 100 - n)}%`, `the family was in the top ${Math.max(1, 100 - n)}% of ${c.name}`);
}

// 人が亡くなったとき。5歳未満は国の5歳未満死亡率、それ以外はその年齢・性別の1年の死亡率と平均寿命
export function deathWhy(c: Country, sex: Sex, age: number): string {
  if (age < 5) {
    const one = Math.max(2, Math.round(1 / c.u5mr));
    return L(`${c.name}では、子どものおよそ${one}人に1人が5歳までに亡くなる`, `In ${c.name}, about 1 child in ${one} dies before turning 5`);
  }
  // 平均寿命は子どもの死に引っぱられるので、大人には「その年まで生きる割合」で示す
  const q = pct(qAt(c, sex, age));
  const by = (c.year ?? new Date().getFullYear()) - age; // その人が生まれた年
  const reach = pct(bornTable(countryAt(c.code, by), sex, by).l[Math.min(age, MAX_AGE)]);
  return L(`${c.name}で生まれた${sexJa(sex)}のうち、${age}歳まで生きるのは約${reach}%。${age}歳の1年で亡くなる確率は約${q}%`,
    `Of ${sexEn(sex)} born in ${c.name}, about ${reach}% live to ${age}. At ${age}, the chance of dying within a year is about ${q}%`);
}

export const joinWhy = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(L('。', '; '));

// 学校を早く離れた理由。学校に通う年数は、国の平均・家の暮らし向き・農村か・女の子か で決まる (events/childhood.ts の startSchool)
export function schoolWhy(p: Person, c: Country): string {
  return joinWhy([
    homeWhy(p, c),
    L(`${c.name}の大人が学校に通った年数は平均${c.school.toFixed(1)}年`, `adults in ${c.name} spent ${c.school.toFixed(1)} years in school on average`),
    p.rural && L('農村で育った', 'grew up in the countryside'),
    p.sex === 'F' && c.gdp < 5000 && L('女の子は学校に行かせてもらいにくい', 'girls are less often kept in school'),
  ]);
}

// 出産での死。危険は国の妊産婦死亡率に、貧しい農村 (1.6倍)・豊か (0.5倍)・18歳未満 (2倍) をかけたもの (events/love.ts の giveBirth)
export function birthWhy(p: Person, c: Country, motherAge: number): string {
  return joinWhy([
    L(`${c.name}では出産のたびに、およそ${Math.max(1, Math.round(1e5 / c.mmr))}人に1人の母親が亡くなる`, `In ${c.name}, about 1 mother in ${Math.max(1, Math.round(1e5 / c.mmr))} dies with each birth`),
    p.familyP < 0.3 && p.rural && L('貧しい農村で、近くに病院がなかった', 'a poor rural home, far from a hospital'),
    motherAge < 18 && L(`母親はまだ${motherAge}歳だった`, `the mother was only ${motherAge}`),
  ]);
}

// 児童婚。貧しい家・農村ほど起きやすい (events/love.ts の childMarriage)。豊かな家なら、まれな側だったと書く
export function childMarriageWhy(p: Person, c: Country): string {
  if (p.familyP > 0.7) return L(`家は${c.name}の上から${Math.max(1, Math.round((1 - p.familyP) * 100))}%の暮らし向きで、こうした結婚はまれな側だった。それでも起きた`,
    `the family was in the top ${Math.max(1, Math.round((1 - p.familyP) * 100))}% of ${c.name}, where this is rare. It happened anyway`);
  return joinWhy([homeWhy(p, c), p.rural && L('農村で育った', 'grew up in the countryside')]);
}
