// 人生の長さ: 1年にかける時間の倍率。約30分 (1倍速で1年 ≈ 26秒) を 1 として、約1時間・約1時間半。この端末に残す
import { load, save } from './dom';
import { L } from '../i18n';

export const BASE_YEAR_MS = 26000; // 1倍速で1年 = 26秒 (平均寿命まで約30分)
export const PACES: [number, string][] = [[1, L('約30分', 'About 30 min')], [2, L('約1時間', 'About 1 hour')], [3, L('約1時間半', 'About 90 min')]];

export const pace = (): number => (PACES.some(([k]) => k === load<number>('pace', 1)) ? load<number>('pace', 1) : 1);
export const setPace = (k: number): void => save('pace', k);
export const yearMs = (): number => BASE_YEAR_MS * pace();

// トップ画面の1行: 人生の長さ [約30分][約1時間][約1時間半]
export const paceSeg = (): string => `<div class="pacerow"><span class="note">${L('人生の長さ', 'Length of a life')}</span>
  <span class="seg">${PACES.map(([k, label]) => `<button data-pace="${k}" class="${pace() === k ? 'on' : ''}" title="${L(`1倍速で1年 ≈ ${Math.round(BASE_YEAR_MS * k / 1000)}秒`, `1 year ≈ ${Math.round(BASE_YEAR_MS * k / 1000)}s at 1×`)}">${label}</button>`).join('')}</span></div>`;
