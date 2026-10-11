// つらい時期と、人に話すこと。
// 仕事を失った・大きな借金・身近な人との死別・ずっと沈んだ気分のあとに、しんどい時期が来ることがある。
// その間は自死の率が少し上がり、人に話す・助けを求めると下がる (causes.ts の pickCause と life.ts の riskParts に倍率を渡す)。
// たいていの時期は、時間がたてば抜ける。理由や方法は書かない (suicide.ts の方針)
import { bump, decide, log, type Person, type Relative } from '../person';
import { pick } from '../rng';
import { remember } from '../bonds';
import { because } from '../why';
import { scaleOf } from './common';
import { helpline } from '../suicide';
import { L } from '../../i18n';

// 自死の率にかける倍率。抱えこむと上がり、話す・頼ると下がる。
// 推計: 心理的な苦痛が強い時期の自殺念慮のリスク上昇と、相談・治療による低下 (WHO LIVE LIFE 2021 の介入の考え方) を、ゆるやかな倍率に置いたもの
const K = { start: 1.3, talk: 0.6, help: 0.5, alone: 1.8 };
export const strainK = (p: Person): number => (p.strain && p.age < p.strain.until ? p.strain.k : 1);

const setK = (p: Person, k: number) => { if (p.strain) p.strain = { ...p.strain, k }; };
const friendTie = (p: Person) => (p.ties ?? []).find((t) => t.role === 'friend' && t.alive && t.until === undefined);

// 今年、しんどい時期の入り口になる出来事があったか
function trigger(p: Person): [ja: string, en: string] | undefined {
  if (p.log.some((e) => e.age === p.age && e.kind === 'loss' && e.big)) return ['見送ったあと、何も手につかない日が続いた。', 'After the loss, days went by with nothing getting done.'];
  if (p.unemployed > 0) return ['仕事がないまま、眠れない夜が続いた。', 'Still no work, and the nights brought little sleep.'];
  if (p.wealth < -2 * scaleOf(p)) return ['借金の額を考えると、胸が重くなる日が続いた。', 'Thinking about the debt made every day feel heavy.'];
  if (p.stats.happy < 20) return ['理由もはっきりしないまま、気持ちの沈む日が続いた。', 'Without any clear reason, the low days kept coming.'];
}

export function strain(p: Person): void {
  const s = p.strain;
  if (s) {
    if (p.age < s.until) return;
    p.strain = undefined;
    log(p, pick(p.rng, RECOVER)(), 'family');
    bump(p, { happy: 6 });
    return;
  }
  if (p.age < 15 || p.age - (p.recent.strain ?? -99) < 8) return;
  const t = trigger(p);
  // 推計: きっかけのある年の15%がしんどい時期になる。一生のうちに一度は経験する人が約半数になる (実測 2026-10-11)。
  // うつ病の生涯有病率は15〜20% (WHO・Kessler ほか 2005) で、ここでの「しんどい時期」はそれより広い
  if (!t || p.rng() >= 0.15) return;
  p.recent.strain = p.age;
  p.strain = { until: p.age + 1 + Math.floor(p.rng() * 3), k: K.start };
  const f = friendTie(p);
  decide(p, {
    title: L('しんどい時期', 'A hard stretch'),
    text: L(t[0], t[1]),
    stat: L('世界の大人の約5%がうつ病を経験している (WHO 2023)。話すこと・助けを求めることで、多くの人が回復する', 'About 5% of adults worldwide experience depression (WHO 2023). Talking and getting help is how many people recover'),
    options: [
      {
        label: f ? L(`${f.name}に打ち明ける`, `Tell ${f.name}`) : L('家族に打ち明ける', 'Tell family'), hint: L('うまく言えなくてもいい', 'It does not have to come out right'),
        apply: (q) => {
          setK(q, K.talk);
          const text = L('思い切って話した。黙って聞いてもらえただけで、少し息がしやすくなった。', 'Said it out loud at last. Just being listened to made it a little easier to breathe.');
          log(q, text, 'family', false, undefined, f ? [f.id!] : undefined);
          if (f) remember(q, f as Relative, text, 6);
          bump(q, { happy: 3, bond: 3 });
        },
      },
      {
        label: L('相談窓口や医者を頼る', 'See a counselor or doctor'), hint: L('少しお金と勇気がいる', 'Takes a little money and nerve'),
        apply: (q) => {
          setK(q, K.help);
          q.wealth -= scaleOf(q) * 0.02;
          log(q, L('相談に通いはじめた。眠れる夜が少しずつ増えた。', 'Started going to talk to someone. Slowly, more nights brought sleep.'), 'ill');
          bump(q, { happy: 4 });
        },
      },
      {
        label: L('ひとりで抱える', 'Keep it to yourself'), hint: L('誰にも心配をかけたくない', 'Do not want anyone to worry'),
        apply: (q) => {
          setK(q, K.alone);
          log(q, L('誰にも言わずに、毎日をやり過ごした。', 'Told no one, and just got through each day.'), 'hard');
          because(q, helpline());
          bump(q, { happy: -3 });
        },
      },
    ],
    auto: (q) => { const x = q.rng(); return x < 0.45 ? 0 : x < 0.6 ? 1 : 2; },
  });
}

const RECOVER: (() => string)[] = [
  () => L('少しずつ、朝が軽くなっていった。', 'Little by little, the mornings got lighter.'),
  () => L('気づけば、また笑える日のほうが多くなっていた。', 'Before long, the days with laughter in them outnumbered the others again.'),
  () => L('いちばんつらい時期を抜けた。あの頃の自分に、よく持ちこたえたと言いたい。', 'Came out the other side of the worst of it. Would like to tell that earlier self: you held on.'),
];

// 友だちのつらさに気づく話。ときどき、本人から打ち明けられることもある
export function reachOut(p: Person): void {
  if (p.age < 14 || p.age - (p.recent.reachOut ?? -99) < 15 || p.rng() >= 0.006) return;
  p.recent.reachOut = p.age;
  const f = friendTie(p);
  const who = f?.name ?? (p.working ? L('同僚', 'a coworker') : L('同じクラスの子', 'a classmate'));
  const ids = f ? [f.id!] : undefined;
  const note = (q: Person, text: string, d: number) => {
    log(q, text, 'family', false, undefined, ids);
    if (f) remember(q, f as Relative, text, d);
  };
  if (f && p.rng() < 0.4) {
    note(p, L(`${who}が、しばらく前からずっとつらかったと打ち明けてくれた。夜遅くまで話を聞き、一緒に相談先を探した。何年かして、${who}は「あの夜があってよかった」と言った。`,
      `${who} admitted things had been really hard for a while. They talked late into the night and looked up where to get help together. Years later, ${who} said, "I'm glad that night happened."`), 8);
    because(p, helpline());
    bump(p, { bond: 4 });
    return;
  }
  decide(p, {
    title: L('元気がない', 'Not themselves'),
    text: L(`最近、${who}の口数が減った。前は好きだったことにも、あまり手を出さない。`, `Lately ${who} has gone quiet, and does not seem to care about the things they used to love.`),
    options: [
      {
        label: L('「最近どう？」と聞いてみる', 'Ask, "How are you, really?"'), hint: L('うまく言葉が出なくてもいい', 'The words do not have to be perfect'),
        apply: (q) => {
          note(q, L(`${who}にそっと声をかけた。少し黙ってから、ぽつりぽつりと話しはじめた。それから、ときどき一緒に歩くようになった。`,
            `Quietly asked ${who} how things really were. After a pause, the words started to come. After that, they went walking together now and then.`), 6);
          because(q, helpline());
          bump(q, { bond: 3, happy: 2 });
        },
      },
      {
        label: L('そっとしておく', 'Leave them be'),
        apply: (q) => note(q, L(`あとになって、${who}があの頃とてもしんどかったと聞いた。次は自分から聞こうと思った。`, `Later, heard how hard that time had been for ${who}. Decided to be the one to ask next time.`), 0),
      },
    ],
    auto: (q) => (q.rng() < 0.6 ? 0 : 1),
  });
}

// 家族・友だちを自死で亡くしたとき。直前の死別の記録に印を付け、誰のせいでもないことと相談先を添える
export function afterSuicideLoss(p: Person): void {
  const e = p.log[p.log.length - 1];
  if (e) e.quiet = true;
  log(p, L('誰のせいでもなかった。それでも、何度もあの頃のことを思い返した。', 'It was nobody\'s fault. Even so, those days came back again and again.'), 'loss');
  const g = p.log[p.log.length - 1];
  g.quiet = true;
  because(p, helpline());
  bump(p, { happy: -4 });
}
