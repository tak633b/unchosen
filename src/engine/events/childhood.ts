// 幼い日々: 気質・好きなこと・ペット・学校に上がるか。
import type { Country } from '../countries';
import { makeName } from '../identity';
import { bump, countryOf, decide, log, type Person, type Stats } from '../person';
import { clamp, normal, pick } from '../rng';
import { isRich } from './common';
import { homeShare } from './work';

const TEMPERAMENTS: [string, Partial<Stats>, string][] = [
  ['好奇心の強い子', { learn: 8 }, '学び +8'],
  ['活発な子', { health: 6, bond: 3 }, '健康 +6・つながり +3'],
  ['人なつこい子', { bond: 8 }, 'つながり +8'],
  ['粘り強い子', { learn: 4, health: 3 }, '学び +4・健康 +3'],
];

function temperament(p: Person): void {
  decide(p, {
    title: 'どんな子に育っている？',
    text: `${p.given}は2歳になった。性格が見えてきた。`,
    options: TEMPERAMENTS.map(([label, d, hint]) => ({
      label, hint,
      apply: (q: Person) => { q.temperament = label; bump(q, d); },
    })),
    auto: (q) => Math.floor(q.rng() * TEMPERAMENTS.length),
  });
}

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
  const opts = hobbyPool(countryOf(p)).filter((h) => !p.hobbies.includes(h));
  const three = [...opts].sort(() => p.rng() - 0.5).slice(0, 3);
  decide(p, {
    title,
    text: '時間があるとき、何をして過ごそう？',
    options: three.map((h) => ({
      label: h,
      hint: /サッカー|走|球|ボール|ホッケー|ラグビー|水泳|ムエタイ|カポエイラ|テコンドー|カバディ|クリケット|バドミントン|卓球/.test(h) ? '健康 + つながり +' : '学び + 幸福 +',
      apply: (q: Person) => {
        q.hobbies.push(h);
        log(q, `${h}に夢中になった。`, 'child');
        bump(q, /サッカー|走|球|ボール|ホッケー|ラグビー|水泳|ムエタイ|カポエイラ|テコンドー|カバディ|クリケット|バドミントン|卓球/.test(h) ? { health: 4, bond: 3, happy: 3 } : { learn: 4, happy: 4 });
      },
    })),
    auto: (q) => Math.floor(q.rng() * three.length),
  });
}

const PET_NAMES = {
  犬: { JPN: ['ポチ', 'ハナ', 'コタロウ', 'モモ'], any: ['Max', 'Luna', 'Simba', 'Coco', 'Rocky', 'Bella', 'Toby', 'Lucky', 'Bobby'] },
  猫: { JPN: ['タマ', 'ミケ', 'ソラ', 'キナコ'], any: ['Milo', 'Kitty', 'Nala', 'Leo', 'Mimi', 'Oscar', 'Lily', 'Mishmish', 'Pisi'] },
};

export function getPet(p: Person, kind: '犬' | '猫'): void {
  const names = PET_NAMES[kind];
  const name = pick(p.rng, p.country === 'JPN' ? names.JPN : names.any);
  p.pet = { kind, name, age: 0, life: kind === '犬' ? 10 + Math.floor(p.rng() * 6) : 12 + Math.floor(p.rng() * 7) };
  p.petsHad++;
  log(p, `${kind}の${name}が家族になった。`, 'family');
  bump(p, { happy: 6, bond: 3 });
}

function askForPet(p: Person): void {
  decide(p, {
    title: '犬を飼いたい',
    text: '友だちの家の犬を見てから、ずっと親にせがんでいる。',
    options: [
      {
        label: 'せがみ続ける', hint: '許してもらえるかは家の事情しだい',
        apply: (q) => {
          if (q.rng() < 0.2 + q.familyP * 0.6) getPet(q, '犬');
          else { log(q, '「うちには余裕がない」と言われた。', 'child'); bump(q, { happy: -2 }); }
        },
      },
      { label: 'がまんする', apply: () => {} },
    ],
    auto: () => 0,
  });
}

export function childhood(p: Person): void {
  const c = countryOf(p);
  const r = p.rng;
  if (p.age === 2) temperament(p);
  if (p.age <= 4 && r() < c.u5mr * 1.5) {
    log(p, 'ひどい熱と下痢で何日も寝込んだが、回復した。', 'ill');
    bump(p, { health: -6 });
  }
  if (p.age === 3 && p.familyP < 0.25 && c.gdp < 6000 && r() < 0.6) {
    log(p, '食べ物の足りない年が続き、背が伸びなかった。', 'hard', true,
      '世界の5歳未満の子どものおよそ5人に1人が発育阻害(年齢に比べて背が低い)の状態にある (UNICEF・WHO・世界銀行 2023)');
    bump(p, { health: -10, learn: -5 });
  }
  if (p.age === 6) startSchool(p, c);
  if (p.age === 7) chooseHobby(p, '好きなことが見つかった');
  if (p.age === 8 && !p.pet && r() < 0.35) askForPet(p);
  if (p.age === 10 && !p.school.enrolled && !p.working && p.rng() >= homeShare(p)) {
    p.working = true;
    p.job = c.agri > 0.3 && p.rural ? '畑と家畜の世話' : '家の仕事と物売り';
    p.jobKind = p.rural ? 'farm' : 'manual';
    p.selfEmployed = true;
    log(p, `${p.job}をして家族を手伝い始めた。`, 'work', false,
      '世界でおよそ1億6千万人の子どもが働いている (ILO・UNICEF 2021)');
  }
}

function startSchool(p: Person, c: Country): void {
  const r = p.rng;
  const girlGap = p.sex === 'F' && c.gdp < 5000 ? -1.2 : 0;
  p.school.target = clamp(normal(r, c.school * 1.35 + (p.familyP - 0.5) * 6 + (p.rural ? -1.5 : 0) + girlGap, 3), 0, 12);
  if (p.school.target < 1) {
    log(p, 'みんなが学校へ行く年になったが、通えなかった。', 'hard', true);
    return;
  }
  p.school.enrolled = true;
  log(p, isRich(p) && c.gdp > 8000 ? '私立の小学校に入学した。' : '小学校に入学した。', 'school');
}

// 子どもやきょうだいの名前は、自分と同じ命名の伝統から
export const kinName = (p: Person, sex: 'F' | 'M', poolHint: string) =>
  makeName(p.rng, p.birthCountry, sex, { pool: poolHint, index: 0 }).given;

// 大人になってからペットを迎えるか
export function adultPet(p: Person): void {
  if (p.pet || p.age < 22 || p.age > 72 || p.rng() > 0.035) return;
  const c = countryOf(p);
  const share = c.gdp > 25000 ? 45 : c.gdp > 8000 ? 30 : 15;
  decide(p, {
    title: 'ペットを迎える？',
    text: '近所でよく見かける小さな動物が、どうしても気になる。',
    stat: `${c.name}では犬か猫を飼っている家はおよそ${share}% (各国の業界団体の調査にもとづく大まかな目安)`,
    options: [
      { label: '犬を迎える', hint: '10〜15年いっしょ', apply: (q) => getPet(q, '犬') },
      { label: '猫を迎える', hint: '12〜18年いっしょ', apply: (q) => getPet(q, '猫') },
      { label: '今はやめておく', apply: () => {} },
    ],
    auto: (q) => (q.rng() < 0.3 ? 0 : q.rng() < 0.3 ? 1 : 2),
  });
}
