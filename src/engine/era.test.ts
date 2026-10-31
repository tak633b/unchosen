// 時代のゲート (era.ts): 1950〜70年代の先進国の子ども時代に低所得国の行を出さない。社会主義の経済には市場と失業がない
import { describe, it, expect, beforeAll } from 'vitest';
import { createPerson, liveOut } from './life';
import { loadWorld } from './world';
import { richChildhood, socialistAt, universalSchooling } from './era';
import type { Person } from './person';

beforeAll(() => loadWorld());

// 生まれた国を離れなかった人だけ (外国に出れば、その国の暮らしになる)
const stayers = (code: string, year: number, n = 100): Person[] => {
  const out: Person[] = [];
  for (let s = 1; s <= n; s++) {
    const p = liveOut(createPerson({ seed: s * 101 + year, basis: 'births', auto: true, country: code, year }));
    if (p.countriesLived.length === 1 && p.recent['mark:fled-west'] === undefined) out.push(p);
  }
  return out;
};
const count = (ps: Person[], re: RegExp, from = (p: Person) => 0, to = (p: Person) => 200) =>
  ps.reduce((n, p) => n + p.log.filter((e) => e.age >= from(p) && e.age <= to(p) && re.test(e.text)).length, 0);

describe('判定', () => {
  it('先進国の子ども時代と、皆が通う学校', () => {
    expect(richChildhood('DEU', 1955)).toBe(true);
    expect(richChildhood('DEU', 1949)).toBe(false);
    expect(richChildhood('JPN', 1954)).toBe(false);
    expect(richChildhood('JPN', 1955)).toBe(true);
    expect(richChildhood('POL', 1960)).toBe(true);
    expect(richChildhood('MDA', 1980)).toBe(false); // モルドバ・コーカサス・中央アジアは対象外 (本家どおり)
    expect(richChildhood('UZB', 1980)).toBe(false);
    expect(richChildhood('IND', 1980)).toBe(false);
    expect(universalSchooling('FRA', 1920)).toBe('prim');
    expect(universalSchooling('FRA', 1955)).toBe('lower');
    expect(universalSchooling('RUS', 1925)).toBeUndefined();
    expect(universalSchooling('RUS', 1965)).toBe('lower');
    expect(universalSchooling('NGA', 1965)).toBeUndefined();
  });
  it('社会主義の経済の国と年', () => {
    expect(socialistAt('RUS', 1950)).toBe(true);
    expect(socialistAt('RUS', 1921)).toBe(false);
    expect(socialistAt('RUS', 1992)).toBe(false);
    expect(socialistAt('LTU', 1942)).toBe(false); // ドイツ占領下
    expect(socialistAt('LTU', 1960)).toBe(true);
    expect(socialistAt('POL', 1947)).toBe(false);
    expect(socialistAt('POL', 1960)).toBe(true);
    expect(socialistAt('POL', 1990)).toBe(false);
    expect(socialistAt('DEU', 1970, 'E')).toBe(true);
    expect(socialistAt('DEU', 1970, 'W')).toBe(false);
    expect(socialistAt('DEU', 1970)).toBe(false);
    expect(socialistAt('CHN', 1970)).toBe(true);
    expect(socialistAt('CHN', 1980)).toBe(false);
    expect(socialistAt('VNM', 1960, 'N')).toBe(true);
    expect(socialistAt('VNM', 1960, 'S')).toBe(false);
    expect(socialistAt('VNM', 1980, 'S')).toBe(true);
    expect(socialistAt('VNM', 1990)).toBe(false);
  });
});

// 低所得国の子ども時代の行 (events/childhood.ts・school.ts・moments.json)。「学校の給食がいちばんの食事」は家の貧しさだけで出る行なので数えない
const POOR_CHILD = /通えなかった|背が伸びなかった|裸足|ビニール袋|井戸まで|水汲み|水を汲み|学費の支払いが遅れ|教科書は三人|灯油ランプ|片道一時間歩いた|家族を手伝い始めた|学校をやめて働き|はしかにかかり、高い|虫下し|揚げ菓子を道で売った|共同のトイレ|バケツ一杯|豆と穀物|かまどの煙|塩と砂糖を溶かした|小学校を\d年で離れた|布の使い方|同じ学年の女の子が結婚|収穫の時期は学校を休んで|停電の夜/;

describe('1950〜70年代の先進国の子ども時代', () => {
  // 実測 (2026-10-31、100人生ずつ、15歳まで): 直す前は FRA 1955年生まれ 53行 (通えなかった 11・小学校を#年で離れた 23・家の仕事と物売り 19)、
  // ITA 1955年 41行、RUS 1955年 63行、POL 1955年 66行 (揚げ菓子 32・バケツ 19)、JPN 1955年 33行、DEU 1955年 13行。直したあとはどれも 0 行。
  // 0 と断定できる理由: これらの行は確率ではなく、国と年のゲート (richChildhood → fits の所得の床、universalSchooling → 入学時の通う年数の床) で止まる
  for (const [code, year] of [['DEU', 1965], ['FRA', 1955], ['JPN', 1955], ['RUS', 1955], ['POL', 1965]] as const) {
    it(`${year}年の${code}に生まれた子に、低所得国の子ども時代の行が出ない`, () => {
      const ps = stayers(code, year);
      expect(ps.length).toBeGreaterThan(80);
      expect(count(ps, POOR_CHILD, () => 0, () => 15)).toBe(0);
    });
  }
  it('1965年の西ドイツに生まれた子は、少なくとも中学校まで通う', () => {
    for (const p of stayers('DEU', 1965, 60)) if (p.birthSide === 'W') expect(p.school.years, `seed ${p.seed}`).toBeGreaterThanOrEqual(p.age < 15 ? 0 : 9); // ドイツは4+6=10年が前期中等の終わり (schoolsys.json) だが、入学の年は数えない
  });
  it('裸足のサッカーは、今の低所得国の子にはそのまま出る', () => {
    // ナイジェリア 1990年生まれ 100人生 (実測 2026-10-31: 11人生)。ゲートの入れ方を間違えて全員から消えていないか
    expect(count(stayers('NGA', 1990), /裸足のサッカー/)).toBeGreaterThan(2);
  });
});

const MARKET = /持っている株|株価指数|自分で株を選ぶ|住宅ローン|ローンを組んで|ローンで家|投資の値動き|投資話|学生ローン|家賃が一度に|保険に入った|貸し始めた/;
const JOBLESS = /仕事を失った|仕事がなくなった|か月探して|仕事を探し続けた|もっといい仕事/;
const PAID = /自己負担は|借金でまかなう|学費は\d/;
const socYears = (code: string) => (p: Person) => (y: number) => socialistAt(code, p.birthYear + y, p.birthSide);

describe('社会主義の経済', () => {
  // 1970年生まれのロシア 100人生 (実測 2026-10-31): 直す前は1991年までに「ローンを組んで買う」「車を買った」「株」の行が出ていた。
  // 直したあとは 0。0 と断定できる理由: finances() は社会主義の年に投資・ローン・保険の提案へ進まず、貯えの置き場所も預金に固定される (era.ts の isSocialist)
  it('ソ連 (1991年まで) のロシアに、株・住宅ローン・投資・保険・失業・医療費の行が出ない', () => {
    for (const [code, year] of [['RUS', 1950], ['POL', 1950], ['UKR', 1950]] as const) {
      const ps = stayers(code, year);
      const inSoc = (re: RegExp) => ps.reduce((n, p) => n + p.log.filter((e) => socYears(code)(p)(e.age) && re.test(e.text)).length, 0);
      expect(inSoc(MARKET), code).toBe(0);
      expect(inSoc(JOBLESS), code).toBe(0);
      expect(inSoc(PAID), code).toBe(0);
    }
  });
  it('ソ連の子はピオネールとコムソモールに入り、大学の学費がなく、職場が減っても別の職場に割り当てられる', () => {
    const ps = stayers('RUS', 1950);
    // 実測 (2026-10-31、1970年生まれ 96人生): ピオネール 89・コムソモール 61・学費なし 24・別の職場 6。1940年生まれ 97人生: 別の職場 17・アパートの割り当て 18
    expect(count(ps, /ピオネールに入った/)).toBeGreaterThan(60);
    expect(count(ps, /コムソモールに入った/)).toBeGreaterThan(35);
    expect(count(stayers('RUS', 1970), /学費はかからなかった/)).toBeGreaterThan(10); // 1950年生まれは大学に進む年 (1968年ごろ) の進学率が低く、1人生だけだった
    expect(count(ps, /別の職場に割り当てられた/)).toBeGreaterThan(3);
    expect(count(ps, /アパートを割り当てられた|住宅協同組合/)).toBeGreaterThan(5);
  });
  it('1990年代のロシアでは、住んでいたアパートの私有化と民営化小切手の行が出る', () => {
    const ps = stayers('RUS', 1950);
    // 実測 (2026-10-31): 1940年生まれ 97人生で私有化 8・小切手 51、1970年生まれ 96人生で小切手 93
    expect(count(ps, /無償で私有化した/)).toBeGreaterThan(2);
    expect(count(ps, /民営化小切手/)).toBeGreaterThan(40);
    for (const p of ps) for (const e of p.log) if (/民営化小切手/.test(e.text)) expect(p.birthYear + e.age, `seed ${p.seed}`).toBeLessThanOrEqual(1994); // 小切手の期限は1994年7月
  });
  it('東ドイツの行 (divided.ts) と重ねない: 東の人にピオネールとソ連式の車の順番待ちは出ない', () => {
    // 東ドイツのピオニール (青いスカーフ) とトラバントは divided.ts が書く。era.ts のピオネール (赤いネッカチーフ) と車の順番待ちはソ連だけ
    const ps = stayers('DEU', 1950, 150).filter((p) => p.birthSide === 'E');
    expect(ps.length).toBeGreaterThan(20);
    expect(count(ps, /ピオネールに入った|車の順番が回ってきた/)).toBe(0);
  });
});
