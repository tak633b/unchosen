// 仕事の道の先: プロのスポーツと代表、舞台の踊り手、遠洋の漁船、自分の会社、士官学校と宇宙、資格、夢の仕事、
// そして年をとってから仕事を離れる理由と、職ごとの定年。
import { L } from '../../i18n';
import type { Country } from '../countries';
import { earnings, formatMoney, yen } from '../economy';
import { jobName } from '../jobs';
import { bump, countryOf, decide, eduLevel, log, type Person, yearOf } from '../person';
import { clamp, normal } from '../rng';
import { inDreamJob, talent } from '../talent';
import { scaleOf } from './common';
import { layoffK } from '../market';
import { showRng } from '../crisis';

// 決まった仕事に就く (求人の中から選ぶのではなく、道の先で就くもの)
function assignJob(p: Person, name: string, kind: 'office' | 'manual', pos: number): void {
  p.working = true;
  p.unemployed = 0;
  p.job = name;
  p.jobKind = kind;
  p.selfEmployed = false;
  p.jobYears = 0;
  p.incomeP = clamp(pos, 0.01, 0.99);
  p.formal = true;
  log(p, L(`${name}として働き始めた。年収 ${formatMoney(earnings(countryOf(p), p.incomeP))}。`, `Started work as: ${jobName(name)}. ${formatMoney(earnings(countryOf(p), p.incomeP))} a year.`), 'work', true);
}

const base = (p: Person) => p.job?.replace('(リーダー)', '') ?? '';
export const DEEP_SEA = '遠洋漁業の船員';
// 遠洋の漁船員が仕事中の事故で亡くなる確率 (年)。米国の漁業の死亡災害は10万人あたり年132人 (BLS 2022) で、全職業平均の約35倍
export const DEEP_SEA_RISK = 0.0013;

// ---- 毎年 (work の中で、働いている年に呼ぶ) ----------------------------------------------------

export function career(p: Person): void {
  const job = base(p);
  if (job === 'プロのスポーツ選手') athlete(p);
  if (job === '舞踊団のダンサー' && p.age >= 33 && (p.rng() < 0.25 || p.age >= 38)) {
    p.job = '舞踊の講師';
    p.incomeP = clamp(p.incomeP - 0.05, 0.01, 0.99);
    log(p, L('舞台を降り、踊りを教える側にまわった。', 'Stepped off the stage and began teaching dance.'), 'work', true);
  }
  if (job === '空軍のパイロット' && p.age >= 30 && p.age <= 45 && p.rng() < 0.002) {
    // 宇宙へ行った人は、これまでに世界で600人ほど。多くは空軍のテストパイロットの出身
    p.job = '宇宙飛行士';
    log(p, L('宇宙飛行士の候補に選ばれた。', 'Was selected as an astronaut candidate.'), 'work', true);
    bump(p, { happy: 10 });
  }
  if (job === DEEP_SEA) {
    // 何か月も海の上。家族とはほとんど会えない
    if (p.jobYears === 1) log(p, L('漁船で何か月も海に出たきり、家に戻れるのは年に数週間だけになった。', 'Out at sea for months on end; home only a few weeks a year.'), 'work');
    bump(p, { bond: -2, happy: -1 });
    if (p.spouse?.alive) p.spouse.bond = clamp((p.spouse.bond ?? 50) - 2, 0, 100);
  }
  // 子どものころの夢の仕事なら、少しだけ幸せ
  if (inDreamJob(p)) bump(p, { happy: 1 });
  if (p.business) businessYear(p);
  athleteOffer(p);
  certOffer(p);
  businessOffer(p);
  familyShop(p);
}

// ---- スポーツ -------------------------------------------------------------------------

// 体の向きが上位1%ほどの若者に、プロから声がかかることがある
function athleteOffer(p: Person): void {
  if (p.age < 17 || p.age > 21 || p.recent.pro !== undefined || talent(p, 'body') < 2.3 || p.rng() > 0.1) return;
  p.recent.pro = p.age;
  decide(p, {
    title: L('プロのチームから声がかかった', 'A pro team calls'),
    text: L('試合を見ていたスカウトが、うちでプレーしないかと言ってきた。', 'A scout who watched a game asked whether you would play for the team.'),
    stat: L('プロのスポーツ選手として食べていける人は、どの国でも同世代の千人に1人もいない', 'In any country, fewer than 1 in 1,000 people make a living as a professional athlete'),
    options: [
      { label: L('プロになる', 'Turn pro'), hint: L('30代で引退する世界', 'Most careers end in the 30s'), apply: (q) => assignJob(q, 'プロのスポーツ選手', 'manual', 0.5 + talent(q, 'body') * 0.08 + normal(q.rng, 0, 0.1)) },
      { label: L('今の道を続ける', 'Stay the course'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.4 ? 0 : 1),
  });
}

function athlete(p: Person): void {
  const z = talent(p, 'body');
  if (!p.national && p.age <= 32 && p.rng() < 0.05 * (z - 1.5)) {
    p.national = true;
    log(p, L('国の代表に選ばれた。', 'Was picked for the national team.'), 'work', true);
    bump(p, { happy: 8 });
  }
  if (p.age < 31 || (p.rng() >= 0.2 && p.age < 37)) return;
  // 現役を退く。代表だった人は、まれに代表チームを率いる側になる
  p.job = 'スポーツの指導者';
  p.incomeP = clamp(p.incomeP - 0.1, 0.01, 0.99);
  if (p.national && p.rng() < 0.15) {
    log(p, L('現役を退いたあと、代表チームのコーチに招かれた。', 'After retiring as a player, was invited to coach the national team.'), 'work', true);
    bump(p, { happy: 6 });
  } else {
    log(p, L('現役を退き、若い選手を教える指導者になった。', 'Retired as a player and became a coach for young athletes.'), 'work', true);
  }
}

// ---- 資格 -----------------------------------------------------------------------------

// 夜や週末の資格講座。3年のあいだ、昇進が少しだけしやすくなる (work.ts)
function certOffer(p: Person): void {
  if (p.selfEmployed || p.age < 25 || p.age > 50 || eduLevel(p) < 2 || (p.certUntil ?? -99) + 7 > p.age || p.rng() > 0.015) return;
  const cost = scaleOf(p) * 0.05;
  decide(p, {
    title: L('資格の講座に通う？', 'Take a certificate course?'),
    text: L(`仕事に役立つ資格の講座がある。費用は${yen(cost)}ほどで、夜と週末がつぶれる。`, `There is a course for a certificate useful at work. About ${yen(cost)}, and it eats evenings and weekends.`),
    options: [
      {
        label: L('通う', 'Enroll'), hint: L('しばらく昇進に少し有利', 'A small edge for promotion for a while'),
        apply: (q) => { q.wealth -= cost; q.certUntil = q.age + 3; bump(q, { health: -1, learn: 2 }); log(q, L('仕事のあとに講座に通い、資格をとった。', 'Studied after work and earned the certificate.'), 'work'); },
      },
      { label: L('通わない', 'Skip it'), apply: (q) => { q.certUntil = q.age - 4; } },
    ],
    auto: (q) => (q.rng() < 0.35 ? 0 : 1),
  });
}

// ---- 自分の会社 -------------------------------------------------------------------------

function businessOffer(p: Person): void {
  if (p.business || p.selfEmployed || p.age < 28 || p.age > 50 || p.wealth < scaleOf(p) || p.rng() > 0.008) return;
  const cost = scaleOf(p) * 0.5;
  decide(p, {
    title: L('自分で会社を始める？', 'Start your own company?'),
    text: L(`今の仕事で覚えたことを元手に、小さな会社を始められそうだ。はじめに${yen(cost)}ほどかかる。`, `What was learned on the job could be the start of a small company. About ${yen(cost)} to get going.`),
    stat: L('米国では新しい事業のおよそ2割が1年以内に、半分が5年以内に閉じる (米国労働統計局)', 'In the US, about 20% of new businesses close within a year and about half within five (US Bureau of Labor Statistics)'),
    options: [
      {
        label: L('始める', 'Start it'), hint: L('半分は5年もたない', 'Half fail within five years'),
        apply: (q) => {
          q.wealth -= cost;
          q.business = true;
          q.selfEmployed = true;
          q.job = '自分の会社の経営者';
          q.jobKind = 'office';
          q.jobYears = 0;
          q.incomeP = clamp(q.incomeP + normal(q.rng, 0.05, 0.15), 0.01, 0.99);
          log(q, L('小さな会社を立ち上げた。', 'Started a small company.'), 'work', true);
        },
      },
      { label: L('雇われて働き続ける', 'Keep the job'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.3 ? 0 : 1),
  });
}

function businessYear(p: Person): void {
  // 5年もたない会社が半分: 年に13%ずつ閉じる (1 - 0.5^(1/5))
  if (p.jobYears <= 5 && p.rng() < 0.13) {
    p.business = false;
    p.selfEmployed = false;
    p.wealth -= scaleOf(p) * 0.5;
    p.unemployed = 1;
    log(p, L('会社がうまくいかず、たたむことになった。', 'The company did not make it and had to close.'), 'hard', true);
    bump(p, { happy: -8 });
    return;
  }
  // 根づいた商売にも、客が離れる年がある。景気の悪い年 (market.ts の SHOCKS) ほど多い
  if (p.jobYears > 5 && p.rng() < 0.03 * layoffK(p)) hardYear(p);
}

function hardYear(p: Person): void {
  const loan = scaleOf(p) * 0.3;
  decide(p, {
    title: L('客が減った', 'Customers are falling away'),
    text: L('売り上げが落ち、このままでは持たない。', 'Sales have dropped. This cannot go on.'),
    options: [
      { label: L('規模を縮小して持ちこたえる', 'Scale back and hold on'),
        apply: (q) => { q.incomeP = clamp(q.incomeP - 0.1, 0.01, 0.99); log(q, L('人と仕入れを減らした。稼ぎは減ったが、峠は越えられそうだ。', 'Cut staff and stock. Less coming in, but it looked like the worst could be weathered.'), 'work'); bump(q, { happy: -3 }); } },
      { label: L('借金をして踏ん張る', 'Borrow and push through'), hint: L('うまくいけば取り戻せる', 'Could win it all back'),
        apply: (q) => {
          q.wealth -= loan;
          if (q.rng() < 0.5) { q.incomeP = clamp(q.incomeP + 0.05, 0.01, 0.99); log(q, L(`${yen(loan)}を借りて店を立て直した。次の年、客が戻ってきた。`, `Borrowed ${yen(loan)} to rebuild. The next year, the customers came back.`), 'work', true); bump(q, { happy: 6 }); }
          else { q.business = false; q.selfEmployed = false; q.unemployed = 1; log(q, L(`${yen(loan)}を借りて踏ん張ったが、客は戻らなかった。店をたたみ、借金が残った。`, `Borrowed ${yen(loan)} and held on, but the customers never came back. Closed up, with the debt still owed.`), 'hard', true); bump(q, { happy: -10 }); }
        } },
      { label: L('たたむ', 'Close it'),
        apply: (q) => { q.business = false; q.selfEmployed = false; q.unemployed = 1; log(q, L('長く続けた店を閉めた。最後の日、常連の客が花を持ってきた。', 'Closed the business after many years. On the last day, a regular came with flowers.'), 'hard', true); bump(q, { happy: -6 }); } },
    ],
    auto: (q) => (q.rng() < 0.6 ? 0 : q.rng() < 0.6 ? 1 : 2),
  });
}

// ---- 家業 ---------------------------------------------------------------------------
// 町の家の1割ほどは、店や工房を営んでいる (自営業は世界の働く人の約4割だが、多くは畑と露店。ここでは継げる店のある家だけ。ILO)
// 生まれたときの乱数を使わずに決める (showRng)。親が年をとるか亡くなったころ、継ぐかを聞かれる
const hasFamilyShop = (p: Person) => showRng(p.seed, 0, 0x5409)() < 0.1 && p.familyP >= 0.3;
function familyShop(p: Person): void {
  if (p.recent.familyShop !== undefined || p.business || p.age < 25 || p.age > 50 || !hasFamilyShop(p)) return;
  const father = p.father;
  const ready = !father.alive || father.age >= 65;
  if (!ready) return;
  p.recent.familyShop = p.age;
  const word = father.alive ? L('父', 'Father') : L('亡くなった父', 'late Father');
  decide(p, {
    title: L('家業', 'The family business'),
    text: L(`${word}の店を、誰が継ぐかという話になった。`, `The question came up of who would take over ${father.alive ? "Father's" : "the late Father's"} shop.`),
    options: [
      { label: L('家業を継ぐ', 'Take over the family business'),
        apply: (q) => {
          q.working = true; q.unemployed = 0; q.business = true; q.selfEmployed = true;
          q.job = '家業の店主'; q.jobKind = 'manual'; q.jobYears = 6; // 根づいた店なので、始めたばかりの店のようにはつぶれない
          q.incomeP = clamp(Math.max(q.incomeP, q.familyP) + normal(q.rng, 0, 0.08), 0.01, 0.99);
          log(q, L('父の店を継いだ。古い常連の客は、しばらく父の名前で呼びかけてきた。', "Took over Father's shop. For a while the old regulars kept calling out Father's name."), 'work', true);
        } },
      { label: L('自分の仕事を続ける', 'Stay in own line of work'),
        apply: (q) => { log(q, L('店は人に譲られた。前を通るたびに、看板が新しくなっているのを見た。', 'The shop passed to someone else. Walking by, there was always a new sign out front.'), 'work'); bump(q, { happy: -2 }); } },
    ],
    auto: (q) => (q.rng() < (q.working && q.incomeP > 0.6 ? 0.2 : 0.55) ? 0 : 1),
  });
}

// 会社の持ち主は、経営を人に任せて退き、配当で暮らせる (common.ts の pension)。退いたら true
export function businessRetire(p: Person): boolean {
  if (!p.business || p.age < 58 || p.age % 2 !== 0) return false;
  decide(p, {
    title: L('経営を任せて退く？', 'Hand over the company?'),
    text: L(`${p.age}歳。会社の切り盛りを、育ててきた人に任せることもできる。株は手元に残し、配当を受け取る。`, `Age ${p.age}. The company could be handed to someone trained for it, keeping the shares and the dividends.`),
    options: [
      { label: L('任せて退く', 'Hand it over'), hint: L('配当で暮らす', 'Live on dividends'), apply: (q) => { q.retired = true; log(q, L('会社の経営を任せて退き、配当で暮らし始めた。', 'Handed over the running of the company and began living on dividends.'), 'old', true); } },
      { label: L('まだ続ける', 'Keep running it'), apply: () => {} },
    ],
    auto: (q) => (q.age >= 65 || q.stats.health < 45 ? 0 : 1),
  });
  return true;
}

// ---- 士官学校 -------------------------------------------------------------------------

// 海のない国 (ISO3)。士官学校で海軍は選べない
const LANDLOCKED = new Set(['AFG', 'ARM', 'AUT', 'AZE', 'BLR', 'BTN', 'BOL', 'BWA', 'BFA', 'BDI', 'CAF', 'TCD', 'CZE', 'ETH', 'HUN', 'KAZ', 'KGZ', 'LAO', 'LSO', 'LIE', 'LUX', 'MWI', 'MLI', 'MDA', 'MNG', 'NPL', 'NER', 'MKD', 'PRY', 'RWA', 'SRB', 'SVK', 'SSD', 'SWZ', 'CHE', 'TJK', 'TKM', 'UGA', 'UZB', 'ZMB', 'ZWE']);

export function enterAcademy(p: Person): void {
  p.school.uni = 'studying';
  p.school.uniYears = 0;
  p.school.major = '防衛学';
  if (p.military === 'none') p.military = 'done'; // 兵役は将校として果たす
  log(p, L('士官学校に入った。学費はかからず、手当も出る。', 'Entered the military academy. No tuition, and a small allowance.'), 'school', true);
  const options = [
    { label: L('陸軍', 'Army'), apply: (q: Person) => { q.branch = 'army' as const; } },
    ...(LANDLOCKED.has(p.country) ? [] : [{ label: L('海軍', 'Navy'), hint: L('長く海に出る', 'Long stretches at sea'), apply: (q: Person) => { q.branch = 'navy' as const; } }]),
    { label: L('空軍', 'Air force'), hint: L('体が強ければ操縦士への道も', 'Pilot training if fit enough'), apply: (q: Person) => { q.branch = 'air' as const; } },
  ];
  decide(p, {
    title: L('どの軍に進む？', 'Which service?'),
    text: L('士官学校では、2年目までに進む軍を決める。', 'Cadets choose their service by the second year.'),
    options,
    // 乱数は海軍の有無にかかわらず同じだけ引く。海軍が無ければ、その分は空軍になる
    auto: (q) => Math.min(q.rng() < 0.5 ? 0 : q.rng() < 0.4 ? 1 : 2, options.length - 1),
  });
}

export function commission(p: Person): void {
  const job = p.branch === 'navy' ? '海軍の将校' : p.branch === 'air' ? (p.stats.health >= 70 && p.rng() < 0.5 ? '空軍のパイロット' : '空軍の将校') : '陸軍の将校';
  log(p, L('士官学校を卒業し、少尉に任官した。', 'Graduated from the academy and was commissioned as a second lieutenant.'), 'school', true);
  assignJob(p, job, 'office', 0.6 + normal(p.rng, 0, 0.05));
}

// ---- 仕事を離れる --------------------------------------------------------------------------

// 職ごとの定年。公務員と警察官: 日本は60歳から2023年に61歳、2年ごとに1歳上がって2031年に65歳 (国家公務員法の改正)、
// 韓国60歳 (国家公務員法)、中国は男性60歳・女性55歳 (2025年から段階的に引き上げ)、米国は定年が無く連邦の法執行官だけ57歳。
// 将校: 日本の1佐56歳・2佐3佐55歳 (自衛隊法施行令)、韓国の大佐56歳・中佐53歳 (軍人事法) → おおむね55歳、米国は62歳
export function legalAge(p: Person, c: Country): number | undefined {
  const job = base(p);
  if (/将校|パイロット/.test(job)) return c.code === 'USA' ? 62 : 55;
  if (job !== '公務員' && job !== '警察官') return undefined;
  if (c.code === 'JPN') return 60 + clamp(Math.floor((yearOf(p) - 2021) / 2), 0, 5);
  if (c.code === 'USA') return job === '警察官' ? 57 : undefined;
  if (c.code === 'CHN') return p.sex === 'M' ? 60 : 55;
  return 60;
}

// 年をとってから仕事を離れる理由 (55歳から)。離れるならその一行を返す
export function leaveReason(p: Person, c: Country): string | null {
  const legal = legalAge(p, c);
  if (legal !== undefined && p.age >= legal) return /将校|パイロット/.test(base(p)) ? L('定年で退官した。', 'Retired from the service at the mandatory age.') : L('定年で職を退いた。', 'Retired at the mandatory age for the post.');
  if (p.age < 55) return null;
  // 親の介護で仕事を辞める人は日本で年10万人ほど (総務省 就業構造基本調査 2022)
  const frail = [p.mother, p.father].some((r) => r.alive && r.age >= 80);
  if (frail && p.rng() < 0.02) return L('親の介護のために仕事を辞めた。', 'Left work to care for an aging parent.');
  if (p.stats.health < 40 && p.rng() < 0.15) return L('体を壊し、仕事を続けられなくなった。', 'Health gave out, and work could not go on.');
  if (!p.formal && !p.selfEmployed && p.age >= 60 && p.rng() < 0.1) return L('契約が更新されず、仕事を離れた。', 'The contract was not renewed, and work came to an end.');
  return null;
}
