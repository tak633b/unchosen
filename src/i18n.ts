// 表示の言語。日本語と英語。切り替えは保存してから読み込み直す。
// 内部の比較に使う値(地域・宗教・死因の種類など)は日本語のまま持ち、表示の時だけ訳す。
export type Lang = 'ja' | 'en';

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'ja' || saved === 'en') return saved;
    return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  } catch {
    return 'ja'; // テスト(node)では日本語
  }
}

export const lang: Lang = detect();
export const isEn = lang === 'en';

// 日本語と英語を並べて書き、今の言語の方を返す
export const L = (ja: string, en: string): string => (isEn ? en : ja);

export function setLang(next: Lang): void {
  try { localStorage.setItem('lang', next); } catch { /* 保存できなくても今回だけは切り替える */ }
  location.reload();
}

const REGION_EN: Record<string, string> = {
  アフリカ: 'Africa', アジア: 'Asia', ヨーロッパ: 'Europe',
  北アメリカ: 'North America', 南アメリカ: 'South America', オセアニア: 'Oceania',
};
export const regionName = (r: string): string => (isEn ? REGION_EN[r] ?? r : r);

const RELIGION_EN: Record<string, string> = {
  ヒンドゥー教: 'Hindu', イスラム教: 'Muslim', キリスト教: 'Christian', シク教: 'Sikh', その他: 'Other',
  無宗教: 'No religion', '民間信仰・伝統宗教': 'Folk / traditional religion', 仏教: 'Buddhist', ユダヤ教: 'Jewish',
};
export const religionName = (r: string): string => (isEn ? RELIGION_EN[r] ?? r : r);
