// 死亡記録の小さな世界地図: 生まれた国から暮らした国へ、番号の点を線でつなぐ。正距円筒図法の SVG。
// 陸の形は持たず、162か国の中心点 (src/data/centroids.json) を薄い点でまいて大陸の気配だけ出す
import centroids from '../data/centroids.json';
import { byCode } from '../engine/countries';
import { esc } from './dom';
import { L } from '../i18n';

const C = centroids as unknown as Record<string, [number, number]>;
export const MAP_W = 360, MAP_H = 150; // 緯度は -60〜85 だけ描く (南極を切る)
const W = MAP_W, H = MAP_H;
// 国の中心点を地図の座標に。canvas の共有カード (sharecards.ts) も同じ座標を使う
export const xy = (code: string): [number, number] | null => {
  const c = C[code];
  return c ? [c[1] + 180, 85 - c[0]] : null;
};
export const landXY = (): [number, number][] => Object.keys(C).map((k) => xy(k)!);

// codes: 暮らした国の順 (最初が生まれた国)。同じ国が続けば1つにまとめる
export function worldMap(codes: string[]): string {
  const path = codes.filter((c, i) => c !== codes[i - 1]).map((c) => ({ c, at: xy(c) })).filter((s): s is { c: string; at: [number, number] } => !!s.at);
  if (!path.length) return '';
  const land = landXY().map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.1"/>`).join('');
  const line = path.length > 1 ? `<polyline points="${path.map(({ at }) => `${at[0].toFixed(1)},${at[1].toFixed(1)}`).join(' ')}"/>` : '';
  const pts = path.map(({ c, at }, i) => `<g class="wpt"><circle cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="4"/><text x="${at[0].toFixed(1)}" y="${(at[1] + 1.6).toFixed(1)}">${i + 1}</text><title>${i + 1}. ${esc(byCode(c).name)}</title></g>`).join('');
  const names = path.map(({ c }, i) => `${i + 1}. ${esc(byCode(c).name)}`).join(L('　→　', '  →  '));
  return `<svg class="worldmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="${L('暮らした国の地図', 'Map of countries lived in')}">
    <g class="wland">${land}</g><g class="wline">${line}</g>${pts}</svg><p class="note">${names}</p>`;
}
