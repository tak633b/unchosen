// 分かれていた国 (東西ドイツ 1949〜90年・南北ベトナム 1954〜76年) に生まれた人の、側ごとの暮らし。
// 側は生まれたときに実際の出生の割合で決まり (divide)、国の名前 (polity.ts)・所得と寿命 (polity.ts の sidedCountry・sideMortality)・
// 目録の出来事 (data/events の side)・兵役 (sideDraft) と、ここに書いた側だけの出来事が、その側のものになる。
// 抽選は見せ方用の乱数 (crisis.ts の showRng) で引き、人生の乱数の並びは変えない (党に誘われたときの決めごとの自動の選び方だけは決めごとの作法どおり)
import { L } from '../i18n';
import { bump, decide, eduLevel, log, yearOf, type Person } from './person';
import { DIVIDED, lerp, sideOf } from './polity';
import { showRng } from './crisis';
import { pickCity } from './identity';
import { clamp, pickWeighted } from './rng';

const draw = (p: Person, salt: number, age = p.age) => showRng(p.seed, age, 7700 + salt)();
const once = (p: Person, k: string) => (p.recent[`side:${k}`] === undefined ? ((p.recent[`side:${k}`] = p.age), true) : false);
const done = (p: Person, k: string) => p.recent[`side:${k}`] !== undefined;

// ---- 生まれたとき ----------------------------------------------------------------------------
// 東ドイツ (東ベルリンを含む) の出生が、東西を合わせた出生に占める割合 (Destatis: 東 1950年 303,866人・1970年 236,929人・1989年 198,922人 /
// 西 812,835人・810,808人・681,537人 など)。1949年までに生まれた人は、1950年の人口の割合 (東 1,840万人 / 西 5,210万人)
const EAST_BIRTHS: [number, number][] = [[1950, 0.272], [1955, 0.263], [1960, 0.232], [1965, 0.212], [1970, 0.226], [1975, 0.232], [1980, 0.283], [1985, 0.28], [1989, 0.226], [1990, 0.197]];
export const eastShare = (y: number): number => (y < 1950 ? 0.26 : lerp(EAST_BIRTHS, y));
// 東の街 (1980年代の人口、百万人)。identity.json のドイツの街は西とベルリンなので、東に生まれた街の人はここから
const EAST_CITIES: [string, string, number][] = [['ベルリン', 'Berlin', 1.2], ['ライプツィヒ', 'Leipzig', 0.55], ['ドレスデン', 'Dresden', 0.5], ['ケムニッツ', 'Chemnitz', 0.3],
  ['マクデブルク', 'Magdeburg', 0.29], ['ロストック', 'Rostock', 0.25], ['ハレ', 'Halle', 0.23], ['エアフルト', 'Erfurt', 0.2]];
// ベトナムは街で側が決まる (北緯17度線の北: ハノイ・ハイフォン)。農村は、街の割合と合わせて北が人口の約53%
// (1960年の北1,600万人・南1,400万人) になるよう、57%を北にする
const NORTH_CITIES = ['ハノイ', 'Hanoi', 'ハイフォン', 'Haiphong'];
const SOUTH_CITIES: [string, string, number][] = [['サイゴン', 'Saigon', 1], ['ダナン', 'Da Nang', 0.2], ['カントー', 'Can Tho', 0.25]];
const SAIGON = ['ホーチミン市', 'Ho Chi Minh City'];
const pickFrom = (p: Person, list: [string, string, number][], salt: number) => { const [ja, en] = pickWeighted(showRng(p.seed, p.age, 7700 + salt), list, (c) => c[2]); return L(ja, en); };

export function divide(p: Person): void {
  const d = DIVIDED[p.birthCountry];
  if (!d || p.birthYear >= d[2]) return;
  if (p.birthCountry === 'DEU') {
    p.side = p.birthSide = draw(p, 1, 0) < eastShare(p.birthYear) ? 'E' : 'W';
    if (p.side === 'E' && p.city) p.city = pickFrom(p, EAST_CITIES, 2);
    return;
  }
  p.side = p.birthSide = (p.city ? NORTH_CITIES.includes(p.city) : draw(p, 1, 0) < 0.57) ? 'N' : 'S';
  if (p.city && SAIGON.includes(p.city)) p.city = L('サイゴン', 'Saigon'); // 1976年にホーチミン市と名が変わる
}

// ---- 兵役 (school.ts の military) -----------------------------------------------------------------
// 19歳の年の制度での期間 (月)。0 は徴兵が無い。undefined は国の一覧の兵役 (CONSCRIPTION) のまま
// 北ベトナム: 1960年の兵役法から、男性のおよそ3人に2人が2年。1965年からは戦争の終わるまで
// 南ベトナム: 1957年から18か月。1968年の総動員法からは戦争の終わるまで (Pike 1986, PAVN; Wiest 2008, Vietnam's Forgotten Army)
// 東ドイツ: 1962年の兵役法から国家人民軍に18か月 / 西ドイツ: 1957年から。兵役に就いたのは男性のおよそ半分 (ほかは免除・良心的兵役拒否) で、期間は12〜18か月 (15か月の時期が長い)
export function sideDraft(p: Person): number | undefined {
  const s = sideOf(p);
  const y = yearOf(p);
  if (!s || y >= DIVIDED[p.birthCountry][2]) return undefined;
  const until = Math.max(0, (1975 - y) * 12);
  switch (s) {
    case 'E': return y >= 1962 ? 18 : 0;
    case 'W': return y >= 1957 && draw(p, 3, 0) < 0.5 ? 15 : 0;
    case 'N': return y < 1960 || draw(p, 3, 0) >= 2 / 3 ? 0 : y >= 1965 ? Math.max(24, until) : 24;
    case 'S': return y < 1957 || y >= 1975 ? 0 : y >= 1968 ? Math.max(18, until) : 18;
  }
}

// 戦争の間に兵として服務している人の、1年あたりの死亡の確率 (worldevents.ts の myExcessQ に足す)。
// 北: 戦死・戦病死した兵は約85万〜110万人 (ベトナム政府 1995年)、服務していた兵は平均で約100万人 → 1年に約10%。
// 南: 南ベトナム軍の戦死は約25万人 (1960〜74年)、兵はおよそ75万〜100万人 → 1年に約3%。
// 生命表にはすでに国全体の平均の戦死が入っているので、そのぶん (若い男性で1年に約2%・0.5%) を引いた
// ponytail: 部隊や年による差は入れていない
export function warDutyQ(p: Person): number {
  const s = sideOf(p);
  if (p.military !== 'serving' || (s !== 'N' && s !== 'S')) return 0;
  const y = yearOf(p);
  return s === 'N' ? (y >= 1965 && y <= 1975 ? 0.08 : 0) : y >= 1965 && y <= 1974 ? 0.025 : 0;
}

// ---- 毎年 (history.ts から) ----------------------------------------------------------------------
export function divided(p: Person): void {
  const s = sideOf(p);
  if (!s) return;
  if (p.country === 'DEU') germany(p, s);
  else vietnam(p, s);
}

// 東から西へ移った人の割合 (1年あたり)。1949年〜61年8月に約270万人 (人口1,800万人の約15%)、壁のあと1962〜88年は合わせて約60万人
// (その多くは出国を許された年金生活者)、1989年に約34万人、1990年 (統一まで) に約24万人 (Bundesarchiv; Hertle 2007)。若い人ほど多い
function fleeRate(y: number, age: number): number {
  const young = age >= 18 && age <= 30 ? 1.5 : 1;
  if (y <= 1960) return 0.012 * young;
  if (y === 1961) return 0.007 * young; // 8月13日まで
  if (y <= 1988) return age >= 65 ? 0.004 : 0.0011;
  return (y === 1989 ? 0.021 : 0.0145) * young;
}

function germany(p: Person, s: 'E' | 'W' | 'N' | 'S'): void {
  const y = yearOf(p);
  if (s === 'W') {
    // 東に住む親戚へ、年に2,000万個を超える小包が送られていた
    if (y >= 1955 && y <= 1989 && p.age >= 30 && p.age <= 70 && !done(p, 'paket-w') && draw(p, 10) < 0.02 && once(p, 'paket-w')) {
      log(p, L('東に住む親戚に、コーヒーとチョコレートとナイロンの靴下を詰めた小包を送った。', 'Packed a parcel of coffee, chocolate and nylon stockings for the relatives in the East.'), 'family');
      bump(p, { bond: 2 });
    }
    return;
  }
  if (y >= 1949 && y <= 1990 && draw(p, 11) < fleeRate(y, p.age)) { flee(p, y); return; }
  if (y >= 1990) { afterWall(p, y); return; }
  if (y < 1950) return;
  // 学校: 6〜14歳のほとんどがピオニール組織に、14歳でほとんどがユーゲントヴァイエ (1955年17%、1960年88%、1970年代から9割台)
  if (p.age === 7 && draw(p, 12) < (y < 1960 ? 0.6 : 0.9) && once(p, 'pioneer')) {
    log(p, L('青いスカーフを首に巻き、ピオニールに入った。朝の集会で「いつでも備えよ」と声をそろえた。', 'Tied on the blue neckerchief and joined the Young Pioneers. At morning assembly everyone answered "Always ready!" together.'), 'school');
  }
  if (p.age === 14 && y >= 1955 && draw(p, 13) < (y < 1958 ? 0.25 : y < 1960 ? 0.5 : 0.92) && once(p, 'jugendweihe')) {
    log(p, L('14歳の春、ユーゲントヴァイエの式で、社会主義の国に尽くすと誓った。親戚から初めての腕時計をもらった。', 'In the spring of being 14, at the Jugendweihe ceremony, swore to serve the socialist state. The relatives gave a first wristwatch.'), 'school', false,
      L('1960年代からは、14歳の9割あまりがユーゲントヴァイエに出た', 'From the 1960s, over 90% of 14-year-olds took part in the Jugendweihe'));
    bump(p, { happy: 2 });
  }
  if (p.age >= 4 && p.age <= 14 && !done(p, 'paket') && draw(p, 14) < 0.05 && once(p, 'paket')) {
    log(p, L('西の親戚から小包が届いた。コーヒーとチョコレートの匂いが、しばらく部屋に残った。', 'A parcel came from the relatives in the West. The smell of coffee and chocolate hung in the room for days.'), 'family');
    bump(p, { happy: 3 });
  }
  // 仕事と暮らし: 車は注文してから十数年待った。党員は大人のおよそ6人に1人 (誘われる年の確率は、東の大人の生涯で党員がおよそ17%になるよう測って決めた)。西への旅は年金生活者になるまでほぼ許されなかった
  if (y >= 1960 && y <= 1988 && p.age >= 18 && p.age <= 45 && !done(p, 'trabant') && draw(p, 15) < 0.08 && once(p, 'trabant')) {
    log(p, L('トラバントを申し込んだ。届くのは十年以上先だと言われた。', 'Put in an order for a Trabant. Delivery, they said, would be more than ten years away.'), 'work', false,
      L('1980年代の終わり、トラバントの注文から受け取りまでは12〜15年かかった', 'By the late 1980s the wait for a Trabant was 12-15 years'));
  }
  if (y <= 1988 && p.age >= 25 && p.age <= 50 && p.working && !done(p, 'sed') && draw(p, 16) < 0.045 && once(p, 'sed')) joinParty(p);
  if (y >= 1962 && y <= 1988 && p.age >= 20 && p.age < 65 && !done(p, 'border') && draw(p, 17) < 0.03 && once(p, 'border')) {
    log(p, L('西に住む叔母の葬式に、行く許可が下りなかった。', "Permission to travel to an aunt's funeral in the West was refused."), 'hard');
    bump(p, { happy: -5 });
  }
  if (y === 1989 && p.age >= 3 && draw(p, 18) < 0.6 && once(p, 'wall-open')) {
    log(p, L('11月、壁が開いた。初めて西ベルリンへ渡り、歓迎金の100マルクを受け取った。', 'In November the Wall opened. Crossed into West Berlin for the first time and collected the 100-mark welcome money.'), 'family', true);
    bump(p, { happy: 10 });
  }
}

function joinParty(p: Person): void {
  decide(p, {
    title: L('党に入る？', 'Join the party?'),
    text: L('職場の党の書記に、ドイツ社会主義統一党 (SED) に入らないかと誘われた。入れば仕事の道は開けやすいが、会議と務めが増える。', 'The party secretary at work asked whether to join the Socialist Unity Party (SED). Membership opens doors at work, and brings meetings and duties.'),
    stat: L('1989年、SEDの党員は約230万人で、大人のおよそ6人に1人だった', 'In 1989 the SED had about 2.3 million members, roughly one adult in six'),
    options: [
      { label: L('入る', 'Join'), apply: (q) => { q.recent['mark:party'] = q.age; q.incomeP = clamp(q.incomeP + 0.03, 0.02, 0.99); log(q, L('党員証を受け取った。', 'Received the party card.'), 'work'); } },
      { label: L('断る', 'Decline'), apply: (q) => { log(q, L('忙しいことを理由に、やんわり断った。', 'Politely declined, pleading too much work.'), 'work'); } },
    ],
    auto: (q) => (q.rng() < 0.45 ? 0 : 1),
  });
}

function flee(p: Person, y: number): void {
  p.side = 'W';
  if (p.city) p.city = pickCity(showRng(p.seed, p.age, 7719), 'DEU');
  const child = p.age < 16;
  const [ja, en] = y <= 1961
    ? (child ? ['家族で西ベルリンへ渡り、そのまま西へ逃れた。持ち出せたのは手に持てる荷物だけだった。', 'The family crossed into West Berlin and kept going west, with nothing but what they could carry.']
      : ['西ベルリンへ渡り、そのまま西へ逃れた。家も家具も置いてきた。', 'Crossed into West Berlin and kept going west, leaving the house and the furniture behind.'])
    : y <= 1988
      ? (p.age >= 65 ? ['年金生活に入ると、西への出国が許された。西の親戚のもとへ移った。', 'Once retired, was allowed to leave for the West, and moved in with relatives there.']
        : ['何年も出国の申請を出し続け、ようやく許された。西へ移った。', 'After years of applications to leave, permission finally came. Moved to the West.'])
      : y === 1989 ? ['夏、ハンガリーの国境が開いたと聞き、車に荷物を積んで西へ向かった。', 'In the summer word came that the Hungarian border was open. Loaded the car and headed west.']
        : ['壁が開いたあと、仕事を探して西へ移った。', 'After the Wall opened, moved west to look for work.'];
  log(p, L(ja, en), 'move', true, y <= 1961
    ? L('1949年から壁ができる1961年8月までに、約270万人が東ドイツから西へ移った', 'Between 1949 and the building of the Wall in August 1961, about 2.7 million people left East Germany for the West')
    : y >= 1989 ? L('1989年に東ドイツから西へ移った人は約34万人だった', 'About 340,000 people left East Germany for the West in 1989') : undefined);
  p.recent['mark:fled-west'] = p.age;
  bump(p, { happy: -4 });
}

// 統一のあと。仕事の減少は目録の出来事 (deu-reunification-jobs、東だけ)
function afterWall(p: Person, y: number): void {
  // 自分の記録の閲覧を申し込んだ人は、2020年までに330万人を超えた (シュタージ文書局)。東の大人のおよそ4人に1人
  if (y >= 1992 && y <= 2015 && p.birthYear <= 1972 && !done(p, 'stasi') && draw(p, 20) < 0.012 && once(p, 'stasi')) {
    log(p, L('シュタージの文書館に、自分の記録を見せてほしいと申し込んだ。', 'Applied to the Stasi archive to see the file kept on ' + p.given + '.'), 'family', false,
      L('2020年までに、自分の記録の閲覧を申し込んだ人は330万人を超えた (シュタージ文書局)', 'By 2020 more than 3.3 million people had applied to see their own Stasi files (Stasi Records Agency)'));
    bump(p, { happy: -2 });
  }
}

function vietnam(p: Person, s: 'E' | 'W' | 'N' | 'S'): void {
  const y = yearOf(p);
  if (y === 1976 && p.city === L('サイゴン', 'Saigon') && once(p, 'hcmc')) {
    p.city = L('ホーチミン市', 'Ho Chi Minh City');
    log(p, L('サイゴンの名が、ホーチミン市になった。', 'Saigon was renamed Ho Chi Minh City.'), 'family');
  }
  if (s === 'N') {
    // 1954〜55年に約80万〜100万人が北から南へ移った。多くはカトリック (北のカトリック約130万人のおよそ半分)
    if (y === 1954 && draw(p, 30) < (p.religion === 'キリスト教' ? 0.5 : 0.025) && once(p, 'south')) {
      p.side = 'S';
      if (p.city) p.city = pickFrom(p, SOUTH_CITIES, 31);
      log(p, L(`ジュネーブ協定のあと、${p.age < 16 ? '家族で' : ''}南へ移った。ハイフォンの港から船に乗った。`, `After the Geneva Accords, ${p.age < 16 ? 'the family ' : ''}moved south, sailing from the port of Haiphong.`), 'move', true,
        L('1954〜55年に、約80万〜100万人が北から南へ移った。その多くはカトリックの信者だった', 'In 1954-55 some 800,000 to 1 million people moved from North to South, many of them Catholics'));
      bump(p, { happy: -6 });
      return;
    }
    // 1953〜56年の土地改革。地主とされたのは農村の人の数%
    if (y === 1955 && p.city === null && p.familyP >= 0.93 && draw(p, 32) < 0.6 && once(p, 'landreform')) {
      log(p, L(`土地改革で家が地主とされ、田畑を取り上げられた。${p.father.alive ? '父' : '母'}は村の集会で人々の前に立たされた。`, `In the land reform the family was branded landlords and the fields were taken. ${p.father.alive ? 'Father' : 'Mother'} was made to stand before the village at a denunciation meeting.`), 'hard', true,
        L('1953〜56年の土地改革では、約1万3,500人が処刑されたと推計される', 'An estimated 13,500 people were executed in the land reform of 1953-56'));
      bump(p, { happy: -15, health: -3 });
    }
    return;
  }
  // 南。1968年の総動員法で、18〜38歳の男性が兵に呼ばれた (南ベトナム軍は1970年に100万人を超えた)
  if (y === 1968 && p.sex === 'M' && p.age >= 20 && p.age <= 38 && p.military !== 'serving' && draw(p, 40) < 0.45 && once(p, 'mobilized')) {
    p.military = 'serving';
    p.serviceEnd = p.age + 1975 - y;
    p.working = false;
    log(p, L('総動員法で、38歳までの男は兵に呼ばれた。軍服を受け取り、部隊に入った。', 'Under the general mobilization law, men up to 38 were called up. Was issued a uniform and joined a unit.'), 'work', true,
      L('1968年の総動員法のあと、南ベトナム軍は1970年には100万人を超えた', 'After the 1968 general mobilization law, the South Vietnamese armed forces passed one million men by 1970'));
  }
  if (p.military === 'serving' && y < 1975) p.recent['side:arvn'] ??= p.age;
  // 1975年4月。南の兵と役人は「学習」に呼ばれた。将校の多くは何年も再教育収容所にとどめられた
  if (y === 1975 && done(p, 'arvn') && once(p, 'reedu')) {
    p.military = 'done';
    const long = eduLevel(p) >= 3 && draw(p, 41) < 0.5;
    if (long) p.recent['side:camp'] = p.age + 3 + Math.floor(draw(p, 42) * 4);
    log(p, long
      ? L('4月、戦争が終わった。旧政府の兵として「学習」に呼ばれ、北の山の中の再教育収容所に送られた。', 'In April the war ended. Summoned to "study" as a soldier of the old regime, and sent to a re-education camp in the northern mountains.')
      : L('4月、戦争が終わった。旧政府の兵として、十日間の「学習」に通わされた。', 'In April the war ended. As a soldier of the old regime, had to attend ten days of "study" sessions.'), 'hard', true,
      L('1975年のあと、旧南ベトナムの兵と役人の多くが再教育収容所に送られ、何年もとどめられた人は数十万人にのぼる', 'After 1975 many former South Vietnamese soldiers and officials were sent to re-education camps; hundreds of thousands were held for years'));
    bump(p, long ? { happy: -20, health: -8 } : { happy: -6 });
    if (long) p.working = false;
  }
  const camp = p.recent['side:camp'];
  if (camp !== undefined && p.age >= camp && once(p, 'camp-out')) {
    log(p, L('収容所から帰された。家族は、すっかりやせた姿にしばらく言葉が出なかった。', 'Was released from the camp. The family stood speechless at how thin ' + p.given + ' had become.'), 'family', true);
    bump(p, { happy: 10 });
  }
  // ボートピープル。1975〜95年に80万人あまりが船でベトナムを離れ、難民キャンプにたどり着いた (UNHCR)。多くは1978〜81年
  if (y >= 1978 && y <= 1989 && draw(p, 43) < (y <= 1981 ? 0.012 : 0.003) && once(p, 'boat')) {
    log(p, L(`夜、${p.age < 16 ? '家族と' : ''}小さな船に乗り、海へ出た。`, `At night ${p.age < 16 ? 'the family' : p.given} boarded a small boat and put out to sea.`), 'move', true,
      L('1975〜95年に、80万人あまりが船でベトナムを離れて難民キャンプにたどり着いた。海で命を落とした人も多い (UNHCR)', 'Between 1975 and 1995 more than 800,000 people fled Vietnam by boat and reached refugee camps; many more died at sea (UNHCR)'));
    p.recent['mark:boat'] = p.age; // 行き先は history.ts の MOVES
  }
}
