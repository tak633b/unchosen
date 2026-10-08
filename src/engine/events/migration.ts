// 国を移る・帰る。
import { COUNTRIES, byCode } from '../countries';
import { earnings, formatMoney } from '../economy';
import { pickCity } from '../identity';
import { bump, countryOf, decide, log, type Person } from '../person';
import { clamp, normal, pickWeighted } from '../rng';

export function migration(p: Person): void {
  if (p.migratedTo) return homesick(p);
  const c = countryOf(p);
  const r = p.rng;
  if (p.age < 18 || p.age > 45 || c.gdp > 20000 || p.school.enrolled || p.school.uni === 'studying') return;
  if (r() >= (p.focus === 'work' ? 0.025 : 0.015)) return;
  const dests = COUNTRIES.filter((d) => d.gdp > Math.max(15000, c.gdp * 2.5));
  const dest = pickWeighted(r, dests, (d) => d.pop * (d.region === c.region ? 3 : 1));
  const destIncome = earnings(dest, 0.2);
  decide(p, {
    title: '外国で働く話',
    text: `${dest.name}で働かないかという話が来た。向こうでの最初の年収は ${formatMoney(destIncome)} ほど(今は ${formatMoney(earnings(c, p.incomeP))})。家族とは離れることになる。`,
    stat: '生まれた国の外で暮らす人は世界におよそ2億8千万人、世界人口の約3.6% (IOM 世界移住報告 2024)',
    options: [
      {
        label: `${dest.name}へ行く`, hint: 'ビザや仲介業者でつまずくこともある',
        apply: (q) => {
          if (q.rng() < 0.6) {
            q.migratedTo = dest.code;
            q.country = dest.code;
            q.city = pickCity(q.rng, dest.code);
            if (!q.countriesLived.includes(dest.code)) q.countriesLived.push(dest.code);
            q.incomeP = clamp(0.12 + q.stats.learn / 500 + normal(q.rng, 0, 0.05), 0.01, 0.6);
            q.working = true;
            q.unemployed = 0;
            q.formal = q.rng() < 0.5;
            log(q, `${dest.name}の${q.city ?? '町'}へ移り住んだ。`, 'move', true);
            bump(q, { bond: -12, happy: 3 });
          } else {
            log(q, q.rng() < 0.5 ? '仲介業者にお金をだまし取られ、移住できなかった。' : 'ビザが下りず、移住できなかった。', 'hard');
            q.wealth -= earnings(c, q.incomeP) * 0.3;
            bump(q, { happy: -8 });
          }
        },
      },
      { label: '残る', apply: (q) => log(q, `${byCode(q.country).name}に残ることにした。`, 'move') },
    ],
    auto: (q) => (q.rng() < 0.2 ? 0 : 1),
  });
}

// 外国で何年か暮らすと、帰るかどうか揺れる
function homesick(p: Person): void {
  const home = byCode(p.birthCountry);
  const yearsAway = p.age - (p.log.find((e) => e.kind === 'move' && e.big)?.age ?? p.age);
  if (yearsAway === 10 && p.rng() < 0.6) log(p, `${countryOf(p).name}の国籍をとった。`, 'move');
  if (yearsAway < 3 || p.age > 70 || p.rng() > 0.12) return;
  decide(p, {
    title: `${home.name}に帰る？`,
    text: `${countryOf(p).name}で暮らして${yearsAway}年。故郷の家族や友だちの話を聞くたびに気持ちが揺れる。`,
    stat: '移住した人の2〜5割は、5年のうちに故郷に戻るか別の国へ移る (OECD 国際移住アウトルック)',
    options: [
      {
        label: '故郷に帰る', hint: 'つながり↑ 幸福↑・仕事は探し直し',
        apply: (q) => {
          q.country = q.birthCountry;
          q.migratedTo = undefined;
          q.city = pickCity(q.rng, q.birthCountry);
          q.incomeP = clamp(q.incomeP + 0.15, 0.01, 0.95);
          log(q, `${countryOf(q).name}で${yearsAway}年暮らし、故郷の${home.name}に帰った。`, 'move', true);
          bump(q, { bond: 12, happy: 5 });
        },
      },
      { label: '今の国に残る', apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.3 ? 0 : 1),
  });
}
