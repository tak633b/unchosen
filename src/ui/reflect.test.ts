import { describe, expect, it } from 'vitest';
import { advanceYear, createPerson, PAUSE_AGES } from '../engine/life';
import { pickQuestion, questionPool } from './pause';
import { lifeMapCells } from './lifemap';
import { addMoment, momentOf, pickMoments, type Moment } from './album';
import { addLife, MAX_PAST, storeLives } from './past';

const person = (s: number) => createPerson({ seed: s * 7919 + 3, basis: 'births', auto: true, year: 1990 });

describe('ひと息の問い', () => {
  it('どの止まる年齢にも問いがあり、同じ人生なら同じ問い', () => {
    const p = person(1);
    for (const age of PAUSE_AGES) {
      const q = pickQuestion(p, age);
      expect(q.length).toBeGreaterThan(0);
      expect(pickQuestion(p, age)).toBe(q);
    }
    expect(pickQuestion(p, 6)).toBe('');
  });
  it('人生が変われば、違う問いも出る (年齢ごとに札が複数ある)', () => {
    for (const age of PAUSE_AGES) {
      const seen = new Set(Array.from({ length: 60 }, (_, s) => pickQuestion(person(s), age)));
      expect(seen.size).toBeGreaterThan(1);
    }
  });
  it('学校に行っていない15歳には、それにふれた札から引く', () => {
    const out = { school: { enrolled: false }, working: false } as Parameters<typeof questionPool>[0];
    const inn = { school: { enrolled: true }, working: false } as Parameters<typeof questionPool>[0];
    expect(questionPool(out, 15)).not.toEqual(questionPool(inn, 15));
  });
});

describe('人生地図', () => {
  it('亡くなった年が最後のマスで死の色。行は10年単位', () => {
    const cells = lifeMapCells({ kinds: ['child', undefined, 'school', undefined, 'ill', undefined, 'death'], age: 6, alive: false });
    expect(cells.length).toBe(10);
    expect(cells[6].kind).toBe('death');
    expect(cells.slice(7).every((c) => c.kind === 'future')).toBe(true);
    // 記録の無い年は前の暮らし (学び) の色。病気はその年だけ
    expect(cells.map((c) => c.kind).slice(0, 6)).toEqual(['child', 'child', 'school', 'school', 'ill', 'school']);
  });
  it('生きている間は今の年に印、先の年は暗いマス、ひと息を書いた年に点', () => {
    const cells = lifeMapCells({ kinds: ['child'], age: 15, alive: true, noted: [5] }, 80);
    expect(cells.length).toBe(80);
    expect(cells[15].now).toBe(true);
    expect(cells[16].kind).toBe('future');
    expect(cells[5].note).toBe(true);
    expect(cells.filter((c) => c.now).length).toBe(1);
  });
});

describe('思い出のアルバム', () => {
  it('撮っても人生は変わらない。撮った枚数は上限まで', () => {
    const a = person(5), b = person(5);
    let album: Moment[] = [];
    while (a.alive) {
      advanceYear(a);
      advanceYear(b);
      if (a.alive) album = addMoment(album, momentOf(a));
    }
    expect(a.age).toBe(b.age);
    expect(a.log.map((e) => e.text)).toEqual(b.log.map((e) => e.text));
    expect(album.length).toBeLessThanOrEqual(24);
    expect(new Set(album.map((m) => m.age)).size).toBe(album.length);
  });
  it('多すぎれば最初と最後を残して間引く', () => {
    const list = Array.from({ length: 30 }, (_, i) => i);
    const kept = pickMoments(list, 12);
    expect(kept.length).toBe(12);
    expect(kept[0]).toBe(0);
    expect(kept[11]).toBe(29);
  });
});

describe('前世の記録', () => {
  it(`新しい人生が先頭、${MAX_PAST}件まで`, () => {
    let list: number[] = [];
    for (let i = 0; i < 15; i++) list = addLife(list, i);
    expect(list.length).toBe(MAX_PAST);
    expect(list[0]).toBe(14);
  });
  it('入りきらなければ古いものから落として、新しい人生は残す', () => {
    const kept: string[] = [];
    const store = { setItem: (_k: string, v: string) => { if (v.length > 30) throw new Error('quota'); kept.push(v); } };
    const n = storeLives(['new-life', 'old-life-1', 'old-life-2', 'old-life-3'], store);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(4);
    expect(JSON.parse(kept[0])[0]).toBe('new-life');
    expect(storeLives(['x'], null)).toBe(0);
  });
});
