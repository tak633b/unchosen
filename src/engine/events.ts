// 1年ごとに起こりうる出来事。確率は国の統計から引き、意思決定は Decision として積む。
import { COUNTRIES, byCode, type Country } from './countries';
import { earnings, formatMoney } from './economy';
import { lifeTable, type Sex } from './lifetable';
import { bump, childWord, countryOf, decide, log, type Person, type Relative } from './person';
import { clamp, normal, pickWeighted } from './rng';

const qAt = (c: Country, sex: Sex, age: number) => lifeTable(c, sex).q[Math.min(110, age)];
const yearly = (total: number, years: number) => 1 - (1 - clamp(total, 0, 0.99)) ** (1 / years);

// ---- 家族 ----------------------------------------------------------------

export function family(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  const ageRel = (rel: Relative) => { rel.age++; };
  for (const [rel, word] of [[p.mother, '母'], [p.father, '父']] as const) {
    if (!rel.alive) continue;
    ageRel(rel);
    if (r() < qAt(c, rel.sex, rel.age)) {
      rel.alive = false;
      const young = p.age < 18;
      log(p, `${word}が${rel.age}歳で亡くなった。`, 'loss', young);
      bump(p, { happy: young ? -18 : -8, bond: young ? -10 : -4 });
      if (young) p.familyP = clamp(p.familyP - 0.12, 0.01, 0.99);
    }
  }
  for (const s of p.siblings) {
    if (s.age < 0) { s.age++; if (s.age === 0) log(p, `${childWord(s.sex)}のきょうだいが生まれた。`, 'family'); continue; }
    if (!s.alive) continue;
    if (r() < qAt(c, s.sex, s.age)) {
      s.alive = false;
      log(p, `${s.age === 0 ? '生まれたばかりの' : `${s.age}歳の`}きょうだいが亡くなった。`, 'loss', true);
      bump(p, { happy: -10 });
    }
    s.age++;
  }
  if (p.spouse?.alive) {
    p.spouse.age++;
    if (r() < qAt(c, p.spouse.sex, p.spouse.age)) {
      p.spouse.alive = false;
      log(p, `連れ合いが${p.spouse.age}歳で亡くなった。`, 'loss', true);
      bump(p, { happy: -20, bond: -15 });
    }
  }
  for (const [i, k] of p.children.entries()) {
    if (!k.alive) continue;
    if (r() < qAt(c, k.sex, k.age)) {
      k.alive = false;
      log(p, `${i + 1}人目の子どもが${k.age === 0 ? '1歳になる前に' : `${k.age}歳で`}亡くなった。`, 'loss', true);
      bump(p, { happy: -25, bond: -5 });
    }
    k.age++;
  }
  if (p.age >= 55 && p.children.some((k) => k.alive && k.age >= 20) && r() < 0.12) {
    log(p, '孫が生まれた。', 'family');
    bump(p, { happy: 6, bond: 5 });
  }
}

// ---- 幼年期と学校 ---------------------------------------------------------

export function childhood(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.age <= 4 && r() < c.u5mr * 1.5) {
    log(p, 'ひどい熱と下痢で何日も寝込んだが、回復した。', 'ill');
    bump(p, { health: -6 });
  }
  if (p.age === 3 && p.familyP < 0.25 && c.gdp < 6000 && r() < 0.6) {
    log(p, '食べ物の足りない年が続き、背が伸びなかった。', 'hard', true);
    bump(p, { health: -10, learn: -5 });
  }
  if (p.age === 6) startSchool(p, c);
  if (p.age === 10 && !p.school.enrolled && !p.working) {
    p.working = true;
    p.job = c.agri > 0.3 && p.rural ? '畑と家畜の世話' : '家の仕事と物売り';
    log(p, `${p.job}をして家族を手伝い始めた。`, 'work');
  }
}

function startSchool(p: Person, c: Country): void {
  const r = p.rng;
  const girlGap = p.sex === 'F' && c.gdp < 5000 ? -1.2 : 0;
  p.school.target = clamp(normal(r, c.school * 1.35 + (p.familyP - 0.5) * 6 + (p.rural ? -1.5 : 0) + girlGap, 3), 0, 12);
  if (p.school.target < 1) {
    log(p, 'みんなが学校へ行く年になったが、通えなかった。', 'hard', true);
    return;
  }
  p.school.enrolled = true;
  log(p, '小学校に入学した。', 'school');
}

const levelOf = (years: number) =>
  years >= 12 ? '高校を卒業した' : years >= 9 ? '中学校を卒業した' : years >= 6 ? '小学校を卒業した' : `小学校を${Math.round(years)}年で離れた`;

export function schooling(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.school.uni === 'studying') {
    bump(p, { learn: 5 + (p.focus === 'learn' ? 3 : 0) });
    if (p.age >= 22) {
      p.school.uni = 'done';
      log(p, '大学を卒業した。', 'school', true);
      startWork(p);
    }
    return;
  }
  if (!p.school.enrolled) return;
  p.school.years++;
  bump(p, { learn: 4 + (p.focus === 'learn' ? 3 : 0) });

  if (p.school.years >= 12) {
    p.school.enrolled = false;
    log(p, levelOf(12) + '。', 'school', true);
    afterHighSchool(p, c);
    return;
  }
  if (p.school.years >= p.school.target) {
    if (p.school.years < 12 && p.age >= 10) {
      decide(p, {
        title: '学校をやめる？',
        text: `家計が苦しく、${levelOf(p.school.years)}ところで働きに出るよう言われた。`,
        options: [
          {
            label: '学校を続けたいと頼む',
            hint: 'うまくいくとは限らない',
            apply: (q) => {
              if (q.rng() < 0.35 + q.stats.learn / 250) {
                q.school.target += 3;
                log(q, '頼み込んで、もう少し学校に通えることになった。', 'school');
              } else {
                leaveSchool(q);
                log(q, '願いは聞き入れられなかった。', 'hard');
              }
            },
          },
          { label: '働きに出る', apply: (q) => leaveSchool(q) },
        ],
        auto: (q) => (q.rng() < 0.2 ? 0 : 1),
      });
    } else {
      leaveSchool(p);
    }
  }
}

function leaveSchool(p: Person): void {
  p.school.enrolled = false;
  log(p, levelOf(p.school.years) + '。', 'school');
  startWork(p);
}

export function childMarriage(p: Person): void {
  const c = countryOf(p);
  if (p.sex !== 'F' || p.age < 12 || p.age > 17 || p.spouse) return;
  const mult = (p.familyP < 0.4 ? 1.5 : p.familyP > 0.7 ? 0.3 : 1) * (p.rural ? 1.2 : 1);
  if (p.rng() >= yearly(c.childMarriage * mult, 6)) return;
  p.spouse = { alive: true, age: p.age + Math.round(clamp(normal(p.rng, 9, 4), 2, 30)), sex: 'M' };
  p.childMarriage = true;
  const wasInSchool = p.school.enrolled;
  p.school.enrolled = false;
  log(p, `${p.age}歳で、親の決めた相手と結婚させられた。${wasInSchool ? '学校には戻れなかった。' : ''}`, 'hard', true);
  bump(p, { happy: -15, health: -3 });
}

function afterHighSchool(p: Person, c: Country): void {
  const chance = clamp(c.tertiary * (0.5 + p.familyP) * (0.4 + p.stats.learn / 100), 0.02, 0.95);
  const tuition = earnings(c, 0.5) * 0.25 * (1 - Math.min(0.8, p.familyP));
  const opts = [
    {
      label: '大学を受験する',
      hint: `合格の見込み ${Math.round(chance * 100)}%`,
      apply: (q: Person) => {
        if (q.rng() < chance) {
          q.school.uni = 'studying';
          log(q, `大学に合格した。学費は年に ${formatMoney(tuition)}。`, 'school', true);
          bump(q, { happy: 8 });
        } else {
          log(q, '大学には受からなかった。働き始めた。', 'school');
          startWork(q);
        }
      },
    },
    { label: '働き始める', apply: (q: Person) => startWork(q) },
  ];
  decide(p, {
    title: '高校のあと',
    text: `${c.name}で大学に進む人は同世代の約${Math.round(Math.min(1, c.tertiary) * 100)}%。`,
    options: opts,
    auto: (q) => (q.rng() < chance * 1.1 ? 0 : 1),
  });
}

// ---- 仕事とお金 -----------------------------------------------------------

function jobFor(p: Person, c: Country): string {
  const y = p.school.years;
  if (p.school.uni === 'done') return p.rng() < 0.5 ? '専門職' : '会社員(事務・技術)';
  if (p.rural && p.rng() < c.agri * 1.4) return '農業';
  if (y < 6) return c.gdp < 10000 ? '日雇いや露店の仕事' : '清掃や日雇いの仕事';
  if (y < 9) return '工場や建設現場の仕事';
  if (y < 12) return '店やサービスの仕事';
  return p.rng() < 0.5 ? '事務の仕事' : '販売・サービスの仕事';
}

export function startWork(p: Person): void {
  const c = countryOf(p);
  const eduRank = p.school.uni === 'done' ? 0.85 : clamp(p.school.years / 14, 0, 0.8);
  p.incomeP = clamp(0.5 * p.familyP + 0.5 * eduRank + normal(p.rng, 0, 0.1), 0.01, 0.99);
  p.working = true;
  p.job = jobFor(p, c);
  log(p, `${p.job}に就いた。年収は ${formatMoney(earnings(c, p.incomeP))}。`, 'work', true);
}

export function work(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (!p.working || p.school.uni === 'studying') return;
  if (p.unemployed > 0) {
    p.unemployed--;
    if (p.unemployed === 0) log(p, '新しい仕事が見つかった。', 'work');
    return;
  }
  p.incomeP = clamp(p.incomeP + normal(r, p.focus === 'work' ? 0.015 : 0, 0.03), 0.01, 0.99);
  if (p.age < 60 && r() < (p.focus === 'work' ? 0.02 : 0.04)) {
    p.unemployed = 1 + Math.floor(r() * 2);
    log(p, '仕事を失った。', 'hard');
    bump(p, { happy: -8 });
  } else if (p.focus === 'work' && r() < 0.08) {
    p.incomeP = clamp(p.incomeP + 0.08, 0, 0.99);
    log(p, `仕事が認められ、収入が上がった(年収 ${formatMoney(earnings(c, p.incomeP))})。`, 'work');
    bump(p, { happy: 4 });
  }
  const pension = c.gdp > 15000;
  if (pension && p.age >= 65 && !p.retired) {
    p.retired = true;
    log(p, '仕事を引退し、年金で暮らし始めた。', 'old');
  } else if (!pension && !p.retired && (p.age >= 72 || (p.age >= 60 && p.stats.health < 35))) {
    p.retired = true;
    log(p, '体が利かなくなり、働けなくなった。子どもや親族を頼って暮らす。', 'old');
  }
}

// 財産の目盛り: その国の中での所得分位
export function moneyScore(p: Person): number {
  if (!p.working || p.school.uni === 'studying') return p.familyP * 100;
  const k = p.retired ? 0.8 : p.unemployed > 0 ? 0.5 : 1;
  return clamp(p.incomeP * 100 * k, 0, 100);
}

// ---- 恋愛・結婚・子ども ---------------------------------------------------

export function love(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  const minAge = c.childMarriage > 0.2 ? 17 : 19;
  if (p.spouse?.alive || p.age < minAge || p.age > 45 || p.school.enrolled) return;
  if (r() >= (p.focus === 'family' ? 0.16 : 0.1)) return;
  const remarry = p.spouse && !p.spouse.alive;
  decide(p, {
    title: remarry ? 'もう一度' : '出会い',
    text: remarry ? '新しく大切に思える人ができた。一緒になる？' : '気の合う人と出会い、結婚の話が出ている。',
    options: [
      {
        label: '結婚する',
        apply: (q) => {
          const d = q.sex === 'F' ? normal(q.rng, 3, 3) : normal(q.rng, -3, 3);
          q.spouse = { alive: true, age: Math.max(16, Math.round(q.age + d)), sex: q.sex === 'F' ? 'M' : 'F' };
          log(q, '結婚した。', 'love', true);
          bump(q, { happy: 10, bond: 15 });
        },
      },
      { label: '今はしない', apply: (q) => log(q, '結婚はまだ考えないことにした。', 'love') },
    ],
    auto: (q) => (q.rng() < 0.75 ? 0 : 1),
  });
}

export function births(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (!p.spouse?.alive) return;
  const motherAge = p.sex === 'F' ? p.age : p.spouse.age;
  if (motherAge < 15 || motherAge > 45) return;
  const pYear = Math.min(0.45, c.tfr / 18);
  if (r() >= pYear) return;
  if (c.tfr < 3 && !p.auto) {
    decide(p, {
      title: '子ども',
      text: p.children.length ? 'もう一人、子どもを持つ？' : '子どもを持つ？',
      options: [
        { label: '持つ', apply: (q) => giveBirth(q) },
        { label: '今は持たない', apply: () => {} },
      ],
      auto: () => 0,
    });
  } else {
    giveBirth(p);
  }
}

function giveBirth(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  const sex: Sex = r() < 0.512 ? 'M' : 'F';
  p.children.push({ alive: true, age: 0, sex });
  const n = p.children.length;
  log(p, `${n}人目の子ども(${childWord(sex)})が生まれた。`, 'family', n === 1);
  bump(p, { happy: 8, bond: 8 });
  const motherAge = p.sex === 'F' ? p.age : p.spouse!.age;
  const risk = (c.mmr / 1e5) * (p.familyP < 0.3 && p.rural ? 1.6 : p.incomeP > 0.7 ? 0.5 : 1) * (motherAge < 18 ? 2 : 1);
  if (r() < risk) {
    if (p.sex === 'F') {
      p.alive = false;
      p.cause = '出産時の合併症';
    } else {
      p.spouse!.alive = false;
      log(p, '妻が出産で亡くなった。', 'loss', true);
      bump(p, { happy: -25, bond: -15 });
    }
  }
}

// ---- 健康 -----------------------------------------------------------------

export function habits(p: Person): void {
  const c = countryOf(p);
  if (p.age === 16 && p.smoker === undefined) {
    const rate = clamp(c.smoke * (p.sex === 'M' ? 1.6 : 0.4), 0.01, 0.9);
    decide(p, {
      title: 'タバコ',
      text: `友だちにタバコを勧められた。${c.name}の大人の約${Math.round(c.smoke * 100)}%が吸っている。`,
      options: [
        { label: '吸ってみる', apply: (q) => { q.smoker = true; log(q, 'タバコを吸うようになった。', 'hard'); } },
        { label: '断る', apply: (q) => { q.smoker = false; } },
      ],
      auto: (q) => (q.rng() < rate ? 0 : 1),
    });
  }
  if (p.smoker && p.age >= 35 && p.age % 5 === 0) {
    decide(p, {
      title: '禁煙',
      text: '咳が続くようになった。タバコをやめてみる？',
      options: [
        {
          label: 'やめてみる',
          apply: (q) => {
            if (q.rng() < 0.4 + (q.focus === 'health' ? 0.2 : 0)) { q.smoker = false; log(q, 'タバコをやめた。', 'ill'); }
            else log(q, 'タバコをやめようとしたが、続かなかった。', 'hard');
          },
        },
        { label: '続ける', apply: () => {} },
      ],
      auto: (q) => (q.rng() < 0.3 ? 0 : 1),
    });
  }
}

export function hiv(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.hiv !== 'none') { p.hivYears++; if (p.hiv === 'untreated') bump(p, { health: -4 }); return; }
  if (p.age < 15 || p.age > 49) return;
  const risk = (c.hiv / 12) * (p.sex === 'F' && c.region === 'アフリカ' ? 1.4 : 1) * (p.childMarriage ? 1.5 : 1);
  if (r() >= risk) return;
  p.hiv = 'untreated';
  const access = c.gdp > 20000 ? 0.95 : 0.75;
  if (r() >= access) {
    log(p, '体調を崩しがちになった。HIVに感染していたが、検査を受ける機会はなかった。', 'ill', true);
    return;
  }
  decide(p, {
    title: 'HIV',
    text: '検査でHIV陽性と分かった。抗ウイルス薬を毎日飲み続ければ、長く生きられる。',
    options: [
      { label: '治療を始める', apply: (q) => { q.hiv = 'treated'; log(q, 'HIV陽性と分かり、治療を始めた。', 'ill', true); } },
      { label: '治療しない', apply: (q) => log(q, 'HIV陽性と分かったが、治療は受けなかった。', 'ill', true) },
    ],
    auto: (q) => (q.rng() < 0.9 ? 0 : 1),
  });
}

const DISEASES: [name: string, minAge: number, poorOnly?: boolean][] = [
  ['がん', 30], ['心臓病', 40], ['脳卒中', 45], ['糖尿病の合併症', 35], ['結核', 15, true], ['腎臓病', 40],
];

export function illness(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.illness) {
    p.illness.years--;
    if (p.illness.years <= 0) { log(p, `${p.illness.name}がひとまず落ち着いた。`, 'ill'); p.illness = undefined; }
    return;
  }
  if (p.age < 15) return;
  const pIll = (0.002 + 0.0009 * Math.max(0, p.age - 25)) * (p.focus === 'health' ? 0.7 : 1);
  if (r() >= pIll) return;
  const pool = DISEASES.filter(([, min, poor]) => p.age >= min && (!poor || c.gdp < 12000));
  if (!pool.length) return;
  const [name] = pool[Math.floor(r() * pool.length)];
  const cost = c.gdp * (0.4 + r() * 1.2);
  const share = cost * c.oop;
  const income = Math.max(200, earnings(c, p.working ? p.incomeP : p.familyP));
  const ratio = share / income;
  const quality = c.gdp < 5000 ? 2 : c.gdp < 20000 ? 1.6 : 1.3;
  bump(p, { health: -15 });
  decide(p, {
    title: `${name}と診断された`,
    text: `治療費は ${formatMoney(cost)}。そのうち自己負担は ${formatMoney(share)} で、年収の約${Math.round(ratio * 100)}%にあたる。`,
    options: [
      {
        label: ratio > 1 ? '借金をして治療を受ける' : '治療を受ける',
        apply: (q) => {
          q.illness = { name, years: 3, mult: quality };
          q.incomeP = clamp(q.incomeP - Math.min(0.3, ratio * 0.15), 0.01, 0.99);
          q.familyP = clamp(q.familyP - Math.min(0.2, ratio * 0.1), 0.01, 0.99);
          log(q, `${name}の治療を受けた。`, 'ill', true);
          bump(q, { happy: ratio > 1 ? -8 : -3 });
        },
      },
      {
        label: '治療をあきらめる',
        apply: (q) => {
          q.illness = { name, years: 3, mult: 3.5 };
          log(q, `${name}と分かったが、治療は受けなかった。`, 'ill', true);
        },
      },
    ],
    auto: (q) => (ratio < 1 || q.rng() < 0.4 ? 0 : 1),
  });
}

// ---- 移住 -----------------------------------------------------------------

export function migration(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.migratedTo || p.age < 18 || p.age > 45 || c.gdp > 20000 || p.school.enrolled) return;
  if (r() >= (p.focus === 'work' ? 0.025 : 0.015)) return;
  const dests = COUNTRIES.filter((d) => d.gdp > Math.max(15000, c.gdp * 2.5));
  const dest = pickWeighted(r, dests, (d) => d.pop * (d.region === c.region ? 3 : 1));
  const destIncome = earnings(dest, 0.2);
  decide(p, {
    title: '移住の話',
    text: `${dest.name}で働かないかという話が来た。向こうでの最初の年収は ${formatMoney(destIncome)} ほど(今は ${formatMoney(earnings(c, p.incomeP))})。家族とは離れることになる。`,
    options: [
      {
        label: `${dest.name}へ行く`,
        hint: 'ビザや仲介でうまくいかないこともある',
        apply: (q) => {
          if (q.rng() < 0.6) {
            q.migratedTo = dest.code;
            q.country = dest.code;
            q.incomeP = clamp(0.12 + q.stats.learn / 500 + normal(q.rng, 0, 0.05), 0.01, 0.6);
            q.working = true;
            q.unemployed = 0;
            log(q, `${dest.name}へ移り住んだ。`, 'move', true);
            bump(q, { bond: -12, happy: 3 });
          } else {
            log(q, q.rng() < 0.5 ? '仲介業者にお金をだまし取られ、移住できなかった。' : 'ビザが下りず、移住できなかった。', 'hard');
            q.incomeP = clamp(q.incomeP - 0.08, 0.01, 0.99);
            bump(q, { happy: -8 });
          }
        },
      },
      { label: '残る', apply: (q) => log(q, `${byCode(q.country).name}に残ることにした。`, 'move') },
    ],
    auto: (q) => (q.rng() < 0.2 ? 0 : 1),
  });
}

// ---- 治安 -----------------------------------------------------------------

export function crime(p: Person): void {
  const c = countryOf(p);
  if (p.age >= 12 && p.rng() < (c.homicide / 1e5) * 25) {
    log(p, '強盗にあい、怪我をした。', 'hard');
    bump(p, { happy: -6, health: -4 });
  }
}

// ---- 年ごとの目盛りの流れ --------------------------------------------------

export function drift(p: Person): void {
  const c = countryOf(p);
  const f = p.focus;
  // 若いうちは 80 前後へ戻り、45歳からは年々下がる。焦点はその上に足し引きする
  const ageDrift = p.age < 45 ? (80 - p.stats.health) * 0.1 : p.age < 70 ? -0.7 : -1.4;
  bump(p, { health: ageDrift + (f === 'health' ? 1.5 : 0) + (f === 'work' ? -0.6 : 0) + (p.smoker ? -0.5 : 0) });
  bump(p, { learn: f === 'learn' && !p.school.enrolled ? 2 : p.age > 70 ? -0.5 : 0 });
  bump(p, { bond: (55 - p.stats.bond) * 0.08 + (f === 'family' ? 3 : f === 'work' ? -1 : 0) });
  // 幸福はその国の生活満足度に向かって戻っていく
  const target = c.happiness * 10 + (moneyScore(p) - 50) * 0.2 + (p.stats.bond - 50) * 0.2 + (p.stats.health - 60) * 0.15;
  bump(p, { happy: (target - p.stats.happy) * 0.15 + (f === 'rest' ? 2 : 0) });
  p.stats.money = moneyScore(p);
}
