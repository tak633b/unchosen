// 時代のゲート。所得 (その年の1人あたりGDP) だけで決めると、1950〜70年代の西ヨーロッパ・北米・オセアニア・日本・ソ連と東欧に
// 生まれた子に、今の低所得国の子ども時代 (学校に行けない・水汲み・裸足のサッカー) が出てしまう。国と年で開く判定はここに集める。
// 社会主義の経済 (無料の病院と学校・失業のない職場・市場のない住宅と貯え) の判定と、その時代だけの一行もここ (1in8b.life v0.8.64〜0.8.71 の直し)
import { L } from '../i18n';
import { earnings } from './economy';
import { bump, countryOf, log, yearOf, type Person } from './person';
import { sideOf, type Side } from './polity';

// ---- A. 先進国の子ども時代 --------------------------------------------------------------
// 1950年から: 西ヨーロッパ・北米・オセアニア。1955年から: 日本、ソ連の欧州部とバルト三国、東欧 (本家どおり。モルドバ・コーカサス・中央アジアは入れない)
const WEST = new Set(['DEU', 'AUT', 'BEL', 'CHE', 'DNK', 'FIN', 'FRA', 'GBR', 'IRL', 'ISL', 'ITA', 'LUX', 'NLD', 'NOR', 'SWE', 'USA', 'CAN', 'AUS', 'NZL']);
const EAST = new Set(['RUS', 'UKR', 'BLR', 'LTU', 'LVA', 'EST', 'POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR']);
// 南ヨーロッパは遅れて。推計: 1人あたりGDP (Maddison) が西欧の1950年の水準 (約1万ドル) に届いた頃
const SOUTH: Record<string, number> = { ESP: 1965, GRC: 1965, PRT: 1975 };
export function richChildhood(code: string, year: number): boolean {
  if (year < 1950) return false;
  if (WEST.has(code)) return true;
  if (code === 'JPN' || EAST.has(code)) return year >= 1955;
  return SOUTH[code] !== undefined && year >= SOUTH[code];
}
// 皆が通う学校。'prim' は初等教育まで、'lower' は前期中等 (中学校) まで、少なくとも通う。
// 西欧・北米・日本は1900年までに初等教育が義務 (プロイセン 1763/1871年、フランス 1882年ジュール・フェリー法、英国 1880年、日本 1900年に授業料無償・1905年就学率95%超)。
// 前期中等まで: フランス 1936年 (14歳まで)、英国 1944年法 (15歳)、日本 1947年 (9年)、ドイツ 8年 (1919年) → まとめて1950年から (推計)。
// ソ連 1930年に初等義務教育令・1958年に8年制、ポーランド 1961年 8年制、チェコスロバキア 1948年 9年制、ハンガリー 1945年 8年制 → 東は1930年 prim・1960年 lower (推計)
export function universalSchooling(code: string, year: number): 'prim' | 'lower' | undefined {
  if (year < 1900) return undefined;
  if (WEST.has(code) || code === 'JPN') return year >= 1950 ? 'lower' : 'prim';
  if (EAST.has(code)) return year >= 1960 ? 'lower' : year >= 1930 ? 'prim' : undefined;
  const s = SOUTH[code];
  if (s === undefined) return undefined;
  return year >= s ? 'lower' : year >= 1950 ? 'prim' : undefined;
}

// ---- B. 社会主義の経済 ---------------------------------------------------------------------
// [この年から, この年まで]。側のある国は「国:側」(polity.ts の Side)
type Span = [number, number];
const SOVIET: Record<string, Span[]> = {};
for (const c of ['RUS', 'UKR', 'BLR', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK']) SOVIET[c] = [[1922, 1991]]; // ソ連 1922年12月〜1991年12月
for (const c of ['LTU', 'LVA', 'EST', 'MDA']) SOVIET[c] = [[1940, 1940], [1944, 1991]]; // 1940年に併合、1941〜44年はドイツ占領
const SOCIALIST: Record<string, Span[]> = {
  ...SOVIET,
  POL: [[1948, 1989]], CZE: [[1948, 1989]], SVK: [[1948, 1989]], HUN: [[1948, 1989]], ROU: [[1948, 1989]], BGR: [[1948, 1989]], // 1948年の共産党の権力掌握〜1989年
  'DEU:E': [[1949, 1990]], // 東ドイツ 1949年10月〜1990年10月
  CHN: [[1949, 1978]],     // 中華人民共和国〜1978年12月の改革開放。住宅は1992年まで公有 (socialistHousing)
  'VNM:N': [[1954, 1986]], VNM: [[1976, 1986]], // 北ベトナム 1954年〜、1976年の統一から1986年のドイモイまで全土
  // ponytail: キューバ (1959年〜) は国の一覧に無い。ユーゴスラビア・アルバニア・モンゴルは本家の対象外なので入れていない
};
const within = (spans: Span[] | undefined, y: number) => !!spans?.some(([a, b]) => y >= a && y <= b);
export const socialistAt = (code: string, year: number, side?: Side): boolean => within(SOCIALIST[code], year) || (!!side && within(SOCIALIST[`${code}:${side}`], year));
export const isSocialist = (p: Person): boolean => socialistAt(p.country, yearOf(p), sideOf(p));
const isSoviet = (p: Person) => within(SOVIET[p.country], yearOf(p));
// 住宅が公有で、市場も住宅ローンもない。中国は1988年の住宅制度改革のあと1992〜94年に売却が広がった → 1992年まで
export const socialistHousing = (p: Person): boolean => isSocialist(p) || (p.country === 'CHN' && yearOf(p) <= 1992);

const once = (p: Person, k: string) => (p.recent[`soc:${k}`] === undefined ? ((p.recent[`soc:${k}`] = p.age), true) : false);

// 毎年 (history.ts から)。東ドイツの行 (ピオニール・トラバント) は divided.ts が書くので重ねない
export function socialistYear(p: Person): void {
  if (p.country === 'RUS' && yearOf(p) >= 1992) afterSoviet(p);
  if (socialistHousing(p)) housing(p);
  if (!isSocialist(p)) return;
  const east = p.country === 'DEU' && sideOf(p) === 'E';
  if (isSoviet(p)) youth(p);
  if (!east) car(p);
}

// ピオネール (9〜14歳) とコムソモール (14〜28歳)。1930年代からピオネールは学齢の子のほぼ全員、
// コムソモールは1980年代に約4,000万人で14〜28歳のおよそ6〜7割 (推計)
function youth(p: Person): void {
  const y = yearOf(p);
  if (p.age === 10 && p.rng() < (y < 1935 ? 0.5 : 0.95) && once(p, 'pioneer')) {
    log(p, L('赤いネッカチーフを結び、ピオネールに入った。「備えよ！」「常に備えあり！」', 'Tied on the red neckerchief and joined the Pioneers. "Be prepared!" "Always prepared!"'), 'school');
  }
  if (p.age === 14 && p.rng() < 0.65 && once(p, 'komsomol')) {
    log(p, L('コムソモールに入った。集まりと務めが増え、進学と仕事の道が少し開けた。', 'Joined the Komsomol. More meetings and duties, and a slightly wider road to university and work.'), 'school');
  }
}

// 住まい。都市では国 (職場や市) の順番待ちでアパートを割り当てられる。ソ連では1962年から住宅協同組合も。農村では自分で建てる。
// 順番待ちは数年から十年あまり (Morton 1980, "Who Gets What, When and How? Housing in the Soviet Union", Soviet Studies)。家賃は所得の2〜3%ほど (推計)
function housing(p: Person): void {
  if (p.house || p.mortgage || p.recent['soc:flat'] !== undefined || p.age < 24 || p.age > 60 || !p.working || p.unemployed > 0) return;
  const c = countryOf(p);
  if (p.city === null) {
    if (p.rng() > 0.08) return; // 24〜45歳の22年で8割あまりが建てる (1 - 0.92^22)
    const cost = earnings(c, 0.08) * 1.2; // 最低限の暮らしの1.5年分 (money.ts の selfBuild と同じ目安)
    p.wealth -= cost;
    p.house = true; p.homeValue = cost * 2; p.homeSince = p.age;
    log(p, L('村で、親族と近所の人の手を借りて自分たちの家を建てた。', 'In the village, built a house of their own with help from relatives and neighbors.'), 'family');
    return;
  }
  if (p.rng() > 0.12) return; // 年12% → 働き始めてから平均8年ほどで割り当て (推計)
  if (isSoviet(p) && yearOf(p) >= 1962 && p.rng() < 0.2) {
    // 住宅協同組合 (ЖСК)。1962年の党・政府決定で復活し、都市の住宅建設の1割前後 (推計)。頭金4割、残りは15年の分割
    const cost = earnings(c, 0.5) * 2;
    p.wealth -= cost * 0.4;
    p.house = true; p.homeValue = cost; p.homeSince = p.age;
    log(p, L('住宅協同組合に入り、頭金を払って2部屋のアパートを手に入れた。残りは15年かけて払う。', 'Joined a housing cooperative and, with a down payment, got a two-room flat. The rest would be paid over fifteen years.'), 'family', true);
    bump(p, { happy: 6 });
    return;
  }
  const wait = 3 + Math.floor(p.rng() * 8); // 3〜10年 (ponytail: 都市と時期で大きく違う。推計)
  p.recent['soc:flat'] = p.age;
  log(p, L(`${wait}年の順番待ちの末に、国から2部屋のアパートを割り当てられた。家賃は給料のほんの数%だった。`, `After ${wait} years on the waiting list, the state allotted a two-room flat. The rent was a few per cent of a wage.`), 'family', true);
  bump(p, { happy: 6 });
}

// 車。申し込んでから何年も待つ (ソ連のジグリは1970〜80年代に5〜10年待ち、値段は平均の月給の3年分ほど。推計)
function car(p: Person): void {
  const c = countryOf(p);
  const price = earnings(c, 0.5) * 2;
  const due = p.recent['soc:car'];
  if (due !== undefined) {
    if (!p.car && p.age >= due) {
      p.car = true;
      p.wealth -= price;
      log(p, L(`${p.recent['soc:carWait']}年待って、ようやく車の順番が回ってきた。`, `After ${p.recent['soc:carWait']} years of waiting, the turn to buy a car finally came.`), 'family');
      bump(p, { happy: 4 });
    }
    return;
  }
  if (p.car || p.age < 25 || p.age > 55 || !p.working || p.wealth < price * 0.5 || p.rng() > 0.06) return;
  const wait = 3 + Math.floor(p.rng() * 6);
  p.recent['soc:car'] = p.age + wait;
  p.recent['soc:carWait'] = wait;
}

// ソ連のあとのロシア。住んでいたアパートの無償の私有化 (1991年7月の住宅私有化法。2010年までに住宅の約8割が私有に、Rosstat・推計) と、
// 1992年10月からの民営化小切手 (額面1万ルーブル、約1億4,800万枚)。小切手の分かれ道 (decisions/adult.json の a-voucher) が出なかった人に一行
function afterSoviet(p: Person): void {
  const y = yearOf(p);
  if (y === 1993 && p.age >= 18 && p.recent['choice:a-voucher'] === undefined && once(p, 'voucher')) {
    p.recent['choice:a-voucher'] = p.age;
    log(p, L('額面1万ルーブルの民営化小切手を受け取った。何と換えればいいのか、職場でも誰もよく分かっていなかった。', 'Received a privatization voucher with a face value of 10,000 rubles. Nobody at work quite knew what to exchange it for.'), 'work', false,
      L('1992年10月から、ロシアの国民一人に一枚、約1億4,800万枚の民営化小切手が配られた', 'From October 1992 about 148 million privatization vouchers were handed out in Russia, one per citizen'));
  }
  if (p.recent['soc:flat'] !== undefined && !p.house && !p.mortgage && p.age <= 85 && p.rng() < 0.15 && once(p, 'privatized')) {
    const c = countryOf(p);
    p.house = true; p.homeValue = earnings(c, 0.5) * 3; p.homeSince = p.age; // 推計: ふつうの年収の3年分
    log(p, L('住んでいたアパートを、無償で私有化した。登記の窓口に半日並んだ。', 'Privatized the flat the family lived in, free of charge, after half a day in the registry queue.'), 'family', true,
      L('1991年7月の法律で、国と自治体のアパートは住んでいる人に無償で私有化された。2010年までに住宅の約8割が私有になった', 'Under a law of July 1991, state and municipal flats were privatized free of charge to their tenants. By 2010 about 80% of housing was privately owned'));
    bump(p, { happy: 5 });
  }
}
