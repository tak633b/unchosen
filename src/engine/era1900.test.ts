import { describe, it, expect } from 'vitest';
import { advanceYear, createPerson } from './life';
import { lifeStory, nowLine } from './summary';
import { techWeight } from './events/moments';
import { yearOf, type Person } from './person';

// 1900〜1949年に生まれた人の一生 (国をまたいで少しずつ)
const COUNTRIES = ['JPN', 'KOR', 'CHN', 'IND', 'USA', 'GBR', 'DEU', 'RUS', 'BRA', 'NGA', 'EGY', 'MEX', 'IDN'];
function lives(n: number, from: number, span: number): { p: Person; lines: [number, string][] }[] {
  const out: { p: Person; lines: [number, string][] }[] = [];
  for (let i = 0; i < n; i++) {
    const p = createPerson({ seed: 4001 + i * 7919, basis: 'births', auto: true, year: from + (i * 7) % span, country: COUNTRIES[i % COUNTRIES.length] });
    while (p.alive && p.age < 120) advanceYear(p);
    out.push({ p, lines: p.log.map((e) => [p.birthYear + e.age, e.text]) });
  }
  return out;
}

describe('1900年代前半に生まれた人の一生', () => {
  const all = lives(160, 1900, 50);

  it('記録とまとめに NaN・undefined が出ない', () => {
    for (const { p, lines } of all) {
      for (const [, t] of lines) expect(t, `${p.birthCountry} ${p.birthYear}`).not.toMatch(/NaN|undefined|Infinity/); // 数の計算が壊れた印
      expect(lifeStory(p)).not.toMatch(/NaN|undefined/);
      expect(nowLine(p)).not.toMatch(/NaN|undefined/);
    }
  });

  // 根拠: それぞれ世に出る前の年。テレビ放送 1936年、携帯電話 1983年、スマートフォン 2007年、家庭のパソコン 1975年ごろ、インターネット 1991年
  it('1936年より前の年に、テレビ・携帯・スマホ・パソコン・ネットの出てくる出来事が起きない', () => {
    const seen: string[] = [];
    for (const { lines } of all) for (const [y, t] of lines) if (y < 1936 && /テレビ|携帯|スマホ|スマートフォン|パソコン|ネット|アプリ|ゲーム/.test(t)) seen.push(`${y} ${t}`);
    expect(seen).toEqual([]);
  });

  // 根拠: 株価指数のインデックスファンドは1976年 (バンガード) が最初
  it('1976年より前にインデックスファンドを選ばない', () => {
    const seen: string[] = [];
    for (const { lines } of all) for (const [y, t] of lines) if (y < 1976 && t.includes('インデックスファンド')) seen.push(`${y} ${t}`);
    expect(seen).toEqual([]);
  });
});

describe('道具の広まりは、その人の暦年で見る', () => {
  // countryAt は持っている値の最初の年で止まるので、国の値の年 (c.year) ではなく暦年で見る
  it('1930年にはテレビもスマホもない。2020年の日本にはある', () => {
    const p = createPerson({ seed: 7, basis: 'births', auto: true, year: 1905, country: 'USA' });
    p.age = 25;
    expect(yearOf(p)).toBe(1930);
    expect(techWeight(p, { tech: ['tv'] })).toBe(0);
    expect(techWeight(p, { tech: ['smartphone'] })).toBe(0);
    const q = createPerson({ seed: 7, basis: 'births', auto: true, year: 1990, country: 'JPN' });
    q.age = 30;
    expect(techWeight(q, { tech: ['tv'] })).toBeGreaterThan(0.5);
  });
});
