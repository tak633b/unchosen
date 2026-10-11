// 信仰の移り変わり: 名乗る宗教はそのままに、静かに遠のくこと。まれな改宗と、それに対する親の反応。
// 背教を罰する国では、口に出さず心の中で手放すだけにする。乱数は主人公の乱数とは別 (subRng)
import { byCode } from '../countries';
import { religionsOf } from '../identity';
import { bump, log, yearOf, type Person } from '../person';
import { subRng } from '../roots';
import { remember } from '../bonds';
import { clamp, pickWeighted } from '../rng';
import { yearly } from './common';
import { L, religionName } from '../../i18n';

// 宗教が「とても大切」と答えた人の割合 (Pew Research Center, Global Attitudes 2015。"The Age Gap in Religion Around the World" 2018 に所収、概数)
const IMPORTANT: Record<string, number> = {
  ETH: 0.98, SEN: 0.97, IDN: 0.93, PAK: 0.94, NGA: 0.88, KEN: 0.86, UGA: 0.86, TZA: 0.88, GHA: 0.88, ZAF: 0.77, PHL: 0.87,
  IND: 0.8, BGD: 0.9, TUR: 0.67, LBN: 0.5, JOR: 0.85, PSE: 0.85, EGY: 0.75, BRA: 0.72, PER: 0.69, BOL: 0.6, COL: 0.6, MEX: 0.45, ARG: 0.41, CHL: 0.39,
  USA: 0.53, CAN: 0.27, GBR: 0.1, FRA: 0.14, DEU: 0.21, ITA: 0.21, ESP: 0.22, POL: 0.29, UKR: 0.21, RUS: 0.16, SWE: 0.1, AUS: 0.18,
  CHN: 0.03, JPN: 0.1, KOR: 0.16, VNM: 0.15, ISR: 0.39,
};
// 一覧にない国は、地域の値の目安 (上の国の地域ごとのおおよその中央値)
const REGION_IMPORTANT: Record<string, number> = { アフリカ: 0.88, アジア: 0.75, ヨーロッパ: 0.2, 北アメリカ: 0.6, 南アメリカ: 0.6, オセアニア: 0.3 };

// 名乗る宗教のある人のうち、それが「とても大切」ではない人の割合 = 静かに遠のく人の割合。
// イスラエルは別: 宗教を大切にしない人の多くは、もともと世俗の家 (ヒロニ) に育つ。育った家より世俗の側へ移ったユダヤ人は1割ほど
// (Pew "Israel's Religiously Divided Society" 2016、概数)
export function driftChance(code: string): number {
  if (code === 'ISR') return 0.1;
  const none = religionsOf(code).find(([r]) => r === '無宗教')?.[1] ?? 0;
  const important = IMPORTANT[code] ?? REGION_IMPORTANT[byCode(code).region] ?? 0.5;
  return clamp(1 - important / Math.max(0.05, 1 - none), 0, 0.9);
}

// 一生のうちに別の宗教へ移る人の割合 (無宗教への移りは「遠のく」に入れる)。Pew "Religious Switching" (2025、36か国) と
// 韓国ギャラップ・インドの宗教調査 (Pew 2021: 育った宗教を変えた人は1%未満) からの概数
const SWITCH: Record<string, number> = {
  KOR: 0.1, USA: 0.1, BRA: 0.12, CHL: 0.1, MEX: 0.06, PHL: 0.05, KEN: 0.08, NGA: 0.05, GHA: 0.06, JPN: 0.03, GBR: 0.04, IND: 0.01, ISR: 0.005,
};
const switchChance = (code: string) => SWITCH[code] ?? 0.03;

// 背教 (イスラムを離れること) を法律で罰する国 (Pew 2022 "Four-in-ten countries…"、米国議会図書館 2014)。スーダンは2020年に廃止
const APOSTASY = ['AFG', 'IRN', 'SAU', 'QAT', 'ARE', 'MDV', 'MRT', 'SOM', 'MYS'];
export const apostasyLaw = (code: string, year: number): boolean => APOSTASY.includes(code) || (code === 'SDN' && year < 2020);

const PLACE: Record<string, [string, string]> = {
  キリスト教: ['教会', 'church'], イスラム教: ['モスク', 'the mosque'], 仏教: ['お寺', 'the temple'], ヒンドゥー教: ['寺院', 'the temple'],
  ユダヤ教: ['シナゴーグ', 'synagogue'], シク教: ['グルドワラ', 'the gurdwara'],
};

export function faith(p: Person): void {
  if (p.age < 15 || p.age > 70 || p.anchor) return; // 輪の人の一生では、家の宗教のまま (kin.ts)
  const f = (p.faith ??= { from: p.religion });
  const r = subRng(p, 0xfa17);
  const year = yearOf(p);
  const hidden = p.religion === 'イスラム教' && apostasyLaw(p.country, year);
  const parents = [p.mother, p.father].filter((x) => x.alive);
  // 静かに遠のく: 15〜40歳のどこかで
  if (f.drifted === undefined && f.hidden === undefined && p.religion !== '無宗教' && p.age <= 40 && r() < yearly(driftChance(p.country), 26)) {
    if (hidden) {
      p.faith = { ...f, hidden: p.age };
      log(p, L('心の中では、もう前のようには信じていない。口に出せば罪に問われうるので、誰にも言わずに礼拝の列に並び続けた。', 'Inside, the old faith had gone. Saying so could be a crime, so the person told no one and kept standing in the prayer line.'), 'family', false,
        L('背教を法律で罰する国は世界に22か国 (Pew 2022)', '22 countries have laws punishing apostasy (Pew 2022)'));
      return;
    }
    p.faith = { ...f, drifted: p.age };
    const [ja, en] = PLACE[p.religion] ?? ['祈りの場', 'services'];
    log(p, L(`いつのまにか、${ja}へ行かなくなっていた。それでも聞かれれば、${p.religion}だと答える。`, `Somewhere along the way, stopped going to ${en}. Asked, the answer is still: ${religionName(p.religion)}.`), 'family');
    return;
  }
  // まれな分かれ道で別の宗教へ: 死別・大学・外国暮らし・友だちの誘い
  if (f.converted === undefined && f.hidden === undefined && r() < yearly(switchChance(p.country), 55)) {
    if (hidden) return; // 背教を罰する国では改宗しない (遠のくのも心の中だけ)
    const choices = religionsOf(p.country).filter(([x]) => x !== p.religion && x !== '無宗教' && x !== 'その他');
    if (!choices.length) return;
    const to = pickWeighted(r, choices, ([, w]) => w)[0];
    const why = p.log.some((e) => e.age === p.age && e.kind === 'loss') ? L('大切な人を亡くした年', 'In a year of grief')
      : p.school.uni === 'studying' ? L('大学で出会った人たちに誘われて', 'Through people met at university')
        : p.country !== p.birthCountry ? L('外国で暮らすうちに', 'While living abroad')
          : L('友だちに誘われて通ううちに', 'After a friend kept inviting');
    p.faith = { ...f, converted: p.age };
    p.religion = to;
    log(p, L(`${why}、${to}に移った。`, `${why}, converted to ${religionName(to)}.`), 'family', true);
    if (!parents.length || f.from === to) return;
    // ponytail: 親の反応の強さを、その国で宗教を「とても大切」と答える割合で決める。縁を切る割合 (その3分の1) を測った統計は見つからなかった
    const devout = IMPORTANT[p.birthCountry] ?? REGION_IMPORTANT[byCode(p.birthCountry).region] ?? 0.5;
    if (r() < devout / 3) {
      p.faith = { ...p.faith, cut: p.age };
      for (const x of parents) remember(p, x, p.log.at(-1)!.text, -30);
      log(p, L('親は受け入れなかった。家に来るなと言われ、連絡が途絶えた。', 'The parents would not accept it. They said not to come home, and stopped answering.'), 'loss', true);
      bump(p, { happy: -8, bond: -10 });
    } else if (r() < devout) {
      for (const x of parents) remember(p, x, p.log.at(-1)!.text, -10);
      log(p, L('親は強く反対した。家の中に、しばらく気まずい空気が続いた。', 'The parents objected strongly. Things at home stayed tense for a long while.'), 'family');
    }
    return;
  }
  // 縁を切られた後: 年に1割ほど、どちらかが歩み寄る。ponytail: 物語のための値
  if (f.cut !== undefined && f.reconciled === undefined && parents.length && r() < 0.1) {
    p.faith = { ...f, reconciled: p.age };
    for (const x of parents) remember(p, x, L('また会うようになった', 'Back in touch'), 20);
    log(p, L(`${p.age - f.cut}年ぶりに、親から連絡があった。信じるものは違っても、また会うようになった。`, `After ${p.age - f.cut} years, the parents got in touch. They believe different things, but they see each other again.`), 'family', true);
    bump(p, { happy: 6 });
  }
}
