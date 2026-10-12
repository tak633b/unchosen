// 巻き込まれる出来事: すり・空き巣・強盗・暴力、その時代の道具に合わせた詐欺、闇バイトや運び屋の誘い、交通事故・火事・目撃・人違い・みかじめ料・誘拐。
// 死は生命表 (lifetable.ts) と九死に一生 (crisis.ts) に入っているので、ここでは死なせない。体・気持ち・お金に跡を残す。
// 1年に起きるのは多くても1つ。種類ごとに間を置き、一生で数回になるようにする (実測は incidents.test.ts)。
// 国の差は殺人率 (UNODC、era.json で年ごと) を暴力の目安にし、物を盗られる率はその0.3乗で緩く動かす。
// ponytail: 殺人率で財産犯を代用している。英国のように殺人は少なく空き巣の多い国は低めに出る。国別の被害調査の表を足すと直る
import { yen } from '../economy';
import { bump, countryOf, decide, log, yearOf, type Person } from '../person';
import type { Country } from '../countries';
import { clamp, pick } from '../rng';
import { techShare } from '../tech';
import { because } from '../why';
import { isPoor, isRich, scaleOf } from './common';
import { sentence } from './justice';
import { L } from '../../i18n';

const US_HOMICIDE = 5.8; // 米国の殺人率 (10万人あたり、UNODC 2021ごろ)。暴力の目安の基準
const pct = (x: number) => (x >= 0.01 ? (x * 100).toFixed(1) : (x * 100).toFixed(2));
const chance = (p: Person, what: string, whatEn: string, x: number) =>
  because(p, L(`その年、${countryOf(p).name}で${what}確率はおよそ${pct(x)}%`, `That year in ${countryOf(p).name}, the chance of ${whatEn} was about ${pct(x)}%`));
// 印は inc: を付けて置く (moments.json の id 'burglary' などと重ならないように)
const ok = (p: Person, key: string, gap: number) => p.age - (p.recent[`inc:${key}`] ?? -999) >= gap;
const lose = (p: Person, amount: number) => { p.wealth -= amount; return yen(amount); };

interface Ctx { c: Country; y: number; v: number; prop: number; urban: number; old: boolean }

// ---- 1. 被害 ---------------------------------------------------------------

// すり・置き引き・ひったくり。国際犯罪被害調査 (ICVS 2004/05) で、1年に持ち物を盗まれた人は多くの国で2〜5%。
// 覚えているほどのものだけを書くので、米国の都市で年1.2%とする (ponytail: 概数)
const theftP = (p: Person, x: Ctx) => (p.age >= 12 ? 0.012 * x.prop * x.urban : 0);
function theft(p: Person, x: Ctx): void {
  const what = x.c.code === 'JPN' && x.y >= 1960
    ? pick(p.rng, [L('駅の駐輪場で、自転車を盗まれた。', 'A bicycle was stolen from the station lot.'), L('電車の中で財布をすられた。', 'A wallet was picked on a crowded train.')])
    : pick(p.rng, [L('市場の人ごみで財布をすられた。', 'A wallet was picked in a crowded market.'), L('バス停でかばんをひったくられた。', 'A bag was snatched at a bus stop.'), L('少し目を離したすきに、荷物を持っていかれた。', 'Looked away for a moment, and the bag was gone.')]);
  const lost = lose(p, scaleOf(p) * (0.01 + p.rng() * 0.02));
  log(p, `${what}${L(`${lost}ほどの損だった。`, ` A loss of about ${lost}.`)}`, 'hard', false,
    x.c.code === 'JPN' ? L('日本の窃盗の認知件数は2022年に約40.8万件 (警察庁)', 'Japan recorded about 408,000 thefts in 2022 (National Police Agency)')
      : L('1年に持ち物を盗まれた人は、多くの国で2〜5% (国際犯罪被害調査 2004/05)', 'In most countries, 2 to 5% of people have something stolen each year (ICVS 2004/05)'));
  bump(p, { happy: -2 });
}

// 空き巣。米国の世帯の侵入盗は年に約1.3% (NCVS 2019)。日本は侵入窃盗が2022年に約3.7万件 (5,500万世帯で約0.07%、警察庁)
// ponytail: 0.0035×prop で米国0.35%・日本0.13%。届け出のない分を足した概数
const burglaryP = (p: Person, x: Ctx) => (p.age >= 22 ? 0.0035 * x.prop * (x.urban === 1 ? 1.2 : 0.8) : 0);
function burglary(p: Person, x: Ctx): void {
  const lost = lose(p, scaleOf(p) * (0.03 + p.rng() * 0.07));
  log(p, L(`留守のあいだに空き巣に入られた。引き出しが全部開いていた。${lost}ほどの物とお金がなくなった。しばらく、夜の物音で目が覚めた。`,
    `The house was burgled while no one was home. Every drawer had been pulled open; about ${lost} in cash and things were gone. For a while, every night noise brought sleep to an end.`), 'hard', false,
  x.c.code === 'JPN' ? L('日本の侵入窃盗は2022年に約3.7万件 (警察庁)', 'Japan recorded about 37,000 break-ins in 2022 (National Police Agency)')
    : L('米国では1年に世帯のおよそ1.3%が侵入盗にあう (司法統計局 NCVS 2019)', 'About 1.3% of US households are burgled each year (BJS NCVS 2019)'));
  bump(p, { happy: -4 });
}

// 強盗。米国の強盗被害は12歳以上で年0.2% (NCVS 2019)。殺人率に比例させ、米国で0.23%、メキシコ1%、日本0.01% (日本の強盗は2022年に1,148件)
// 強盗のおよそ3分の1でけが人が出る (NCVS)
const robberyP = (p: Person, x: Ctx) => (p.age >= 14 ? Math.min(0.03, (x.c.homicide / 1e5) * 40) * (x.urban === 1 ? 1.2 : 0.6) : 0);
function robbery(p: Person, x: Ctx): void {
  const hurt = p.rng() < 0.33;
  const lost = lose(p, scaleOf(p) * (0.02 + p.rng() * 0.04));
  log(p, hurt
    ? L(`夜道で刃物を持った男に囲まれ、持ち物を奪われた。抵抗したわけでもないのに殴られ、顔を何針か縫った。${lost}ほどの損だった。`, `Cornered on a dark street by men with a knife and robbed of everything. Beaten anyway, though there was no struggle; the face needed stitches. A loss of about ${lost}.`)
    : L(`帰り道で強盗にあった。言われるままに財布と電話を渡した。${lost}ほどの損だった。けがはなかったが、その道はもう通らなくなった。`, `Robbed on the way home. Handed over wallet and phone without a word. A loss of about ${lost}. No injuries, but that street was never walked again.`),
  'hard', hurt, L(`強盗の被害は、殺人の多い国ほど多い。この国の殺人は10万人あたり${x.c.homicide.toFixed(1)}件 (UNODC)`, `Robbery runs higher where homicide does. Here, ${x.c.homicide.toFixed(1)} homicides per 100,000 (UNODC)`));
  chance(p, '強盗にあう', 'being robbed', robberyP(p, x));
  bump(p, { happy: -6, health: hurt ? -5 : 0 });
}

// 殴られる・脅される。米国の暴力被害は12歳以上で年2.1% (NCVS 2019)。覚えているほどの暴行は米国で年0.6%とし、殺人率の平方根で動かす
// 若い男性ほど多い (NCVS)。ponytail: 家庭の中の暴力は別の話として入れていない
const assaultP = (p: Person, x: Ctx) => (p.age >= 14 && p.age <= 70 ? 0.006 * Math.sqrt(x.v) * (p.sex === 'M' ? 1.3 : 0.7) * (p.age < 30 ? 1.6 : p.age > 50 ? 0.5 : 1) : 0);
function assault(p: Person): void {
  log(p, pick(p.rng, [
    L('駅前で知らない男にからまれ、いきなり殴られた。目の上が腫れて、一週間引かなかった。', 'A stranger outside the station picked a fight and threw a punch out of nowhere. The swelling over one eye took a week to go down.'),
    L('夜の帰り道、後ろから突き飛ばされて転んだ。相手は何も取らずに走っていった。膝の傷はなかなか治らなかった。', 'Shoved from behind on the way home at night. Whoever it was ran off without taking anything. The scraped knee was slow to heal.'),
  ]), 'hard', false, L('米国では12歳以上の人の約2%が、1年に暴力の被害にあう (NCVS 2019)', 'About 2% of Americans aged 12 and over suffer a violent crime each year (BJS NCVS 2019)'));
  bump(p, { happy: -4, health: -3 });
}

// 押し売り・点検商法・うまい話。どの時代にもある。日本の訪問販売の相談は年に約7万件 (国民生活センター PIO-NET)。高齢者が多い
// ponytail: 年0.2% (65歳から倍) は推計
const conP = (p: Person, x: Ctx) => (p.age >= 25 ? 0.002 * (x.old ? 2 : 1) : 0);
function con(p: Person, x: Ctx): void {
  const lost = lose(p, scaleOf(p) * (0.08 + p.rng() * 0.15));
  log(p, pick(p.rng, [
    L(`「屋根が傷んでいる、このままだと雨漏りする」と言う業者に、修理を頼んだ。${lost}を払ったあと、どこも傷んでいなかったと知った。`, `A contractor said the roof was failing and would leak. Paid ${lost} for the repair, then learned nothing had been wrong.`),
    L(`「必ずもうかる」という知り合いの話に乗って、${lost}を預けた。その人とは、それきり連絡がつかなくなった。`, `An acquaintance promised a sure return. Handed over ${lost}, and never heard from them again.`),
    L(`家に来たセールスマンに勧められるまま、高い品物を買った。${lost}だった。使わないまま押し入れにしまった。`, `Talked into an expensive purchase by a salesman at the door: ${lost}. It went unused into the back of a closet.`),
  ]), 'hard', false, x.c.code === 'JPN' ? L('訪問販売をめぐる消費生活相談は年に約7万件 (国民生活センター)', 'Japan logs about 70,000 consumer complaints a year about door-to-door sales (NCAC)') : undefined);
  bump(p, { happy: -3 });
}

// 電話の詐欺。日本は2003年ごろから「オレオレ詐欺」(2004年に名づけ、のちに特殊詐欺)。2022年の特殊詐欺は17,570件・被害約370億円 (1件約210万円)、被害者の約87%が65歳以上 (警察庁)。
// 65歳以上 3,600万人で年0.04%。電話がかかってくるだけならずっと多いので、気づいて切った年も書く (ponytail: 65歳から年2% は推計)
// ほかの国は携帯が広まってから。米国 FTC は2023年に詐欺の届け出約260万件・被害100億ドル超 (電話が入口の被害は高齢者で大きい)
function phoneP(p: Person, x: Ctx): [number, number] {
  if (p.age < 20) return [0, 0];
  if (x.c.code === 'JPN') return x.y < 2003 ? [0, 0] : x.old ? [0.02, 0.0006] : [0.005, 0.0001];
  const m = x.y >= 1995 ? techShare(x.c, 'mobile', false, x.y) : 0;
  return [0.006 * m * (x.old ? 2 : 1), 0.0015 * m * (x.old ? 2 : 1)];
}
function phoneScam(p: Person, x: Ctx, hit: boolean): void {
  const jp = x.c.code === 'JPN';
  const stat = jp ? L('日本の特殊詐欺は2022年に17,570件、被害は約370億円。被害者の約87%が65歳以上 (警察庁)', 'Japan had 17,570 phone-scam cases in 2022, about ¥37 billion lost; about 87% of victims were 65 or older (National Police Agency)')
    : L('米国では2023年、詐欺の届け出が約260万件あり、被害は100億ドルを超えた (FTC)', 'In 2023 Americans reported about 2.6 million frauds and more than $10 billion lost (FTC)');
  if (!hit) {
    log(p, jp ? L('「俺だけど、会社のお金をなくした」と、息子を名乗る電話がかかってきた。声が違う気がして、本人の番号にかけ直した。本人は何も知らなかった。', 'A call: "It\'s me. I lost money from work." The voice claimed to be family, but sounded wrong. Called back on the real number; they knew nothing about it.')
      : L('「あなたの口座が不正に使われている」と、銀行を名乗る電話がかかってきた。番号を聞かれたところで切った。', 'A call from someone claiming to be the bank: the account had been compromised. When they asked for the PIN, the line went dead from this end.'), 'family', false, stat);
    return;
  }
  const lost = lose(p, jp ? Math.min(22000, Math.max(scaleOf(p) * 0.5, p.wealth * 0.3)) : scaleOf(p) * (0.1 + p.rng() * 0.3));
  log(p, jp ? L(`息子を名乗る電話を信じ、${lost}を、家まで取りに来た若い男に渡した。だまされたと分かったのは、その夜だった。誰にも言えず、しばらく電話に出られなくなった。`, `Believed a caller pretending to be family, and handed ${lost} to a young man who came to the door to collect it. That night it became clear it was a scam. Told no one, and stopped answering the phone for a while.`)
    : L(`役所を名乗る電話に言われるまま、${lost}を振り込んだ。翌日、本物の役所に問い合わせて、だまされたと知った。`, `Followed the instructions of a caller who claimed to be from the government, and transferred ${lost}. The next day, the real office said it had never called.`), 'hard', true, stat);
  chance(p, 'こうした詐欺で金を失う', 'losing money to such a scam', phoneP(p, x)[1]);
  bump(p, { happy: -8 });
}

// ネットの詐欺となりすまし。ネットが広まってから。FBI IC3 は2023年に約88万件・被害125億ドル。FTC 2023 では投資詐欺46億ドル・恋愛詐欺11億ドル。
// 暗号資産の詐欺は2017年から。米国で個人情報を悪用された人は16歳以上の7%/年 (BJS 2018、ほとんどはカードの不正利用)
// ponytail: 金を失うのは年0.4%×ネットの普及、カードの不正利用は年0.4%×普及 (届け出の数倍とした推計)
const onlineP = (p: Person, x: Ctx) => (p.age >= 18 && x.y >= 1995 ? 0.004 * techShare(x.c, 'internet', p.rural, x.y) : 0);
const idP = (p: Person, x: Ctx) => (p.age >= 18 && x.y >= 1998 ? 0.004 * techShare(x.c, 'internet', p.rural, x.y) : 0);
function onlineScam(p: Person, x: Ctx): void {
  const s = scaleOf(p);
  const r = p.rng();
  const stat = L('米国の FBI には2023年にネット犯罪の届け出が約88万件あり、被害は125億ドル。いちばん大きいのは投資詐欺 (FBI IC3 / FTC)', 'The FBI received about 880,000 internet-crime complaints in 2023, with $12.5 billion lost; investment fraud was the largest (FBI IC3 / FTC)');
  if (r < 0.55) {
    const lost = lose(p, s * 0.02);
    log(p, L(`ネットで安く売られていた品物を注文し、${lost}を払った。品物は届かず、店のページは消えていた。`, `Ordered something cheap online and paid ${lost}. It never came, and the shop's page was gone.`), 'hard', false, stat);
    bump(p, { happy: -2 });
  } else if (r < 0.75 && p.age >= 30) {
    const lost = lose(p, s * (0.2 + p.rng() * 0.4));
    log(p, L(`ネットで知り合った人と、毎晩のようにやりとりした。会ったことはなかった。「急に入り用になった」と言われ、何度かに分けて${lost}を送った。それから連絡は途絶えた。写真は、別の誰かのものだった。`,
      `Met someone online, and wrote to them almost every night. They never met. Then came an emergency, and ${lost} went out in several transfers. After that, silence. The photos had been of someone else.`), 'hard', true, stat);
    bump(p, { happy: -10, bond: -2 });
  } else {
    const crypto = x.y >= 2017;
    const lost = lose(p, s * (0.3 + p.rng() * 0.5));
    log(p, crypto ? L(`SNSで知り合った人に勧められ、暗号資産の投資サイトに${lost}を入れた。画面の上では増えていたが、引き出そうとすると手数料を求められ、やがてサイトごと消えた。`, `Someone met on social media recommended a crypto investment site. Put in ${lost}. On screen it kept growing; withdrawing it required a "fee," and then the whole site vanished.`)
      : L(`ネットの「確実にもうかる」投資話に${lost}を入れた。最初の月だけ配当が出て、それきり止まった。`, `Put ${lost} into an online investment that "couldn't lose." It paid out for one month, then stopped.`), 'hard', true, stat);
    bump(p, { happy: -8 });
  }
  chance(p, 'ネットの詐欺で金を失う', 'losing money to an online scam', onlineP(p, x));
}
function idTheft(p: Person): void {
  log(p, L('カードの明細に、使った覚えのない買い物が並んでいた。番号を盗まれていた。カード会社が調べて、ほとんどは戻ってきた。', 'The card statement listed purchases never made. The number had been stolen. The card company investigated, and most of it came back.'), 'hard', false,
    L('米国では16歳以上の約7%が、1年のうちに個人情報を悪用される。多くはカードの不正利用 (司法統計局 2018)', 'About 7% of Americans 16 and over have their identity misused in a year, mostly existing card accounts (BJS 2018)'));
  bump(p, { happy: -1 });
}

// ---- 2. 誘われる ------------------------------------------------------------
// 若く、貧しいか仕事のない人に「楽にもうかる」話が来る。日本は2019年ごろから SNS の「闇バイト」(特殊詐欺の受け子・出し子、2024年には強盗の実行役も)。
// 2023年の特殊詐欺の検挙は約2,500人で、多くは SNS で集められた末端だった (警察庁)。ほかの国は運び屋・ギャング・口座を貸す「マネーミュール」(Europol: 18〜24歳が最も多い)
// ponytail: 誘われる率 (日本 年0.6%、ほか 年0.4%×殺人率の平方根) と、乗る割合 (日本6%・ほか10%) は推計。誘われた人の大半は断る
const lureP = (p: Person, x: Ctx) => {
  if (p.age < 16 || p.age > 29 || p.record || p.pending.length) return 0;
  if (!(isPoor(p) || p.unemployed > 0 || (!p.working && !p.school.enrolled && p.school.uni !== 'studying'))) return 0;
  if (x.c.code === 'JPN') return x.y >= 2019 ? 0.006 : 0;
  return 0.004 * Math.min(4, Math.sqrt(x.v));
};
type Lure = 'yami' | 'mule' | 'courier' | 'gang';
function lureKind(p: Person, x: Ctx): Lure {
  if (x.c.code === 'JPN') return 'yami';
  if (x.y >= 2005 && p.rng() < techShare(x.c, 'internet', p.rural, x.y) * 0.6) return 'mule';
  return x.v > 2 && p.sex === 'M' && p.rng() < 0.5 ? 'gang' : 'courier';
}
const LURE: Record<Lure, { title: [string, string]; text: [string, string]; stat: [string, string]; arrest: number; prison: number; years: number }> = {
  yami: {
    title: ['高収入のバイト', 'A well-paid job'],
    text: ['SNSに「即日・高収入・荷物を受け取るだけ」という投稿があった。連絡すると、身分証の写真を送るよう言われた。', 'A post on social media: "Same-day pay. High income. Just pick up packages." Messaging the account brought a request for a photo of an ID card.'],
    stat: ['2023年に特殊詐欺で検挙された約2,500人の多くは、SNSで集められた受け取り役だった (警察庁)', 'Most of the roughly 2,500 people arrested for phone scams in Japan in 2023 were low-level pickup runners recruited on social media (National Police Agency)'],
    arrest: 0.7, prison: 0.5, years: 3,
  },
  mule: {
    title: ['口座を貸すだけ', 'Just lend the account'],
    text: ['ネットで知り合った人に「口座にお金が入ったら、引き出して送るだけ。手数料を払う」と持ちかけられた。', 'Someone met online offers a cut: money will land in the account, and all you do is withdraw it and send it on.'],
    stat: ['犯罪の金を流す「マネーミュール」は、18〜24歳が最も多い (Europol)', 'Money mules are most often 18 to 24 years old (Europol)'],
    arrest: 0.35, prison: 0.15, years: 1,
  },
  courier: {
    title: ['包みを届けるだけ', 'Just deliver a package'],
    text: ['顔見知りの男に「この包みを隣の町まで届けたら、ひと月分の稼ぎになる」と言われた。中身は聞かないほうがいい、と。', 'A man from the neighborhood says delivering a package to the next town pays a month\'s wages. Better not to ask what is inside, he says.'],
    stat: ['若者が麻薬の運び役に使われやすい。世界で麻薬取引の罪で収容されている人は約47万人 (UNODC 2023)', 'Young people are often used as drug couriers; about 470,000 people are imprisoned worldwide for drug trafficking (UNODC 2023)'],
    arrest: 0.3, prison: 0.6, years: 3,
  },
  gang: {
    title: ['地元のグループ', 'The local crew'],
    text: ['地元のグループの男たちに「仲間に入れば金も、守ってくれる人もできる」と誘われた。', 'Men from the local crew say: join up, and there will be money and people to watch your back.'],
    stat: ['殺人の被害者の多くは15〜29歳の男性で、暴力の多い国ほど若者が組織に引き込まれる (UNODC Global Study on Homicide 2023)', 'Most homicide victims are men aged 15 to 29; where violence is high, young people are drawn into gangs (UNODC Global Study on Homicide 2023)'],
    arrest: 0.4, prison: 0.7, years: 4,
  },
};
export function lure(p: Person, x: Ctx): void {
  const k = lureKind(p, x);
  const t = LURE[k];
  decide(p, {
    title: L(...t.title), text: L(...t.text), stat: L(...t.stat),
    options: [
      { label: L('断る', 'Say no'), apply: (q) => { log(q, k === 'yami' ? L('「高収入」の投稿には返事をしなかった。半年後、同じような募集に応じた若者が捕まったというニュースを見た。', 'Never replied to the "high income" post. Six months later, the news reported young people arrested after answering one just like it.') : L('断った。それからは、その人たちのいる道を避けて歩いた。', 'Said no, and after that took the long way around them.'), 'family'); } },
      { label: L('引き受ける', 'Take it'), hint: L('一度で抜けられるとは限らない', 'Getting out again is not guaranteed'), apply: (q) => took(q, k) },
    ],
    auto: (q) => (q.rng() < (k === 'yami' ? 0.06 : 0.1) ? 1 : 0),
  });
}
function took(p: Person, k: Lure): void {
  const t = LURE[k];
  const caught = p.rng() < t.arrest;
  if (!caught) {
    log(p, k === 'yami'
      ? L('言われた家で封筒を受け取り、指示された場所に置いた。約束の報酬は払われなかった。抜けたいと言うと、送った身分証の写真で家族のことをほのめかされた。親に打ち明け、一緒に警察に相談に行った。', 'Picked up an envelope at the house they named and left it where they said. The promised pay never came. Asking to quit brought hints about family, using the ID photo already sent. Told a parent, and the two went to the police together.')
      : k === 'mule' ? L('口座に知らない金が入り、言われたとおりに送った。数か月後、銀行に口座を止められ、どこの銀行でも口座が作れなくなった。', 'Unknown money came in, and went out again as instructed. Months later the bank froze the account, and no bank would open a new one.')
        : k === 'courier' ? L('包みを届け、金を受け取った。けれど次の頼みは断れなかった。抜けるまでに二年かかった。', 'Delivered the package and got paid. The next request could not be refused. It took two years to get out.')
          : L('グループに入った。金は入ったが、夜は眠れなくなった。仲間の一人が撃たれたあと、町を出た。', 'Joined the crew. There was money, but no sleep. After one of them was shot, left town.'), 'hard', true);
    bump(p, { happy: -10, health: k === 'gang' ? -6 : 0, bond: -4 });
    return;
  }
  const prison = p.rng() < t.prison;
  const years = prison ? Math.max(1, t.years - 1 + Math.floor(p.rng() * 3)) : 0;
  log(p, k === 'yami'
    ? L(`指示された家に行ったところで、待っていた警察官に捕まった。お金を取られたのは、一人で暮らす80代の女性だった。${prison ? `懲役${years}年の実刑だった。` : '執行猶予つきの判決だった。'}傍聴席で、母が下を向いていた。`, `Arrested at the door, where the police were waiting. The money had been taken from a woman in her eighties who lived alone. ${prison ? `The sentence was ${years} years in prison.` : 'The sentence was suspended.'} In the gallery, Mother kept her eyes on the floor.`)
    : k === 'mule' ? L(`口座に入った金は、だまされた人たちのものだった。警察に呼ばれ、${prison ? `${years}年の刑になった。` : '執行猶予つきの判決を受けた。'}`, `The money had come from people who had been cheated. Called in by the police: ${prison ? `${years} years in prison.` : 'a suspended sentence.'}`)
      : L(`検問で包みを調べられ、その場で捕まった。${prison ? `${years}年の刑だった。` : '初めてだったので、執行猶予がついた。'}家族は近所に顔を上げられなくなった。`, `Searched at a checkpoint and arrested on the spot. ${prison ? `${years} years in prison.` : 'A first offense, so the sentence was suspended.'} The family could no longer look the neighbors in the eye.`), 'hard', true);
  if (p.working && p.unemployed === 0) p.unemployed = 1;
  sentence(p, prison ? 'prison' : 'suspended', years);
  bump(p, { bond: -6 });
}

// ---- 3. 日々の出来事 ---------------------------------------------------------

// 交通事故の死者 (10万人あたり、WHO 道路安全報告 2023 の2021年推計)。表に無い国は所得から
// ponytail: 主な国だけ。重いけが (入院) は死者の約15倍とした (WHO: けが人は年2,000万〜5,000万人、死者119万人)
const ROAD: Record<string, number> = { JPN: 2.7, USA: 12.7, GBR: 2.6, DEU: 3.3, FRA: 5.1, KOR: 6.5, BRA: 16, IND: 15.6, MEX: 12.8, NGA: 21, CHN: 17.4, ZAF: 22 };
// 時代: 車が少ないほど事故は少ないが、昔ほど車が危なかった (日本の死者は1970年に16,765人、2022年に2,610人)。
// ponytail: 車の普及の比 × 年3.5%ずつ安全になった分。日本の1970年は実際の半分ほどにしか出ない
export function roadDeaths(c: Country, y: number): number {
  const now = ROAD[c.code] ?? (c.gdp >= 30000 ? 7 : c.gdp >= 10000 ? 15 : 20);
  if (y >= 2021) return now;
  const car = (yy: number) => 0.15 + techShare(c, 'car', false, yy);
  return now * clamp((car(y) / car(2021)) * 1.035 ** (2021 - y), 0.2, 3);
}
const roadP = (p: Person, x: Ctx) => (p.age >= 6 ? (roadDeaths(x.c, x.y) / 1e5) * 15 * (p.age >= 15 && p.age < 30 ? 1.5 : 1) : 0);
function road(p: Person, x: Ctx): void {
  const car = techShare(x.c, 'car', p.rural, x.y);
  log(p, p.age < 15
    ? (p.school.enrolled
      ? L('学校の帰りに、道に飛び出したところを車にはねられた。脚を折り、ひと月入院した。', 'Ran into the road on the way home from school and was hit by a car. A broken leg, and a month in hospital.')
      : L('道ばたで遊んでいて、走ってきたトラックにはねられた。脚を折り、ひと月寝たきりだった。', 'Playing by the roadside, was hit by a passing truck. A broken leg, and a month in bed.'))
    : p.car && p.rng() < 0.6
      ? L('交差点で横から来た車にぶつけられた。むち打ちと肋骨のひびで、しばらく仕事を休んだ。', 'Hit side-on at an intersection. Whiplash and a cracked rib, and time off work.')
      : car < 0.3 && p.rng() < 0.5
        ? L('乗り合いのバスが横転した。腕を折った。窓から這い出したのを、あとになっても夢に見た。', 'The crowded bus rolled over. A broken arm. Crawling out through the window came back in dreams for years.')
        : L('道を渡っていて、曲がってきた車にはねられた。脚の骨を折り、杖をつく日がしばらく続いた。', 'Hit by a turning car while crossing the road. A broken leg, and weeks on a cane.'),
  'ill', true, L(`この国の交通事故の死者は10万人あたり約${roadDeaths(x.c, x.y).toFixed(1)}人。けがをする人はその何十倍もいる (WHO 2023 をもとにした推計)`, `Road deaths here: about ${roadDeaths(x.c, x.y).toFixed(1)} per 100,000. Many times more are injured (estimated from WHO 2023)`));
  chance(p, '交通事故で大けがをする', 'a serious road injury', roadP(p, x));
  bump(p, { health: -8, happy: -4 });
}

// 家の火事。米国は年に約36.7万件の住宅火災 (NFPA 2022、1億3,100万世帯で0.28%)。日本の住宅火災は年に約1.1万件 (消防白書、5,600万世帯で0.02%)
// ponytail: ほかの国は豊かな国0.15%・それ以外0.2% の推計。多くは小さな火で、家を失うのは5件に1件とした
const FIRE: Record<string, number> = { USA: 0.0028, JPN: 0.0002 };
const fireP = (_p: Person, x: Ctx) => FIRE[x.c.code] ?? (x.c.gdp >= 30000 ? 0.0015 : 0.002);
function fire(p: Person): void {
  const big = p.rng() < 0.2;
  if (big) lose(p, scaleOf(p) * 0.3);
  log(p, big
    ? L('夜中に家から火が出た。家族はみな外に逃げられたが、家の半分が焼けた。写真も、ほとんど残らなかった。', 'In the middle of the night, the house caught fire. Everyone got out, but half the house burned, and almost none of the photographs survived.')
    : L('台所から火が出た。すぐに消し止めたが、壁と天井が黒く焦げた。', 'A fire started in the kitchen. It was put out quickly, but the wall and ceiling were left black.'),
  big ? 'loss' : 'hard', big, FIRE[countryOf(p).code] === 0.0002 ? L('日本の住宅火災は年に約1.1万件 (消防白書)', 'Japan has about 11,000 residential fires a year (Fire Service White Paper)') : L('米国では1年に約36.7万件の住宅火災が起きる (NFPA 2022)', 'The US has about 367,000 home fires a year (NFPA 2022)'));
  bump(p, { happy: big ? -8 : -2 });
}

// 事件を目にする。一生に一度だけ。ponytail: 年0.4%×prop は推計
const witnessP = (p: Person, x: Ctx) => (p.age >= 12 ?0.004 * x.prop : 0);
function witness(p: Person, x: Ctx): void {
  log(p, x.v > 2 && p.rng() < 0.5
    ? L('道の向こうで銃声がして、人が倒れるのを見た。警察に話を聞かれたあとも、その音が耳に残った。', 'Across the street, a gunshot, and someone fell. Long after the police had taken a statement, the sound stayed.')
    : L('目の前でひったくりがあった。犯人の服の色を覚えていて、警察で話した。数週間後、捕まったと電話があった。', 'Saw a bag snatching right in front of them. Remembered the color of the thief\'s jacket and told the police. A few weeks later, a call: he had been caught.'), 'hard');
  bump(p, { happy: -2 });
}

// 人違いで疑われる。一生に一度だけ、ごくまれに。ponytail: 年0.03% は推計。冤罪の判決までは行かせない (家族の冤罪は justice.ts)
const accusedP = (p: Person) => (p.age >= 18 && p.age <= 70 ?0.0003 : 0);
function accused(p: Person, x: Ctx): void {
  log(p, L(`近くの店で起きた盗みの犯人に似ていると言われ、警察で何時間も話を聞かれた。${x.y >= 1995 ? '防犯カメラの映像で' : '居合わせた人の証言で'}、人違いだと分かった。職場では、しばらく噂になった。`,
    `Said to look like the person who had robbed a nearby shop, and questioned at the station for hours. ${x.y >= 1995 ? 'Security camera footage' : 'A witness'} showed it was someone else. At work, the rumors lasted a while.`), 'hard');
  bump(p, { happy: -5 });
}

// みかじめ料・恐喝。殺人率が10万人あたり8を超える国で、店や商売をしている人に。
// メキシコでは恐喝は詐欺・路上強盗と並んで多い犯罪の一つ (INEGI ENVIPE)。ponytail: 年1%×(殺人率/15) (上限6%) は推計
const extortP = (p: Person, x: Ctx) => ((p.selfEmployed || p.business) && p.working && x.c.homicide > 8 && !p.pending.length ? 0.01 * Math.min(3, x.c.homicide / 15) : 0);
function extort(p: Person, x: Ctx): void {
  const s = scaleOf(p);
  decide(p, {
    title: L('みかじめ料', 'Protection money'),
    text: L('店に男たちが来て、「毎月払えば、何も起きない」と言った。', 'Some men come into the shop: pay every month, and nothing will happen.'),
    stat: L(`恐喝は、殺人の多い国でよく起きる犯罪の一つ。この国の殺人は10万人あたり${x.c.homicide.toFixed(1)}件 (UNODC / INEGI ENVIPE)`, `Extortion is common where homicide is high. Here, ${x.c.homicide.toFixed(1)} homicides per 100,000 (UNODC / INEGI ENVIPE)`),
    options: [
      { label: L('払う', 'Pay'), hint: L('稼ぎが毎月減る', 'Less money every month'), apply: (q) => { const l = lose(q, s * 0.15); log(q, L(`毎月、決まった額を渡すようになった。一年で${l}になった。`, `Started handing over a fixed sum every month. Over a year it came to ${l}.`), 'work'); bump(q, { happy: -4 }); } },
      {
        label: L('警察に届ける', 'Go to the police'), hint: L('仕返しがあるかもしれない', 'There may be payback'),
        apply: (q) => {
          if (q.rng() < 0.35) { const l = lose(q, s * 0.25); log(q, L(`届けた翌週、店のガラスが割られ、品物が荒らされた。${l}の損だった。`, `The week after reporting it, the shop windows were smashed and the stock wrecked: ${l} lost.`), 'hard', true); bump(q, { happy: -6 }); } else { log(q, L('警察に届けた。男たちは、それきり来なくなった。', 'Reported it. The men never came back.'), 'work'); bump(q, { happy: 2 }); }
        },
      },
    ],
    auto: (q) => (q.rng() < 0.7 ? 0 : 1),
  });
}

// 誘拐。実際に多かった国と時代だけ。1年あたりの率は大人1人あたりの推計
// コロンビア 2000年に3,572件 (País Libre)、メキシコ 2013年に推計約13万件 (短時間の「急ぎの誘拐」を含む、INEGI ENVIPE 2014)、ナイジェリア 2010年代後半から身代金目的が急増、ハイチ 2021年から急増
// ponytail: 率は概数。豊かな家ほど狙われる
const KIDNAP: Record<string, [number, number, number]> = { COL: [1985, 2008, 6e-5], MEX: [2008, 2025, 1e-4], NGA: [2015, 2035, 1e-4], HTI: [2019, 2030, 2e-4] };
const kidnapP = (p: Person, x: Ctx) => {
  const k = KIDNAP[x.c.code];
  if (!k || x.y < k[0] || x.y > k[1] || p.age < 18) return 0;
  return k[2] * (isRich(p) ? 2.5 : isPoor(p) ? 0.6 : 1);
};
function kidnap(p: Person, x: Ctx): void {
  const lost = lose(p, Math.max(scaleOf(p) * 0.5, p.wealth * 0.2));
  log(p, x.c.code === 'MEX' && p.rng() < 0.6
    ? L(`タクシーで連れ回され、いくつもの ATM で金を下ろさせられた。${lost}を取られて、夜明けに町はずれで放り出された。`, `Driven around in a taxi and made to empty account after account at ATMs. ${lost} gone; dumped at the edge of town at dawn.`)
    : L(`仕事の帰りに車に押し込まれ、何日も目隠しをされたまま過ごした。家族が${lost}の身代金をかき集めて、解放された。`, `Forced into a car on the way home from work and kept blindfolded for days. The family scraped together a ransom of ${lost}, and then came release.`), 'hard', true,
  L('身代金目的の誘拐は、限られた国と時代に集中した (コロンビア2000年に3,572件、メキシコ2013年に推計約13万件)', 'Kidnapping for ransom clustered in particular countries and years (Colombia: 3,572 in 2000; Mexico: an estimated 130,000 in 2013)'));
  chance(p, '誘拐される', 'being kidnapped', kidnapP(p, x));
  bump(p, { happy: -14, health: -6, bond: 3 });
}

// ---- 毎年の抽選 -------------------------------------------------------------
// [印, 間の年数, 確率, 起きたこと]。上から順に引き、起きたらその年はそこで終わり
type Inc = [key: string, gap: number, prob: (p: Person, x: Ctx) => number, run: (p: Person, x: Ctx) => void];
const LIST: Inc[] = [
  ['kidnap', 99, kidnapP, kidnap],
  ['lure', 99, lureP, lure],
  ['extort', 10, extortP, extort],
  ['robbery', 8, robberyP, robbery],
  ['assault', 8, assaultP, (p) => assault(p)],
  ['road', 10, roadP, road],
  ['fire', 15, fireP, (p) => fire(p)],
  ['burglary', 12, burglaryP, burglary],
  ['phone', 8, (p, x) => phoneP(p, x)[1], (p, x) => phoneScam(p, x, true)],
  ['online', 8, onlineP, onlineScam],
  ['con', 15, conP, con],
  ['idtheft', 10, idP, (p) => idTheft(p)],
  ['theft', 6, theftP, theft],
  ['call', 12, (p, x) => phoneP(p, x)[0], (p, x) => phoneScam(p, x, false)],
  ['witness', 99, witnessP, witness],
  ['accused', 99, accusedP, accused],
];

export function context(p: Person): Ctx {
  const c = countryOf(p);
  const v = clamp(c.homicide / US_HOMICIDE, 0.03, 10);
  return { c, y: yearOf(p), v, prop: clamp(v ** 0.3, 0.3, 2.5), urban: p.city ? 1 : 0.6, old: p.age >= 65 };
}

export function crime(p: Person): void {
  if (p.age < 6) return;
  const x = context(p);
  for (const [key, gap, prob, run] of LIST) {
    if (!ok(p, key, gap) || p.rng() >= prob(p, x)) continue;
    p.recent[`inc:${key}`] = p.age;
    run(p, x);
    return;
  }
}

// テスト用: 種類ごとの確率
export const incidentChance = (p: Person, key: string): number => LIST.find(([k]) => k === key)![2](p, context(p));
