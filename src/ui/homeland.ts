// あなたが実際に生まれた国と比べる: この人生の数字を、生まれた国と、あなたの国の「ふつうの一生」と並べる。
// ふつうの一生 = 同じ年に生まれた人の平均寿命、大人になった年 (30歳) の教育年数・1人当たりGDP・出生率。
// 実際の国はトップ画面か、ここで選ぶ (この端末にだけ保存)
import { COUNTRIES, countryAt, type Country } from '../engine/countries';
import { bornTable, type Sex } from '../engine/lifetable';
import type { Brief } from './otherview';
import { esc, load, save } from './dom';
import { isEn, L, lang } from '../i18n';

export interface HomeLife { birthCountry: string; birthYear: number; sex: Sex; age: number; me?: Brief }

const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
const yrs = (v: number) => L(`${v.toFixed(v % 1 ? 1 : 0)}年`, v.toFixed(v % 1 ? 1 : 0));

function typical(code: string, l: HomeLife): { e0: number; c: Country } {
  return { e0: bornTable(countryAt(code, l.birthYear), l.sex, l.birthYear).e0, c: countryAt(code, l.birthYear + 30) };
}

export function homeCompare(l: HomeLife): string {
  const real = load<string | null>('realCountry', null);
  const head = `<h3>${L('あなたの国と比べる', 'Compared with your country')} <small>${L('同じ年に生まれた、ふつうの一生', 'a typical life, born the same year')}</small></h3>`;
  const sorted = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, lang));
  const pick = `<label class="field homepick">${L('あなたが実際に生まれた国', 'The country you were actually born in')}
    <select data-home><option value="">${L('選ばない', 'Skip')}</option>${sorted.map((c) => `<option value="${c.code}" ${c.code === real ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <span class="note">${L('この端末にだけ保存。', 'Saved only on this device.')}</span></label>`;
  const b = typical(l.birthCountry, l);
  const r = real ? typical(real, l) : null;
  const me = l.me;
  const rows: [string, string, (t: { e0: number; c: Country }) => string][] = [
    [L('生きた年数', 'Years lived'), yrs(l.age), (t) => yrs(t.e0)],
    [L('学校に通った年数', 'Years of school'), me && me.edu >= 0 ? yrs(me.school) : '—', (t) => yrs(t.c.school)],
    [L('いちばん稼いだ年の所得', 'Best year’s income'), me?.peak ? money(me.peak) : '—', (t) => money(t.c.gdp)],
    [L('子ども', 'Children'), me ? L(`${me.kids}人`, String(me.kids)) : '—', (t) => (isEn ? t.c.tfr.toFixed(1) : `${t.c.tfr.toFixed(1)}人`)],
  ];
  const b0 = countryAt(l.birthCountry, l.birthYear).name;
  const table = `<table class="cmp"><tr><th></th><th>${L('この人生', 'This life')}</th><th>${esc(b0)}<small>${L('ふつう', 'typical')}</small></th>${r ? `<th>${esc(r.c.name)}<small>${L('あなたの国', 'your country')}</small></th>` : ''}</tr>
    ${rows.map(([k, mine, f]) => `<tr><td>${k}</td><td><b>${mine}</b></td><td>${f(b)}</td>${r ? `<td>${f(r)}</td>` : ''}</tr>`).join('')}</table>
    <p class="note">${L('ふつうの一生は、生きた年数が同じ年に生まれた人の平均寿命、ほかは30歳になった年の国の平均(所得は1人当たりGDP、子どもは合計特殊出生率)。', 'For a typical life: years lived is the life expectancy of people born that year; the rest are national averages in the year they turned 30 (income is GDP per person, children is the fertility rate).')}</p>`;
  return `${head}${table}${pick}`;
}

// 国を選び直したら、その場で並べ直す
export function mountHomeCompare(root: HTMLElement, l: HomeLife): void {
  const box = root.querySelector<HTMLElement>('.homecmp');
  if (!box) return;
  box.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-home]');
    if (!sel) return;
    save('realCountry', sel.value || null);
    box.innerHTML = homeCompare(l);
  });
}
