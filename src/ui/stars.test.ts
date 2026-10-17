import { describe, expect, it } from 'vitest';
import { createPerson, liveOut } from '../engine/life';
import { STAR_MAX, starred, toggleStar } from './stars';
import { lookbackOf, timeSpentHtml } from './lookback';
import { worldMap } from './worldmap';
import { orgsHtml } from './orgs';
import type { PastLife } from './death';

const life = () => liveOut(createPerson({ seed: 7, basis: 'births', auto: true, year: 1960 }));

describe('☆ 覚えておきたい瞬間', () => {
  it('12個まで付けられ、もう一度押すと外れる', () => {
    const p = life();
    expect(p.log.length).toBeGreaterThan(STAR_MAX);
    for (let i = 0; i < STAR_MAX; i++) expect(toggleStar(p, i)).toBe(true);
    expect(toggleStar(p, STAR_MAX)).toBe(false);
    expect(starred(p.log)).toHaveLength(STAR_MAX);
    expect(toggleStar(p, 0)).toBe(true);
    expect(starred(p.log)).toHaveLength(STAR_MAX - 1);
    expect(toggleStar(p, 9999)).toBe(false);
  });
});

describe('振り返って・時間を注いだこと・地図', () => {
  it('3行とも空にならず、18歳からの年を数え、地図は国の数だけ点を打つ', () => {
    const p = life();
    const b = lookbackOf(p);
    expect(b.saved && b.kept && b.lost).toBeTruthy();
    const html = timeSpentHtml(p.kinds, p.age);
    if (p.age >= 20) expect(html).toContain('年');
    expect(timeSpentHtml(p.kinds, 10)).toBe('');
    expect(worldMap(['JPN', 'JPN', 'USA']).match(/class="wpt"/g)).toHaveLength(2);
    expect(worldMap(['ZZZ'])).toBe('');
  });
});

describe('この活動をしている団体', () => {
  it('人生に実際にあった困難だけを、3つまで出す', () => {
    const base = { log: [], cause: '', circle: [], me: undefined, age: 70 } as unknown as PastLife;
    expect(orgsHtml(base)).toBe('');
    const hard = { ...base, cause: '下痢による脱水', log: [{ age: 3, text: '飢饉で村を離れた。', kind: 'hard' }, { age: 5, text: '学校へ行く年になったが、通えなかった。', kind: 'hard' }],
      circle: [{ id: 1, role: 'child', alive: false, since: 20, diedAt: 22 }, { id: 2, role: 'child', alive: false, since: 30, diedAt: 50 }] } as unknown as PastLife;
    const html = orgsHtml(hard);
    expect(html.match(/<tr>/g)).toHaveLength(3); // 5歳未満の子・水・飢饉 (学校は4つ目なので入らない)
    expect(html).toContain('unicef.org');
  });
});
