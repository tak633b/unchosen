import { describe, expect, it } from 'vitest';
import { createPerson, fromSaved, liveOut, toSaved } from './life';
import { petTies } from './pets';
import { continueAs, heirs } from './lineage';

const lives = (n: number, from = 1) => Array.from({ length: n }, (_, i) => liveOut(createPerson({ seed: (from + i) * 6151 + 7, basis: 'births', auto: true, year: [1960, 1990, 2020][i % 3], country: ['JPN', 'USA', undefined][i % 3] })));

// 実測 (2026-10-09): 300人で飼ったペット251匹 (犬159・猫92)、うち亡くなったもの235匹、犬と猫の両方を飼った人30人。
// 連れ合いで続けた6回のうち3回でペットが一緒に来た (残りは、連れ合いの一生にもう自分のペットがいた)
describe('飼ったペットが人の輪に並ぶ', () => {
  it('輪のペットの数と生死が、飼った数と今いるペットに合う', () => {
    let pets = 0, dead = 0;
    for (const p of lives(300)) {
      const ties = petTies(p);
      expect(ties.length).toBe(p.petsHad);
      expect(ties.filter((t) => t.alive).length).toBe(p.pet ? 1 : 0);
      if (p.pet) expect(ties.find((t) => t.alive)!.age).toBe(p.pet.age);
      for (const t of ties) {
        if (!t.alive) expect(t.diedAt).toBeGreaterThanOrEqual(t.since);
        expect(t.mem?.length).toBeGreaterThan(0); // 家族になった日は必ず残る
        expect(t.pet === '犬' || t.pet === '猫').toBe(true);
      }
      pets += ties.length;
      dead += ties.filter((t) => !t.alive).length;
    }
    expect(pets).toBeGreaterThan(200);
    expect(dead).toBeGreaterThan(180);
  }, 60_000);

  it('保存して戻しても同じ。記録の無い古いセーブでも今のペットが並ぶ', () => {
    for (const p of lives(80, 500)) {
      expect(petTies(fromSaved(JSON.parse(JSON.stringify(toSaved(p)))))).toEqual(petTies(p));
      const old = JSON.parse(JSON.stringify(toSaved(p)));
      delete old.pets;
      expect(petTies(fromSaved(old)).length).toBe(p.pet ? 1 : 0);
    }
  });

  it('連れ合いで続けると、生きているペットも一緒に来る', () => {
    let carried = 0;
    for (const p of lives(200, 900)) {
      if (!p.pet) continue;
      const s = heirs(p).find((t) => t.role === 'spouse');
      if (!s) continue;
      const q = continueAs(p, s.id!);
      if (q.pet?.name === p.pet.name) carried++;
      expect(petTies(q).filter((t) => t.alive).length).toBe(q.pet ? 1 : 0);
      expect(petTies(q).length).toBe(q.petsHad);
    }
    expect(carried).toBeGreaterThan(0);
  }, 120_000);
});

// 犬を思って書いた出来事 (雨の日の散歩・同じ速さで歩く) は、猫のときは猫の文になる。選ばれ方は同じ (乱数の並びは変わらない)
describe('ペットの出来事は、その種類に合う', () => {
  it('猫に散歩の文が出ず、犬に昼寝・窓辺の文が出ない', () => {
    const dogOnly = /散歩|ゆっくり歩く/, catOnly = /窓辺|日だまり/;
    let cat = 0, dog = 0;
    for (const p of lives(600, 2000)) for (const t of p.pets ?? []) for (const m of t.mem) {
      if (t.kind === '猫') { expect(m.text).not.toMatch(dogOnly); if (catOnly.test(m.text)) cat++; }
      else { expect(m.text).not.toMatch(catOnly); if (dogOnly.test(m.text)) dog++; }
    }
    expect(cat).toBeGreaterThan(0);
    expect(dog).toBeGreaterThan(0);
  }, 120_000);
});
