import { describe, it, expect } from 'vitest';
import { parseJson } from './client';
import { applyYear, sanitizeWords, sanitizeYear, TONES, type BondAsk } from './apply';
import { lastWords } from './director';
import { circle, people } from '../engine/bonds';
import { createPerson, liveOut } from '../engine/life';
import type { Tie } from '../engine/person';

describe('parseJson', () => {
  it('思考タグやコードフェンスの中から最初の JSON を取り出す', () => {
    const t = '<think>考え中 {"x":1}</think>\n```json\n{"moments":[{"text":"雨が降った。"}],"note":"a}b"}\n```\nおまけ';
    expect(parseJson(t)).toEqual({ moments: [{ text: '雨が降った。' }], note: 'a}b' });
  });
  it('JSON がなければ例外', () => {
    expect(() => parseJson('ごめんなさい')).toThrow();
  });
});

describe('sanitizeYear', () => {
  it('影響の数値とお金を範囲に丸める', () => {
    const y = sanitizeYear({
      moments: [{ text: '井戸の水が冷たかった。' }],
      event: { text: '市場で財布を落とした。', effects: { health: -99, happy: 4.6, wealth: 50 }, money: -9 },
    });
    expect(y.moments).toEqual(['井戸の水が冷たかった。']);
    expect(y.event?.effects).toEqual({ health: -10, happy: 5 });
    expect(y.event?.money).toBe(-0.5);
  });
  it('人生の骨格に触れる文 (死・結婚・出産など) は捨てる', () => {
    const y = sanitizeYear({ moments: [{ text: '祖父が亡くなった。' }, { text: '結婚した。' }, { text: '畑に雨が降った。' }] });
    expect(y.moments).toEqual(['畑に雨が降った。']);
  });
  it('選択肢が2つに満たない決断は使わない', () => {
    const y = sanitizeYear({ moments: [], decision: { title: '迷う', text: 'どうする？', options: [{ label: 'A', result: 'Aにした。' }] } });
    expect(y.decision).toBeUndefined();
  });
  it('頼んでいない決断や出来事は捨てる', () => {
    const raw = { moments: [], event: { text: '雨が降った。' }, decision: { title: '迷う', text: 'どうする？', options: [{ label: 'A', result: 'Aにした。' }, { label: 'B', result: 'Bにした。' }] } };
    const y = sanitizeYear(raw, { event: false, decision: false });
    expect(y.event).toBeUndefined();
    expect(y.decision).toBeUndefined();
    expect(sanitizeYear(raw).decision?.options).toHaveLength(2);
  });
  it('形が違っても落ちない', () => {
    expect(sanitizeYear(null)).toEqual({ moments: [] });
    expect(sanitizeYear({ moments: 'x', event: 3, decision: [] })).toEqual({ moments: [] });
  });
});

describe('sanitizeYear (英語)', () => {
  it('英語でも人生の骨格に触れる文は捨てる', () => {
    const texts = ['Her grandfather died.', 'He got married.', 'The family moved to the city.', 'She was diagnosed with TB.', 'They emigrated to Spain.', 'Rain fell on the field.'];
    const y = sanitizeYear({ moments: texts.map((text) => ({ text })) });
    expect(y.moments).toEqual(['Rain fell on the field.']);
  });
});

describe('人との場面', () => {
  const t = { id: 3, name: 'アミナ', role: 'friend', age: 30, alive: true, sex: 'F', since: 8, bond: 60, mem: [{ age: 12, text: 'アミナと川で魚を捕った。', d: 3 }] } as Tie;
  const b: BondAsk = { t, why: 'close', scene: true, decision: true, household: false, dead: ['ヨセフ', '母'] };
  const scene = (text: string, tone = 'warm') => sanitizeYear({ moments: [], scene: { text, tone } }, { event: false, decision: false, bond: b }).scene;

  it('近さの変化は種類から固定表で決まり、-6〜+6 に収まる', () => {
    expect(scene('アミナと市場で豆を分け合った。')).toEqual({ who: 3, text: 'アミナと市場で豆を分け合った。', tone: 'warm', d: 3 });
    for (const d of Object.values(TONES)) expect(Math.abs(d)).toBeLessThanOrEqual(6);
    expect(scene('アミナと口論した。', 'yell')).toBeUndefined();
    expect(scene('アミナと口論した。', 'toString')).toBeUndefined();
  });
  it('亡くなった人が出てくる場面・一緒に暮らしていない人との同居は捨てる', () => {
    expect(scene('アミナとヨセフと三人で笑った。')).toBeUndefined();
    expect(scene('母とアミナが台所にいた。')).toBeUndefined();
    expect(scene('アミナと一緒に暮らし始めた。')).toBeUndefined();
  });
  it('人が関わる決断: 幸福とお金は既存の範囲、近さは表の値', () => {
    const decision = { title: '頼み', text: 'アミナが金を借りに来た。', options: [{ label: '貸す', result: '貸した。', tone: 'help', effects: { happy: 40, health: -9 }, money: -3 }, { label: '断る', result: '断った。', tone: 'distant', effects: { happy: -2 } }] };
    const d = sanitizeYear({ moments: [], decision }, { event: false, decision: false, bond: b }).decision;
    expect(d?.who).toBe(3);
    expect(d?.options.map((o) => [o.effects, o.money, o.d])).toEqual([[{ happy: 10 }, -0.5, 4], [{ happy: -2 }, 0, -3]]);
  });
  it('届くまでに亡くなった人の場面は反映しない', () => {
    const p = liveOut(createPerson({ seed: 7919, basis: 'births', auto: true }));
    const gone = people(p).find((x) => !x.alive)!;
    const n = p.log.length;
    applyYear(p, { moments: [], scene: { who: gone.id!, text: '畑で話した。', tone: 'warm', d: 3 } });
    expect(p.log.length).toBe(n);
    const alive = circle(p).find(([r]) => r.alive)?.[0];
    if (alive) {
      const before = alive.mem?.length ?? 0;
      applyYear(p, { moments: [], scene: { who: alive.id!, text: '畑で話した。', tone: 'warm', d: 3 } });
      expect(p.log.at(-1)).toMatchObject({ text: '畑で話した。', ai: true, who: [alive.id] });
      expect(alive.mem?.length).toBe(Math.min(before + 1, 12));
    }
  });
});

describe('最後の言葉', () => {
  const known = 'アミナ\n12\nアミナと川で魚を捕った。\nメイ';
  it('mem に無い年・地名・固有名詞を作った言葉は捨てる', () => {
    expect([...sanitizeWords({ words: [{ id: 3, text: '12歳の頃、メイと川で魚を捕った。よく笑う子だった。' }, { id: 4, text: 'x' }] }, [3], known)]).toEqual([[3, '12歳の頃、メイと川で魚を捕った。よく笑う子だった。']]);
    expect(sanitizeWords({ words: [{ id: 3, text: '1999年にパリで一緒に踊ったのを覚えている。' }] }, [3], known).size).toBe(0);
    expect(sanitizeWords({ words: [{ id: 3, text: 'We caught fish in the river. She laughed in Paris.' }] }, [3], 'caught fish in the river with Mei').size).toBe(0);
  });
  it('渡した名前をカタカナに直しただけなら許し、無い名前は捨てる', () => {
    const k = '孫が生まれた。Ghinaの子で、名前はAhmad。\nHussein\nLucía';
    for (const text of ['アハマドの顔を見守ってくれた。', 'フセインとよく遊んだ。', 'ルシアが来てくれた。', 'ギナの子が生まれた。']) expect(sanitizeWords({ words: [{ id: 1, text }] }, [1], k).size).toBe(1);
    for (const text of ['パリで踊った。', 'マリアと市場に行った。', 'トヨタの車に乗った。']) expect(sanitizeWords({ words: [{ id: 1, text }] }, [1], k).size).toBe(0);
  });
  // 実測 (2026-10-09, 1000人): 言葉 2819件のうち k から組めたもの 2333 / k の無い mem への退避 0 / 続柄だけの言葉 486。同じ人生で k が重なった人生 0
  it('同じ人生の3人の言葉で、出来事の種類 (k) が重ならない', () => {
    for (let i = 1; i <= 200; i++) {
      const ks = lastWords(liveOut(createPerson({ seed: i * 7919, basis: 'births', auto: true }))).flatMap((w) => (w.k ? [w.k] : []));
      expect(new Set(ks).size).toBe(ks.length);
    }
  });
  it('AI なしでも、そばにいた人の言葉が mem から組まれる', () => {
    const lives = Array.from({ length: 50 }, (_, i) => liveOut(createPerson({ seed: (i + 1) * 7919, basis: 'births', auto: true })));
    const all = lives.flatMap((p) => lastWords(p));
    expect(all.length).toBeGreaterThan(0);
    for (const w of all) expect(w).toMatchObject({ ai: false, text: expect.any(String) });
  });
});
