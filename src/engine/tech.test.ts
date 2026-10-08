import { describe, it, expect } from 'vitest';
import { countryAt } from './countries';
import { createPerson, liveOut } from './life';
import { techShare } from './tech';

// 実測 (2026-10-09): 米国1970年のテレビ 95%、日本1960年のテレビ 21% (実際は4割台。所得のわりに早かった国は外れる)、
// インド2000年の携帯 4% (実際は1%未満)、2010年 71% (実際は6割)、ナイジェリア2020年の電気 58% (実測 55% × 都市寄りの 1.05)
describe('暮らしの道具の広まり', () => {
  it('時代と国の大きな違いが出る', () => {
    expect(techShare(countryAt('USA', 1970), 'tv')).toBeGreaterThan(0.8);
    expect(techShare(countryAt('IND', 2000), 'mobile')).toBeLessThan(0.1);
    expect(techShare(countryAt('IND', 2010), 'mobile')).toBeGreaterThan(0.5);
    expect(techShare(countryAt('JPN', 2005), 'smartphone')).toBeLessThan(0.05);
    expect(Math.abs(techShare(countryAt('NGA', 2020), 'electricity') - 0.58)).toBeLessThan(0.05);
    expect(techShare(countryAt('NGA', 2020), 'electricity', true)).toBeLessThan(techShare(countryAt('NGA', 2020), 'electricity'));
  });
  it('1955年生まれの人生に、2008年より前のスマートフォンは出てこない', () => {
    for (let s = 1; s <= 150; s++) {
      const p = liveOut(createPerson({ seed: s * 31, basis: 'births', country: 'JPN', auto: true, year: 1955 }));
      for (const e of p.log) if (1955 + e.age < 2008) expect(e.text, `${1955 + e.age}年`).not.toMatch(/スマートフォン|SNS|アプリ|動画通話/);
    }
  }, 60_000);
});
