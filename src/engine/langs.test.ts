// 外国で暮らすと、その国の言葉が毎年1段階ずつ上達する (2026-10-31、本家 v0.8.69 / 0.8.85 に合わせた分)
import { describe, expect, it } from 'vitest';
import { createPerson } from './life';
import { hereLevel, langLine, languages } from './langs';

const born = (country: string, seed = 1) => createPerson({ seed, basis: 'births', country, year: 2000, auto: true });
// 年を進めずに、言葉の年だけ回す
const yearsIn = (p: ReturnType<typeof born>, country: string, n: number) => { p.country = country; for (let i = 0; i < n; i++) { p.age++; languages(p); } };

describe('言葉', () => {
  it('大人は1年に1段階、仕事で使える (2) で止まり、8年たつと母語並みに', () => {
    const p = born('JPN');
    p.age = 29;
    yearsIn(p, 'USA', 1); // 移った年: 初級
    expect(hereLevel(p)).toBe(0);
    yearsIn(p, 'USA', 2);
    expect(hereLevel(p)).toBe(2);
    yearsIn(p, 'USA', 4);
    expect(hereLevel(p)).toBe(2); // 7年目まで 2 のまま
    yearsIn(p, 'USA', 2);
    expect(hereLevel(p)).toBe(3);
    expect(p.langs?.ja).toBe(3); // 母語は抜けない
  });

  it('幼い子 (12歳未満) と、近い言葉 (スペイン語→ポルトガル語) は速い', () => {
    const kid = born('VNM');
    kid.age = 4;
    yearsIn(kid, 'DEU', 3);
    expect(hereLevel(kid)).toBe(3);
    const es = born('ESP');
    es.age = 29;
    yearsIn(es, 'BRA', 2);
    expect(hereLevel(es)).toBe(2); // 大人でも、移った翌年には仕事で使える
  });

  it('すでに話せる言葉の国へ移れば、その旨だけ残る (英語で学ぶ国の人が英国へ)', () => {
    const p = born('IND');
    p.age = 24;
    p.school.years = 12;
    yearsIn(p, 'GBR', 1);
    expect(hereLevel(p)).toBe(2);
    expect(p.log.some((e) => /もう話せた/.test(e.text))).toBe(true);
    expect(p.log.some((e) => /ほとんど分からない/.test(e.text))).toBe(false);
  });

  it('身元欄には、いま住んでいる国の言葉が初級でも入る', () => {
    const p = born('JPN');
    p.age = 29;
    p.country = 'FRA';
    expect(langLine(p)).toContain('フランス語 (初級)');
    expect(langLine(p)).toContain('日本語 (母語並み)');
  });
});
