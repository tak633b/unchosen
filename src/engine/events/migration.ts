// 国を移る・帰る。
import { byCode, countriesAt } from '../countries';
import { earnings, formatMoney } from '../economy';
import { pickCity } from '../identity';
import { bump, countryOf, decide, log, yearOf, type Person } from '../person';
import { clamp, normal, pickWeighted } from '../rng';
import { L } from '../../i18n';

export function migration(p: Person): void {
  if (p.migratedTo) return homesick(p);
  const c = countryOf(p);
  const r = p.rng;
  if (p.age < 18 || p.age > 45 || c.gdp > 20000 || p.school.enrolled || p.school.uni === 'studying') return;
  if (r() >= (p.focus === 'work' ? 0.025 : 0.015)) return;
  const dests = countriesAt(yearOf(p)).filter((d) => d.gdp > Math.max(15000, c.gdp * 2.5));
  const dest = pickWeighted(r, dests, (d) => d.pop * (d.region === c.region ? 3 : 1));
  const destIncome = earnings(dest, 0.2);
  decide(p, {
    title: L('外国で働く話', 'Work abroad?'),
    text: L(`${dest.name}で働かないかという話が来た。向こうでの最初の年収は ${formatMoney(destIncome)} ほど(今は ${formatMoney(earnings(c, p.incomeP))})。家族とは離れることになる。`,
      `An offer came to work in ${dest.name}. First-year pay there would be about ${formatMoney(destIncome)} (now ${formatMoney(earnings(c, p.incomeP))}). It would mean leaving family behind.`),
    stat: L('生まれた国の外で暮らす人は世界におよそ2億8千万人、世界人口の約3.6% (IOM 世界移住報告 2024)', 'About 280 million people live outside their country of birth, roughly 3.6% of the world (IOM World Migration Report 2024)'),
    options: [
      {
        label: L(`${dest.name}へ行く`, `Go to ${dest.name}`), hint: L('ビザや仲介業者でつまずくこともある', 'Visas and brokers can fall through'),
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
            log(q, L(`${dest.name}の${q.city ?? '町'}へ移り住んだ。`, q.city ? `Moved to ${q.city}, ${dest.name}.` : `Moved to ${dest.name}.`), 'move', true);
            bump(q, { bond: -12, happy: 3 });
          } else {
            log(q, q.rng() < 0.5 ? L('仲介業者にお金をだまし取られ、移住できなかった。', 'A broker took the money. The move never happened.') : L('ビザが下りず、移住できなかった。', 'The visa was denied. The move never happened.'), 'hard');
            q.wealth -= earnings(c, q.incomeP) * 0.3;
            bump(q, { happy: -8 });
          }
        },
      },
      { label: L('残る', 'Stay'), apply: (q) => log(q, L(`${byCode(q.country).name}に残ることにした。`, `Decided to stay in ${byCode(q.country).name}.`), 'move') },
    ],
    auto: (q) => (q.rng() < 0.2 ? 0 : 1),
  });
}

// 外国で何年か暮らすと、帰るかどうか揺れる
function homesick(p: Person): void {
  const home = byCode(p.birthCountry);
  const yearsAway = p.age - (p.log.find((e) => e.kind === 'move' && e.big)?.age ?? p.age);
  if (yearsAway === 10 && p.rng() < 0.6) log(p, L(`${countryOf(p).name}の国籍をとった。`, `Became a citizen of ${countryOf(p).name}.`), 'move');
  if (yearsAway < 3 || p.age > 70 || p.rng() > 0.12) return;
  decide(p, {
    title: L(`${home.name}に帰る？`, `Go back to ${home.name}?`),
    text: L(`${countryOf(p).name}で暮らして${yearsAway}年。故郷の家族や友だちの話を聞くたびに気持ちが揺れる。`,
      `${yearsAway} years in ${countryOf(p).name}. Every bit of news from family and friends back home pulls at the heart.`),
    stat: L('移住した人の2〜5割は、5年のうちに故郷に戻るか別の国へ移る (OECD 国際移住アウトルック)', '20 to 50% of immigrants return home or move on to another country within 5 years (OECD International Migration Outlook)'),
    options: [
      {
        label: L('故郷に帰る', 'Go home'), hint: L('つながり↑ 幸福↑・仕事は探し直し', 'Bond↑ Happiness↑, new job search'),
        apply: (q) => {
          q.country = q.birthCountry;
          q.migratedTo = undefined;
          q.city = pickCity(q.rng, q.birthCountry);
          q.incomeP = clamp(q.incomeP + 0.15, 0.01, 0.95);
          log(q, L(`${countryOf(q).name}で${yearsAway}年暮らし、故郷の${home.name}に帰った。`, `After ${yearsAway} years in ${countryOf(q).name}, went back home to ${home.name}.`), 'move', true);
          bump(q, { bond: 12, happy: 5 });
        },
      },
      { label: L('今の国に残る', 'Stay'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.3 ? 0 : 1),
  });
}
