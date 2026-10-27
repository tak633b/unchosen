// 大きな国の農村に生まれた人の、生まれた地方 (州・県・地方域)。重みは国勢調査の農村の人口 (data/regions.json に国ごとの出典)。
// 出生の記録に「インドのビハール州の農村」と出る。抽選は見せ方用の乱数で引き、人生の乱数の並びは変えない
import data from '../data/regions.json';
import { L } from '../i18n';
import { pickWeighted } from './rng';
import { showRng } from './crisis';
import type { Person } from './person';

type Region = [string, string, number];
export const REGIONS = (data as unknown as { regions: Record<string, Region[]> }).regions;
const SALT = 4421;

export function pickRegion(p: Person): void {
  const list = REGIONS[p.birthCountry];
  if (!list || p.city !== null) return;
  const [ja, en] = pickWeighted(showRng(p.seed, 0, SALT), list, (r) => r[2]);
  p.region = L(ja, en);
}
