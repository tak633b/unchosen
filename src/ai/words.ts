// AI なしの最後の言葉。mem の出来事の種類 (k) ごとに、語る人の目線の文を日英で用意しておく
import { callName, closest } from '../engine/bonds';
import type { Memory, Person, Role, Tie } from '../engine/person';
import { isEn } from '../i18n';

export interface LastWord { id: number; name: string; role: Role; text: string; ai: boolean; k?: string }

// {h} は語る人から見た主人公の呼び方。英語の {s}/{o}/{ps} は she/her/her (he/him/his)、{S} は文頭の She/He
type Line = [ja: string, en: string];
const LINES: Record<string, Line[]> = {
  wedding: [['式の日、{h}は緊張して、ずっと私の袖をつかんでいた。', 'On our wedding day, {h} was so nervous {s} held on to my sleeve the whole time.'], ['結婚した年は、二人とも何も持っていなかった。それで足りた。', 'The year we married, neither of us had anything. It was enough.']],
  dating: [['付き合い始めた頃、{h}は待ち合わせにいつも少し早く来ていた。', 'When we first started seeing each other, {h} always came a little early.'], ['最初に二人で歩いた道を、今でも覚えている。', 'I still remember the road we walked down that first time.']],
  birth: [['子どもが生まれた夜、{h}は眠らずに顔ばかり見ていた。', 'The night our child was born, {h} did not sleep. {S} just kept looking.'], ['赤ん坊を抱いた{h}の手が、少し震えていた。', "{h}'s hands shook a little, holding the baby."]],
  home_help: [['学校をやめて、家のことを手伝ってくれた。あの子に頼りすぎた。', '{h} left school to help me at home. I leaned on {o} too much.'], ['台所で並んで働いた年のことを、よく思い出す。', 'I think often of the years we worked side by side in the kitchen.']],
  left_home: [['家を出る朝、{h}は門の前でずっと手を振っていた。', 'The morning I left home, {h} stood at the gate waving until I was out of sight.'], ['家を出るとき、{h}は荷物に食べ物を詰めてくれた。', 'When I left home, {h} packed food into my bag.']],
  lost_touch: [['何年か、連絡が途切れていた時期がある。それでも、また会えた。', 'There were years we lost touch. We found each other again anyway.'], ['しばらく疎遠だった。理由はもう思い出せない。', 'We drifted apart for a while. I cannot remember why.']],
  quarrel: [['ひどいけんかをしたことがある。口をきかない日が続いた。', 'We had a bad fight once. We did not speak for days.'], ['言い合いになると、{h}は絶対に先に折れなかった。', 'In an argument, {h} never gave in first.']],
  makeup: [['けんかのあと、先に謝ってきたのは{h}だった。', 'After our fight, {h} was the one who came to apologize.'], ['仲直りした日、二人で黙ってお茶を飲んだ。', 'The day we made up, we sat and drank tea without saying much.']],
  reunion: [['何年も会っていなかったのに、道でばったり会った。{h}はすぐに私だと分かった。', 'Years apart, and then we ran into each other on the street. {h} knew me right away.'], ['再会した日は、昔の話で夜まで話し込んだ。', 'The day we met again, we talked about the old days until night.']],
  parent_care: [['年を取ってから、{h}が世話をしてくれた。手を煩わせてばかりだった。', 'When I got old, {h} took care of me. I was a lot of trouble.'], ['足が弱ってからは、{h}が毎日様子を見に来てくれた。', 'Once my legs got weak, {h} came by every day to check on me.']],
  sibling_move: [['引っ越しのとき、{h}が一日中荷物を運んでくれた。', 'When I moved, {h} carried boxes all day.'], ['引っ越しを手伝ってくれた日、{h}は文句ばかり言いながら最後までいた。', 'The day {h} helped me move, {s} complained the whole time and stayed until the end.']],
  sibling_kids: [['子どもを預かってくれと頼むと、{h}は断ったことがない。', 'Whenever I asked {h} to watch the kids, {s} never said no.'], ['うちの子たちは、{h}の家から帰りたがらなかった。', "My children never wanted to come home from {h}'s house."]],
  work_talk: [['仕事で行き詰まったとき、{h}は黙って最後まで聞いてくれた。', 'When I was stuck at work, {h} listened to the end without a word.'], ['仕事の相談に行くと、{h}はいつも先にご飯を出した。', 'When I went to {o} about work, {h} always fed me first.']],
  friend_wedding: [['私の結婚式に、{h}は朝いちばんに来てくれた。', '{h} was the first to arrive at my wedding.'], ['結婚式で、{h}は誰よりも大きな声で歌っていた。', 'At my wedding, {h} sang louder than anyone.']],
  mentor_word: [['{h}はよく残って勉強していた。「続けなさい」と言ったのを覚えている。', '{h} used to stay late to study. I remember telling {o} to keep going.'], ['教えた中で、{h}は質問の多い子だった。', 'Of everyone I taught, {h} asked the most questions.']],
  mentor_talk: [['大人になってからも、{h}は相談に来た。こちらが教わることもあった。', 'Even grown up, {h} came to talk things over. Sometimes I was the one who learned.'], ['久しぶりに会うと、{h}はもう私より先を見ていた。', 'When we met again after years, {h} was already looking further ahead than I was.']],
  rival_peace: [['ずっと張り合っていた。初めてゆっくり話した日、案外気が合うと分かった。', 'We competed for years. The first time we really talked, we got along fine.'], ['{h}がいたから、私も手を抜けなかった。', 'With {h} around, I could never slack off.']],
  rival_lose: [['若い頃は、いつも{h}の少し先を行っていた。それが{h}は悔しかったらしい。', 'When we were young I was always a step ahead of {h}. {S} hated that.'], ['{h}とは何でも競った。今思うと、子どもみたいだった。', '{h} and I competed over everything. Like children, looking back.']],
  visit_child: [['{h}が泊まりに来ると、家じゅうが騒がしくなった。', 'When {h} came to stay, the whole house got loud.'], ['帰る日の朝、{h}はいつも台所を片付けてから出ていった。', 'On the morning {s} left, {h} always cleaned the kitchen first.']],
  nursing: [['病気のとき、看病に通った。{h}は「大げさだ」と笑っていた。', 'When {h} was sick, I came to look after {o}. {S} laughed and said I was making a fuss.'], ['看病した夜、{h}は昔の話ばかりしていた。', 'The nights I sat with {o}, {h} only wanted to talk about the old days.']],
  escort: [['病院の帰り、{h}はいつも同じ店で甘いものを買った。', 'On the way back from the doctor, {h} always bought something sweet at the same shop.'], ['買い物に付き添うと、{h}は歩くのが遅いのを謝ってばかりいた。', 'When I went shopping with {o}, {h} kept apologizing for walking slowly.']],
  'babysit:child': [['子どもを預けに行くと、{h}は待ちかねたように孫を抱き上げた。', 'When I dropped the kids off, {h} picked them up as if {s} had been waiting all day.'], ['うちの子は、{h}のところで覚えた歌をずっと歌っていた。', "My child kept singing the songs learned at {h}'s house."]],
  babysit: [['小さい頃、よく{h}の家に預けられた。帰りたくないと泣いた。', "When I was small I was often left at {h}'s house. I cried because I did not want to go home."], ['{h}の家では、夜ふかししても叱られなかった。', "At {h}'s house, no one scolded me for staying up late."]],
  parent_story: [['小さい頃、{h}は寝る前に昔の話をせがんだ。同じ話を何度も。', 'When {h} was little, {s} begged for stories before bed. The same ones, again and again.'], ['昔の話をすると、{h}は目を丸くして聞いていた。', 'When I told {o} about the old days, {h} listened wide-eyed.']],
  parent_outing: [['二人で出かけた日、{h}は帰り道で眠ってしまった。', 'The day we went out together, {h} fell asleep on the way home.'], ['二人きりで出かけると、{h}はいつもよりよくしゃべった。', 'When it was just the two of us out, {h} talked more than usual.']],
  parent_meal: [['大人になっても、{h}はよく食事に来た。黙って食べて、黙って帰った。', 'Even grown up, {h} came by often to eat. Ate quietly, left quietly.'], ['{h}が来る日は、少し多めに作った。', 'On days {h} was coming, I cooked a little extra.']],
  parent_call: [['遠くに住んでからも、{h}は電話をくれた。声で元気かどうか分かった。', 'Living far away, {h} still called. I could tell from the voice how things were.'], ['電話の向こうで、{h}はいつも「大丈夫」と言っていた。', 'On the phone, {h} always said everything was fine.']],
  outing_spouse: [['たまに二人で出かけると、{h}は帰りにいつも遠回りをした。', 'When we went out, just us, {h} always took the long way home.'], ['二人で出かけた日の{h}は、いつもより若く見えた。', 'On our days out, {h} looked younger than usual.']],
  sick_visit: [['{h}が寝込んだとき見舞いに行くと、「来なくていいのに」と言いながら喜んでいた。', 'When {h} was ill and I came to visit, {s} said I did not need to, and was glad I did.'], ['見舞いに行った日、{h}は窓の外の話ばかりしていた。', 'The day I visited {o} sick in bed, {h} only wanted to talk about what was outside the window.']],
  school_start: [['学校に上がる日、{h}は新しい服を夜なべして縫ってくれた。', 'When I started school, {h} stayed up at night sewing me new clothes.'], ['初めて学校へ行く朝、{h}は途中までついてきた。', 'The first morning of school, {h} walked part of the way with me.']],
  graduation: [['卒業式に、{h}はいちばんいい服で来た。', '{h} came to my graduation in {ps} best clothes.'], ['卒業の日、{h}は泣かないと言って、泣いた。', 'On graduation day, {h} said {s} would not cry, and cried.']],
  first_pay: [['初めての給料で食事をごちそうしたら、{h}はほとんど食べずに私を見ていた。', 'I took {h} out with my first paycheck. {S} barely ate, just watched me.'], ['初めての給料の日のことを、{h}は何年も人に話していた。', '{h} told people about my first paycheck for years.']],
  wedding_child: [['結婚式の日、{h}はいちばん前の席にいた。', 'At my wedding, {h} sat in the front row.'], ['結婚式で、{h}は一度も座らずに客の世話をしていた。', '{h} never sat down once at my wedding, looking after the guests.']],
  grandbirth: [['孫の顔を見せに行くと、{h}はなかなか抱いた手を離さなかった。', 'When I brought the baby over, {h} would not let go.'], ['子どもが生まれたと伝えたら、{h}は電話口で黙ってしまった。', 'When I called to say the baby was born, {h} went quiet on the line.']],
  moment: [['{h}とは、何でもない日をたくさん一緒に過ごした。', '{h} and I spent a lot of ordinary days together.'], ['若い頃は、毎日のように{h}と一緒にいた。', 'When we were young, {h} and I were together almost every day.']],
  lend_back: [['お金を借りたことがある。少しずつ返すのを、{h}は黙って待ってくれた。', '{h} once lent me money. {S} waited without a word while I paid it back bit by bit.'], ['困っていたとき、{h}はお金を貸してくれた。返し終えた日に二人で笑った。', 'When I was in trouble, {h} lent me money. We laughed the day I paid the last of it.']],
  lend_lost: [['{h}に借りたお金を、私は返せなかった。{h}はそのことを一度も口にしなかった。', 'I never paid {h} back. {S} never once brought it up.'], ['借りたお金のことは、今も申し訳なく思っている。', 'I still feel bad about the money I borrowed from {o}.']],
  lend_refused: [['お金を貸してと頼んで、断られたことがある。今思えば、{h}も苦しかったのだ。', 'I asked {h} for money once and {s} said no. Looking back, {s} was struggling too.'], ['あの時断られたのは、正しかったと思う。', '{h} said no to me once, about money. {S} was right.']],
};
// AI に渡す、出来事の種類の意味 (語る人から見て)
const K_DESC: Record<string, Line> = {
  wedding: ['主人公と結婚した', 'married the main character'], dating: ['主人公と付き合い始めた', 'started seeing the main character'],
  birth: ['二人の子が生まれた (子にとっては自分の誕生)', 'their child was born (for the child, their own birth)'], home_help: ['主人公が学校をやめて家を手伝った', 'the main character left school to help at home'],
  left_home: ['この人が家を出た', 'this person left home'], lost_touch: ['連絡が途絶えた', 'they lost touch'], quarrel: ['けんかをした', 'they fought'], makeup: ['仲直りした', 'they made up'],
  reunion: ['何年ぶりかに再会した', 'they met again after years'], parent_care: ['年老いたこの人を主人公が世話した', 'the main character cared for this person in old age'],
  sibling_move: ['主人公がこの人の引っ越しを手伝った', "the main character helped this person move"], sibling_kids: ['主人公がこの人の子を預かった', "the main character looked after this person's children"],
  work_talk: ['この人が仕事のことで主人公に相談した', 'this person came to the main character about work'], friend_wedding: ['主人公がこの人の結婚式に出た', "the main character came to this person's wedding"],
  mentor_word: ['この人が若い主人公を励ました', 'this person encouraged the young main character'], mentor_talk: ['大人の主人公がこの人に相談に来た', 'the grown main character came to this person for advice'],
  rival_peace: ['張り合ってきた二人が初めてゆっくり話した', 'the two rivals finally talked'], rival_lose: ['この人が主人公の先を越した', 'this person got ahead of the main character'],
  visit_child: ['主人公がこの人の家に泊まりに来た', "the main character stayed at this person's home"], nursing: ['この人が病気の主人公を看病した', 'this person nursed the main character through an illness'],
  escort: ['この人が年老いた主人公の買い物や通院に付き添った', 'this person went with the aging main character to the shops and the doctor'],
  babysit: ['主人公が孫を預かった', 'the main character looked after a grandchild'], parent_story: ['この人が幼い主人公に昔話をした', 'this person told the young main character stories'],
  parent_outing: ['この人と幼い主人公が出かけた', 'this person took the young main character out'], parent_meal: ['大人の主人公がこの人と食事をした', 'the grown main character had a meal with this person'],
  parent_call: ['遠くに住む主人公がこの人に電話した', 'the main character called this person from far away'], outing_spouse: ['二人で出かけた', 'they went out together'],
  sick_visit: ['この人が病気の主人公を見舞った', 'this person visited the main character during an illness'], school_start: ['この人が学校に上がった', 'this person started school'],
  graduation: ['主人公がこの人の卒業式に出た', "the main character came to this person's graduation"], first_pay: ['この人が初めての給料で家族にごちそうした', 'this person treated the family with a first paycheck'],
  wedding_child: ['主人公がこの人の結婚式に出た', "the main character came to this person's wedding"], grandbirth: ['孫が生まれた', 'a grandchild was born'],
  moment: ['二人で過ごした日常の一場面', 'an ordinary day together'], lend_back: ['主人公がこの人にお金を貸し、返してもらった', 'the main character lent this person money and was paid back'],
  lend_lost: ['主人公がこの人に貸したお金は返らなかった', 'this person never paid back money the main character lent'], lend_refused: ['この人の借金の頼みを主人公が断った', 'the main character refused to lend this person money'],
};
export const kindNote = (k?: string) => (k && K_DESC[k] ? (isEn ? K_DESC[k][1] : K_DESC[k][0]) : '');

// 語れる出来事が無い人の言葉。続柄から確かに言えることだけにする
const PLAIN: Partial<Record<Role, Line[]>> = {
  mother: [['{h}が生まれた日のことは、全部覚えている。', 'I remember every part of the day {h} was born.'], ['{h}の泣き声が、まだ耳に残っている。', "I can still hear {h}'s crying."]],
  father: [['{h}が生まれた日のことは、全部覚えている。', 'I remember every part of the day {h} was born.'], ['初めて{h}を抱いた日の重さを、手が覚えている。', 'My hands still remember how heavy {h} was the first time I held {o}.']],
  sibling: [['{h}とは、同じ家で育った。', '{h} and I grew up in the same house.'], ['子どもの頃の{h}の顔なら、今でもすぐ思い出せる。', "I can still see {h}'s face as a child."]],
  spouse: [['{h}とは長く一緒にいた。それで十分だった。', '{h} and I were together a long time. That was enough.'], ['毎朝、{h}の分のお茶も淹れてしまう。', 'Every morning I still make tea for {h} too.']],
  grandchild: [['{h}のことは、あまりよく知らない。もっと話を聞いておけばよかった。', 'I did not really know {h}. I wish I had asked more.'], ['{h}の家の匂いを覚えている。', "I remember the smell of {h}'s house."]],
};
const PLAIN_ANY: Line[] = [['{h}のことを、うまく言葉にできない。', 'I cannot find the words for {h}.'], ['{h}がいないのが、まだ信じられない。', 'I still cannot believe {h} is gone.']];
const pickLine = (lines: Line[], p: Person, t: Tie, h: string) => {
  const [ja, en] = lines[((p.seed >>> 0) + (t.id ?? 0)) % lines.length];
  return fill(isEn ? en : ja, p, h);
};

const OWN_BIRTH = new Set(['birth', 'sibling_born', 'grandbirth']);
// 二人のあいだにしか無い出来事ほど先に選ぶ。多くの人生にある節目は次、毎年のように起こる出来事は最後
const MILESTONE = new Set(['wedding', 'wedding_child', 'grandbirth', 'left_home', 'school_start', 'graduation']);
const COMMON = new Set(['moment', 'parent_meal', 'parent_call', 'parent_outing', 'outing_spouse', 'quarrel', 'lost_touch']);
const tier = (k: string) => (COMMON.has(k) ? 2 : MILESTONE.has(k) ? 1 : 0);

// 語る人から見た主人公の呼び方
function heroRef(p: Person, t: Tie): string {
  const f = p.sex === 'F';
  if (p.gender === 'X') return p.given; // 性別に「その他」を選んだ人は、子も孫もきょうだいも名前で呼ぶ
  if (t.role === 'child') return isEn ? (f ? 'Mom' : 'Dad') : f ? '母さん' : '父さん';
  if (t.role === 'grandchild') return isEn ? (f ? 'Grandma' : 'Grandpa') : f ? 'おばあちゃん' : 'おじいちゃん';
  if (t.role === 'sibling' && !isEn && p.age > t.age) return f ? '姉さん' : '兄さん';
  return p.given;
}

const fill = (s: string, p: Person, h: string) => {
  // 性別に「その他」を選んだ人は名前で呼ぶ (they にすると動詞の形が合わない文が出る)
  const [sj, o, ps] = p.gender === 'X' ? [p.given, p.given, `${p.given}'s`] : p.sex === 'F' ? ['she', 'her', 'her'] : ['he', 'him', 'his'];
  return s.replace(/\{h\}/g, h).replace(/\{S\}/g, sj[0].toUpperCase() + sj.slice(1)).replace(/\{s\}/g, sj).replace(/\{o\}/g, o).replace(/\{ps\}/g, ps);
};

// この人が語れる出来事。自分が生まれた時の話は覚えていない (配偶者にとっての子の誕生は別)
const linesOf = (k: string, role: Role) => LINES[`${k}:${role}`] ?? LINES[k];
const usable = (t: Tie, m: Memory) => !!m.k && !!linesOf(m.k, t.role) && !(OWN_BIRTH.has(m.k) && t.role !== 'spouse' && m.age <= t.since);

export function lastWords(p: Person): LastWord[] {
  const used = new Set<string>();
  return closest(p, 3).map((t) => {
    const who = callName(t, t.role);
    const mems = (t.mem ?? []).filter((m) => usable(t, m) && !used.has(m.k!));
    const m = mems.sort((a, b) => tier(a.k!) - tier(b.k!) || b.d - a.d || b.age - a.age)[0];
    const old = (t.mem ?? []).filter((x) => !x.k && x.age > t.since).sort((a, b) => b.d - a.d || b.age - a.age)[0];
    const base = { id: t.id!, name: t.name ?? who, role: t.role, ai: false };
    if (m) {
      used.add(m.k!);
      return { ...base, k: m.k, text: pickLine(linesOf(m.k!, t.role), p, t, heroRef(p, t)) };
    }
    // k の無い古いセーブの mem
    if (old) return { ...base, text: isEn ? `${who} talked about the year ${p.given} was ${old.age}. ${old.text}` : `${who}は、${p.given}が${old.age}歳だった年のことを話した。${old.text}` };
    return { ...base, text: pickLine(PLAIN[t.role] ?? PLAIN_ANY, p, t, heroRef(p, t)) };
  });
}
