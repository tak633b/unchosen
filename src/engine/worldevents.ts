// 世界の大きな出来事 (戦争・飢饉・疫病・地震・事故・テロ・政変など)。1900〜2025年は実際の出来事の目録 (data/events/*.json)、
// 2026年から先は歴史の頻度で起きる、名前のない出来事。
// その年その国にいる人は、目録の「影響を受けた人の割合」の確率で巻き込まれる。巻き込まれなければ、ニュースとして一度だけ知る。
// 抽選は seed・年齢・出来事の id で決まる見せ方用の乱数 (crisis.ts の showRng) で引く。人生の乱数の並びは変えない。
// 死: 国連の生命表は1950年から。1950年からの戦争や飢饉の死は表に入っているので、死因の名前を付け替えるだけ。
// 1949年までは表に無いので、目録の死者の割合を、その年の死亡率に足す (excess)
import global from '../data/events/global.json';
import eastAsia from '../data/events/east-asia.json';
import southAsiaMideast from '../data/events/south-asia-mideast.json';
import europe from '../data/events/europe.json';
import africa from '../data/events/africa.json';
import americas from '../data/events/americas.json';
import { byCode } from './countries';
import { L } from '../i18n';
import { bump, log, place, yearOf, type Person, type Relative, type YearKind } from './person';
import { showRng } from './crisis';
import { causeName } from './causes';
import { yearly } from './events/common';
import type { Sex } from './lifetable';

export type EventType = 'war' | 'occupation' | 'genocide' | 'famine' | 'epidemic' | 'quake' | 'tsunami' | 'cyclone' | 'flood' | 'drought'
  | 'heat' | 'volcano' | 'fire' | 'accident' | 'nuclear' | 'terror' | 'coup' | 'revolution' | 'unrest' | 'finance' | 'transport';
// 亡くなった人の偏り。men: 兵士として戦った若い男性 / young: 1918年のかぜのように若い大人 / frail: 飢えと疫病で子どもと年寄り / all: みな同じ
export type Who = 'men' | 'young' | 'frail' | 'all';
export interface Texts { hit: string[]; near?: string[]; news: string[] }
export interface WorldEvent {
  id: string;
  type: EventType;
  countries: string[];          // ISO3。いまの国の区切りで (ソ連の出来事はロシア・ウクライナ…に分けて書く)
  years: [number, number];
  cities?: string[];            // 巻き込まれる街 (identity.json の日本語名と英語名)。あれば hit はその街の人の割合
  elsewhere?: number;           // cities のある出来事で、一覧に無い町や村 (city が null) の人が巻き込まれる割合
  hit: number;                  // 巻き込まれた人の割合 (期間の合計)。家を失った・逃げた・けがをした・職を失った・飢えた…
  kill?: number;                // 国の人口のうち亡くなった人の割合 (期間の合計)
  who?: Who;
  cause?: string;               // 亡くなったときの死因の名前 (causes.ts の CAUSE_EN にあるもの)
  age?: [number, number];       // 巻き込まれる年齢 (学童疎開・徴兵など)
  sex?: Sex;
  urban?: number;               // 街に住む人への倍率 (空襲は高く、飢饉は低い)
  poor?: number;                // 下位4割の家への倍率
  effect: { health?: number; happy?: number; wealth?: number; home?: boolean; job?: boolean };
  severity: number;             // 1〜5。ニュースに出す順
  kind?: YearKind;
  world?: boolean;              // 世界中のニュースになった出来事 (ほかの国の人にもニュースとして届く)
  newsAt?: number;              // ニュースの文が終わりの年のことを書いているとき (「1975年4月30日、サイゴンが陥落した」)、ニュースにする年
  ja: Texts;
  en: Texts;
  stat: [string, string];       // 脚注: 実際の数字
  src: string;
  rough?: boolean;              // 数字が不確か。控えめな値をとった
  faith?: string[];             // この宗教の人だけに起きる (ホロコースト・アルメニア人の虐殺・分離独立)。hit と kill はその人たちの中での割合
  // 召集 (戦争に行く)。die のある出来事は、hit が「年齢の内にいる人のうち召集された割合」になる。
  // 召集されるかどうかは一生に一度だけ決まり (体の弱い人・止められない仕事の人・免除された人は呼ばれない)、
  // 年齢に入った最初の年に呼ばれる。死は召集された人だけに起きる (主人公と家族。輪の人は kill の平均で)
  die?: number;                 // 召集された人のうち亡くなった割合 (戦争の期間の合計。病死を含む)
  wound?: number;               // 負傷した割合
  pow?: number;                 // 捕虜になった割合
  powDie?: number;              // 捕虜のうち、捕らわれている間に亡くなった割合 (省略は3%)
  back?: number;                // 捕虜が帰ってきた年 (省略は戦争の終わりの翌年)
  draft?: number;               // 徴兵の始まった年。それより前は志願した人 (decisions/history.json の印 volunteer) だけが行く
  home?: [string, string];      // 帰ってきたときの一行。省略すると兵の帰還の文
  labour?: boolean;             // 兵ではなく、労働に駆り出された (強制労働・徴用・人夫)
  exempt?: string[];            // 召集されない宗教 (ドイツ国防軍はユダヤ人を兵にしなかった)
}

export const CATALOG: WorldEvent[] = [global, eastAsia, southAsiaMideast, europe, africa, americas].flatMap((f) => (f as { events: WorldEvent[] }).events);
export const WPP_FROM = 1950;   // 国連の生命表の最初の年
export const FUTURE_FROM = 2026;
const NEAR = 3;                 // 巻き込まれる確率の何倍までを「間一髪」とするか
const NEWS_AGE = 6;

const byCountry = new Map<string, WorldEvent[]>();
for (const e of CATALOG) for (const c of e.countries) (byCountry.get(c) ?? byCountry.set(c, []).get(c)!).push(e);
const worldNews = CATALOG.filter((e) => e.world);

const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
const span = (e: WorldEvent) => e.years[1] - e.years[0] + 1;
const active = (e: WorldEvent, y: number) => y >= e.years[0] && y <= e.years[1];

// その国・その年に起きている出来事
export function eventsAt(code: string, year: number): WorldEvent[] {
  if (year >= FUTURE_FROM) return futureEvents(code, year);
  return (byCountry.get(code) ?? []).filter((e) => active(e, year));
}

const inCity = (e: WorldEvent, city: string | null) => !!city && !!e.cities?.includes(city);
const believes = (e: WorldEvent, faith: string | undefined) => !e.faith || (!!faith && e.faith.includes(faith));

// ---- 召集 -------------------------------------------------------------------
export const DRAFTS = CATALOG.filter((e) => e.die !== undefined);
// 召集された人がいた平均の年数。召集は戦争の間に少しずつ進むので、期間の半分あまり
const tour = (e: WorldEvent) => (span(e) + 1) / 2;
// 前線で死ぬのは若い兵が多い。35歳を過ぎた兵の多くは後方の部隊・守備隊・郷土の部隊に回された。
// ponytail: 国と戦争ごとの年齢別の戦死率は無いので、一つの形にしている。召集された人全体の平均はおよそ die のまま
const frontK = (age: number) => (age <= 25 ? 1.2 : age <= 30 ? 1 : age <= 35 ? 0.8 : 0.4);
// 呼ばれる体と立場かどうか。一生に一度だけ決まる (年ごとに引き直すと、長い戦争ほど誰もが呼ばれてしまう)
const fit = (e: WorldEvent, seed: number, who: number) => showRng(seed, who, hash(e.id) + 7)() < e.hit;
function callUp(e: WorldEvent, p: Person): boolean {
  if (e.exempt?.includes(p.religion)) return false;
  const v = p.recent['mark:volunteer'];
  if (v !== undefined && p.age - v <= 1) return true; // 志願した年か、その翌年に入営する
  if (e.draft !== undefined && yearOf(p) < e.draft) return false;
  return fit(e, p.seed, 0);
}

// この人が、この年に巻き込まれる確率
export function hitChance(e: WorldEvent, p: Person): number {
  if (e.age && (p.age < e.age[0] || p.age > e.age[1])) return 0;
  if (e.sex && p.sex !== e.sex) return 0;
  if (!believes(e, p.religion)) return 0;
  if (e.die !== undefined) return callUp(e, p) ? 0.95 : 0;
  // 宗教で分かれる出来事 (迫害・移送・追放) は、始まった年にその人たち全体に届く
  if (e.faith) return e.hit;
  // 街の一覧 (identity.json) は大きな街だけなので、一覧に無い町や村の人は「農村」(city が null) に入っている。
  // elsewhere はその人たちにだけ当てる (東京の人に東北の津波は来ない)
  const total = e.cities ? (inCity(e, p.city) ? e.hit : p.city ? 0 : e.elsewhere ?? 0) : e.hit;
  const k = (p.city ? e.urban ?? 1 : 1) * (p.familyP < 0.4 ? e.poor ?? 1 : 1);
  // 年齢で区切った出来事は、その年齢でいる年数で割る
  const years = e.age ? Math.min(span(e), e.age[1] - e.age[0] + 1) : span(e);
  return Math.min(0.95, yearly(Math.min(0.99, total * k), years));
}

const fill = (p: Person, s: string) => s.replaceAll('{place}', place(p)).replaceAll('{country}', byCode(p.country).name);
const pickText = (p: Person, list: string[] | undefined, salt: number) => (list?.length ? list[Math.floor(showRng(p.seed, p.age, salt + 1)() * list.length)] : undefined);
const say = (p: Person, e: WorldEvent, k: keyof Texts, salt: number) => {
  const ja = pickText(p, e.ja[k], salt), en = pickText(p, e.en[k], salt);
  return ja && en ? fill(p, L(ja, en)) : undefined;
};
const seen = (p: Person, e: WorldEvent) => p.recent[`ev:${e.id}`] !== undefined;

// 毎年、history() から呼ぶ
export function worldEvents(p: Person): void {
  const year = yearOf(p);
  if (year < WPP_FROM) service(p, year);
  const here = eventsAt(p.country, year);
  const news: [WorldEvent, 'near' | 'news'][] = [];
  for (const e of here) {
    if (p.recent[`evhit:${e.id}`] !== undefined) continue;
    const salt = hash(e.id);
    const u = showRng(p.seed, p.age, salt)();
    const h = hitChance(e, p);
    if (u < h) { strike(p, e, salt); continue; }
    // これから先の名前のない出来事は、大きなもの (大流行・大地震) だけをニュースにする (嵐と干ばつは毎年のようにあるので、巻き込まれた人にだけ書く)
    // 迫害された側の人には、隣人の目から書いたニュースを出さない
    if (seen(p, e) || p.age < NEWS_AGE || (e.faith && believes(e, p.religion)) || (year >= FUTURE_FROM && e.severity < 3) || (e.newsAt !== undefined && year !== e.newsAt)) continue;
    news.push([e, u < h * NEAR && e.ja.near?.length && (!e.cities || inCity(e, p.city)) ? 'near' : 'news']);
  }
  // 同じ種類の出来事がその年に自分の国にもあれば (2004年の津波)、世界のニュースは重ねない
  if (year < FUTURE_FROM) for (const e of worldNews) if (!active(e, year) || e.countries.includes(p.country) || seen(p, e) || p.age < NEWS_AGE || (e.newsAt !== undefined && year !== e.newsAt) || here.some((h) => h.type === e.type)) continue; else news.push([e, 'news']);
  // ニュースは1年に1つ、とても大きな出来事 (severity 4以上) が重なった年だけ2つまで
  news.sort(([a], [b]) => b.severity - a.severity || b.hit - a.hit);
  news.slice(0, 2).forEach(([e, how], i) => {
    if (i === 1 && e.severity < 4) return;
    const text = say(p, e, how, hash(e.id));
    if (!text) return;
    p.recent[`ev:${e.id}`] = p.age;
    log(p, text, how === 'near' ? e.kind ?? 'hard' : 'hard', how === 'near', L(...e.stat));
    if (how === 'near') bump(p, { happy: Math.round((e.effect.happy ?? -6) / 3) });
  });
}

// 巻き込まれた
function strike(p: Person, e: WorldEvent, salt: number): void {
  const text = say(p, e, 'hit', salt);
  if (!text) return;
  p.recent[`evhit:${e.id}`] = p.age;
  p.recent[`ev:${e.id}`] = p.age;
  log(p, text, e.kind ?? 'hard', true, L(...e.stat));
  const { health, happy, wealth, home, job } = e.effect;
  bump(p, { ...(health ? { health } : {}), ...(happy ? { happy } : {}) });
  if (wealth && p.wealth > 0) p.wealth *= 1 + wealth;
  // ponytail: ローンの残っている家は、失っても借金だけ残る計算が要るので、家はそのままにしている
  if (home && p.house && !p.mortgage) { p.house = false; p.homeValue = undefined; p.homeSince = undefined; }
  if (job && p.working && !p.retired && p.unemployed === 0) p.unemployed = 1;
  // 召集: 戦争の終わるまで (捕虜なら帰される年まで) 兵として過ごす。仕事と学校は止まる (school.ts の military)
  if (e.die !== undefined && !e.labour && p.military !== 'serving') { p.military = 'serving'; p.serviceEnd = 999; }
}

// ---- 戦地で: 負傷・捕虜・帰還。家族の召集と帰還 ----------------------------------------
const WOUND_JA = ['戦闘で負傷し、野戦病院に運ばれた。傷がふさがると、また前線に戻された。', '砲弾の破片を受け、何か月も病院の寝台で過ごした。傷あとは一生残った。'];
const WOUND_EN = ['Was wounded in battle and carried to a field hospital. Once the wound closed, it was back to the front.', 'Was hit by shell fragments and spent months in a hospital bed. The scars stayed for life.'];
const POW_JA = ['部隊ごと敵に囲まれ、捕虜になった。収容所で、いつ終わるとも知れない日々が始まった。'];
const POW_EN = ['The unit was surrounded and taken prisoner. In the camp began days with no end in sight.'];
const HOME_JA = ['戦争が終わり、家に帰った。迎えた家族は、痩せた姿にしばらく言葉が出なかった。', '戦争が終わり、復員した。帰ってみると、町の顔ぶれがずいぶん減っていた。'];
const HOME_EN = ['The war ended and the long road home ended too. The family stared for a while at how thin the soldier had become.', 'The war ended and the army let its men go. Back home, many familiar faces were missing.'];
const saidOf = (p: Person, ja: string[], en: string[], salt: number) => { const i = Math.floor(showRng(p.seed, p.age, salt)() * ja.length); return L(ja[i], en[i]); };
type Duty = 'front' | 'pow' | undefined;
const myDuty = (p: Person, e: WorldEvent): Duty => (p.recent[`evhit:${e.id}`] === undefined || p.recent[`home:${e.id}`] !== undefined ? undefined : p.recent[`pow:${e.id}`] !== undefined ? 'pow' : 'front');
const relKey = (r: Relative, e: WorldEvent) => `war:${r.id}:${e.id}`;
const relDuty = (p: Person, r: Relative, e: WorldEvent): Duty => (p.recent[relKey(r, e)] !== undefined && p.recent[`${relKey(r, e)}:home`] === undefined ? 'front' : undefined);

// 本人か連れ合いが、戦地か捕虜の収容所にいる (子どもは授からない。love.ts)
export const awayAtWar = (p: Person): boolean =>
  DRAFTS.some((e) => myDuty(p, e) !== undefined || (p.spouse !== undefined && relDuty(p, p.spouse, e) !== undefined));

function service(p: Person, year: number): void {
  for (const e of DRAFTS) {
    // 自分
    const duty = myDuty(p, e);
    if (duty) {
      const salt = hash(e.id);
      const end = duty === 'pow' ? e.back ?? e.years[1] + 1 : e.years[1] + 1;
      if (year >= end) {
        p.recent[`home:${e.id}`] = p.age;
        p.military = 'done';
        log(p, duty === 'pow' ? L(`${year}年、捕虜の収容所から解き放たれ、ようやく家に帰った。`, `In ${year} the prisoner of war camp let its captives go, and the long-awaited homecoming came at last.`) : e.home ? L(...e.home) : saidOf(p, HOME_JA, HOME_EN, salt + 3), 'family', true);
        bump(p, { happy: 8, bond: 4 });
      } else if (duty === 'front' && active(e, year)) {
        if (e.pow && showRng(p.seed, p.age, salt + 4)() < yearly(e.pow, tour(e))) {
          p.recent[`pow:${e.id}`] = p.age;
          log(p, saidOf(p, POW_JA, POW_EN, salt + 5), 'hard', true);
          bump(p, { health: -8, happy: -12 });
        } else if (e.wound && p.recent[`wound:${e.id}`] === undefined && showRng(p.seed, p.age, salt + 6)() < yearly(e.wound, tour(e))) {
          p.recent[`wound:${e.id}`] = p.age;
          log(p, saidOf(p, WOUND_JA, WOUND_EN, salt + 7), 'ill', true);
          bump(p, { health: -12, happy: -6 });
        }
      }
    }
    // 家族の男たち (父・きょうだい・連れ合い)。召集は自分と同じ割合で、一人に一度だけ決まる
    for (const [r, ja, en] of kinAtWar(p)) {
      const k = relKey(r, e);
      if (p.recent[k] === undefined) {
        if (!r.alive || e.exempt?.includes(p.religion) || !e.countries.includes(p.country) || !active(e, year) || (e.age && (r.age < e.age[0] || r.age > e.age[1])) || !fit(e, p.seed, 1000 + r.id!)) continue;
        p.recent[k] = p.age;
        log(p, e.labour ? L(`${ja}が労働に駆り出され、遠くへ連れていかれた。`, `${en} was taken away for forced labor.`) : L(`${ja}が召集され、戦地へ向かった。`, `${en} was called up and left for the front.`), 'hard', false, undefined, [r.id!]);
      } else if (relDuty(p, r, e) && year > e.years[1]) {
        p.recent[`${k}:home`] = p.age;
        if (r.alive) log(p, e.labour ? L(`${ja}が帰ってきた。`, `${en} came home.`) : L(`${ja}が戦地から帰ってきた。`, `${en} came home from the war.`), 'family', false, undefined, [r.id!]);
      }
    }
  }
}

function kinAtWar(p: Person): [Relative, string, string][] {
  const out: [Relative, string, string][] = [];
  if (p.father.id !== undefined) out.push([p.father, '父', 'Father']);
  for (const s of p.siblings) if (s.sex === 'M' && s.age >= 0 && s.id !== undefined) out.push([s, `${s.age > p.age ? '兄' : '弟'}の${s.name}`, `${s.age > p.age ? 'Older' : 'Younger'} brother ${s.name}`]);
  if (p.spouse?.sex === 'M' && p.spouse.id !== undefined) out.push([p.spouse, `${p.sex === 'F' ? '夫' : '連れ合い'}の${p.spouse.name}`, `${p.sex === 'F' ? 'Husband' : 'Partner'} ${p.spouse.name}`]);
  return out.filter(([r]) => r.sex === 'M');
}

// ---- 死 ---------------------------------------------------------------------
// 亡くなった人の偏り。人口全体で平均するとおよそ1になるよう置いた目安
// ponytail: 年齢構成は国と時代で違うが、一つの形で配っている
function whoK(who: Who | undefined, sex: Sex, age: number, only?: Sex): number {
  if (only && sex !== only) return 0; // 兵として召集された男性の死 (女性には起きない)
  switch (who) {
    case 'men': return sex === 'M' && age >= 18 && age <= 45 ? 3.5 : 0.4;
    case 'young': return age >= 15 && age <= 40 ? 2.2 : age < 5 || age >= 65 ? 1.2 : 0.5;
    case 'frail': return age < 5 || age >= 60 ? 2.5 : 0.6;
    default: return 1;
  }
}

// その年に、その国の出来事で亡くなる確率と、その死因。1950年より前は死亡率に足し (add)、1950年からは生命表の中の内訳
// duty を渡すと (主人公と家族)、召集のある出来事の死は召集された人だけに起きる。faith は宗教で分かれる出来事のため
export function eventHazard(code: string, year: number, sex: Sex, age: number, faith?: string, duty?: (e: WorldEvent) => Duty): { q: number; cause?: string } {
  let q = 0, cause: string | undefined, top = 0;
  for (const e of eventsAt(code, year)) {
    if (!e.kill || !e.cause || !believes(e, faith)) continue;
    const d = duty && e.die !== undefined ? duty(e) : 'none';
    const h = d === 'none' ? yearly(e.kill, span(e)) * whoK(e.who, sex, age, e.sex)
      : d === 'front' ? yearly(e.die!, tour(e)) * frontK(age) : d === 'pow' ? yearly(e.powDie ?? 0.03, tour(e)) : 0;
    q += h;
    if (h > top) { top = h; cause = e.cause; }
  }
  return { q: Math.min(0.5, q), cause };
}
export const excessQ = (code: string, year: number, sex: Sex, age: number): number => (year < WPP_FROM ? eventHazard(code, year, sex, age).q : 0);
// 主人公の分 (召集されたかどうか・宗教を見る)
const mine = (p: Person) => eventHazard(p.country, yearOf(p), p.sex, p.age, p.religion, (e) => myDuty(p, e));
export const myExcessQ = (p: Person): number => (yearOf(p) < WPP_FROM ? mine(p).q : 0);
export const myEventCause = (p: Person, u: number): string | undefined => { const h = mine(p); return h.cause && u < h.q ? causeName(h.cause) : undefined; };
// 家族の分。家族は主人公と同じ宗教として数える
const kins = (p: Person, r: Relative) => eventHazard(p.country, yearOf(p), r.sex, r.age, p.religion, (e) => relDuty(p, r, e));
export const kinExcessQ = (p: Person, r: Relative): number => (yearOf(p) < WPP_FROM ? kins(p, r).q : 0);
export const kinEventCause = (p: Person, r: Relative, u: number): string | undefined => { const h = kins(p, r); return h.cause && u < h.q ? causeName(h.cause) : undefined; };

// 死の抽選の値 u (< q) が、出来事の死の分に入っていれば、その死因
export function eventCause(code: string, year: number, sex: Sex, age: number, u: number): string | undefined {
  const h = eventHazard(code, year, sex, age);
  return h.cause && u < h.q ? causeName(h.cause) : undefined;
}

// ---- これから先 (2026年〜) ----------------------------------------------------------
// 名前のない出来事を、国と年だけで決める (同じ年に同じ国にいる人は、同じ出来事を生きる)。頻度は過去の出来事から:
// 世界的な大流行: 1900〜2025年に5回 (1918・1957・1968・2009・2020年) → 1年に4%
// 大きな地震: 地震の多い国で、死者100人を超える地震は国により5〜20年に1度 (EM-DAT の1950〜2020年。トルコ・イランは5年、日本は7年ほど)。ここでは控えめに20年に1度
// 台風・サイクロン・洪水: 被害の大きい国で5〜8年に1度 / 干ばつ: サヘル・アフリカの角・南部アフリカで6年に1度ほど
// 金融危機と不況は market.ts の景気の波 (phaseOf) が受け持つ
const QUAKE = ['JPN', 'TUR', 'IRN', 'CHL', 'PER', 'NPL', 'IDN', 'MEX', 'ITA', 'PAK', 'HTI', 'CHN', 'ECU', 'NZL', 'GTM', 'PHL', 'AFG', 'GRC', 'SLV', 'NIC', 'COL', 'TWN', 'MMR', 'IND', 'DZA', 'MAR', 'ALB', 'GEO', 'ARM', 'TJK', 'KGZ', 'PNG', 'SLB', 'CRI', 'BTN'];
const STORM = ['BGD', 'PHL', 'IND', 'MMR', 'VNM', 'HTI', 'USA', 'MOZ', 'MDG', 'JPN', 'CHN', 'FJI', 'SLB', 'HND', 'NIC', 'GTM', 'DOM', 'JAM', 'MEX', 'PAK', 'LKA', 'THA', 'KHM', 'LAO', 'NPL', 'NGA', 'MWI', 'ZWE', 'COM', 'TTO', 'SLV', 'BLZ', 'PNG', 'TLS', 'MUS', 'KOR', 'IDN', 'MYS'];
const DROUGHT = ['ETH', 'SOM', 'KEN', 'SDN', 'TCD', 'NER', 'MLI', 'BFA', 'MRT', 'SEN', 'DJI', 'ZWE', 'MWI', 'ZMB', 'MOZ', 'MDG', 'LSO', 'SWZ', 'NAM', 'BWA', 'AGO', 'AFG', 'GMB', 'UGA'];
const draw = (key: string) => showRng(hash(key), 0)();

function generic(id: string, type: EventType, codes: string[], y: number, o: Partial<WorldEvent> & Pick<WorldEvent, 'hit' | 'effect' | 'severity' | 'ja' | 'en' | 'stat'>): WorldEvent {
  return { id, type, countries: codes, years: [y, y], src: 'generic', ...o };
}

// 前の大流行から10年は次が来ない (同じ引きが続けて当たり、2年続けて「新しい感染症」になっていた)
const panMemo = new Map<number, boolean>();
function pandemicStarts(y: number): boolean {
  if (y < FUTURE_FROM) return false;
  let hit = panMemo.get(y);
  if (hit === undefined) {
    hit = draw(`PAN:${y}`) < 0.04;
    for (let k = 1; hit && k < 10; k++) if (pandemicStarts(y - k)) hit = false;
    panMemo.set(y, hit);
  }
  return hit;
}

export function futureEvents(code: string, year: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  // 大流行は世界中に同じ年に来て、2年続く
  const pandemic = [year, year - 1].find(pandemicStarts);
  if (pandemic !== undefined) out.push({ ...generic(`f-pandemic-${pandemic}`, 'epidemic', [code], pandemic, {
    hit: 0.12, kill: 0.001, cause: '流行病', who: 'frail', severity: 4, effect: { health: -4, happy: -6, job: true },
    ja: { hit: ['新しい感染症が世界に広がった。熱が何日も下がらず、治ったあとも長く息切れが残った。', '新しい感染症の流行で、店も職場も閉まった。その間に仕事がなくなった。'], news: ['新しい感染症が世界中に広がった。学校が閉まり、街から人が消えた。'] },
    en: { hit: ['A new infection swept the world. The fever lasted for days, and the breathlessness stayed long after.', 'A new epidemic closed shops and workplaces. By the time they reopened, the job was gone.'], news: ['A new infection spread across the world. Schools closed and the streets emptied.'] },
    stat: ['1900〜2025年に、世界的な大流行は5回あった (1918・1957・1968・2009・2020年)', 'Between 1900 and 2025 there were five global pandemics (1918, 1957, 1968, 2009, 2020)'],
  }), years: [pandemic, pandemic + 1] });
  if (QUAKE.includes(code) && draw(`EQ:${code}:${year}`) < 0.05) out.push(generic(`f-quake-${code}-${year}`, 'quake', [code], year, {
    hit: 0.004, urban: 1.5, severity: 3, effect: { health: -3, happy: -12, home: true, wealth: -0.15 },
    ja: { hit: ['大きな地震で家が崩れた。しばらくは避難所で寝起きした。'], near: ['夜中に大きな地震があった。棚が倒れ、外へ飛び出した。家は持ちこたえた。'], news: ['{country}で大きな地震があり、多くの家が崩れた。'] },
    en: { hit: ['A strong earthquake brought the house down. For a while home was a shelter.'], near: ['A strong earthquake struck in the night. The shelves came down and everyone ran outside, but the house held.'], news: ['A major earthquake struck {country}, and many homes collapsed.'] },
    stat: ['地震の多い国では、死者が100人を超える地震が5〜20年に1度起きてきた (EM-DAT)', 'In earthquake-prone countries, quakes killing more than 100 people have struck once every 5-20 years (EM-DAT)'],
  }));
  if (STORM.includes(code) && draw(`ST:${code}:${year}`) < 0.15 + 0.001 * (year - FUTURE_FROM)) out.push(generic(`f-storm-${code}-${year}`, 'cyclone', [code], year, {
    hit: 0.01, poor: 2, severity: 2, effect: { health: -2, happy: -10, home: true, wealth: -0.1 },
    ja: { hit: ['大雨と嵐で川があふれ、家が水につかった。泥をかき出すのにひと月かかった。'], near: ['嵐の夜、川の水が家の前まで来た。朝には引いていった。'], news: ['大きな嵐と洪水で、{country}の多くの人が家を追われた。'] },
    en: { hit: ['Storms and heavy rain burst the river banks and flooded the house. Shoveling out the mud took a month.'], near: ['On the night of the storm the river rose to the doorstep, and by morning it had gone down.'], news: ['A great storm and floods drove many people in {country} from their homes.'] },
    stat: ['暖まる気候で、強い台風・サイクロンの割合と大雨の起きる回数は増えている (IPCC 第6次評価報告書)', 'As the climate warms, the share of intense cyclones and the frequency of heavy rainfall are rising (IPCC AR6)'],
  }));
  if (DROUGHT.includes(code) && draw(`DR:${code}:${year}`) < 0.16) out.push(generic(`f-drought-${code}-${year}`, 'drought', [code], year, {
    hit: 0.08, urban: 0.3, poor: 2, severity: 2, effect: { health: -4, happy: -10, wealth: -0.2 },
    ja: { hit: ['雨が降らず、畑の作物が枯れた。家畜を売って食べ物を買った。'], news: ['日照りが続き、{country}の農村で食べ物が足りなくなった。'] },
    en: { hit: ['The rains failed and the crops withered in the fields. The animals were sold to buy food.'], news: ['A long drought left the countryside of {country} short of food.'] },
    stat: ['サヘルとアフリカの角では、1970年代から大きな干ばつが6年に1度ほど起きてきた', 'The Sahel and the Horn of Africa have seen a major drought roughly every six years since the 1970s'],
  }));
  return out;
}

// 目録の cause に書ける死因 (causes.ts の CAUSE_EN に英語名がある)
export const EVENT_CAUSES = ['戦争', '戦死', 'ホロコースト', '虐殺', '飢饉', 'インフルエンザ', 'COVID-19', '流行病', '災害', '事故'];
