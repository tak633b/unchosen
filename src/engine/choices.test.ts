import { describe, it, expect } from 'vitest';
import { advanceYear, createPerson, fromSaved, liveOut, toSaved } from './life';
import { COUNTRIES } from './countries';
import { CHOICES, RATE, type Choice } from './events/choices';
import { fits } from './events/moments';

const PLACEHOLDERS = ['name', 'city', 'country', 'friend', 'who', 'whoName', 'money'];
const WHEN_KEYS = ['place', 'wealth', 'income', 'region', 'countries', 'religion', 'state', 'sex', 'married', 'widowed', 'hasChildren', 'hasPet', 'migrated', 'youngChild', 'parentAlive', 'fatherAlive', 'motherAlive', 'sibling', 'teenChild', 'livingAlone', 'job'];
const KINDS = ['child', 'school', 'work', 'family', 'love', 'loss', 'ill', 'move', 'old', 'hard'];
const TECH = ['electricity', 'appliance', 'tv', 'car', 'mobile', 'smartphone', 'internet', 'computer'];
const STATS = ['health', 'happy', 'money', 'learn', 'bond'];
const CODES = new Set(COUNTRIES.map((c) => c.code));

// 1件の中の、日本語と英語の文を全部 [どこ, 日本語, 英語] で並べる
function texts(c: Choice): [string, string | undefined, string | undefined][] {
  return [
    ['title', c.title, c.en?.title], ['text', c.text, c.en?.text], ['stat', c.stat, c.stat && c.en?.stat],
    ...c.options.flatMap((o, i) => [
      [`opt${i}.label`, o.label, o.en?.label], [`opt${i}.hint`, o.hint, o.hint && o.en?.hint], [`opt${i}.text`, o.text, o.text && o.en?.text],
      ...o.outcomes.map((r, j) => [`opt${i}.out${j}`, r.text, r.text && r.en?.text] as [string, string | undefined, string | undefined]),
    ] as [string, string | undefined, string | undefined][]),
  ];
}

describe('分かれ道のデータ', () => {
  it('どの選択も形がそろっている', () => {
    const ids = new Set<string>();
    for (const c of CHOICES) {
      const at = c.id;
      expect(at).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(ids.has(at), `${at} が重複`).toBe(false);
      ids.add(at);
      expect(c.minAge <= c.maxAge && c.minAge >= 0, at).toBe(true);
      expect(c.weight, at).toBeGreaterThan(0);
      expect(c.options.length, at).toBeGreaterThanOrEqual(2);
      expect(c.options.length, at).toBeLessThanOrEqual(4);
      expect(c.options.some((o) => (o.auto ?? 1) > 0), `${at} 自動で選べる選択肢がない`).toBe(true);
      for (const k of Object.keys(c.when ?? {})) expect(WHEN_KEYS, `${at} when.${k}`).toContain(k);
      for (const code of c.when?.countries ?? []) expect(CODES.has(code), `${at} ${code}`).toBe(true);
      for (const t of c.tech ?? []) expect(TECH, at).toContain(t);
      if (c.whoAge) expect(c.who, `${at} whoAge は child と使う`).toBe('child');
      for (const [where, ja, en] of texts(c)) {
        if (!ja) continue;
        expect(en, `${at} ${where} に英語がない`).toBeTruthy();
        for (const s of [ja, en!]) {
          const used = [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
          for (const u of used) expect(PLACEHOLDERS, `${at} ${where}: {${u}}`).toContain(u);
          if (used.includes('who') || used.includes('whoName')) expect(c.who, `${at} ${where}: who がないのに {who}`).toBeTruthy();
          if (used.includes('money')) expect(c.amount, `${at} ${where}: amount がないのに {money}`).toBeGreaterThan(0);
        }
        // 出てくる人を文の中で死なせない。死はシミュレーションが決め、why を付ける (why.test.ts)
        if (c.who && where.includes('.out')) expect(ja, `${at} ${where}: who の選択で人が亡くなる文`).not.toMatch(/亡くな|死んだ|死んで/);
        // 英語の文に日本語が混ざっていない
        expect(en, `${at} ${where}`).not.toMatch(/[぀-ヿ一-鿿]/);
      }
      for (const o of c.options) {
        expect(o.outcomes.length, at).toBeGreaterThan(0);
        expect(o.outcomes.reduce((s, r) => s + r.weight, 0), at).toBeGreaterThan(0);
        for (const e of [o, ...o.outcomes]) for (const k of Object.keys(e.effects ?? {})) expect(STATS, at).toContain(k);
        for (const r of o.outcomes) {
          expect(r.weight, at).toBeGreaterThan(0);
          if (r.kind) expect(KINDS, at).toContain(r.kind);
          if (r.after !== undefined) expect(Number.isInteger(r.after) && r.after > 0, at).toBe(true);
        }
      }
    }
  });
});

describe('分かれ道の出方', () => {
  // 既存の決定は、分かれ道を足す前に同じ300人で測って1人あたり24.3回。足したあとは28.6回で、うち分かれ道が4.7回 (2026-10-09)
  it('1人あたりの決定は、分かれ道を足しても以前の1.5倍以内', () => {
    let decisions = 0, choices = 0;
    for (let s = 1; s <= 300; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', auto: true }));
      decisions += p.decisions;
      choices += Object.keys(p.recent).filter((k) => k.startsWith('choice:')).length;
    }
    expect(decisions / 300).toBeLessThanOrEqual(24.3 * 1.5);
    expect(choices / 300).toBeGreaterThan(0);
    expect(choices / 300).toBeLessThanOrEqual(RATE * 120);
  }, 120_000);

  // 国を限った選択は、その国にいる年にしか出ない (根拠: デング熱の出来事が日本で出た報告。moment-when.test.ts と同じ考え)
  it('国を限った選択は、ほかの国では出ない', () => {
    const limited = new Map(CHOICES.filter((c) => c.when?.countries).map((c) => [`choice:${c.id}`, c.when!.countries!]));
    let seen = 0;
    for (const country of ['JPN', 'KEN', 'USA', 'IND']) {
      for (let s = 1; s <= 150; s++) {
        const p = createPerson({ seed: s * 7919, basis: 'births', country, year: 1950, auto: true });
        for (let y = 0; y < 120 && p.alive; y++) {
          const before = { ...p.recent };
          advanceYear(p);
          for (const [k, list] of limited) {
            if (p.recent[k] === undefined || before[k] !== undefined) continue;
            seen++;
            expect(list, `${k} が ${p.country} で出た (seed ${s * 7919})`).toContain(p.country);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  }, 120_000);

  it('何年か後の結果は、保存して読み込み直しても届く', () => {
    const c = CHOICES.find((x) => x.id === 'plant-tree')!;
    const o = c.options[0].outcomes.findIndex((r) => r.after);
    const p = createPerson({ seed: 4242, basis: 'births', auto: true });
    for (let y = 0; y < 30 && p.alive; y++) advanceYear(p);
    expect(p.alive).toBe(true);
    p.later = [{ age: p.age + 2, id: c.id, o: 0, r: o }];
    const q = fromSaved(JSON.parse(JSON.stringify(toSaved(p))));
    expect(q.later).toEqual(p.later);
    const head = c.options[0].outcomes[o].text!.slice(0, 8);
    advanceYear(q);
    expect(q.log.some((e) => e.text.startsWith(head))).toBe(false);
    advanceYear(q);
    if (!q.alive) return; // その年に亡くなったら届かない
    expect(q.log.some((e) => e.age === q.age && e.text.startsWith(head))).toBe(true);
    expect(q.later).toEqual([]);
  });

  it('自然な一生の中でも、何年か後の結果が届く', () => {
    const delayed = CHOICES.flatMap((c) => c.options.flatMap((o) => o.outcomes.filter((r) => r.after && r.text).map((r) => r.text!.slice(0, 10))));
    let n = 0;
    for (let s = 1; s <= 300; s++) {
      const p = liveOut(createPerson({ seed: s * 7919, basis: 'births', auto: true }));
      n += p.log.filter((e) => delayed.some((d) => e.text.startsWith(d))).length;
    }
    expect(n).toBeGreaterThan(0);
  }, 120_000);
});

describe('widowed の条件', () => {
  it('連れ合いを亡くし、再婚していない人だけ', () => {
    const p = createPerson({ seed: 4242, basis: 'births', auto: true });
    const sp = { alive: true, age: 40, sex: 'F' as const, name: 'A', id: 900 };
    expect(fits(p, { widowed: true })).toBe(false); // 結婚したことがない
    p.spouse = { ...sp };
    expect(fits(p, { widowed: true })).toBe(false);
    p.spouse.alive = false;
    expect(fits(p, { widowed: true })).toBe(true);
    expect(fits(p, { widowed: false })).toBe(false);
    // 再婚: 亡くなった連れ合いは ties に移り、今の連れ合いは生きている
    p.ties = [...(p.ties ?? []), { ...sp, alive: false, role: 'spouse', since: 0, until: 1 }];
    p.spouse = { ...sp, id: 901 };
    expect(fits(p, { widowed: true })).toBe(false);
    p.spouse.alive = false;
    expect(fits(p, { widowed: true })).toBe(true);
  });
});

describe('真偽の条件の false', () => {
  it('motherAlive: false は母が亡くなった人だけ', () => {
    const p = createPerson({ seed: 4242, basis: 'births', auto: true });
    expect(fits(p, { motherAlive: false })).toBe(false);
    p.mother.alive = false;
    expect(fits(p, { motherAlive: false })).toBe(true);
    expect(fits(p, { motherAlive: true })).toBe(false);
  });
});
