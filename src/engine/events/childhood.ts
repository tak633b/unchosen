// 幼い日々: 気質・好きなこと・ペット・学校に上がるか。
import type { Country } from '../countries';
import { petJoined } from '../pets';
import { bump, countryOf, decide, log, type Person, type Stats } from '../person';
import { clamp, normal, pick } from '../rng';
import { isRich } from './common';
import { homeShare } from './work';
import { isEn, L } from '../../i18n';
import { because, homeWhy, schoolWhy } from '../why';

const TEMPERAMENTS: [string, Partial<Stats>, string][] = [
  [L('好奇心の強い子', 'Curious'), { learn: 8 }, L('学び +8', 'Learning +8')],
  [L('活発な子', 'Active'), { health: 6, bond: 3 }, L('健康 +6・つながり +3', 'Health +6, Bond +3')],
  [L('人なつこい子', 'Friendly'), { bond: 8 }, L('つながり +8', 'Bond +8')],
  [L('粘り強い子', 'Persistent'), { learn: 4, health: 3 }, L('学び +4・健康 +3', 'Learning +4, Health +3')],
];

function temperament(p: Person): void {
  decide(p, {
    title: L('どんな子に育っている？', 'What kind of child?'),
    text: L(`${p.given}は2歳になった。性格が見えてきた。`, `${p.given} turned 2. A personality is showing.`),
    options: TEMPERAMENTS.map(([label, d, hint]) => ({
      label, hint,
      apply: (q: Person) => { q.temperament = label; bump(q, d); },
    })),
    auto: (q) => Math.floor(q.rng() * TEMPERAMENTS.length),
  });
}

const HOBBY_EN: Record<string, string> = {
  サッカー: 'soccer', 絵を描くこと: 'drawing', 歌: 'singing', 本を読むこと: 'reading', 走ること: 'running', 料理の手伝い: 'helping in the kitchen', 工作: 'making things',
  クリケット: 'cricket', カバディ: 'kabaddi', 野球: 'baseball', ゲーム: 'video games', 書道: 'calligraphy', テコンドー: 'taekwondo',
  卓球: 'table tennis', バドミントン: 'badminton', バスケットボール: 'basketball', アイスホッケー: 'ice hockey', ムエタイ: 'Muay Thai',
  カポエイラ: 'capoeira', ラグビー: 'rugby', 水泳: 'swimming', 長距離走: 'distance running', ピアノ: 'piano',
};
// 内部(スポーツかどうかの判定)は日本語、p.hobbies には表示の言葉で入れる
const hobbyName = (h: string) => (isEn ? HOBBY_EN[h] ?? h : h);
const SPORT = /サッカー|走|球|ボール|ホッケー|ラグビー|水泳|ムエタイ|カポエイラ|テコンドー|カバディ|クリケット|バドミントン|卓球/;

// その国でよく見かける遊びや習い事
function hobbyPool(c: Country): string[] {
  const base = ['サッカー', '絵を描くこと', '歌', '本を読むこと', '走ること', '料理の手伝い', '工作'];
  const by: Record<string, string[]> = {
    IND: ['クリケット', 'カバディ'], PAK: ['クリケット'], BGD: ['クリケット'], LKA: ['クリケット'],
    JPN: ['野球', 'ゲーム', '書道'], KOR: ['ゲーム', 'テコンドー'], CHN: ['卓球', 'バドミントン'],
    USA: ['野球', 'バスケットボール'], CAN: ['アイスホッケー'], PHL: ['バスケットボール'],
    IDN: ['バドミントン'], MYS: ['バドミントン'], VNM: ['バドミントン'], THA: ['ムエタイ'],
    BRA: ['サッカー', 'カポエイラ'], NZL: ['ラグビー'], AUS: ['水泳'], KEN: ['長距離走'], ETH: ['長距離走'],
  };
  const rich = c.gdp > 20000 ? ['ピアノ', '水泳'] : [];
  return [...new Set([...(by[c.code] ?? []), ...base, ...rich])];
}

export function chooseHobby(p: Person, title: string): void {
  const opts = hobbyPool(countryOf(p)).filter((h) => !p.hobbies.includes(hobbyName(h)));
  const three = [...opts].sort(() => p.rng() - 0.5).slice(0, 3);
  decide(p, {
    title,
    text: L('時間があるとき、何をして過ごそう？', 'What to do with free time?'),
    options: three.map((h) => ({
      label: hobbyName(h),
      hint: SPORT.test(h) ? L('健康 + つながり +', 'Health + Bond +') : L('学び + 幸福 +', 'Learning + Happiness +'),
      apply: (q: Person) => {
        q.hobbies.push(hobbyName(h));
        log(q, L(`${h}に夢中になった。`, `Got hooked on ${hobbyName(h)}.`), 'child');
        bump(q, SPORT.test(h) ? { health: 4, bond: 3, happy: 3 } : { learn: 4, happy: 4 });
      },
    })),
    auto: (q) => Math.floor(q.rng() * three.length),
  });
}

const PET_NAMES = {
  犬: { JPN: isEn ? ['Pochi', 'Hana', 'Kotaro', 'Momo'] : ['ポチ', 'ハナ', 'コタロウ', 'モモ'], any: ['Max', 'Luna', 'Simba', 'Coco', 'Rocky', 'Bella', 'Toby', 'Lucky', 'Bobby'] },
  猫: { JPN: isEn ? ['Tama', 'Tora', 'Sora', 'Kinako'] : ['タマ', 'ミケ', 'ソラ', 'キナコ'], any: ['Milo', 'Kitty', 'Nala', 'Leo', 'Mimi', 'Oscar', 'Lily', 'Mishmish', 'Pisi'] },
};

export function getPet(p: Person, kind: '犬' | '猫'): void {
  const names = PET_NAMES[kind];
  const name = pick(p.rng, p.country === 'JPN' ? names.JPN : names.any);
  p.pet = { kind, name, age: 0, life: kind === '犬' ? 10 + Math.floor(p.rng() * 6) : 12 + Math.floor(p.rng() * 7) };
  p.petsHad++;
  log(p, L(`${kind}の${name}が家族になった。`, `${name} the ${kind === '犬' ? 'dog' : 'cat'} joined the family.`), 'family');
  petJoined(p, p.log[p.log.length - 1].text);
  bump(p, { happy: 6, bond: 3 });
}

function askForPet(p: Person): void {
  decide(p, {
    title: L('犬を飼いたい', 'Wanting a dog'),
    text: L('友だちの家の犬を見てから、ずっと親にせがんでいる。', "Has been begging for a dog ever since seeing a friend's."),
    options: [
      {
        label: L('せがみ続ける', 'Keep asking'), hint: L('許してもらえるかは家の事情しだい', 'Depends on what the family can afford'),
        apply: (q) => {
          if (q.rng() < 0.2 + q.familyP * 0.6) getPet(q, '犬');
          else { log(q, L('「うちには余裕がない」と言われた。', 'Was told, "We can\'t afford it."'), 'child'); bump(q, { happy: -2 }); }
        },
      },
      { label: L('がまんする', 'Let it go'), apply: () => {} },
    ],
    auto: () => 0,
  });
}

export function childhood(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.age === 2) temperament(p);
  if (p.age <= 4 && r() < c.u5mr * 1.5) {
    log(p, L('ひどい熱と下痢で何日も寝込んだが、回復した。', 'Was bedridden for days with high fever and diarrhea, then recovered.'), 'ill');
    bump(p, { health: -6 });
  }
  if (p.age === 3 && p.familyP < 0.25 && c.gdp < 6000 && r() < 0.6) {
    log(p, L('食べ物の足りない年が続き、背が伸びなかった。', 'Years of too little food. Stopped growing taller.'), 'hard', true,
      L('世界の5歳未満の子どものおよそ5人に1人が発育阻害(年齢に比べて背が低い)の状態にある (UNICEF・WHO・世界銀行 2023)',
        'About 1 in 5 children under 5 worldwide are stunted, too short for their age (UNICEF, WHO, World Bank 2023)'));
    bump(p, { health: -10, learn: -5 });
  }
  if (p.age === 6) startSchool(p, c);
  if (p.age === 7) chooseHobby(p, L('好きなことが見つかった', 'Found something to love'));
  if (p.age === 8 && !p.pet && r() < 0.35) askForPet(p);
  if (p.age === 10 && !p.school.enrolled && !p.working && p.rng() >= homeShare(p)) {
    p.working = true;
    p.job = c.agri > 0.3 && p.rural ? L('畑と家畜の世話', 'tending fields and animals') : L('家の仕事と物売り', 'housework and street selling');
    p.jobKind = p.rural ? 'farm' : 'manual';
    p.selfEmployed = true;
    log(p, L(`${p.job}をして家族を手伝い始めた。`, `Started helping the family by ${p.job}.`), 'work', false,
      L('世界でおよそ1億6千万人の子どもが働いている (ILO・UNICEF 2021)', 'About 160 million children worldwide are in child labor (ILO, UNICEF 2021)'));
    because(p, homeWhy(p, c));
  }
}

function startSchool(p: Person, c: Country): void {
  const r = p.rng;
  const girlGap = p.sex === 'F' && c.gdp < 5000 ? -1.2 : 0;
  p.school.target = Math.max(p.anchor?.school ?? 0, clamp(normal(r, c.school * 1.35 + (p.familyP - 0.5) * 6 + (p.rural ? -1.5 : 0) + girlGap, 3), 0, 12));
  if (p.school.target < 1) {
    log(p, L('みんなが学校へ行く年になったが、通えなかった。', 'Reached school age, but could not go.'), 'hard', true);
    because(p, schoolWhy(p, c));
    return;
  }
  p.school.enrolled = true;
  log(p, isRich(p) && c.gdp > 8000 ? L('私立の小学校に入学した。', 'Started at a private primary school.') : L('小学校に入学した。', 'Started primary school.'), 'school');
}

// 大人になってからペットを迎えるか
export function adultPet(p: Person): void {
  if (p.pet || p.age < 22 || p.age > 72 || p.rng() > 0.035) return;
  const c = countryOf(p);
  const share = c.gdp > 25000 ? 45 : c.gdp > 8000 ? 30 : 15;
  decide(p, {
    title: L('ペットを迎える？', 'Get a pet?'),
    text: L('近所でよく見かける小さな動物が、どうしても気になる。', 'Keeps thinking about the small animals around the neighborhood.'),
    stat: L(`${c.name}では犬か猫を飼っている家はおよそ${share}% (各国の業界団体の調査にもとづく大まかな目安)`,
      `About ${share}% of households in ${c.name} keep a dog or cat (rough estimate from industry surveys)`),
    options: [
      { label: L('犬を迎える', 'Get a dog'), hint: L('10〜15年いっしょ', '10 to 15 years together'), apply: (q) => getPet(q, '犬') },
      { label: L('猫を迎える', 'Get a cat'), hint: L('12〜18年いっしょ', '12 to 18 years together'), apply: (q) => getPet(q, '猫') },
      { label: L('今はやめておく', 'Not now'), apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.3 ? 0 : q.rng() < 0.3 ? 1 : 2),
  });
}
