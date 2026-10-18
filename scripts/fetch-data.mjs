// OWID の grapher CSV を data/raw/ に落とす。一度だけ走らせればよい。
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const SLUGS = {
  population: 'population',
  births: 'number-of-births-per-year',
  lifeExp: 'life-expectancy-of-women-vs-life-expectancy-of-men',
  infant: 'infant-mortality',
  under5: 'child-mortality',
  gdp: 'gdp-per-capita-worldbank',
  gini: 'economic-inequality-gini-index',
  schooling: 'mean-years-of-schooling-long-run',
  tertiary: 'gross-enrollment-ratio-in-tertiary-education',
  agriculture: 'share-of-the-labor-force-employed-in-agriculture',
  fertility: 'children-born-per-woman',
  maternal: 'maternal-mortality',
  hiv: 'share-of-population-infected-with-hiv-ihme',
  homicide: 'homicide-rate-unodc',
  smoking: 'share-of-adults-who-smoke',
  oop: 'share-of-out-of-pocket-expenditure-on-healthcare',
  childMarriage: 'women-married-by-age-18',
  happiness: 'happiness-cantril-ladder',
  flfp: 'female-labor-force-participation-rates',
  electricity: 'share-of-the-population-with-access-to-electricity',
};

const dir = new URL('../data/raw/', import.meta.url);
await mkdir(dir, { recursive: true });

for (const [key, slug] of Object.entries(SLUGS)) {
  const url = `https://ourworldindata.org/grapher/${slug}.csv?v=1&csvType=full&useColumnShortNames=true`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} ${url}`);
  const text = await res.text();
  await writeFile(new URL(`${key}.csv`, dir), text);
  console.log(key, text.split('\n').length, 'lines |', text.split('\n')[0]);
}

// Gapminder (1800〜2100年、CC BY 4.0)。1人当たりGDP は暦年の GDP の形に使う。
// 平均寿命・5歳未満死亡率・人口・合計特殊出生率は、1900〜1949年 (国連 WPP より前) を延ばすのに使う (build-era.mjs)
await mkdir(new URL('gapminder/', dir), { recursive: true });
const GM = {
  gdp_pcap: 'gdp_pcap', lex: 'lex', pop: 'pop',
  u5mr: 'child_mortality_0_5_year_olds_dying_per_1000_born', tfr: 'children_per_woman_total_fertility',
};
for (const [file, concept] of Object.entries(GM)) {
  const url = `https://raw.githubusercontent.com/open-numbers/ddf--gapminder--fasttrack/master/countries_etc_datapoints/ddf--datapoints--${concept}--by--country--time.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gapminder ${file}: HTTP ${res.status}`);
  await writeFile(new URL(`gapminder/${file}.csv`, dir), await res.text());
  console.log('gapminder', file);
}

// 国連 WPP 2024 (CC BY 3.0 IGO)。単歳の生命表は男女・過去/予測の4本で約800MB あるので、すでにあれば落とさない
await mkdir(new URL('wpp/', dir), { recursive: true });
const WPP = 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/';
for (const f of ['WPP2024_Demographic_Indicators_Medium.csv.gz',
  ...['Female', 'Male'].flatMap((s) => ['1950-2023', '2024-2100'].map((y) => `WPP2024_Life_Table_Complete_Medium_${s}_${y}.csv.gz`))]) {
  const to = new URL(`wpp/${f}`, dir);
  if (await stat(to).then(() => true, () => false)) { console.log('wpp', f, 'already here'); continue; }
  const res = await fetch(WPP + f);
  if (!res.ok) throw new Error(`wpp ${f}: HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(to));
  console.log('wpp', f);
}

// Jordà-Schularick-Taylor Macrohistory Database R6 (18か国 1870〜2020年、CC BY-NC-SA 4.0)。
// 名前は .xlsx だが中身は Stata の .dta。1900〜1949年の実際の相場に使う (build-market1900.py)
await mkdir(new URL('jst/', dir), { recursive: true });
{
  const res = await fetch('https://www.macrohistory.net/app/download/9834512469/JSTdatasetR6.xlsx', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`jst: HTTP ${res.status}`);
  await writeFile(new URL('jst/JSTdatasetR6.dta', dir), Buffer.from(await res.arrayBuffer()));
  console.log('jst JSTdatasetR6.dta');
}
