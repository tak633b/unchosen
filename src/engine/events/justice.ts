// 罪と償い: 飲んだあとの運転、酒の席のけんか、10代のあやまち、食べ物のない年の盗み。家族が刑務所に入ること。
// 罪を犯して得をすることはない。たいていは罰金か執行猶予で終わり、誰が傷ついたか・何を払ったか・どう謝り、どう戻ったかを書く。
// 前科の効力は日本の刑法34条の2・27条にならう: 罰金は5年、執行猶予は猶予期間 (ここでは3年)、刑務所は出てから10年で消える
import { bump, countryOf, decide, log, type Person, type Relative } from '../person';
import { pick } from '../rng';
import { shared } from '../bonds';
import { scaleOf } from './common';
import { L } from '../../i18n';

type Kind = NonNullable<Person['record']>['kind'];
const FADE: Record<Kind, number> = { fine: 5, suspended: 3, prison: 10 };

// 外国で働くビザが下りないか。多くの国が過去の有罪を問うので、前科の効力が消えたあとも、刑務所なら5年長く残す (推計)
export function visaBarred(p: Person): boolean {
  const r = p.record;
  return !!r && p.age < r.until + (r.kind === 'prison' ? 5 : 0);
}

function sentence(p: Person, kind: Kind, years = 0): void {
  // 刑務所にいる間は働けない (仕事を探している扱いにして、出たあと探し直す)
  if (kind === 'prison' && p.working) p.unemployed = Math.max(p.unemployed, years);
  const until = p.age + years + FADE[kind];
  if (!p.record || p.record.until < until) p.record = { kind, until };
  log(p, L(`前科がついた。これから${years + FADE[kind]}年ほどは、仕事探しや外国のビザで不利になる。`, `Now there was a record. For about ${years + FADE[kind]} years it would count against them in job hunts and visa applications.`), 'hard');
  bump(p, { happy: kind === 'prison' ? -15 : -6, bond: kind === 'prison' ? -6 : -2 });
}

export function justice(p: Person): void {
  fade(p);
  kinPrison(p);
  if (p.pending.length) return;
  const r = p.rng;
  const c = countryOf(p);
  // 推計: 毎年の出会いやすさ。米国 CDC (2018): 飲酒運転は自己申告で年1.47億回、逮捕は約100万件 (1回あたり約0.7%)
  if (p.drinker && p.car && p.age >= 18 && p.age <= 80 && p.age - (p.recent.drunkDrive ?? -99) >= 10 && r() < 0.04) return drunkDrive(p);
  if (p.drinker && p.age >= 18 && p.age <= 60 && p.age - (p.recent.brawl ?? -99) >= 15 && r() < 0.015) return brawl(p);
  if (p.age >= 13 && p.age <= 18 && p.recent.teen === undefined && r() < 0.02) return teenMistake(p);
  if (p.age >= 16 && p.stats.money < 8 && p.wealth <= 0 && c.gdp < 20000 && p.age - (p.recent.hungry ?? -99) >= 10 && r() < 0.15) return hungerTheft(p);
}

// 前科の効力が消えた年と、前科のせいで仕事が決まらない年
function fade(p: Person): void {
  const rec = p.record;
  if (!rec) return;
  if (p.age >= rec.until) {
    p.record = undefined;
    log(p, rec.kind === 'fine'
      ? L('罰金を払ってから5年がたち、前科の効力が消えた。', 'Five years after the fine, the conviction no longer counted against them.')
      : rec.kind === 'suspended'
        ? L('執行猶予の期間を何事もなく終え、刑の言い渡しは効力を失った。', 'The suspended sentence ran its course without trouble, and the conviction lapsed.')
        : L('刑務所を出て10年。前科は記録の上でも過去のことになった。', 'Ten years after release, the record was finally behind them on paper too.'), 'family');
    bump(p, { happy: 3 });
    return;
  }
  if (p.unemployed > 0 && p.age - (p.recent.recordJob ?? -99) >= 3 && p.rng() < 0.3) {
    p.recent.recordJob = p.age;
    p.unemployed++;
    log(p, L('面接で前の事件のことを聞かれ、また断られた。', 'Asked about the old case at an interview, and turned down again.'), 'hard');
    bump(p, { happy: -3 });
  }
}

function drunkDrive(p: Person): void {
  p.recent.drunkDrive = p.age;
  const scale = scaleOf(p);
  decide(p, {
    title: L('飲んだあとの帰り道', 'The drive home'),
    text: L('仲間と飲んだ帰り、駐車場に自分の車がある。家までは車で15分。', 'After drinks with friends, the car is sitting in the lot. Home is fifteen minutes away.'),
    stat: L('国によって交通事故死の5〜35%にアルコールが関わっている (WHO 2018)', 'Depending on the country, alcohol is involved in 5 to 35% of road deaths (WHO 2018)'),
    options: [
      {
        label: L('タクシーか代行で帰る', 'Take a cab home'), hint: L('少しお金がかかる', 'Costs a little'),
        apply: (q) => { q.wealth -= scale * 0.003; log(q, L('車は置いて、タクシーで帰った。翌朝取りに行った。', 'Left the car and took a cab. Picked it up the next morning.'), 'family'); },
      },
      {
        label: L('運転して帰る', 'Drive home'), hint: L('一度で終わらないことが多い', 'It rarely stays a one-time thing'),
        apply: (q) => {
          // 推計: 運転を選ぶ人はその年に何度か (ここでは20回) 飲んで運転する。1回あたり逮捕0.7% (CDC)、人をけがさせる事故0.15%
          const x = q.rng();
          if (x < 0.03) {
            q.car = false;
            q.wealth -= scale * 0.6;
            const prison = q.rng() < 0.15;
            log(q, L('飲んで運転した夜、横断歩道を渡っていた人をはねた。相手は脚の骨を折り、半年歩けなかった。保険は下りず、治療費と償いのお金を払いつづけた。',
              'One night after drinking, hit someone in a crosswalk. They broke a leg and could not walk for six months. Insurance would not pay; the medical bills and compensation went on for years.'), 'hard', true);
            log(q, prison
              ? L('懲役2年の実刑だった。免許は取り消された。出てから、相手の家に謝りに行った。玄関は開かなかったが、手紙は受け取ってもらえた。', 'Two years in prison, and the license revoked. After release, went to apologize at their door. It did not open, but the letter was accepted.')
              : L('執行猶予つきの判決で、免許は取り消された。相手の家に何度も謝りに行き、三度目に、やっと話を聞いてもらえた。', 'A suspended sentence, and the license revoked. Went to apologize again and again; on the third visit, they finally listened.'), 'hard');
            sentence(q, prison ? 'prison' : 'suspended', prison ? 2 : 0);
          } else if (x < 0.16) {
            q.wealth -= scale * 0.1;
            log(q, L('検問で止められ、飲酒運転で罰金を払った。免許は止められ、しばらくバスで通った。それから、飲む日は車で出かけなくなった。',
              'Stopped at a checkpoint. A fine for drunk driving, the license suspended, months of taking the bus. After that, never took the car out on a drinking night.'), 'hard');
            sentence(q, 'fine');
          } else {
            log(q, L('何事もなく家に着いた。けれど、翌朝のニュースで飲酒運転の事故を見て、手が冷たくなった。', 'Got home without incident. But the next morning, a news story about a drunk-driving crash left cold hands.'), 'hard');
            bump(q, { happy: -1 });
          }
        },
      },
    ],
    auto: (q) => (q.rng() < 0.2 ? 1 : 0),
  });
}

function brawl(p: Person): void {
  p.recent.brawl = p.age;
  const scale = scaleOf(p);
  decide(p, {
    title: L('酒の席のけんか', 'A fight over drinks'),
    text: L('酒の席で、隣の客にからまれた。相手は胸ぐらをつかんできた。', 'At a drinking spot, a stranger at the next table picks a fight and grabs a fistful of shirt.'),
    options: [
      {
        label: L('殴り返す', 'Hit back'),
        apply: (q) => {
          q.wealth -= scale * 0.15;
          if (q.rng() < 0.5) {
            log(q, L('殴った相手は前歯を折った。警察を呼ばれ、傷害で罰金を払った。治療費も払い、手紙で謝った。', 'The other man lost a front tooth. The police came; there was a fine for assault, his dental bills to pay, and a letter of apology.'), 'hard');
            sentence(q, 'fine');
          } else {
            log(q, L('相手の鼻から血が出た。警察で話をして、治療費を払い、頭を下げて示談になった。帰り道、手の痛みがなかなか引かなかった。', 'The other man\'s nose bled. At the station it ended in a settlement: his medical bills paid and a bow of apology. The hand ached all the way home.'), 'hard');
            bump(q, { happy: -4 });
          }
        },
      },
      { label: L('店を出る', 'Walk out'), apply: (q) => { log(q, L('勘定を置いて、店を出た。夜風で頭が冷えた。', 'Left money on the table and walked out. The night air cooled things down.'), 'family'); } },
      {
        label: L('間に入って止める', 'Step in and calm it down'), hint: L('自分がけがをするかもしれない', 'Might get hurt'),
        apply: (q) => {
          if (q.rng() < 0.3) { log(q, L('間に入ったら肘が当たり、目の下にあざができた。店の人が礼を言ってくれた。', 'Stepped between them and caught an elbow under the eye. The staff said thank you.'), 'hard'); bump(q, { health: -2 }); } else log(q, L('二人の間に入り、なだめているうちに相手も座り直した。', 'Got between them and talked until the stranger sat back down.'), 'family');
          bump(q, { bond: 2 });
        },
      },
    ],
    auto: (q) => { const x = q.rng(); return x < 0.15 ? 0 : x < 0.8 ? 1 : 2; },
  });
}

// 少年の事件は前科にならない (日本の少年法など多くの国で、少年の記録は大人の前科と分けて扱う)
function teenMistake(p: Person): void {
  p.recent.teen = p.age;
  decide(p, {
    title: L('友だちの誘い', 'A dare'),
    text: L('放課後、友だちに「店の物、一つくらいばれないよ」と誘われた。', 'After school, friends say: "Take one thing from the shop. Nobody will notice."'),
    stat: L('米国の10〜17歳の逮捕は年に約70万件で、その年齢の人口のおよそ2%にあたる (OJJDP 2019)', 'US arrests of 10-to-17-year-olds come to about 700,000 a year, roughly 2% of that age group (OJJDP 2019)'),
    options: [
      {
        label: L('やる', 'Do it'),
        apply: (q) => {
          if (q.rng() < 0.5) {
            log(q, L('店の人に見つかり、補導された。迎えに来た親と一緒に店主に頭を下げた。店主は「もう来るなとは言わない」と言った。', 'Caught by the shopkeeper. A parent came to the station, and the two of them bowed to the owner together. The owner said, "I won\'t tell you never to come back."'), 'hard', true);
            bump(q, { happy: -4, bond: -2 });
          } else {
            log(q, L('ばれなかった。盗った物は、一度も使わずに引き出しの奥にしまったままだった。', 'Nobody noticed. The thing sat untouched at the back of a drawer for years.'), 'hard');
            bump(q, { happy: -2 });
          }
        },
      },
      { label: L('断る', 'Say no'), hint: L('仲間外れにされるかもしれない', 'Might get left out'), apply: (q) => { log(q, L('「やめとく」と言った。何日か気まずかったが、そのうち元に戻った。', 'Said "I\'ll pass." It was awkward for a few days, then it blew over.'), 'school'); bump(q, { learn: 1 }); } },
    ],
    auto: (q) => (q.rng() < 0.25 ? 0 : 1),
  });
}

// 食べ物のない年。盗んでも得はしない: 捕まらなくても気持ちは晴れず、助けを求めるほうが体にもよい
function hungerTheft(p: Person): void {
  p.recent.hungry = p.age;
  const scale = scaleOf(p);
  const place = pick(p.rng, [L('近くの寺', 'a temple nearby'), L('教会の炊き出し', 'a church soup kitchen'), L('親戚の家', 'relatives'), L('近所の人', 'the neighbors')]);
  decide(p, {
    title: L('食べる物がない', 'Nothing to eat'),
    text: L('もう何日もまともに食べていない。市場の屋台には、パンが積んである。', 'There has been no real meal for days. At the market, bread is stacked on a stall.'),
    options: [
      {
        label: L('パンを盗む', 'Take the bread'),
        apply: (q) => {
          if (q.rng() < 0.3) {
            q.wealth -= scale * 0.05;
            log(q, L('すぐに捕まり、警察に突き出された。罰金を払うために、さらに借金をした。屋台の主人には、あとで少しずつ代金を返した。', 'Caught on the spot and handed to the police. Borrowed more money to pay the fine, and later paid the stallholder back, a little at a time.'), 'hard', true);
            sentence(q, 'fine');
          } else {
            log(q, L('その夜は食べられた。けれど、それからその屋台の前を通れなくなった。', 'There was food that night. But walking past that stall became impossible after that.'), 'hard');
            bump(q, { happy: -3 });
          }
        },
      },
      { label: L('助けを求める', 'Ask for help'), hint: L('恥ずかしさをこらえる', 'Swallow the shame'), apply: (q) => { log(q, L(`${place}に頼み、食べ物を分けてもらった。次の月、手伝いに行った。`, `Went to ${place} and was given food. The next month, went back to help out.`), 'family'); bump(q, { health: 2, happy: 1, bond: 2 }); } },
      { label: L('我慢する', 'Go without'), apply: (q) => { log(q, L('水を飲んで、空腹をやり過ごした。', 'Drank water and waited out the hunger.'), 'hard'); bump(q, { health: -4 }); } },
    ],
    auto: (q) => { const x = q.rng(); return x < 0.15 ? 0 : x < 0.85 ? 1 : 2; },
  });
}

// ---- 家族が刑務所に入る ----------------------------------------------------
// 人口10万人あたりの収容者数。World Prison Brief (ICPR) の2021〜2023年ごろのおおよその値。載っていない国は世界の値 140 (13th ed. 2021)
// ponytail: 主な国だけ。ほかの国にも表を足すと国ごとの差が出る
const PRISON: Record<string, number> = { USA: 541, RUS: 300, BRA: 390, ZAF: 248, CHN: 119, KOR: 104, GBR: 129, DEU: 67, IND: 41, JPN: 33, NGA: 36 };
// 1年に入る確率: 収容率 ÷ 平均の刑期 (約2年、推計) を、収容者の約93%が男性 (WPB) であることと18〜55歳に寄せて配る
function jailHazard(p: Person, r: Relative): number {
  if (r.age < 18 || r.age > 55) return 0;
  return ((PRISON[p.country] ?? 140) / 1e5 / 2) * (r.sex === 'M' ? 1.85 : 0.15);
}

const word = (p: Person, r: Relative): string =>
  r === p.mother ? L('母', 'Mother') : r === p.father ? L('父', 'Father')
    : p.children.includes(r) ? L(`子どもの${r.name}`, `${r.name}, ${r.sex === 'F' ? 'a daughter' : 'a son'},`)
      : L(`きょうだいの${r.name}`, `${r.sex === 'F' ? 'Sister' : 'Brother'} ${r.name}`);

function kinPrison(p: Person): void {
  const all: Relative[] = [p.mother, p.father, ...p.siblings, ...p.children];
  const j = p.jailed;
  if (j) {
    const r = all.find((x) => x.id === j.id);
    if (!r?.alive) { p.jailed = undefined; return; }
    if (p.age >= j.until) return homecoming(p, r, !!j.retrial);
    return;
  }
  // 子どもの頃の親、大人になったきょうだい、大人になった子
  const cand = [...(p.age < 18 ? [p.mother, p.father] : []), ...(p.age >= 12 ? p.siblings : []), ...(p.age >= 40 ? p.children : [])].filter((r) => r.alive && r.id !== undefined);
  for (const r of cand) {
    if (p.rng() >= jailHazard(p, r)) continue;
    const years = 1 + Math.floor(p.rng() * 3);
    // 推計: 有罪のうち冤罪はごく一部 (米国の死刑判決で約4%、Gross ほか 2014, PNAS)。ここでは2%
    const retrial = p.rng() < 0.02;
    p.jailed = { id: r.id!, until: p.age + years, ...(retrial ? { retrial } : {}) };
    const w = word(p, r);
    shared(p, [r], L(`${w}が罪に問われ、${years}年の刑で刑務所に入った。`, `${w} was convicted and sent to prison for ${years} ${years === 1 ? 'year' : 'years'}.`), 'hard', -4, true);
    if (retrial) log(p, L(`${r.name ?? w}は、やっていないと言いつづけた。`, `${r.name ?? w} kept saying, "I didn't do it."`), 'hard');
    bump(p, { happy: p.age < 18 ? -10 : -6 });
    if (p.age < 18 && (r === p.mother || r === p.father)) {
      p.familyP = Math.max(0.01, p.familyP - 0.08);
      log(p, L('学校では、そのことを誰にも言えなかった。', 'Could not tell anyone at school.'), 'hard');
      if (p.age < 12) { shared(p, [r], L(`月に一度、面会に連れていってもらった。ガラスの向こうで、${word(p, r)}は笑ってみせた。`, `Once a month, went along on a visit. Behind the glass, ${word(p, r)} made a point of smiling.`), 'family', 6); return; }
    }
    visits(p, r);
    return;
  }
}

function visits(p: Person, r: Relative): void {
  decide(p, {
    title: L('刑務所の家族', 'Family behind bars'),
    text: L(`${r.name ?? ''}に会いに行くには、半日かかる。`, `Visiting ${r.name ?? 'them'} takes half a day each way.`),
    stat: L('世界でおよそ1,080万人が刑務所などに収容されている (World Prison Brief 13th ed. 2021)', 'About 10.8 million people are held in prisons worldwide (World Prison Brief, 13th ed., 2021)'),
    options: [
      { label: L('面会に通う', 'Visit'), hint: L('時間とお金がかかる', 'Costs time and money'), apply: (q) => { q.wealth -= scaleOf(q) * 0.02; shared(q, [r], L(`面会に通った。${r.name ?? ''}は、毎回「外はどうだ」と聞いた。`, `Went to visit. Every time, ${r.name ?? 'they'} asked, "What's it like out there?"`), 'family', 8); } },
      { label: L('手紙を書く', 'Write letters'), apply: (q) => shared(q, [r], L(`毎月、手紙を書いた。返事は短かったが、必ず来た。`, `Wrote every month. The replies were short, but they always came.`), 'family', 6) },
      { label: L('距離をおく', 'Keep a distance'), hint: L('自分の暮らしを守る', 'Protect your own life'), apply: (q) => shared(q, [r], L(`しばらく、${r.name ?? ''}のことは考えないようにした。`, `Tried not to think about ${r.name ?? 'them'} for a while.`), 'hard', -8) },
    ],
    auto: (q) => { const x = q.rng(); return x < 0.4 ? 0 : x < 0.8 ? 1 : 2; },
  });
}

function homecoming(p: Person, r: Relative, retrial: boolean): void {
  p.jailed = undefined;
  if (retrial) shared(p, [r], L(`支援する弁護士が新しい証拠を見つけ、再審が決まった。${r.name ?? ''}は釈放され、判決のやり直しを待っている。`, `A lawyer working on the case found new evidence, and a retrial was granted. ${r.name ?? 'They'} walked out to wait for a new verdict.`), 'family', 6, true);
  if (p.age < 12) { shared(p, [r], L(`${word(p, r)}が帰ってきた。少し痩せていた。`, `${word(p, r)} came home, a little thinner.`), 'family', 4); return; }
  decide(p, {
    title: L('出所の日', 'Release day'),
    text: L(`${word(p, r)}が刑務所を出る。どう迎える？`, `${word(p, r)} is getting out. How to welcome them home?`),
    options: [
      { label: L('門の前で待つ', 'Wait at the gate'), apply: (q) => { shared(q, [r], L(`門の前で待った。出てきた${r.name ?? ''}は、こちらを見て立ち止まり、それから歩いてきた。`, `Waited at the gate. ${r.name ?? 'They'} stopped on seeing who was there, then walked over.`), 'family', 12); bump(q, { happy: 4 }); } },
      { label: L('部屋と仕事の口を用意する', 'Find them a room and a job lead'), hint: L('お金と手間がかかる', 'Takes money and effort'), apply: (q) => { q.wealth -= scaleOf(q) * 0.05; shared(q, [r], L(`部屋を借り、知り合いの店の仕事を頼んでおいた。${r.name ?? ''}は、その店で長く働いた。`, `Rented a room and asked a friend's shop to take them on. ${r.name ?? 'They'} ended up working there for years.`), 'family', 10); } },
      { label: L('会わずにおく', 'Stay away'), apply: (q) => { shared(q, [r], L('迎えには行かなかった。何年かして、短い手紙が届いた。', 'Did not go. Years later, a short letter arrived.'), 'hard', -6); } },
    ],
    auto: (q) => { const x = q.rng(); return x < 0.45 ? 0 : x < 0.8 ? 1 : 2; },
  });
}

