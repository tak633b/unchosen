// 年金の決まり: 受け取り始める年齢、早めに受け取る道 (減額と、必要な加入年数)、年金の上限。
// 表に無い国は、これまでどおり60歳から引退を考え、65歳ごろに引退する (work.ts)
import { L } from '../i18n';
import type { Country } from './countries';
import { yearOf, type Person } from './person';
import { clamp } from './rng';

export interface Early { age: number; cut: number; years: number; why: string } // why: 早めに受け取れる理由 (カードに出す)
export interface Rule { age: number; early?: Early; minYears: number; stay: number; claim: number }

// 年金に入っていた (正規で働いた) 年数。数え始める前の古いセーブは、22歳から働いてきたとみなす
export const contribOf = (p: Person): number => p.contrib ?? Math.max(0, p.age - 22);

const lerp = (b: number, b0: number, a0: number, b1: number, a1: number) => Math.round(a0 + (a1 - a0) * clamp((b - b0) / (b1 - b0), 0, 1));
const reduction = (monthsEarly: number, perMonth: number) => Math.min(monthsEarly * perMonth, 0.5);

// stay: 年金の年齢を過ぎても働き続ける割合の目安 (OECD 65〜69歳の就業率 2022: 日本52%・韓国52%・米国32%・英国23%・ドイツ19%・イタリア13%・スペイン9%・フランス8%)。
// claim: 早めに受け取れる人のうち、実際にそうする人の目安
//   米国: 62歳で受け取り始める人は新しい受給者の約4分の1 (SSA Annual Statistical Supplement 2023)
//   ドイツ: 45年加入で63歳から減額なしの年金 (「63歳からの年金」) は新しい老齢年金の約4分の1 (ドイツ年金保険 2023)
//   フランス: 長いキャリアの早期退職 (carrière longue) は新しい退職者の約2割 (DREES 2023)
//   日本: 繰上げ受給は新しく受け取る人の1割強 (厚生労働省 年金制度基礎調査 2022)
export function pensionRule(p: Person, c: Country): Rule {
  const b = p.birthYear, y = yearOf(p), yrs = contribOf(p), M = p.sex === 'M';
  switch (c.code) {
    case 'USA': {
      // 満額の年齢は1937年生まれまで65歳、1943〜54年生まれ66歳、1960年生まれから67歳。
      // 62歳から早めに受け取れ、36か月までは月5/9%、それより前は月5/12%減る (社会保障法 §202(q)、SSA)。10年 (40クレジット) の加入が要る
      const age = b <= 1937 ? 65 : b <= 1942 ? 65 : b <= 1954 ? 66 : b <= 1959 ? 66 : 67;
      const m = (age - 62) * 12;
      return { age, minYears: 10, stay: 0.4, claim: 0.3, early: y >= 1961 ? { age: 62, years: 10, cut: Math.min(36, m) * 5 / 900 + Math.max(0, m - 36) * 5 / 1200, why: L('米国では62歳から、減額された年金を受け取れる', 'In the US, a reduced pension can start at 62') } : undefined };
    }
    case 'DEU': {
      // 標準の年齢は1946年生まれまで65歳、1964年生まれから67歳 (社会法典第6編 §35・§235)。
      // 35年加入なら63歳から月0.3%減で (§36)、45年加入なら2014年から63歳で減額なし (§236b。1953年生まれから2か月ずつ上がり、1964年生まれは65歳)
      const age = lerp(b, 1946, 65, 1964, 67);
      if (yrs >= 45 && y >= 2014) return { age, minYears: 5, stay: 0.2, claim: 0.6, early: { age: lerp(b, 1952, 63, 1964, 65), years: 45, cut: 0, why: L('45年加入した人は、減額なしで早めに受け取れる', 'After 45 years of contributions, the pension can start early without a cut') } };
      return { age, minYears: 5, stay: 0.2, claim: 0.35, early: y >= 1972 ? { age: 63, years: 35, cut: reduction((age - 63) * 12, 0.003), why: L('35年加入した人は63歳から、月0.3%減で受け取れる', 'After 35 years of contributions, the pension can start at 63, 0.3% less per month early') } : undefined };
    }
    case 'FRA': {
      // 法定の年齢は1983年から60歳、2010年の改革で1955年生まれから62歳、2023年の改革で1968年生まれから64歳。
      // 20歳より前に働き始め、加入期間が足りる人は2004年から60歳で引退できる (carrière longue)
      const age = y < 1983 ? 65 : b <= 1950 ? 60 : b <= 1955 ? lerp(b, 1950, 60, 1955, 62) : b <= 1960 ? 62 : lerp(b, 1960, 62, 1968, 64);
      const start = p.age - yrs;
      // ponytail: 16歳より前に働き始めた人の58歳からの道は入れていない (その世代ではまれ)
      const early = y >= 2004 && yrs >= 41 && start < 20 ? 60 : undefined;
      return { age, minYears: 1, stay: 0.08, claim: 0.6, early: early !== undefined && early < age ? { age: early, years: 41, cut: 0, why: L('20歳より前から働き、加入期間が足りる人は早く引退できる (長いキャリアの早期退職)', 'Those who started work before 20 and have enough quarters can retire early (long-career retirement)') } : undefined };
    }
    case 'ITA': {
      // 老齢年金は2012年から66歳、2019年から67歳 (それまで男性65歳・女性60歳)。
      // 加入が男性42年10か月・女性41年10か月あれば年齢によらず受け取れる (pensione anticipata、2012年のフォルネーロ改革。それまでは40年)
      const age = y < 2012 ? (M ? 65 : 60) : y < 2019 ? 66 : 67;
      const need = y < 2012 ? 40 : M ? 43 : 42;
      return { age, minYears: 20, stay: 0.13, claim: 0.6, early: yrs >= need && p.age < age ? { age: p.age, years: need, cut: 0, why: L(`加入${need}年で、年齢によらず受け取れる`, `After ${need} years of contributions, the pension can start at any age`) } : undefined };
    }
    case 'ESP': {
      // 年金の年齢は2012年まで65歳、2013年から2027年にかけて67歳へ (法律27/2011)。
      // 35年加入なら2年早く受け取れ、早めた分は減る (2013年からおよそ年7%。王令法5/2013)
      const age = y <= 2012 ? 65 : lerp(y, 2012, 65, 2027, 67);
      return { age, minYears: 15, stay: 0.09, claim: 0.35, early: y >= 2013 ? { age: age - 2, years: 35, cut: 0.14, why: L('35年加入した人は2年早く受け取れるが、そのぶん年金は減る', 'After 35 years of contributions, the pension can start two years early, at a lower rate') } : undefined };
    }
    case 'JPN': {
      // 老齢基礎年金は65歳から。厚生年金の支給開始は男性1941年生まれまで60歳、1961年生まれから65歳 (女性は5年遅れ)。
      // 60歳から繰り上げて受け取れ、1か月につき0.5% (2022年4月から0.4%) 減る。加入10年 (2017年8月まで25年) が要る
      const age = M ? lerp(b, 1941, 60, 1961, 65) : lerp(b, 1946, 60, 1966, 65);
      const per = y >= 2022 ? 0.004 : 0.005;
      // 2013年から会社は65歳まで雇い続けることが義務 (高年齢者雇用安定法)。65歳より前の年金の年齢では7割5分が働き続ける (60〜64歳の就業率 74%、2022)
      return { age, minYears: y >= 2017 ? 10 : 25, stay: age < 65 ? 0.75 : 0.5, claim: 0.15, early: age > 60 ? { age: 60, years: 10, cut: reduction((age - 60) * 12, per), why: L(`60歳から繰り上げて受け取れる。1か月早めるごとに${per * 100}%減る`, `The pension can start from 60, ${per * 100}% less for each month early`) } : undefined };
    }
    case 'KOR': {
      // 国民年金 (1988年〜) は1952年生まれまで60歳、1953〜56年61歳・57〜60年62歳・61〜64年63歳・65〜68年64歳・1969年から65歳。
      // 5年早く受け取れ、1年につき6%減る (国民年金法 §61・§63)。加入10年が要る
      const age = b <= 1952 ? 60 : b <= 1956 ? 61 : b <= 1960 ? 62 : b <= 1964 ? 63 : b <= 1968 ? 64 : 65;
      return { age, minYears: 10, stay: 0.5, claim: 0.15, early: y >= 1998 ? { age: age - 5, years: 10, cut: 0.3, why: L('5年早く受け取れるが、1年につき6%減る', 'The pension can start five years early, 6% less for each year') } : undefined };
    }
    case 'GBR':
      // 国の年金の年齢は男性65歳・女性60歳 (2010年から女性を引き上げ、2018年に65歳でそろう)、1954〜60年生まれ66歳、1961年生まれから67歳 (年金法 1995・2011・2014)。早めの受け取りはない
      return { age: b <= 1950 ? (M ? 65 : 60) : b <= 1953 ? 65 : b <= 1960 ? 66 : 67, minYears: 10, stay: 0.23, claim: 0 };
    case 'RUS':
      // 男性60歳・女性55歳。2019年から5年かけて男性65歳・女性60歳へ (連邦法 350-FZ)
      return { age: M ? 60 + clamp(b - 1958, 0, 5) : 55 + clamp(b - 1963, 0, 5), minYears: 15, stay: 0.2, claim: 0 };
    case 'CHN':
      // 男性60歳・女性50歳 (事務の職は55歳)。2025年から15年かけて男性63歳・女性55歳と58歳へ (全国人民代表大会常務委員会 2024)
      return { age: Math.round(M ? 60 + 3 * clamp((y - 2025) / 15, 0, 1) : p.jobKind === 'office' ? 55 + 3 * clamp((y - 2025) / 15, 0, 1) : 50 + 5 * clamp((y - 2025) / 15, 0, 1)), minYears: 15, stay: 0.2, claim: 0 };
    default:
      return { age: 60, minYears: 10, stay: 0.7, claim: 0 };
  }
}

// 年金の上限: 保険料をかける給料の上限を、その国の給料の中央値の何倍かで (この先は稼いでも年金は増えない)。
// 米国 年16万8,600ドル (2024年の課税上限、SSA)・ドイツ 年9万600ユーロ (2024年の保険料算定上限)・日本 標準報酬月額65万円と賞与 (厚生年金)・
// 韓国 基準所得月額617万ウォン (2024年7月から)・ロシア 年222万5,000ルーブル (2024年の保険料算定上限)。中央値はOECD・各国統計の常勤の給料の目安
export const PENSION_CAP: Record<string, number> = { USA: 2.9, DEU: 2.0, JPN: 2.0, KOR: 1.9, RUS: 3.7 };
