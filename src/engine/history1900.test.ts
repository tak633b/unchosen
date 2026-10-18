// 1900〜1949年: 召集と戦死・1918年のかぜ・宗教で分かれた出来事・当時の国の名前
import { describe, it, expect, beforeAll } from 'vitest';
import { advanceYear, createPerson } from './life';
import { loadWorld } from './world';
import { yearOf, type Person } from './person';
import { CATALOG, excessQ, hitChance } from './worldevents';
import { bornIn, polityChange, polityName } from './polity';
import { religionsAt, religionsOf } from './identity';

beforeAll(() => loadWorld());

// その年まで生きる (途中で亡くなればそこまで)
const liveTo = (p: Person, year: number) => { while (p.alive && yearOf(p) < year) advanceYear(p); return p; };
const byId = (id: string) => CATALOG.find((e) => e.id === id)!;

describe('第一次世界大戦の召集と戦死', () => {
  // 600人ずつ実測 (2026-10-18): 召集 FRA 65%・DEU 78%・GBR 63%、1920年までの戦死 FRA 13%・DEU 16%・GBR 9.5%。
  // 1900年生まれのフランスの男性は大戦中に召集されていない (1920年組)。
  // 当時: フランスの1915年組 (1895年生まれ) は動員された人の27〜29%を失い、1919年組 (1899年生まれ) は数%だった (Huber 1931; Prost 2008)。
  // ドイツは約1,320万人を動員し約200万人が死亡 (15%)、英国は約570万人のうち約70万人 (12%) (Winter 2003)
  const BANDS = { FRA: [0.55, 0.78, 0.09, 0.19], DEU: [0.68, 0.88, 0.1, 0.22], GBR: [0.52, 0.75, 0.06, 0.14] } as const;
  for (const [code, id] of [['FRA', 'wwi-fra'], ['DEU', 'wwi-deu'], ['GBR', 'wwi-gbr']] as const) {
    it(`${code}: 1895〜1900年生まれの男性の多くが召集され、1割前後が戦死する`, () => {
      let n = 0, served = 0, dead = 0;
      for (let s = 1; s <= 600; s++) {
        const p = liveTo(createPerson({ seed: s, basis: 'births', auto: true, year: 1895 + (s % 6), country: code, gender: 'M' }), 1920);
        if (p.age < 18 && !p.alive) continue; // 戦争の前に亡くなった子は数えない
        n++;
        if (p.recent[`evhit:${id}`] !== undefined) served++;
        if (!p.alive && p.cause === '戦死') dead++;
      }
      const [s0, s1, d0, d1] = BANDS[code];
      expect(served / n).toBeGreaterThan(s0);
      expect(served / n).toBeLessThan(s1);
      expect(dead / n).toBeGreaterThan(d0);
      expect(dead / n).toBeLessThan(d1);
    });
  }
  it('戦死は召集された人にだけ起きる (女性は戦死しない)', () => {
    for (let s = 1; s <= 200; s++) {
      const p = liveTo(createPerson({ seed: s, basis: 'births', auto: true, year: 1895, country: 'FRA', gender: 'F' }), 1920);
      expect(p.cause === '戦死', `seed ${s}`).toBe(false); // 根拠: 召集のある出来事は sex: 'M' で、死は召集された人だけ (worldevents.ts の duty)
    }
  });
  // 600人ずつ実測: 1910年生まれの子の父が戦死した割合 FRA 8.5%・GBR 4.8%。
  // フランスの戦争孤児 (pupilles de la nation) は約110万人、18歳未満の子のおよそ1割 (Faron 2001)
  it('1910年生まれの子の、父が戦死する割合', () => {
    const rate = (code: string) => {
      let lost = 0;
      for (let s = 1; s <= 600; s++) {
        const p = liveTo(createPerson({ seed: s, basis: 'births', auto: true, year: 1910, country: code }), 1920);
        if (p.log.some((e) => /^父が\d+歳で亡くなった\(戦死\)/.test(e.text))) lost++;
      }
      return lost / 600;
    };
    const fra = rate('FRA'), gbr = rate('GBR');
    expect(fra).toBeGreaterThan(0.05);
    expect(fra).toBeLessThan(0.13);
    expect(gbr).toBeGreaterThan(0.02);
    expect(gbr).toBeLessThan(fra);
  });
  it('召集された人は、戦争が終われば家に帰る', () => {
    let back = 0, served = 0;
    for (let s = 1; s <= 200; s++) {
      const p = liveTo(createPerson({ seed: s, basis: 'births', auto: true, year: 1895, country: 'FRA', gender: 'M' }), 1921);
      if (p.recent['evhit:wwi-fra'] === undefined || !p.alive) continue;
      served++;
      if (p.recent['home:wwi-fra'] !== undefined) back++;
    }
    expect(served).toBeGreaterThan(50);
    expect(back).toBe(served);
  });
});

describe('1918年のかぜ', () => {
  // 若い大人が多く亡くなった (Taubenberger & Morens 2006)。インドは人口の5%前後が亡くなった (Chandra 2012: 約1,390万人)
  it('若い大人の死亡率が上がり、インドでは欧米より何倍も高い', () => {
    expect(excessQ('IND', 1918, 'M', 25)).toBeGreaterThan(2 * excessQ('IND', 1918, 'M', 55));
    expect(excessQ('IND', 1918, 'M', 25)).toBeGreaterThan(3 * excessQ('USA', 1918, 'M', 25));
    expect(excessQ('IND', 1920, 'M', 25)).toBe(0);
  });
  // 1500人で実測: 1918年に23歳で生きていたインドの人のうち、5.0%がかぜで亡くなった
  it('1895年生まれのインドの人の、1918〜19年のかぜでの死', () => {
    let n = 0, flu = 0;
    for (let s = 1; s <= 1500; s++) {
      const p = liveTo(createPerson({ seed: s, basis: 'births', auto: true, year: 1895, country: 'IND' }), 1918);
      if (!p.alive) continue;
      n++;
      if (!liveTo(p, 1920).alive && p.cause === 'インフルエンザ') flu++;
    }
    expect(flu / n).toBeGreaterThan(0.03);
    expect(flu / n).toBeLessThan(0.08);
  });
});

describe('宗教で分かれた出来事', () => {
  it('1946年より前に生まれた人の宗教は当時の割合 (ポーランドのユダヤ教徒は1931年に9.8%)', () => {
    expect(religionsAt('POL', 1920).find(([r]) => r === 'ユダヤ教')?.[1]).toBeCloseTo(0.098, 3);
    expect(religionsAt('POL', 1960)).toEqual(religionsOf('POL'));
    const sum = religionsAt('TUR', 1900).reduce((s, [, w]) => s + w, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it('ホロコーストはユダヤ教の家の人に起き、ドイツ国防軍はユダヤ人を召集しない', () => {
    const p = createPerson({ seed: 1, basis: 'births', auto: true, year: 1915, country: 'POL' });
    p.age = 27;
    p.religion = 'キリスト教';
    expect(hitChance(byId('holocaust-pol'), p)).toBe(0);
    p.religion = 'ユダヤ教';
    expect(hitChance(byId('holocaust-pol'), p)).toBeGreaterThan(0.9);
    const q = createPerson({ seed: 2, basis: 'births', auto: true, year: 1920, country: 'DEU', gender: 'M' });
    q.age = 21;
    q.religion = 'ユダヤ教';
    expect(hitChance(byId('ww2-deu-front'), q)).toBe(0);
  });
});

describe('当時の国の名前', () => {
  it('植民地・占領・帝国の名前と、独立のあとのいまの名前', () => {
    expect(polityName('IND', 1910)).toBe('イギリス領インド');
    expect(polityName('KOR', 1925)).toBe('日本統治下の朝鮮');
    expect(polityName('SEN', 1930)).toBe('フランス領西アフリカ');
    expect(polityName('TUR', 1910)).toBe('オスマン帝国');
    expect(polityName('UKR', 1905)).toBe('ロシア帝国');
    expect(polityName('UKR', 1930)).toBe('ソビエト連邦');
    expect(polityName('CZE', 1910)).toBe('オーストリア＝ハンガリー');
    expect(polityName('COD', 1950)).toBe('ベルギー領コンゴ');
    // 独立のあとはいまの国名 (polity.ts は undefined を返し、出生の記録は countries.json の名前)
    expect(bornIn('IND', 1960)).toBe('インド');
    expect(bornIn('KOR', 1950)).toBe('韓国');
    // 出生の記録に当時の名前を使うのは1949年までの生まれだけ (ナイジェリアの1955年生まれは「ナイジェリア」)
    expect(bornIn('NGA', 1955)).toBe('ナイジェリア');
    expect(createPerson({ seed: 3, basis: 'births', auto: true, year: 1910, country: 'IND' }).log[0].text).toContain('イギリス領インド');
  });
  it('国が独立・併合された年に一行が残る', () => {
    expect(polityChange('KOR', 1945)).toContain('解放');
    expect(polityChange('NGA', 1960)).toContain('独立');
    expect(polityChange('KOR', 1946)).toBeUndefined();
    const p = liveTo(createPerson({ seed: 5, basis: 'births', auto: true, year: 1925, country: 'KOR', gender: 'F' }), 1949);
    if (p.alive) expect(p.log.some((e) => e.text.includes('大韓民国の成立'))).toBe(true);
  });
});

describe('出来事は、その年の間にだけ起きる', () => {
  // 巻き込まれた (evhit) かニュースで知った (ev) 年が、目録の years (ニュースは newsAt) の中にあるか。180人 × 1890〜1935年生まれ
  it('1890〜1935年に生まれた人が1950年までに出会った出来事', () => {
    const codes = ['FRA', 'DEU', 'POL', 'RUS', 'UKR', 'JPN', 'KOR', 'CHN', 'IND', 'TUR', 'ITA', 'GBR', 'USA', 'NGA', 'IDN', 'MEX', 'ESP', 'GRC'];
    let checked = 0;
    for (let s = 1; s <= 180; s++) {
      const p = liveTo(createPerson({ seed: s * 31, basis: 'births', auto: true, year: 1890 + (s % 46), country: codes[s % codes.length] }), 1950);
      for (const [k, age] of Object.entries(p.recent)) {
        const m = /^ev(?:hit)?:(.+)$/.exec(k);
        if (!m) continue;
        const e = CATALOG.find((x) => x.id === m[1]);
        if (!e) continue;
        const y = p.birthYear + age;
        checked++;
        expect(y >= e.years[0] && y <= e.years[1], `${e.id} ${y} (seed ${s * 31})`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});
