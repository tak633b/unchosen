// 仕事の一覧。学歴・専攻・農村か都市かで就ける仕事が決まり、給料はその国の所得分布の中の位置で決まる。
import type { Country } from './countries';
import { earnings } from './economy';
import type { EduLevel, Person } from './person';
import { clamp, normal, type Rng } from './rng';

export interface Job {
  name: string;
  edu: EduLevel;      // 必要な学歴
  pay: number;        // 所得分位の上乗せ (-0.4〜+0.45)
  majors?: string[];  // 大学の専攻が要る仕事
  where?: 'rural' | 'urban';
  maxEdu?: EduLevel;  // 学歴が高すぎる人には勧めない
}

export const MAJORS = ['人文学', '経営・経済', '法学', '工学', '情報科学', '医学', '看護・保健', '教育', '農学'] as const;

export const JOBS: Job[] = [
  { name: '自分の畑を耕す農家', edu: 0, pay: -0.3, where: 'rural', maxEdu: 3 },
  { name: '農場の働き手', edu: 0, pay: -0.38, where: 'rural', maxEdu: 2 },
  { name: '漁師', edu: 0, pay: -0.28, where: 'rural', maxEdu: 3 },
  { name: '家畜の世話', edu: 0, pay: -0.35, where: 'rural', maxEdu: 2 },
  { name: '日雇い労働者', edu: 0, pay: -0.35, maxEdu: 2 },
  { name: '露天商', edu: 0, pay: -0.28, where: 'urban', maxEdu: 2 },
  { name: '住み込みの家事手伝い', edu: 0, pay: -0.38, maxEdu: 2 },
  { name: '縫製工場の工員', edu: 1, pay: -0.2, where: 'urban', maxEdu: 3 },
  { name: '建設作業員', edu: 1, pay: -0.15, maxEdu: 3 },
  { name: '運転手', edu: 1, pay: -0.1, maxEdu: 3 },
  { name: '市場の店主', edu: 1, pay: -0.05, maxEdu: 3 },
  { name: '店員', edu: 2, pay: -0.08, maxEdu: 4 },
  { name: '料理人', edu: 2, pay: -0.03, maxEdu: 4 },
  { name: '工場のライン工', edu: 2, pay: -0.02, where: 'urban', maxEdu: 3 },
  { name: '警備員', edu: 2, pay: -0.08, maxEdu: 3 },
  { name: '美容師', edu: 2, pay: -0.02, maxEdu: 4 },
  { name: '整備士', edu: 3, pay: 0.05, maxEdu: 4 },
  { name: '電気工', edu: 3, pay: 0.06, maxEdu: 4 },
  { name: '事務員', edu: 3, pay: 0.05, maxEdu: 4 },
  { name: '販売員', edu: 3, pay: 0.02, maxEdu: 4 },
  { name: '介護士', edu: 3, pay: -0.02, maxEdu: 4 },
  { name: '銀行の窓口係', edu: 3, pay: 0.1, where: 'urban', maxEdu: 4 },
  { name: '教師', edu: 4, pay: 0.12, majors: ['教育', '人文学'] },
  { name: '看護師', edu: 4, pay: 0.14, majors: ['看護・保健', '医学'] },
  { name: 'エンジニア', edu: 4, pay: 0.25, majors: ['工学', '情報科学'] },
  { name: 'プログラマー', edu: 4, pay: 0.27, majors: ['情報科学', '工学'], where: 'urban' },
  { name: '会計・金融の専門職', edu: 4, pay: 0.25, majors: ['経営・経済'], where: 'urban' },
  { name: '会社員(営業・企画)', edu: 4, pay: 0.18, where: 'urban' },
  { name: '公務員', edu: 4, pay: 0.15, majors: ['法学', '人文学', '経営・経済', '教育'] },
  { name: '農業技術者', edu: 4, pay: 0.12, majors: ['農学'] },
  { name: '記者・編集者', edu: 4, pay: 0.12, majors: ['人文学'], where: 'urban' },
  { name: '弁護士', edu: 5, pay: 0.36, majors: ['法学'], where: 'urban' },
  { name: '医師', edu: 5, pay: 0.4, majors: ['医学'] },
  { name: '研究者', edu: 5, pay: 0.22 },
  { name: '大学の教員', edu: 5, pay: 0.25 },
];

export interface Offer { job: Job; p: number; pay: number; formal: boolean }

// 学歴・家の豊かさ・運で、その人がその国の所得分布のどこに入るかが決まる
export function offerFor(p: Person, c: Country, job: Job, rng: Rng): Offer {
  const pos = clamp(0.5 + job.pay * 1.4 + (p.familyP - 0.5) * 0.25 + (p.stats.learn - 50) / 600 + normal(rng, 0, 0.06), 0.01, 0.99);
  // 低所得国ほど、学歴の低い仕事は非正規 (年金や保険なし) が多い
  const informalShare = c.gdp < 5000 ? 0.85 : c.gdp < 15000 ? 0.6 : c.gdp < 30000 ? 0.3 : 0.12;
  const formal = job.edu >= 4 || rng() > informalShare * (1 - job.edu * 0.2);
  return { job, p: pos, pay: earnings(c, pos), formal };
}

export function eligibleJobs(p: Person, edu: EduLevel): Job[] {
  return JOBS.filter((j) => j.edu <= edu && (j.maxEdu ?? 5) >= edu
    && (!j.majors || (p.school.major && j.majors.includes(p.school.major)))
    && (!j.where || (j.where === 'rural') === p.rural));
}

// 学歴に一番合う仕事から順に、3つまで選ぶ
export function pickOffers(p: Person, c: Country, edu: EduLevel, rng: Rng, n = 3): Offer[] {
  const pool = eligibleJobs(p, edu).sort((a, b) => b.edu - a.edu + (rng() - 0.5) * 2.5);
  return pool.slice(0, n).map((j) => offerFor(p, c, j, rng)).sort((a, b) => b.pay - a.pay);
}
