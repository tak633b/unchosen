// 過去の世界: 歴史の大きな出来事が、その年その国にいた一人に届く。
// 分かれ道は decisions/history.json (chance のある選択)。選ばずに起きる出来事と、その後の続き (名誉回復・亡命からの帰国など) はここに書く。
// 死者の数は国連の生命表にすでに入っているので、ここでは人を死なせない。健康を大きく損なうことで、死にやすさに表れる
import { byCode, countriesAt, type Country } from './countries';
import { L } from '../i18n';
import { pickCity } from './identity';
import { bump, decide, eduLevel, log, yearOf, type Person } from './person';
import { clamp, pickWeighted } from './rng';
import { CHOICES, eligible, toDecision } from './events/choices';
import { economyNews } from './market';
import { worldEvents } from './worldevents';

// history.json の need に書ける条件
const uni = (p: Person) => p.school.uni === 'studying' || p.school.grad === 'studying';
const teacher = (p: Person) => !!p.working && /教師|教員/.test(p.job ?? '');
const educated = (p: Person) => eduLevel(p) >= 3 || teacher(p) || (uni(p) && p.age >= 16);
const NEED: Record<string, (p: Person) => boolean> = {
  uni,
  educated,
  // 軍政が狙ったのは、学生・教員・組合に入っている (正規の) 働き手
  target: (p) => uni(p) || teacher(p) || (p.working && p.formal && p.jobKind === 'manual' && p.unemployed === 0),
  // 1980〜84年の強制入隊のある選択 (h-kr-80s-draft) に当たる人には、もう一方を出さない
  notDrafted: (p) => !(p.sex === 'M' && yearOf(p) <= 1984),
};

const HISTORY = CHOICES.filter((c) => c.chance);
const mark = (p: Person, k: string) => p.recent[`mark:${k}`];
const once = (p: Person, k: string) => (p.recent[`hist:${k}`] === undefined ? ((p.recent[`hist:${k}`] = p.age), true) : false);
const parentWord = (p: Person) => (p.father.alive ? L('父', 'father') : L('母', 'mother'));

export function history(p: Person): void {
  economyNews(p);
  if (p.anchor) return; // 輪の人の一生には出さない (主人公の記録とぶつけない)
  worldEvents(p); // 戦争・災害・疫病・事故など、目録の出来事 (1900年〜) と、これから先の名前のない出来事
  const year = yearOf(p);
  for (const c of HISTORY) {
    if (!eligible(p, c) || !(c.need ?? []).every((n) => NEED[n]?.(p))) continue;
    if (p.rng() >= c.chance!) continue;
    p.recent[`choice:${c.id}`] = p.age;
    decide(p, toDecision(p, c));
    break; // 1年に一つまで
  }
  happenings(p, year);
  aftermath(p, year);
}

// 選ぶ余地のなかった出来事
function happenings(p: Person, y: number): void {
  const c = p.country;
  // 文化大革命 (1966〜76年)。教師と知識人は「反動的な学術権威」として批判にさらされた。
  // 1年に3% → 11年でおよそ3割。ponytail: 知識人のうち何割が批判集会に立たされたかの全国の統計はない。迫害の広がりからの目安
  if (c === 'CHN' && y >= 1966 && y <= 1976) {
    if (p.age >= 22 && (eduLevel(p) >= 4 || teacher(p)) && mark(p, 'cn-labelled') === undefined && p.rng() < 0.03) {
      p.recent['mark:cn-labelled'] = p.age;
      log(p, L('「反動的な学術権威」として批判集会に立たされた。首に札を下げられ、そのあと何か月も「牛棚」に閉じこめられた。', 'Was paraded at a struggle session as a "reactionary academic authority", a placard hung from the neck, then locked for months in a "cowshed".'), 'hard', true,
        L('1978年からの見直しで、文化大革命などで不当に罪を着せられた300万人あまりの名誉が回復された', 'From 1978 on, more than three million people wrongly condemned in the Cultural Revolution and earlier campaigns were rehabilitated'));
      bump(p, { health: -6, happy: -18 });
    }
    // 家の出身。地主・富農などの「黒五類」とされた家は、人口の5%ほど。ここでは生まれた家の所得の上位7%に当てる
    if (p.age >= 5 && p.age <= 17 && p.familyP >= 0.93 && (p.father.alive || p.mother.alive) && mark(p, 'cn-family') === undefined && p.rng() < 0.3) {
      p.recent['mark:cn-family'] = p.age;
      log(p, L(`家が「黒五類」の出身とされ、${parentWord(p)}が批判集会に引き出された。紅衛兵が家に来て、本と写真を持ち去った。`, `The family was branded one of the "five black categories". ${p.given}'s ${parentWord(p)} was dragged to a struggle session, and Red Guards came to the house and carried off the books and photographs.`), 'hard', true);
      bump(p, { happy: -15, bond: -3 });
    }
  }
  // 光州 1980年5月。光州に住んでいる人に起きる (identity.json の韓国の6番目の街)
  if (c === 'KOR' && y === 1980 && (p.city === '光州' || p.city === 'Gwangju') && p.age >= 6 && once(p, 'gwangju')) {
    log(p, L('5月、街に空挺部隊が入り、学生と市民に銃を向けた。十日のあいだ、街は外とつながる道も電話も断たれた。', 'In May, paratroopers entered the city and turned their guns on students and citizens. For ten days the roads and phone lines out of the city were cut.'), 'hard', true,
      L('光州事件の死者は、のちの政府の認定で民間人165人、行方不明者は76人、負傷者は3,000人を超える', 'Government figures later recognized 165 civilians killed, 76 missing and more than 3,000 injured in Gwangju'));
    bump(p, { happy: -20, health: -3 });
  }
  // 1987年6月。大統領の直接選挙を求めるデモが全国に広がり、6月29日に受け入れられた
  if (c === 'KOR' && y === 1987 && p.age >= 12 && once(p, 'kr-june')) {
    log(p, L('6月、会社員も商店の人も学生と一緒に街に出た。月末、政府は大統領を国民が直接選ぶことを受け入れた。', 'In June office workers and shopkeepers joined the students in the streets. At the end of the month the government agreed to let the people elect the president directly.'), 'family');
    bump(p, { happy: 4 });
  }
  // カンボジア 1975年4月。都市の住民は全員、地方へ追い出された。お金と市場はなくなった
  if (c === 'KHM' && y === 1975 && once(p, 'kh-1975')) {
    log(p, p.city
      ? L(`4月17日、クメール・ルージュが${p.city}に入った。町の人は全員、地方へ歩いて移るよう命じられた。お金は使えなくなった。`, `On 17 April the Khmer Rouge entered ${p.city}. Everyone in the city was ordered to walk out to the countryside. Money stopped being of any use.`)
      : L('村は協同組合に組みこまれ、食事は共同の食堂でとることになった。お金と市場はなくなった。', 'The village was folded into a cooperative, and meals were now eaten in a communal canteen. Money and markets were abolished.'), 'hard', true,
      L('1975年4月、プノンペンの200万人ほどが数日のうちに町から追い出された', 'In April 1975 some two million people were driven out of Phnom Penh within days'));
    p.city = null;
    p.wealth = Math.min(p.wealth, 0);
    p.house = false; p.car = false; p.mortgage = undefined; p.invest = undefined;
    bump(p, { happy: -15, health: -6 });
  }
  if (c === 'KHM' && y === 1979 && p.recent['hist:kh-1975'] !== undefined && once(p, 'kh-1979')) {
    log(p, L('1月、ベトナム軍がプノンペンに入り、クメール・ルージュは西の国境の森へ退いた。歩いて、元いた町を探しに出た。', "In January the Vietnamese army entered Phnom Penh and the Khmer Rouge fell back to the forests on the western border. Set out on foot to look for the old home."), 'move', true);
    bump(p, { happy: 8 });
  }
  // トルコ 1980年9月12日のクーデター。約65万人が拘束された (トルコ大国民議会 クーデター調査委員会)。
  // 人口4,500万人のうち16〜45歳に寄るとして1年で2%、学生と組合の働き手は6%
  if (c === 'TUR' && y === 1980 && p.age >= 16 && p.age <= 45 && once(p, 'tr-1980') && p.rng() < (NEED.target(p) ? 0.06 : 0.02)) {
    log(p, L('9月12日、軍が政権を握った。数週間後、明け方に連行され、警察署の地下で何週間も過ごした。', 'On 12 September the army seized power. A few weeks later came the dawn arrest, and weeks in a police station basement.'), 'hard', true,
      L('クーデターのあと、約65万人が拘束された (トルコ大国民議会 調査委員会)', 'After the coup some 650,000 people were detained (Turkish Grand National Assembly inquiry)'));
    bump(p, { health: -6, happy: -15 });
  }
  // チェコスロバキアの「正常化」。1970年の党員の審査で、約150万人のうち32万人あまりが除名・抹消された。
  // 大人の4%ほど、大学を出た人はその2.5倍。子は親が職を追われると、1989年まで大学に進みにくい
  if ((c === 'CZE' || c === 'SVK') && y === 1970 && once(p, 'cz-1970')) {
    if (p.age >= 25 && p.age <= 64 && p.working && p.rng() < (eduLevel(p) >= 4 ? 0.1 : 0.04)) {
      p.recent['mark:cz-purged'] = p.age;
      p.incomeP = clamp(p.incomeP - 0.25, 0.02, 0.99);
      log(p, L('党の「審査」で、1968年の改革を支持したことをとがめられた。職場を追われ、ボイラー焚きの仕事に回された。', "In the party's \"screening\", support for the 1968 reforms was held against " + p.given + '. Thrown out of the job and sent to stoke boilers.'), 'hard', true,
        L('1970年の党員の審査では、約150万人の党員のうち32万人あまりが除名・抹消された', 'The 1970 party screenings expelled or struck off more than 320,000 of about 1.5 million members'));
      bump(p, { happy: -15 });
    } else if (p.age <= 17 && (p.father.alive || p.mother.alive) && p.rng() < (p.familyP > 0.6 ? 0.08 : 0.04)) {
      p.recent['mark:cz-parent'] = p.age;
      log(p, L(`${parentWord(p)}が職場を追われ、倉庫番になった。家の子が大学へ進むのは難しくなった。`, `${p.given}'s ${parentWord(p)} was thrown out of work and became a warehouse watchman. From now on, university would be hard for the children of the house.`), 'hard', true);
      bump(p, { happy: -8 });
    }
  }
}

// 何年もあとに届く続き
function aftermath(p: Person, y: number): void {
  // 1978年12月の三中全会のあと、名誉回復が進んだ
  if (y >= 1979 && y <= 1985 && p.country === 'CHN') {
    if (mark(p, 'cn-labelled') !== undefined && once(p, 'cn-rehab')) {
      log(p, L('名誉が回復された。「反動」と書かれた書類は、ファイルから取り除かれた。', 'Was officially rehabilitated. The papers labeling ' + p.given + ' a "reactionary" were removed from the file.'), 'family', true);
      bump(p, { happy: 10 });
    } else if (mark(p, 'cn-family') !== undefined && once(p, 'cn-rehab')) {
      log(p, L('家の「出身」の区分がなくなり、地主や富農の子という呼び方も使われなくなった。', "The family's class label was abolished; nobody was called the child of a landlord any more."), 'family');
      bump(p, { happy: 6 });
    }
  }
  // 1983年12月の学園自律化の措置で、除籍された学生の復学が認められた
  if (p.country === 'KOR' && mark(p, 'kr-expelled') !== undefined) {
    if (p.school.uni === 'studying' && p.recent['hist:kr-out'] === undefined) { p.recent['hist:kr-out'] = p.age; p.school.uni = 'no'; }
    if (y >= 1984 && p.age <= 35 && p.school.uni === 'no' && once(p, 'kr-back')) {
      p.school.uni = 'studying';
      log(p, L('除籍された学生の復学が認められ、大学に戻った。', 'Expelled students were allowed to return, and ' + p.given + ' went back to university.'), 'school', true);
      bump(p, { happy: 6 });
    }
  }
  // 強制入隊: まだ兵役を終えていなければ、そのまま入営する (当時の陸軍は約30か月)
  if (mark(p, 'kr-drafted') !== undefined && p.military !== 'serving' && p.military !== 'done' && once(p, 'kr-drafted')) {
    p.military = 'serving';
    p.serviceEnd = p.age + 3;
    p.working = false;
  }
  // 亡命。アルゼンチンは1983年12月の民政移管のあと、チリは1988年に帰国禁止の名簿がなくなってから帰れた
  const exiled = mark(p, 'exile');
  if (exiled !== undefined && once(p, 'exile')) goIntoExile(p);
  const back = p.birthCountry === 'ARG' ? 1984 : p.birthCountry === 'CHL' ? 1988 : 0;
  if (exiled !== undefined && back && y >= back && p.country !== p.birthCountry && p.recent['hist:exile'] !== undefined && once(p, 'exile-back')) homecoming(p);
  // 1989年11月のビロード革命のあと、追われた人の名誉が回復された
  if (y === 1990 && mark(p, 'cz-purged') !== undefined && once(p, 'cz-rehab')) {
    log(p, L('ビロード革命のあと、20年前の処分が取り消された。', 'After the Velvet Revolution, the punishment of twenty years before was annulled.'), 'family', true);
    bump(p, { happy: 10 });
  }
}

// 亡命先: アルゼンチンからはメキシコ・スペイン・ベネズエラなど、チリからはスウェーデン・ベネズエラ・メキシコ・フランスなどへ
const EXILE: Record<string, string[]> = { ARG: ['MEX', 'ESP', 'VEN', 'FRA', 'SWE', 'BRA'], CHL: ['SWE', 'VEN', 'MEX', 'FRA', 'CAN', 'ESP'] };
function goIntoExile(p: Person): void {
  const list = (EXILE[p.birthCountry] ?? []).filter((code) => countriesAt(yearOf(p)).some((c) => c.code === code));
  if (!list.length) return;
  const dest: Country = byCode(pickWeighted(p.rng, list, (code) => list.length - list.indexOf(code)));
  p.country = dest.code;
  p.city = pickCity(p.rng, dest.code);
  if (!p.countriesLived.includes(dest.code)) p.countriesLived.push(dest.code);
  p.incomeP = clamp(p.incomeP * 0.6, 0.02, 0.9);
  if (p.working) p.unemployed = 1;
  log(p, L(`${dest.name}の${p.city ?? '町'}で、亡命者として暮らし始めた。`, `Began life as an exile in ${p.city ? `${p.city}, ` : ''}${dest.name}.`), 'move', true);
}

function homecoming(p: Person): void {
  const home = byCode(p.birthCountry);
  decide(p, {
    title: L(`${home.name}に帰る？`, `Go back to ${home.name}?`),
    text: L(`${home.name}で、亡命した人の帰国が認められた。`, `Exiles are being allowed back into ${home.name}.`),
    options: [
      {
        label: L('帰る', 'Go home'),
        apply: (q) => {
          q.country = q.birthCountry;
          q.city = pickCity(q.rng, q.birthCountry);
          if (q.working) q.unemployed = 1;
          log(q, L(`${home.name}に帰った。空港には、何年も会っていなかった家族が来ていた。`, `Went home to ${home.name}. Family not seen in years were waiting at the airport.`), 'move', true);
          bump(q, { happy: 10, bond: 8 });
        },
      },
      // 残る人は、ふつうの移住者として暮らす (migration.ts の、帰るかどうかの揺れに入る)
      { label: L('今の国に残る', 'Stay'), apply: (q) => { q.migratedTo = q.country; } },
    ],
    auto: (q) => (q.rng() < 0.5 ? 0 : 1),
  });
}

// 大学への入りやすさの倍率 (events/school.ts の uniChance にかける)
export function uniK(p: Person): number {
  const y = yearOf(p);
  // 文化大革命の始まりから1969年まで、中国の大学は新入生を取らなかった
  if (p.country === 'CHN' && y >= 1966 && y <= 1969) return 0;
  // 親が職を追われた家の子は、1989年まで大学に進みにくかった
  if (mark(p, 'cz-parent') !== undefined && y < 1990) return 0.3;
  return 1;
}

// 留学のビザが下りない確率。
// 米国: 2025年秋の新しい留学生は前年より17%少ない (IIE Fall 2025 International Enrollment Snapshot)。
// カナダ: 2024年から学生ビザの数に上限。2024年は前年より35%少なく、2025年はさらに1割減らした (カナダ移民・難民・市民権省)。
// ponytail: この先の年も同じ厳しさが続くとしている
export function visaRefused(p: Person, dest: string): boolean {
  const y = yearOf(p);
  const refuse = dest === 'USA' && y >= 2025 ? 0.17 : dest === 'CAN' && y >= 2025 ? 0.42 : dest === 'CAN' && y >= 2024 ? 0.35 : 0;
  return refuse > 0 && p.rng() < refuse;
}
