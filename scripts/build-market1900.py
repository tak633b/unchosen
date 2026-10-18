# 1900〜1949年の実際の相場の表 (src/engine/market1900.ts) を JST Macrohistory Database から作る。
# 走らせ方: uv run --with pandas python -I scripts/build-market1900.py  (先に node scripts/fetch-data.mjs で data/raw/jst/ を落とす)
# 年ごとの実質の利回り = (1 + 名目) / (1 + 消費者物価の上昇率) - 1。物価は年平均なので、物価が何億倍にもなった年は年末値の株とずれる
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
FROM, TO = 1900, 1949
FLOOR = -99.0  # 1年で失うのは99%まで (残高が0や負にならない)

d = pd.read_stata(ROOT / 'data/raw/jst/JSTdatasetR6.dta')
d = d[(d.year >= FROM - 1) & (d.year <= TO)].sort_values(['iso', 'year']).copy()
d['inf'] = d.groupby('iso').cpi.pct_change()
# 短期金利の抜けた年は前後の年で埋める (物価の動きのほうがずっと大きい)
d['bill'] = d.groupby('iso').bill_rate.transform(lambda s: s.ffill().bfill())
real = lambda nom: ((1 + nom) / (1 + d.inf) - 1) * 100
d['deposit'] = real(d.bill)
d['bond'] = real(d.bond_tr).fillna(d.deposit)       # 国債の記録が無い年は預金と同じだけ目減りしたとみなす
d['stock'] = real(d.eq_tr).fillna(d.bond)           # 取引所が閉じていた年 (日本1946〜47年など) は紙の資産として債券と同じに
d['house'] = real(d.housing_capgain)
d = d[d.year >= FROM]

def fix(iso, year, **kw):
    for k, v in kw.items(): d.loc[(d.iso == iso) & (d.year == year), k] = v

# ドイツ 1922〜24年: 物価 (年平均) と株 (年末) の時点のずれで、株が +93%・+150%・-87% とはねる。3年の複利を均して並べる
g = d[(d.iso == 'DEU') & d.year.between(1922, 1924)].stock
avg = ((1 + g / 100).prod() ** (1 / 3) - 1) * 100
for y in (1922, 1923, 1924): fix('DEU', y, stock=avg)
# 1923年は物価が約10億倍 (年平均)。マルクの預金と国債は消えた。1924年は新しいレンテンマルクで物価が落ち着いた (年平均どうしの比較が見かけの -87% を出す)
fix('DEU', 1923, deposit=FLOOR, bond=FLOOR)
fix('DEU', 1924, deposit=0, bond=0)
# 1948年6月の通貨改革: ライヒスマルクの預金は100対6.5で切り替え、帝国の国債は切り捨て (Deutsche Bundesbank)
fix('DEU', 1948, deposit=-93.5, bond=FLOOR)

COLS = ['deposit', 'bond', 'stock', 'house']
for k in COLS: d[k] = d[k].clip(lower=FLOOR).round(1)

def row(s):
    return '[' + ', '.join('null' if pd.isna(v) else f'{v:g}' for v in s) + ']'

out = []
for iso, g in d.groupby('iso'):
    g = g.set_index('year').reindex(range(FROM, TO + 1))
    if g.deposit.isna().all(): continue  # カナダ・アイルランドは1950年より前の記録が無い
    out.append(f'  {iso}: {{ ' + ', '.join(f'{k}: {row(g[k])}' for k in COLS) + ' },')
# 表の無い国の株は、記録のある国の実質の株の値動きの中央値 (世界の大きな下げ、1931年などが入る)
world = d.groupby('year').stock.median().reindex(range(FROM, TO + 1)).round(1)

(ROOT / 'src/engine/market1900.ts').write_text(f'''// 1900〜1949年の実際の相場 (年ごとの実質の利回り、%)。scripts/build-market1900.py が書く。手で直さない
// 出典: Jordà-Schularick-Taylor Macrohistory Database R6 (Jordà, Knoll, Kuvshinov, Schularick & Taylor 2019 "The Rate of Return on Everything")
// 預金 = 短期金利、債券 = 国債の総収益、株 = 配当込みの総収益、家 = 住宅価格の変化。どれも消費者物価で割り引き、1年で失うのは99%まで
// null は記録の無い年 (長い目で見た統計に戻る)
export type EarlyAsset = 'deposit' | 'bond' | 'stock' | 'house';
export const EARLY_FROM = {FROM};
export const EARLY: Record<string, Record<EarlyAsset, (number | null)[]>> = {{
{chr(10).join(out)}
}};
// 表の無い国の株: 上の国々の実質の株の値動きの中央値
export const EARLY_WORLD: number[] = {row(world)};
''')
print('countries', len(out))
