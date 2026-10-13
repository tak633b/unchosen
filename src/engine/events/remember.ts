// 見送りと、あとから返ってくるもの: 親の葬儀、一周忌、親の口ぐせ、昔の親切への礼。
// 乱数は showRng (crisis.ts) で引き、人生の乱数の並びを変えない
import { earnings, formatMoney } from '../economy';
import { bump, countryOf, log, type Person, type Relative } from '../person';
import { showRng } from '../crisis';
import { L } from '../../i18n';

const RITE: Record<string, [string, string]> = {
  ヒンドゥー教: ['しきたりに従って火葬し、遺灰を川に流した。', 'Cremated according to custom; the ashes were given to the river.'],
  シク教: ['グルドワラで祈りをあげてから火葬し、灰を川に流した。', 'Prayers at the gurdwara, then cremation; the ashes went to the river.'],
  イスラム教: ['その日のうちに白い布で包み、土に葬った。', 'Wrapped in white cloth and buried the same day.'],
  キリスト教: ['教会で葬儀をし、墓地に葬った。', 'A funeral at the church, then burial in the cemetery.'],
  仏教: ['僧侶に経をあげてもらい、火葬した。', 'Monks chanted the sutras, and then came the cremation.'],
  ユダヤ教: ['翌日に葬り、七日のあいだ家で喪に服した。', 'Buried the next day; the family sat shiva at home for seven days.'],
};
const RITE_JPN: [string, string] = ['通夜と葬儀をし、火葬のあと、骨を箸で拾った。', 'A wake and a funeral; after the cremation, the bones were lifted into the urn with chopsticks.'];
const RITE_OTHER: [string, string] = ['親戚が集まり、土地のしきたりで見送った。', 'Relatives gathered and said goodbye in the local way.'];

// 親を見送る。費用は大人になっていれば自分が出す (年収の1割ほど。インドの中くらいの家で約8万円)
export function funeral(p: Person): void {
  const [ja, en] = countryOf(p).code === 'JPN' ? RITE_JPN : RITE[p.religion] ?? RITE_OTHER;
  if (p.age < 18) { log(p, L(ja, en), 'loss'); return; }
  const cost = earnings(countryOf(p), p.familyP) * 0.1;
  p.wealth -= cost;
  log(p, L(`${ja}葬儀の費用を払った(−${formatMoney(cost)})。`, `${en} Paid for the funeral (−${formatMoney(cost)}).`), 'loss');
}

const roll = (p: Person, salt: number) => showRng(p.seed, p.age, salt)();

// 毎年、family() の終わりに呼ぶ
export function remember(p: Person): void {
  const parents = [[p.mother, '母', 'Mother'], [p.father, '父', 'Father']] as const;
  for (const [rel, ja, en] of parents) {
    if (rel.alive || rel.diedAt === undefined || p.age - rel.diedAt !== 1 || p.age < 6 || roll(p, 0x1ea7 + (rel === p.mother ? 1 : 2)) >= 0.6) continue;
    log(p, L(`${ja}の一周忌に家族が集まり、${ja}の昔話をした。笑い声も出た。`, `On the first anniversary of ${en.toLowerCase()}'s death, the family gathered and told old stories. There was laughter, too.`), 'family', false,
      L('死別を経験した人の多くは、深い悲しみの中でも日常を保つか、一、二年のうちに取り戻す (Bonanno 2004)', 'Most bereaved people keep up daily life through grief, or regain it within a year or two (Bonanno 2004)'));
  }
  parentWords(p, parents.filter(([rel]) => !rel.alive && rel.diedAt !== undefined && p.age - rel.diedAt >= 8));
  kindness(p);
}

// 亡くなった親の口ぐせが、いつの間にか自分のものになっている
function parentWords(p: Person, gone: (readonly [Relative, string, string])[]): void {
  if (p.age < 40 || !gone.length || p.recent.parentWords !== undefined || roll(p, 0x3c11) >= 0.03) return;
  p.recent.parentWords = p.age;
  const [, ja, en] = gone[Math.floor(roll(p, 0x3c12) * gone.length)];
  log(p, L(`ふと、${ja}がいつも口にしていた言葉を思い出し、一人で笑った。その言葉は、いつの間にか自分の口ぐせになっていた。`,
    `Suddenly remembered something ${en.toLowerCase()} used to say all the time, and laughed alone. Somewhere along the way it had become a habit of ${p.sex === 'F' ? 'her' : 'his'} own.`), 'family');
  bump(p, { happy: 2 });
}

// 人を助け、何年かあとにその礼が届く
const HELP: [string, string, string, string][] = [
  ['道で倒れていた人を病院まで連れていった。', 'Took a stranger who had collapsed in the street to the hospital.',
    '何年も前に病院まで連れていった人が、家を探し当ててお礼を言いに来た。', 'Years later, the person once taken to the hospital tracked down the house to say thank you.'],
  ['近所の子の宿題を、しばらく毎晩見てやった。', 'Helped a neighbour\'s child with homework every evening for a while.',
    '昔、宿題を見てやった近所の子が、大人になって挨拶に来た。仕事が決まったという。', 'The neighbour\'s child once helped with homework came by, grown up, to say a job had come through.'],
  ['ひとり暮らしの近所のお年寄りを、たびたび見に行った。', 'Kept checking in on an elderly neighbour who lived alone.',
    '昔よく様子を見に行ったお年寄りの家族から、手紙が届いた。「あの頃、母がいつもあなたの話をしていました」とあった。', 'A letter came from the family of the elderly neighbour once looked in on: "Mother always talked about you back then."'],
];
function kindness(p: Person): void {
  const at = p.recent.kindness;
  if (at === undefined) {
    if (p.age < 15 || p.age > 65 || roll(p, 0x4b1d) >= 0.015) return;
    const i = Math.floor(roll(p, 0x4b1e) * HELP.length);
    p.recent.kindness = p.age;
    p.recent.kindWhich = i;
    log(p, L(HELP[i][0], HELP[i][1]), 'family');
    bump(p, { happy: 2 });
  } else if (p.recent.kindThanks === undefined && p.age - at >= 3 && roll(p, 0x4b1f) < 0.25) {
    const h = HELP[p.recent.kindWhich ?? 0];
    p.recent.kindThanks = p.age;
    log(p, L(h[2], h[3]), 'family');
    bump(p, { happy: 4 });
  }
}
