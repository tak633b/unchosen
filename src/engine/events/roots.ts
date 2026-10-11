// 生まれの区分と家族の成り立ちから起きる、毎年の出来事 (engine/roots.ts で生まれた時に決めたことの続き)。
// カーストの留保枠と差別の経験・異なるカーストとの結婚・養子の告知と生みの親探し・中国の少数民族をめぐる争点・
// 北朝鮮から韓国に着いた人の定着支援・亡くなったきょうだいを思い出すこと・子を亡くした後の孫。
// 乱数は主人公の乱数とは別 (subRng)。差別は本人が出会った出来事としてだけ書き、集団の性質としては書かない
import { byCode } from '../countries';
import { formatMoney } from '../economy';
import { bump, countryOf, log, yearOf, type Person, type Relative, type Tie } from '../person';
import { groupName, subRng } from '../roots';
import { remember, shared } from '../bonds';
import { pick, type Rng } from '../rng';
import { yearly } from './common';
import { tuitionOf } from './school';
import { L } from '../../i18n';

const once = (p: Person, key: string): boolean => {
  const done = p.roots?.done ?? [];
  if (done.includes(key)) return false;
  p.roots = { ...p.roots, done: [...done, key] };
  return true;
};

export function rootsYear(p: Person): void {
  if (p.anchor) return; // 輪の人の一生では起こさない (記録とのつじつまは kin.ts が守る)
  const r = subRng(p, 0x2007);
  if (p.roots?.group && ['SC', 'ST', 'OBC', 'GEN'].includes(p.roots.group)) caste(p, r);
  if (p.roots?.adopted) adopted(p, r);
  if (p.roots?.group === 'uyghur' || p.roots?.group === 'tibetan') minority(p);
  if (p.country === 'PRK') defect(p, r);
  if (p.roots?.resettled && p.school.uni !== 'no' && once(p, 'nkTuition')) nkTuition(p);
  rememberSibling(p, r);
}

// ---- インドのカースト ------------------------------------------------------
// 留保枠 (中央政府の大学と公務員の採用): SC 15%・ST 7.5% は憲法の施行 (1950年) から。
// OBC 27% は公務員が1993年 (マンダル委員会の答申の実施)、中央の大学が2008年 (2006年の中央教育機関法)
const QUOTA: Record<string, [number, number, number]> = { SC: [15, 1950, 1950], ST: [7.5, 1950, 1950], OBC: [27, 1993, 2008] };
// IHDS-II (2011-12): 世帯の27%が、何らかの「不可触」の慣習 (台所に入れない・別の器を使わせるなど) を今も続けていると答えた
const UNTOUCHABILITY = 0.27;
// IHDS-II (2011-12): 結婚している女性のうち、異なるカーストの相手と結婚したのは5.8%
const INTERCASTE = 0.058;

function caste(p: Person, r: Rng): void {
  const g = p.roots!.group!;
  if (p.country !== 'IND') return;
  const dalit = g === 'SC' || p.roots!.dalit;
  if (dalit && p.age === 9 && r() < UNTOUCHABILITY) {
    log(p, pick(r, [
      L('近所の家に遊びに行くと、台所には入らないよう言われ、自分の分だけ別のコップで水を出された。', 'At a neighbour’s house, was told to stay out of the kitchen and given water in a separate cup.'),
      L('学校の昼食で、ほかの子とは別の列に座らされた。', 'At the school lunch, was made to sit in a separate row from the other children.'),
      L('同級生の親が、名字を聞いたとたんに家に上げてくれなくなった。', 'A classmate’s parent heard the family name and stopped letting the child into the house.'),
    ]), 'hard', false, L('インドの世帯の27%が、何らかの「不可触」の慣習を今も続けていると答えた (IHDS-II 2011-12)。不可触の扱いは1955年から法律で禁じられている', '27% of Indian households said they still practise some form of untouchability (IHDS-II 2011-12). It has been illegal since 1955'));
    bump(p, { happy: -4 });
  }
  const q = QUOTA[g];
  if (q && p.school.uni !== 'no' && !p.school.abroad && yearOf(p) >= q[2] && once(p, 'quota')) {
    log(p, L(`${groupName(g)}の留保枠 (中央の大学の定員の${q[0]}%) の対象として、大学に出願した。`, `Applied to university under the ${groupName(g)} reservation (${q[0]}% of seats at central universities).`), 'school', false,
      L(`インドの留保枠: 中央の大学と公務員の採用で SC 15%・ST 7.5%・OBC 27%。それでも大学の総就学率は全体27%に対し SC 23%・ST 18% (AISHE 2019-20)`, 'India’s reservations: SC 15%, ST 7.5%, OBC 27% of central university seats and government jobs. Even so, gross university enrolment is 27% overall but 23% for SC and 18% for ST (AISHE 2019-20)'));
  }
  if (p.spouse && p.spouse.id !== p.roots!.spouseSeen) {
    p.roots = { ...p.roots, spouseSeen: p.spouse.id };
    if (r() < INTERCASTE) {
      shared(p, [p.spouse], L(`${p.spouse.name}とはカーストが違う。親戚の何人かは結婚式に来なかった。`, `${p.spouse.name} is from a different caste. Some relatives did not come to the wedding.`), 'love', 0, false,
        L('インドで異なるカーストの相手と結婚する人は約5.8% (IHDS-II 2011-12)', 'About 5.8% of marriages in India cross caste lines (IHDS-II 2011-12)'));
    }
  }
}

// ---- 養子 ------------------------------------------------------------
// いつ知るか。外国への養子は見た目や書類で、物心つく前から知っていることがほとんど。
// 国内の養子は、閉じた養子縁組 (記録を封じる) が当たり前だった1980年ごろまで、子に伝えない家が多かった。
// ponytail: 割合 (子どものうちに 0.5 / 0.85、大人になってから知る 0.5) は研究の傾向に合わせた概算。国別の統計は見つからなかった
function knowAge(p: Person): number | null {
  const a = p.roots!.adopted!;
  if (a.abroad) return 5;
  const r = subRng(p, 0x4d0e, 0);
  if (r() < (p.birthYear < 1980 ? 0.5 : 0.85)) return 7;
  return r() < 0.5 ? 18 + Math.floor(r() * 28) : null;
}

// 生みの親を探して見つかる割合。韓国から外国への養子の照会で再会に至ったのは2割に届かない (韓国 児童権利保障院 の年次統計、概数)。
// 国内の養子は記録が国内にあり、半分ほどが見つかる。2015年ごろからは DNA 検査で見つかる人が増えた。ponytail: 概数
const findChance = (abroad: boolean, year: number) => (abroad ? 0.15 : 0.5) + (year >= 2015 ? 0.1 : 0);

function adopted(p: Person, r: Rng): void {
  const a = p.roots!.adopted!;
  if (a.knows === undefined && p.age === knowAge(p)) {
    p.roots = { ...p.roots, adopted: { ...a, knows: p.age } };
    if (a.abroad) log(p, L(`自分が${byCode(a.from).name}で生まれ、養子として来たことは、物心ついたころから知っていた。`, `Has always known about being born in ${byCode(a.from).name} and coming as an adopted child.`), 'family');
    else if (p.age < 18) log(p, L('両親から、自分は養子だと聞かされた。', 'The parents explained that this child was adopted.'), 'family', true);
    else {
      log(p, L(`${p.age}歳で、自分が養子だったと知った。両親はずっと言えずにいた。`, `At ${p.age}, found out about being adopted. The parents had never been able to say it.`), 'family', true);
      bump(p, { happy: -6 });
    }
    return;
  }
  const knows = p.roots!.adopted!.knows;
  // 大人の養子のおよそ半分が生みの親を探す (米国の研究のまとめ、Müller & Perry 2001)
  if (knows === undefined || a.searched !== undefined || p.age < 20 || p.age > 45 || r() >= yearly(0.5, 26)) return;
  const found = r() < findChance(a.abroad, yearOf(p));
  p.roots = { ...p.roots, adopted: { ...p.roots!.adopted!, searched: p.age, found } };
  if (found) {
    log(p, L(a.abroad ? `${byCode(a.from).name}に渡り、施設の記録をたどって、生みの母に会えた。通訳を介して話した。` : '記録をたどって、生みの母に会えた。', a.abroad ? `Travelled to ${byCode(a.from).name}, followed the agency records, and met the birth mother, talking through an interpreter.` : 'Followed the records and met the birth mother.'), 'family', true);
    bump(p, { happy: 6, bond: 4 });
  } else {
    log(p, L('生みの母を探したが、記録は途中で途切れていた。', 'Searched for the birth mother, but the records ran out.'), 'family', true);
    bump(p, { happy: -3 });
  }
}

// ---- 中国のウイグル族・チベット族 ---------------------------------------------
// 争点になっている出来事は、国連の見解と中国政府の立場を並べて一行だけ書く。本人に何が起きたかは決めない
// チベット自治区の平均の就学年数は6.75年、全国は9.91年 (2020年国勢調査、15歳以上)。その比で、通える年数の見込みを縮める
const TIBET_SCHOOL = 6.75 / 9.91;

function minority(p: Person): void {
  const g = p.roots!.group;
  if (p.country !== 'CHN') return;
  if (g === 'tibetan' && p.age === 6 && p.school.target > 0 && once(p, 'tibetSchool')) p.school.target = Math.round(p.school.target * TIBET_SCHOOL);
  if (g === 'uyghur' && yearOf(p) === 2017 && p.age >= 10 && once(p, 'xj2017')) {
    log(p, L('この年から、新疆で多くのウイグル族が施設に収容されたと伝えられた。国連人権高等弁務官事務所は2022年の評価で「深刻な人権侵害」にあたりうるとした。中国政府は、テロ対策の職業技能教育訓練センターで、受講者は2019年に全員修了したと説明している。',
      'From this year, many Uyghurs in Xinjiang were reported held in facilities. The UN human rights office (OHCHR) said in its 2022 assessment that this may amount to serious human rights violations. The Chinese government describes them as vocational education and training centres for counter-terrorism, and says all trainees graduated in 2019.'), 'hard');
  }
  if (g === 'tibetan' && p.age === 6 && yearOf(p) >= 2010 && once(p, 'tibetBoarding')) {
    log(p, L('学校に上がる年。国連の特別報告者たちは2023年、チベットの子ども約100万人が寄宿制の学校で暮らし、言葉と文化から切り離されていると懸念を示した。中国政府は、寄宿学校は遠い村の子のためのもので、入るかどうかは家庭が選ぶと説明している。',
      'School age. In 2023, UN special rapporteurs raised concern that about a million Tibetan children live in residential schools, cut off from their language and culture. The Chinese government says boarding schools serve children from remote areas and that families choose whether to enrol.'), 'school');
  }
}

// ---- 北朝鮮から韓国へ ------------------------------------------------------
// ponytail: 北朝鮮 (PRK) はまだ国の一覧 (countries.json) に無いので、ここは眠っている。国が入ればそのまま動く
// 韓国に着いた脱北者の数 (統一部): 2009年の2914人が最多、2012-19年は年1000〜1500人、国境が閉じた2020年から年200人前後。
// 北朝鮮の大人 (およそ1600万人) で割った年あたりの割合。着いた人の7〜8割は女性
const DEFECT: [number, number][] = [[1990, 0.000005], [1998, 0.00003], [2006, 0.00012], [2012, 0.00008], [2020, 0.00001]];
const rateAt = (t: [number, number][], year: number) => t.reduce((v, [from, x]) => (year >= from ? x : v), 0);
// 仲介業者 (ブローカー) への支払い: 2019年まではおよそ1000〜2000万ウォン、国境が閉じてからは数千万ウォン以上 (脱北者団体・報道の聞き取り、概数)
// 韓国ウォンは、購買力平価でおよそ 850ウォン = 1ドル (OECD)
const KRW = 1 / 850;

export function defect(p: Person, r: Rng): void {
  if (p.age < 18 || p.age > 50) return;
  const rate = rateAt(DEFECT, yearOf(p)) * (p.sex === 'F' ? 1.5 : 0.5);
  if (r() >= rate) return;
  const broker = (yearOf(p) >= 2020 ? 50_000_000 : 15_000_000) * KRW;
  p.wealth -= broker;
  log(p, L(`川を渡って中国に入り、仲介業者の手引きで第三国を経て、韓国にたどり着いた。仲介料は ${formatMoney(broker)} ほど。多くは借金として残った。`,
    `Crossed the river into China and, guided by a broker through a third country, reached South Korea. The broker’s fee was about ${formatMoney(broker)}, much of it left as debt.`), 'move', true);
  bump(p, { bond: -15, happy: -5 });
  p.country = 'KOR';
  p.city = null;
  p.countriesLived = [...p.countriesLived, 'KOR'];
  resettle(p);
}

// 定着支援 (統一部「北韓離脱住民 定着支援」2024年の制度、概数)。
// 定着基本金: 1人世帯 1000万ウォン (世帯の人数で増える) / 住居支援金: 公共賃貸住宅の保証金として 1人 1600万・2〜4人 2000万・5人以上 2300万ウォン /
// 就業奨励金: 3年働き続けると最大 1800万ウォン (首都圏の外は 2100万) / 医療給付1種: 5年 / 大学の授業料: 国立は全額・私立は半額 (子どもも対象)
const BASIC = [10, 17, 22, 27, 31].map((x) => x * 1_000_000);
export function resettle(p: Person): void {
  const n = Math.min(5, 1 + (p.spouse?.alive && p.spouse.country === p.country ? 1 : 0) + p.children.filter((k) => k.alive && k.age < 18).length);
  const basic = BASIC[n - 1] * KRW;
  const housing = (n === 1 ? 16_000_000 : n <= 4 ? 20_000_000 : 23_000_000) * KRW;
  p.wealth += basic;
  p.roots = { ...p.roots, resettled: p.age };
  log(p, L(`統一院 (ハナ院) で12週間を過ごし、定着基本金 ${formatMoney(basic)} (${n}人世帯) を受け取った。国が保証金 ${formatMoney(housing)} を払った公共賃貸住宅に入った。医療費は5年間、医療給付でまかなわれる。働き続ければ就業奨励金も出る。`,
    `Spent 12 weeks at Hanawon, then received a basic settlement grant of ${formatMoney(basic)} for a household of ${n}. Moved into public rental housing with a ${formatMoney(housing)} deposit paid by the state. Medical aid covers 5 years of care, and steady work earns an employment incentive.`), 'move', true,
  L('韓国に着いた脱北者は2024年までに約3万4千人 (統一部)', 'About 34,000 North Korean defectors had arrived in South Korea by 2024 (Ministry of Unification)'));
  p.unemployed = 0;
}

// 脱北者は大学の授業料が国立で全額、私立で半額免除。学費の分を戻す (school.ts の enterUni は4年分を先に払っている)
function nkTuition(p: Person): void {
  const cost = tuitionOf(byCode('KOR'), false) * 4 * 0.75; // 国立と私立の間をとって4分の3
  p.wealth += cost;
  log(p, L(`脱北者への支援で、大学の授業料の多くが免除された (+${formatMoney(cost)})。`, `As a defector, most university tuition was waived (+${formatMoney(cost)}).`), 'school');
}

// ---- 亡くなったきょうだい ------------------------------------------------------
// ponytail: 思い出す年の割合 (年3%) は物語のための値
function rememberSibling(p: Person, r: Rng): void {
  const gone = p.siblings.filter((s) => !s.alive && s.diedAt !== undefined && p.age - s.diedAt >= 5);
  if (!gone.length || r() >= 0.03) return;
  const s = pick(r, gone);
  const now = s.age + (p.age - s.diedAt!);
  log(p, L(`ふと、${s.name}のことを思い出した。生きていれば${now}歳になる。`, `Thought of ${s.name} out of nowhere. ${s.sex === 'F' ? 'She' : 'He'} would have been ${now} now.`), 'family', false, undefined, [s.id!]);
  remember(p, s, p.log.at(-1)!.text, 0);
}

// ---- 子を亡くした後の孫 (family.ts から、子が亡くなった年に) ----------------------
// 誰が孫を育てるか。片親を亡くした子の多くはもう一人の親が育てる。両親とも亡くした子は、サハラ以南のアフリカでは
// 半分ほどが祖父母のもとで暮らす (UNICEF「Children on the Brink」2004)。ponytail: もう一人の親が育てる割合 0.75 は国によらない概算
export function orphans(p: Person, k: Relative): void {
  const kids = (p.ties ?? []).filter((t: Tie) => t.role === 'grandchild' && t.of === k.id && t.alive && t.age < 18);
  if (!kids.length) return;
  const r = subRng(p, 0x0f0f);
  const names = kids.map((t) => t.name).join(L('と', ' and '));
  if (r() < 0.75) {
    shared(p, kids, L(`${names}は、${k.name}の連れ合いが育てることになった。`, `${names} will be raised by ${k.name}'s partner.`), 'family');
  } else if (p.age < 75 && p.stats.health > 30 && r() < 0.5) {
    shared(p, kids, L(`${names}を引き取って、育てることにした。`, `Took in ${names} to raise.`), 'family', 15, true,
      L('親を亡くした子は世界で約1億4千万人。その多くを祖父母が育てている (UNICEF)', 'About 140 million children worldwide have lost a parent, many of them raised by grandparents (UNICEF)'));
    bump(p, { happy: -3, bond: 6 });
    p.wealth -= countryOf(p).gdp * 0.1 * kids.length;
  } else {
    shared(p, kids, L(`${names}は、${k.name}の連れ合いの親族に引き取られた。`, `${names} went to live with ${k.name}'s partner's family.`), 'family', -5);
  }
}
