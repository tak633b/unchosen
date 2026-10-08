// 仕事の一覧。学歴・専攻・農村か都市かで就ける仕事が決まり、給料はその国の所得分布の中の位置で決まる。
import type { Country } from './countries';
import { earnings } from './economy';
import type { EduLevel, Person } from './person';
import { clamp, normal, type Rng } from './rng';

export type JobKind = 'office' | 'manual' | 'farm';

export interface Job {
  name: string;
  kind: JobKind;
  edu: EduLevel;      // 必要な学歴
  pay: number;        // 所得分位の上乗せ (-0.4〜+0.45)
  majors?: string[];  // 大学の専攻が要る仕事
  where?: 'rural' | 'urban';
  maxEdu?: EduLevel;  // 学歴が高すぎる人には勧めない
}

export const MAJORS = ['人文学', '経営・経済', '法学', '工学', '情報科学', '医学', '看護・保健', '教育', '農学'] as const;

export const JOBS: Job[] = [
  { name: '自分の畑を耕す農家', kind: 'farm', edu: 0, pay: -0.3, where: 'rural', maxEdu: 3 },
  { name: '農場の働き手', kind: 'farm', edu: 0, pay: -0.38, where: 'rural', maxEdu: 2 },
  { name: '漁師', kind: 'farm', edu: 0, pay: -0.28, where: 'rural', maxEdu: 3 },
  { name: '家畜の世話', kind: 'farm', edu: 0, pay: -0.35, where: 'rural', maxEdu: 2 },
  { name: '日雇い労働者', kind: 'manual', edu: 0, pay: -0.35, maxEdu: 2 },
  { name: '露天商', kind: 'manual', edu: 0, pay: -0.28, where: 'urban', maxEdu: 2 },
  { name: '住み込みの家事手伝い', kind: 'manual', edu: 0, pay: -0.38, maxEdu: 2 },
  { name: '縫製工場の工員', kind: 'manual', edu: 1, pay: -0.2, where: 'urban', maxEdu: 3 },
  { name: '建設作業員', kind: 'manual', edu: 1, pay: -0.15, maxEdu: 3 },
  { name: '運転手', kind: 'manual', edu: 1, pay: -0.1, maxEdu: 3 },
  { name: '市場の店主', kind: 'manual', edu: 1, pay: -0.05, maxEdu: 3 },
  { name: '店員', kind: 'manual', edu: 2, pay: -0.08, maxEdu: 4 },
  { name: '料理人', kind: 'manual', edu: 2, pay: -0.03, maxEdu: 4 },
  { name: '工場のライン工', kind: 'manual', edu: 2, pay: -0.02, where: 'urban', maxEdu: 3 },
  { name: '警備員', kind: 'manual', edu: 2, pay: -0.08, maxEdu: 3 },
  { name: '美容師', kind: 'manual', edu: 2, pay: -0.02, maxEdu: 4 },
  { name: '整備士', kind: 'manual', edu: 3, pay: 0.05, maxEdu: 4 },
  { name: '電気工', kind: 'manual', edu: 3, pay: 0.06, maxEdu: 4 },
  { name: '事務員', kind: 'office', edu: 3, pay: 0.05, maxEdu: 4 },
  { name: '販売員', kind: 'office', edu: 3, pay: 0.02, maxEdu: 4 },
  { name: '介護士', kind: 'manual', edu: 3, pay: -0.02, maxEdu: 4 },
  { name: '銀行の窓口係', kind: 'office', edu: 3, pay: 0.1, where: 'urban', maxEdu: 4 },
  { name: '教師', kind: 'office', edu: 4, pay: 0.12, majors: ['教育', '人文学'] },
  { name: '看護師', kind: 'office', edu: 4, pay: 0.14, majors: ['看護・保健', '医学'] },
  { name: 'エンジニア', kind: 'office', edu: 4, pay: 0.25, majors: ['工学', '情報科学'] },
  { name: 'プログラマー', kind: 'office', edu: 4, pay: 0.27, majors: ['情報科学', '工学'], where: 'urban' },
  { name: '会計・金融の専門職', kind: 'office', edu: 4, pay: 0.25, majors: ['経営・経済'], where: 'urban' },
  { name: '会社員(営業・企画)', kind: 'office', edu: 4, pay: 0.18, where: 'urban' },
  { name: '公務員', kind: 'office', edu: 4, pay: 0.15, majors: ['法学', '人文学', '経営・経済', '教育'] },
  { name: '農業技術者', kind: 'office', edu: 4, pay: 0.12, majors: ['農学'] },
  { name: '記者・編集者', kind: 'office', edu: 4, pay: 0.12, majors: ['人文学'], where: 'urban' },
  { name: '弁護士', kind: 'office', edu: 5, pay: 0.36, majors: ['法学'], where: 'urban' },
  { name: '医師', kind: 'office', edu: 5, pay: 0.4, majors: ['医学'] },
  { name: '研究者', kind: 'office', edu: 5, pay: 0.22 },
  { name: '大学の教員', kind: 'office', edu: 5, pay: 0.25 },
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

// 働き手の多くが男性/女性の仕事。逆の性別には、4回に1回だけ勧める
const MOSTLY_MEN = /運転手|建設|警備|整備|電気工|漁師/;
const MOSTLY_WOMEN = /縫製|家事手伝い|美容師|看護師|介護士/;
const fitsSex = (j: Job, p: Person, rng: Rng) =>
  !(p.sex === 'F' ? MOSTLY_MEN : MOSTLY_WOMEN).test(j.name) || rng() < 0.25;

// 学歴に一番合う仕事から順に、3つまで選ぶ
export function pickOffers(p: Person, c: Country, edu: EduLevel, rng: Rng, n = 3): Offer[] {
  const pool = eligibleJobs(p, edu).filter((j) => fitsSex(j, p, rng)).sort((a, b) => b.edu - a.edu + (rng() - 0.5) * 2.5);
  return pool.slice(0, n).map((j) => offerFor(p, c, j, rng)).sort((a, b) => b.pay - a.pay);
}
