// 大きくなった子ども: 学校を終えて働き始め、何年かすると親に生活費を入れる。
// 乱数は showRng (crisis.ts) で引き、人生の乱数の並びを変えない
import { L } from '../../i18n';
import { earnings } from '../economy';
import { JOBS, jobName } from '../jobs';
import { countryOf, eduLevel, log, type Person, type Relative } from '../person';
import { showRng } from '../crisis';
import { techShare } from '../tech';

const roll = (p: Person, k: Relative, salt: number) => showRng(p.seed, p.age, salt + (k.id ?? 0) * 7)();

// 子の学歴は親と同じくらい。上か下に1つずれることがある
function childJob(p: Person, k: Relative): string {
  const c = countryOf(p);
  const edu = Math.max(0, Math.min(4, eduLevel(p) + (roll(p, k, 0x91) < 0.3 ? 1 : 0) - (roll(p, k, 0x92) < 0.2 ? 1 : 0)));
  const pool = JOBS.filter((j) => j.edu <= edu && (j.maxEdu ?? 5) >= edu && !j.majors && !j.rare
    && (!j.where || (j.where === 'rural') === p.rural) && (!j.tech || techShare(c, j.tech) > 0.02));
  return pool.length ? pool[Math.floor(roll(p, k, 0x93) * pool.length)].name : '日雇い労働者';
}

// 子が働き始める年齢。貧しい国ほど早い
const startAge = (p: Person) => (countryOf(p).gdp < 8000 ? 17 : 22);

// 毎年、family() から呼ぶ
export function grownChildren(p: Person): void {
  for (const k of p.children) {
    if (!k.alive || k.fixed) continue;
    if (k.age === startAge(p) && !k.job) {
      k.job = childJob(p, k);
      log(p, L(`${k.name}が学校を終えて働き始めた。${jobName(k.job)}になった。`, `${k.name} finished school and started work as ${jobName(k.job)}.`), 'family', false, undefined, k.id ? [k.id] : undefined);
      continue;
    }
    const key = `kidpay:${k.id}`;
    if (!k.job || p.recent[key] !== undefined || p.age < 45 || k.age < startAge(p) + 2) continue;
    // 豊かでない国では大人になった子が家計を支えるのがふつう。豊かな国では、親が引退したか暮らしが苦しいときだけ
    const odds = countryOf(p).gdp < 15000 ? 0.3 : p.retired || p.incomeP < 0.3 ? 0.008 : 0;
    if (roll(p, k, 0x94) >= odds) continue;
    p.recent[key] = p.age;
    log(p, L(`${k.name}が給料から毎月生活費を入れ始めた。ありがたくもあり、申し訳なくもあった。`, `${k.name} began handing over part of the pay every month for the household. Grateful, and a little guilty.`), 'family', false, undefined, k.id ? [k.id] : undefined);
  }
}

// 生活費を入れてくれている子からの、1年の額 (その国の真ん中くらいの稼ぎの1割を、1人あたり)。money.ts の finances で足す
export function kidSupport(p: Person): number {
  const each = earnings(countryOf(p), 0.5) * 0.1;
  return p.children.filter((k) => k.alive && p.recent[`kidpay:${k.id}`] !== undefined).length * each;
}
