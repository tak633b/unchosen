// 追悼館に載る文の、ごく基本の言葉の網 (広告を載せるサイトの方針のため)。依存なし。
// ponytail: 短い一覧の照合だけ。すり抜けは管理者の非表示で拾う。足りなくなったら外部のモデレーション API へ
// Random Isekai の網を写したもの。名前の表に実在の名 (オランダの Dick・ジョージアの Nazi) があるので、この2語は外した。
// 「死ね」も外した (死を扱うゲームなので「死ねば」「死ねなかった」が物語に出る)。代わりに「死ねよ」を入れる
//
// 英語は単語ごと (assassin の ass のような誤検出を避ける)。日本語は空白と記号を除き、カタカナをひらがなにしてから部分一致
const EN = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'pussy', 'cock', 'porn', 'porno',
  'rape', 'rapist', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kys', 'hitler',
];
const JA = [
  'ちんこ', 'ちんぽ', 'まんこ', 'せっくす', 'えっち', 'おなにー', 'れいぷ', '強姦', '売春', '援交', 'ぱぱかつ',
  'きちがい', '気違い', '基地外', 'がいじ', '池沼', '支那人', 'しなじん', '死ねよ', '氏ね', 'しねよ', '殺すぞ', 'ころすぞ',
];
// 宣伝・誘導の網: 本文に URL や連絡先は要らない
const SPAM = /https?:|www\.|discord\.gg|line\s*id|@[a-z0-9_]{3,}/i;

const EN_RE = new RegExp(`\\b(?:${EN.join('|')})s?\\b`, 'i');
const kanaToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const squash = (s) => kanaToHira(s.normalize('NFKC').toLowerCase()).replace(/[\s\p{P}\p{S}ー]/gu, '');
const JA_SQ = JA.map((w) => squash(w));

/** 載せられない文なら true */
export function blocked(text) {
  if (typeof text !== 'string' || !text) return false;
  const n = text.normalize('NFKC');
  if (EN_RE.test(n) || SPAM.test(n)) return true;
  const sq = squash(n);
  return JA_SQ.some((w) => sq.includes(w));
}
