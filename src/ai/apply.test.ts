import { describe, it, expect } from 'vitest';
import { parseJson } from './client';
import { sanitizeYear } from './apply';

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
