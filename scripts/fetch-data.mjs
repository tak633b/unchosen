// OWID の grapher CSV を data/raw/ に落とす。一度だけ走らせればよい。
import { writeFile, mkdir } from 'node:fs/promises';

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
