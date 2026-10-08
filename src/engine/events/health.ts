// 体と心: タバコ・酒・HIV・病気の治療、目盛りの年ごとの流れ。
import { formatMoney } from '../economy';
import { bump, countryOf, decide, log, type Person } from '../person';
import { clamp, pick } from '../rng';
import { currentIncome, subsistence } from './common';
import { isEn, L } from '../../i18n';
import type { Country } from '../countries';
import type { Sex } from '../lifetable';

export function habits(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.age === 15 && p.smoker === undefined) {
    const rate = smokeStart(c, p.sex);
    decide(p, {
      title: L('タバコ', 'Smoking'),
      text: L('友だちにタバコを勧められた。', 'A friend offered a cigarette.'),
      stat: L(`${c.name}の${p.sex === 'M' ? '男性' : '女性'}の喫煙率はおよそ${Math.round(rate * 100)}% (WHO・年齢調整)`,
        `About ${Math.round(rate * 100)}% of ${p.sex === 'M' ? 'men' : 'women'} in ${c.name} smoke (WHO, age-standardized)`),
      options: [
        { label: L('断る', 'Say no'), apply: (q) => { q.smoker = false; } },
        { label: L('吸ってみる', 'Try one'), hint: L('やめられなくなるかもしれない', 'Might be hard to quit'), apply: (q) => { q.smoker = true; log(q, L('タバコを吸うようになった。', 'Started smoking.'), 'hard'); } },
      ],
      auto: (q) => (q.rng() < rate ? 1 : 0),
    });
  }
  if (p.smoker && p.age >= 30 && p.age % 6 === 0) {
    decide(p, {
      title: L('タバコをやめる？', 'Quit smoking?'),
      text: L('咳が続くようになった。', 'The cough will not go away.'),
      stat: L('タバコをやめた人は、10年で肺がんで亡くなるリスクがおよそ半分になる (WHO)', 'Ten years after quitting, the risk of dying from lung cancer is about half that of a smoker (WHO)'),
      options: [
        {
          label: L('やめてみる', 'Try to quit'),
          apply: (q) => {
            if (q.rng() < 0.4 + (q.focus === 'health' ? 0.2 : 0)) { q.smoker = false; log(q, L('タバコをやめた。', 'Quit smoking.'), 'ill'); }
            else log(q, L('タバコをやめようとしたが、続かなかった。', 'Tried to quit smoking, but could not stick with it.'), 'hard');
          },
        },
        { label: L('続ける', 'Keep smoking'), apply: () => {} },
      ],
      auto: (q) => (q.rng() < 0.35 ? 0 : 1),
    });
  }
  if (!p.drinker && p.age >= 22 && p.age <= 60 && r() < (p.stats.happy < 40 ? 0.04 : 0.015)) {
    decide(p, {
      title: L('酒の量が増えた', 'Drinking more'),
      text: L('寝る前の一杯が、いつのまにか三杯、四杯になっている。', 'One drink before bed has quietly become three or four.'),
      stat: L('世界の大人のおよそ7%がアルコール使用障害を抱えている (WHO 2024)', 'About 7% of adults worldwide live with an alcohol use disorder (WHO 2024)'),
      options: [
        { label: L('量を減らし、ほかの方法を探す', 'Cut back, find other ways'), hint: L('歩く・人と話す・助けを求める', 'Walk, talk to people, get help'), apply: (q) => { log(q, L('酒を控え、夕方に歩くようになった。', 'Cut back on drinking and took up evening walks.'), 'ill'); bump(q, { health: 2 }); } },
        { label: L('酒でしのぐ', 'Drink to cope'), hint: L('今は楽になる・やめにくくなる', 'Easier now, harder to stop later'), apply: (q) => { q.drinker = true; log(q, L('酒に頼る日が増えた。', 'Leaned on alcohol more and more.'), 'hard'); } },
      ],
      auto: (q) => (q.rng() < 0.7 ? 0 : 1),
    });
  }
  if (p.drinker && r() < 0.08) {
    p.drinker = false;
    log(p, L('酒をやめた。', 'Stopped drinking.'), 'ill');
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
    log(p, L('体調を崩しがちになった。HIVに感染していたが、検査を受ける機会はなかった。', 'Often fell sick. Had HIV, but never had a chance to get tested.'), 'ill', true);
    return;
  }
  decide(p, {
    title: 'HIV',
    text: L('検査でHIV陽性と分かった。抗ウイルス薬を毎日飲み続ければ、長く生きられる。', 'Tested HIV positive. Taking antiretrovirals every day means a long life is possible.'),
    stat: L(`${c.name}の15〜49歳のHIV陽性率はおよそ${(c.hiv * 100).toFixed(1)}% (UNAIDS)`, `About ${(c.hiv * 100).toFixed(1)}% of people aged 15 to 49 in ${c.name} have HIV (UNAIDS)`),
    options: [
      { label: L('治療を始める', 'Start treatment'), apply: (q) => { q.hiv = 'treated'; log(q, L('HIV陽性と分かり、治療を始めた。', 'Tested HIV positive and started treatment.'), 'ill', true); } },
      { label: L('治療しない', 'No treatment'), apply: (q) => log(q, L('HIV陽性と分かったが、治療は受けなかった。', 'Tested HIV positive, but did not get treatment.'), 'ill', true) },
    ],
    auto: (q) => (q.rng() < 0.9 ? 0 : 1),
  });
}

const CHRONIC: [name: string, minAge: number, poorOnly?: boolean][] = [
  ['がん', 30], ['心臓病', 40], ['狭心症', 45], ['脳卒中', 45], ['糖尿病の合併症', 35], ['結核', 15, true], ['腎臓病', 40], ['慢性閉塞性肺疾患', 45],
];
const ACUTE: [name: string, minAge: number][] = [['重い肺炎', 50], ['骨折', 55], ['マラリア', 5], ['腸チフス', 5], ['盲腸', 10]];
// 病名は内部では日本語(上の正規表現で比べる)。p.illness には表示の言葉で入れる
const ILLNESS_EN: Record<string, string> = {
  がん: 'cancer', 心臓病: 'heart disease', 狭心症: 'angina', 脳卒中: 'stroke', 糖尿病の合併症: 'diabetes complications', 結核: 'tuberculosis',
  腎臓病: 'kidney disease', 慢性閉塞性肺疾患: 'COPD', 重い肺炎: 'severe pneumonia', 骨折: 'broken bone', マラリア: 'malaria', 腸チフス: 'typhoid', 盲腸: 'appendicitis',
};
const illnessName = (n: string) => (isEn ? ILLNESS_EN[n] ?? n : n);

export function illness(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.illness) {
    p.illness.years--;
    if (p.illness.years <= 0) { log(p, L(`${p.illness.name}がひとまず落ち着いた。`, `The ${p.illness.name} eased, for now.`), 'ill'); p.illness = undefined; }
    return;
  }
  if (p.age < 5) return;
  const pChronic = p.age < 15 ? 0 : (0.002 + 0.0009 * Math.max(0, p.age - 25)) * (p.focus === 'health' ? 0.7 : 1) * (p.smoker ? 1.3 : 1) * (p.drinker ? 1.2 : 1);
  const pAcute = 0.004 + (p.age > 50 ? 0.004 : 0);
  if (r() < pChronic) {
    const pool = CHRONIC.filter(([, min, poor]) => p.age >= min && (!poor || c.gdp < 12000));
    if (pool.length) treat(p, illnessName(pick(r, pool)[0]), 3, 1);
  } else if (r() < pAcute) {
    const pool = ACUTE.filter(([n, min]) => p.age >= min && (!/マラリア|腸チフス/.test(n) || (c.gdp < 8000 && (n !== 'マラリア' || c.region === 'アフリカ'))));
    if (pool.length) treat(p, illnessName(pick(r, pool)[0]), 1, 0.6);
  }
}

// 病院で治したときの死亡率の倍率。その国の医療の水準で決まる (生命表には、この水準がすでに入っている)
export const careQuality = (c: Country) => (c.gdp < 5000 ? 2 : c.gdp < 20000 ? 1.6 : 1.3);
// 15歳のときにタバコを吸い始める確率 (国の喫煙率は男女の平均なので、男は高く女は低く)
export const smokeStart = (c: Country, sex: Sex) => clamp(c.smoke * (sex === 'M' ? 1.6 : 0.4), 0.01, 0.9);

// 病院で治すか、安い手で済ませるか、何もしないか
function treat(p: Person, name: string, years: number, severity: number): void {
  const c = countryOf(p);
  const r = p.rng;
  const cost = c.gdp * (0.3 + r() * 1.0) * severity;
  const share = cost * c.oop;
  const income = Math.max(currentIncome(p), subsistence(c));
  const ratio = share / income;
  const quality = careQuality(c);
  bump(p, { health: -15 * severity });
  const traditional = c.gdp < 15000;
  decide(p, {
    title: L(`${name}と診断された`, `Diagnosed with ${name}`),
    text: L(`治療費は ${formatMoney(cost)}。そのうち自分で払うのは ${formatMoney(share)} で、年収の約${Math.round(ratio * 100)}%にあたる。`,
      `Treatment costs ${formatMoney(cost)}. The out-of-pocket share is ${formatMoney(share)}, about ${Math.round(ratio * 100)}% of a year's income.`),
    stat: L(`${c.name}では医療費のおよそ${Math.round(c.oop * 100)}%を患者が自分で払っている (WHO)`, `In ${c.name}, patients pay about ${Math.round(c.oop * 100)}% of health spending out of pocket (WHO)`),
    options: [
      {
        label: ratio > 1 ? L('借金をして病院で治療を受ける', 'Borrow and go to hospital') : L('病院で治療を受ける', 'Go to hospital'),
        apply: (q) => {
          q.illness = { name, years, mult: quality };
          q.wealth -= share;
          q.familyP = clamp(q.familyP - Math.min(0.15, ratio * 0.05), 0.01, 0.99);
          log(q, L(`${name}の治療を受けた。${ratio > 0.3 ? `自己負担は ${formatMoney(share)}。` : ''}`,
            `Got treatment for ${name}.${ratio > 0.3 ? ` Paid ${formatMoney(share)} out of pocket.` : ''}`), 'ill', true);
          bump(q, { happy: ratio > 1 ? -8 : -3 });
        },
      },
      {
        label: traditional ? L('薬局の薬や伝統的な治療でしのぐ', 'Pharmacy drugs, traditional remedies') : L('通院だけにして様子を見る', 'Outpatient visits only'), hint: L('安く済むが、治りにくい', 'Cheaper, but slower to heal'),
        apply: (q) => {
          q.illness = { name, years: years + 1, mult: 1.9 };
          q.wealth -= share * 0.1;
          log(q, L(`${name}を${traditional ? '薬局の薬と伝統的な治療' : '最低限の通院'}でしのいだ。長く患った。`,
            `Got by with ${traditional ? 'pharmacy drugs and traditional remedies' : 'minimal outpatient care'} for ${name}. Was ill a long time.`), 'ill', true);
        },
      },
      {
        label: L('治療をあきらめる', 'Forgo treatment'),
        apply: (q) => { q.illness = { name, years, mult: 3 }; log(q, L(`${name}と分かったが、治療は受けなかった。`, `Learned it was ${name}, but did not get treatment.`), 'ill', true); },
      },
    ],
    auto: (q) => (ratio < 1 || q.rng() < 0.4 ? 0 : q.rng() < 0.7 ? 1 : 2),
  });
}

// 目盛りの年ごとの流れ。若いうちは 80 前後へ戻り、45歳からは年々下がる
export function drift(p: Person): void {
  const c = countryOf(p);
  const f = p.focus;
  const ageDrift = p.age < 45 ? (80 - p.stats.health) * 0.1 : p.age < 70 ? -0.7 : -1.4;
  bump(p, { health: ageDrift + (f === 'health' ? 1.5 : 0) + (f === 'work' ? -0.6 : 0) + (p.smoker ? -0.5 : 0) + (p.drinker ? -1.5 : 0) });
  bump(p, { learn: f === 'learn' && !p.school.enrolled ? 2 : p.age > 70 ? -0.5 : 0 });
  bump(p, { bond: (55 - p.stats.bond) * 0.08 + (f === 'family' ? 3 : f === 'work' ? -1 : 0) });
  const moneyScore = (p.working || p.retired ? p.incomeP : p.familyP) * 100;
  const target = c.happiness * 10 + (moneyScore - 50) * 0.2 + (p.stats.bond - 50) * 0.2 + (p.stats.health - 60) * 0.15;
  bump(p, { happy: (target - p.stats.happy) * 0.15 + (f === 'rest' ? 2 : 0) });
  p.stats.money = clamp(moneyScore * (p.unemployed > 0 ? 0.5 : p.retired ? 0.8 : 1), 0, 100);
  p.happyByAge[p.age] = p.stats.happy;
}
