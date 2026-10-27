// 暮らす場所の空気と、台所の煙。
// 空気: 人口で重みを付けた年平均の微小粒子 (PM2.5) の濃さ (SatPM, ワシントン大学 1998〜2024年)。濃い国ではかすんだ空・マスク・外で遊べない学校の日があり、
//   薄くなった国では澄んでいく空に出会う。
// 台所: 主に薪・炭・家畜の糞・灯油などで煮炊きする人の割合 (WHO、都市と農村、2000〜2024年)。家ごとに一つの順位を持ち、その割合より下にいる家は
//   煙の出る火で煮炊きする。割合が下がってその家の順位を越えた年が、ガスコンロの来る年 (貧しい家ほど遅い)。
// 1990〜99年は、PM2.5 は1998年の値のまま、台所は2000〜10年の傾きで延ばした値。1989年より前とデータの無い国では何も起こさない
// (それより前の台所の煙は moments.json の kitchen-smoke)。2025年からは2024年の値のまま。
// 死にやすさは生命表に入っているので、ここでは健康を少し動かすだけ
// 抽選は見せ方用の乱数で引き、人生の乱数の並びは変えない
import data from '../data/air.json';
import { L } from '../i18n';
import { bump, log, yearOf, type Person } from './person';
import { byCode } from './countries';
import { showRng } from './crisis';
import { clamp, invNorm } from './rng';

type Series = Record<string, (number | null)[]>;
const D = data as unknown as { pmFrom: number; pm: Series; dirtyFrom: number; dirtyU: Series; dirtyR: Series };
const FROM = 1990;
const LAST = 2024;

// 年の値。無い年は近い年の値
function valueAt(s: (number | null)[] | undefined, from: number, y: number): number | undefined {
  if (!s) return undefined;
  const i = clamp(y, from, from + s.length - 1) - from;
  for (let d = 0; d < s.length; d++) for (const j of [i - d, i + d]) if (s[j] !== undefined && s[j] !== null) return s[j]!;
  return undefined;
}

// その国・その年の PM2.5 (µg/m³)
export function pm25(code: string, year: number): number | undefined {
  if (year < FROM) return undefined;
  const v = valueAt(D.pm[code], D.pmFrom, Math.min(year, LAST));
  return v === undefined ? undefined : v / 10;
}

// その国・その年に、煙の出る燃料で煮炊きする人の割合 (0–1)
export function dirtyShare(code: string, rural: boolean, year: number): number | undefined {
  if (year < FROM) return undefined;
  const s = (rural ? D.dirtyR : D.dirtyU)[code];
  const a = valueAt(s, D.dirtyFrom, D.dirtyFrom), b = valueAt(s, D.dirtyFrom, D.dirtyFrom + 10);
  if (a === undefined || b === undefined) return undefined;
  const v = year < D.dirtyFrom ? a + (Math.max(0, a - b) / 10) * (D.dirtyFrom - year) : valueAt(s, D.dirtyFrom, Math.min(year, LAST))!;
  return clamp(v / 100, 0, 1);
}

// 標準正規分布の累積 (Abramowitz & Stegun 7.1.26)
function cdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + e) / 2 : (1 - e) / 2;
}
// 家の順位 (0–1、一様)。生まれた家の所得分位と 0.6 の相関 (豊かな家ほど早く煙のない台所になり、早くテレビが来る)。
// 小さいほど貧しい側。salt ごとに別の順位
export const homeRank = (p: Person, salt = 9101) => cdf(0.6 * invNorm(p.familyP) + 0.8 * invNorm(clamp(showRng(p.seed, 0, salt)(), 1e-6, 1 - 1e-6)));
export const smokyKitchen = (p: Person, year = yearOf(p)): boolean | undefined => {
  const s = dirtyShare(p.country, p.city === null, year);
  return s === undefined ? undefined : homeRank(p) < s;
};

const draw = (p: Person, salt: number) => showRng(p.seed, p.age, 9100 + salt)();
const gap = (p: Person, k: string, years: number) => p.recent[`air:${k}`] === undefined || p.age - p.recent[`air:${k}`] >= years;
const mark = (p: Person, k: string) => { p.recent[`air:${k}`] = p.age; };
const WHO_PM = 5; // WHO の大気質指針 (2021年) の年平均
const ALERTS = ['CHN', 'IND', 'KOR', 'THA', 'MNG', 'PAK', 'IRN', 'NPL', 'BGD', 'VNM', 'MEX', 'CHL', 'POL'];

export function air(p: Person): void {
  const y = yearOf(p);
  if (y < FROM || !p.alive) return;
  kitchen(p, y);
  sky(p, y);
}

function kitchen(p: Person, y: number): void {
  const smoky = smokyKitchen(p, y);
  if (smoky === undefined) return;
  const was = p.recent['air:smoky'];
  p.recent['air:smoky'] = smoky ? 1 : 0;
  if (!smoky) {
    // 去年まで煙の出る火で煮炊きしていた家に、ガスか電気のコンロが来た
    if (was === 1 && p.age >= 4 && gap(p, 'stove', 99)) {
      mark(p, 'stove');
      log(p, p.city === null
        ? L('家にガスのボンベとコンロが来た。もう薪を集めに行かなくてよくなり、台所の壁も黒くならなくなった。', 'A gas cylinder and stove arrived at the house. No more gathering firewood, and the kitchen walls stopped turning black.')
        : L('家にガスコンロが来た。マッチ一本で火がつき、台所に煙がこもらなくなった。', 'A gas stove arrived at the house. One match lit it, and smoke no longer filled the kitchen.'), 'family');
      bump(p, { happy: 3 });
    }
    return;
  }
  // 煙の出る台所。子どもと、煮炊きをすることの多い女性に
  const k = p.age <= 12 ? 0.08 : p.age >= 15 && p.sex === 'F' ? 0.06 : 0.02;
  if (!gap(p, 'smoke', 5) || draw(p, 1) >= k) return;
  mark(p, 'smoke');
  const share = Math.round(dirtyShare(p.country, p.city === null, y)! * 100);
  const stat = p.recent['air:smoke-stat'] === undefined ? ((p.recent['air:smoke-stat'] = p.age), L(`${y}年の${byCode(p.country).name}の${p.city === null ? '農村' : '都市'}では、人々の約${share}%が薪・炭・糞・灯油など煙の出る燃料で煮炊きしていた (WHO)`,
    `In ${y}, about ${share}% of people in ${p.city === null ? 'rural' : 'urban'} ${byCode(p.country).name} cooked mainly with smoky fuels such as wood, charcoal, dung or kerosene (WHO)`)) : undefined;
  const child = p.age <= 12;
  log(p, child
    ? L(`かまどの煙で目がしみ、${p.given}はよく咳をした。`, `The smoke from the cooking fire stung ${p.given}'s eyes, and the coughing never quite stopped.`)
    : p.sex === 'F' && p.age >= 15
      ? L('毎日の煮炊きの煙で、台所の天井はすすで真っ黒だった。夕方になると目が赤くなった。', "The smoke of the daily cooking had blackened the kitchen ceiling. By evening, one's eyes were red.")
      : L('夕方、家の中に煮炊きの煙がこもり、外に出て息をついた。', 'In the evening the cooking smoke filled the house, and stepping outside was the only way to breathe.'), child ? 'child' : 'family', false, stat);
  bump(p, { health: -1 });
}

function sky(p: Person, y: number): void {
  const v = pm25(p.country, y);
  if (v === undefined) return;
  const urban = p.city !== null;
  const statOnce = (k: string) => (p.recent[`air:${k}`] === undefined ? ((p.recent[`air:${k}`] = p.age), L(`${byCode(p.country).name}の人が吸う空気の微小粒子 (PM2.5) は、${y}年の平均で${v.toFixed(0)}µg/m³。WHOの指針の${Math.round(v / WHO_PM)}倍だった (SatPM)`,
    `In ${y} the air people breathed in ${byCode(p.country).name} carried ${v.toFixed(0)} µg/m³ of fine particles (PM2.5) on average, ${Math.round(v / WHO_PM)} times the WHO guideline (SatPM)`)) : undefined);
  // 澄んでいく空: 5〜12年前のいちばん濃い年より、25%以上薄くなった国で、ずっと暮らしてきた人に一度
  if (p.age >= 15 && p.countriesLived.length === 1 && gap(p, 'clear', 999)) {
    let peak = 0, at = 0;
    for (let k = 5; k <= 12; k++) { const w = pm25(p.country, y - k) ?? 0; if (w > peak) { peak = w; at = y - k; } }
    if (peak >= 20 && v <= peak * 0.75 && y <= LAST && draw(p, 2) < 0.3) {
      mark(p, 'clear');
      log(p, L('このところ、青い空の日が増えた。前は、こんなに遠くの山まで見えなかった。', 'There were more blue-sky days these days. A few years ago one could never have seen the mountains this far off.'), 'family', false,
        L(`${byCode(p.country).name}の空気の微小粒子 (PM2.5) は、${at}年の${peak.toFixed(0)}µg/m³から${y}年には${v.toFixed(0)}µg/m³になった (SatPM)`, `Fine particles (PM2.5) in ${byCode(p.country).name} fell from ${peak.toFixed(0)} µg/m³ in ${at} to ${v.toFixed(0)} µg/m³ in ${y} (SatPM)`));
      bump(p, { happy: 2 });
      return;
    }
  }
  // 外で遊べない学校の日とマスクは、大気汚染の注意報で学校が外の活動を止めてきた国の話 (北京・デリー・ソウル・バンコク・ウランバートル・
  // ラホール・テヘラン・カトマンズ・ダッカ・ハノイ・メキシコ市・サンティアゴ・クラクフ)。ナイジェリアの砂ぼこりの季節には出さない
  // ponytail: 注意報のある国の一覧は報道からの目安
  const alerts = ALERTS.includes(p.country);
  // 外で遊べない学校の日 (2010年代から、濃い日に体育や休み時間を室内にする学校が増えた)
  if (alerts && y >= 2010 && p.school.enrolled && p.age >= 6 && p.age <= 15 && v >= 25 && gap(p, 'school', 4) && draw(p, 3) < 0.12 * Math.min(2, v / 35)) {
    mark(p, 'school');
    log(p, L('空気の悪い日で、校庭での体育が取りやめになった。休み時間も教室の窓を閉めたまま過ごした。', 'A bad air day: outdoor PE was cancelled, and even break time was spent in the classroom with the windows shut.'), 'school', false, statOnce('stat'));
    return;
  }
  // マスク (2010年代から、濃い日に外でマスクをつける人が増えた)
  if (alerts && y >= 2010 && urban && p.age >= 6 && v >= 25 && gap(p, 'mask', 8) && draw(p, 4) < 0.1 * Math.min(2, v / 25)) {
    mark(p, 'mask');
    log(p, L('空気の濁った日に、マスクをして出かけた。夕方、白いマスクの口のところが灰色になっていた。', 'Went out in a mask on a smoggy day. By evening the white mask was grey where it covered the mouth.'), 'family', false, statOnce('stat'));
    return;
  }
  // かすんだ空 (WHO の暫定目標1の35µg/m³を超える国)
  if (v >= 35 && p.age >= 5 && gap(p, 'haze', 6) && draw(p, 5) < (urban ? 0.08 : 0.04) * Math.min(2, v / 35)) {
    mark(p, 'haze');
    log(p, urban
      ? L('空が白くかすみ、通りの向こうのビルの上のほうが見えなかった。喉がいがらっぽい日が続いた。', 'The sky was a white haze; the tops of the buildings across the street had vanished. Days of a scratchy throat followed.')
      : L('空がかすんで、いつもは見える遠くの丘が見えなかった。', 'A haze hung over everything, and the far hills that were usually visible had disappeared.'), 'family', false, statOnce('stat'));
    bump(p, { health: -1 });
  }
}
