// 旅行の行き先。日常の出来事 (moments.json) の {spot} は国内の有名な場所、{abroad} はその国の人が実際によく行く外国。
// 外国の行き先は、各国の出国統計の上位 (UNWTO と各国の統計の2010年代の目安)。並べた順に選ばれやすい。
// 東ドイツ (1990年まで) は東側の国にしか行けなかった。分かれていたベトナムは、その側の場所だけ
import { L } from '../i18n';
import { yearOf, type Person } from './person';
import { sideOf } from './polity';
import { showRng } from './crisis';
import { pickWeighted } from './rng';

type Places = [string, string][];
const SPOTS: Record<string, Places> = {
  JPN: [['京都', 'Kyoto'], ['北海道', 'Hokkaido'], ['沖縄', 'Okinawa']],
  KOR: [['済州島', 'Jeju Island'], ['慶州', 'Gyeongju'], ['釜山の海雲台', "Busan's Haeundae beach"]],
  CHN: [['万里の長城', 'the Great Wall'], ['西安', "Xi'an"], ['桂林', 'Guilin']],
  USA: [['グランドキャニオン', 'the Grand Canyon'], ['イエローストーン', 'Yellowstone'], ['フロリダの海', 'the Florida beaches']],
  IND: [['タージ・マハル', 'the Taj Mahal'], ['ゴア', 'Goa'], ['ケーララの水郷', 'the Kerala backwaters']],
  DEU: [['バルト海の浜', 'the Baltic coast'], ['バイエルンのアルプス', 'the Bavarian Alps'], ['黒い森', 'the Black Forest']],
  FRA: [['コート・ダジュール', "the Côte d'Azur"], ['モン・サン＝ミシェル', 'Mont-Saint-Michel'], ['ブルターニュ', 'Brittany']],
  GBR: [['湖水地方', 'the Lake District'], ['コーンウォール', 'Cornwall'], ['スコットランドの高地', 'the Scottish Highlands']],
  ITA: [['ローマ', 'Rome'], ['フィレンツェ', 'Florence'], ['アマルフィ海岸', 'the Amalfi Coast']],
  ESP: [['マヨルカ島', 'Mallorca'], ['バルセロナ', 'Barcelona'], ['アンダルシア', 'Andalusia']],
  RUS: [['ソチ', 'Sochi'], ['サンクトペテルブルク', 'Saint Petersburg'], ['バイカル湖', 'Lake Baikal']],
  BRA: [['リオ・デ・ジャネイロ', 'Rio de Janeiro'], ['イグアスの滝', 'the Iguaçu Falls'], ['サルヴァドール', 'Salvador']],
  MEX: [['カンクン', 'Cancún'], ['オアハカ', 'Oaxaca'], ['チチェン・イッツァ', 'Chichén Itzá']],
  CAN: [['バンフ', 'Banff'], ['ナイアガラの滝', 'Niagara Falls'], ['ケベック・シティ', 'Quebec City']],
  AUS: [['ゴールドコースト', 'the Gold Coast'], ['ウルル', 'Uluru'], ['グレート・バリア・リーフ', 'the Great Barrier Reef']],
  IDN: [['バリ島', 'Bali'], ['ジョグジャカルタ', 'Yogyakarta'], ['ロンボク島', 'Lombok']],
  THA: [['プーケット', 'Phuket'], ['チェンマイ', 'Chiang Mai'], ['アユタヤ', 'Ayutthaya']],
  VNM: [['ハロン湾', 'Ha Long Bay'], ['ダナン', 'Da Nang'], ['ホイアン', 'Hoi An']],
  PHL: [['ボラカイ島', 'Boracay'], ['パラワン島', 'Palawan'], ['バギオ', 'Baguio']],
  TUR: [['カッパドキア', 'Cappadocia'], ['アンタルヤ', 'Antalya'], ['パムッカレ', 'Pamukkale']],
  EGY: [['ルクソール', 'Luxor'], ['シャルム・エル・シェイク', 'Sharm el-Sheikh'], ['アレクサンドリア', 'Alexandria']],
  ARG: [['バリローチェ', 'Bariloche'], ['イグアスの滝', 'the Iguazú Falls'], ['マル・デル・プラタ', 'Mar del Plata']],
  ZAF: [['クルーガー国立公園', 'Kruger National Park'], ['ケープタウン', 'Cape Town'], ['ガーデン・ルート', 'the Garden Route']],
  KEN: [['マサイマラ', 'the Maasai Mara'], ['モンバサの海', 'the beaches of Mombasa'], ['ナイバシャ湖', 'Lake Naivasha']],
};
const SIDE_SPOTS: Record<string, Places> = {
  'DEU:E': [['バルト海の浜', 'the Baltic coast'], ['ザクセンのスイス', 'Saxon Switzerland'], ['チューリンゲンの森', 'the Thuringian Forest']],
  'VNM:N': [['ハロン湾', 'Ha Long Bay'], ['サパ', 'Sa Pa']],
  'VNM:S': [['ダラット', 'Da Lat'], ['ヴンタウの海', 'the beach at Vung Tau']],
};
const ABROAD: Record<string, Places> = {
  JPN: [['韓国', 'South Korea'], ['アメリカ', 'the United States'], ['台湾', 'Taiwan'], ['中国', 'China']],
  KOR: [['日本', 'Japan'], ['ベトナム', 'Vietnam'], ['中国', 'China'], ['タイ', 'Thailand']],
  CHN: [['香港', 'Hong Kong'], ['マカオ', 'Macau'], ['タイ', 'Thailand'], ['日本', 'Japan']],
  USA: [['メキシコ', 'Mexico'], ['カナダ', 'Canada'], ['イギリス', 'Britain']],
  CAN: [['アメリカ', 'the United States'], ['メキシコ', 'Mexico']],
  MEX: [['アメリカ', 'the United States'], ['カナダ', 'Canada']],
  GBR: [['スペイン', 'Spain'], ['フランス', 'France'], ['イタリア', 'Italy']],
  DEU: [['イタリア', 'Italy'], ['スペイン', 'Spain'], ['オーストリア', 'Austria']],
  FRA: [['スペイン', 'Spain'], ['イタリア', 'Italy'], ['ポルトガル', 'Portugal']],
  ITA: [['スペイン', 'Spain'], ['フランス', 'France'], ['ギリシャ', 'Greece']],
  ESP: [['フランス', 'France'], ['ポルトガル', 'Portugal'], ['イタリア', 'Italy']],
  NLD: [['フランス', 'France'], ['スペイン', 'Spain'], ['ドイツ', 'Germany']],
  RUS: [['トルコ', 'Turkey'], ['エジプト', 'Egypt'], ['タイ', 'Thailand']],
  IND: [['アラブ首長国連邦', 'the United Arab Emirates'], ['タイ', 'Thailand'], ['シンガポール', 'Singapore']],
  BRA: [['アメリカ', 'the United States'], ['アルゼンチン', 'Argentina'], ['ポルトガル', 'Portugal']],
  ARG: [['ブラジル', 'Brazil'], ['チリ', 'Chile'], ['ウルグアイ', 'Uruguay']],
  AUS: [['インドネシアのバリ島', 'Bali, Indonesia'], ['ニュージーランド', 'New Zealand'], ['アメリカ', 'the United States']],
  NZL: [['オーストラリア', 'Australia'], ['フィジー', 'Fiji']],
  THA: [['日本', 'Japan'], ['韓国', 'South Korea'], ['ラオス', 'Laos']],
  PHL: [['日本', 'Japan'], ['香港', 'Hong Kong'], ['韓国', 'South Korea']],
  IDN: [['シンガポール', 'Singapore'], ['マレーシア', 'Malaysia'], ['サウジアラビア', 'Saudi Arabia']],
  MYS: [['タイ', 'Thailand'], ['シンガポール', 'Singapore'], ['インドネシア', 'Indonesia']],
  SWE: [['スペイン', 'Spain'], ['ギリシャ', 'Greece'], ['タイ', 'Thailand']],
  POL: [['ドイツ', 'Germany'], ['クロアチア', 'Croatia'], ['ギリシャ', 'Greece']],
};
// 東ドイツの人が行けたのは東側の国 (ハンガリーのバラトン湖・ブルガリアの黒海・チェコスロバキア)
const EAST_BLOC: Places = [['ハンガリーのバラトン湖', 'Lake Balaton in Hungary'], ['ブルガリアの黒海の浜', 'the Black Sea coast of Bulgaria'], ['チェコスロバキア', 'Czechoslovakia']];

const pickPlace = (p: Person, list: Places, salt: number) => { const [ja, en] = pickWeighted(showRng(p.seed, p.age, salt), list, (x) => list.length - list.indexOf(x)); return L(ja, en); };
const sideKey = (p: Person) => { const s = sideOf(p); return s && yearOf(p) < (p.country === 'DEU' ? 1990 : 1976) ? `${p.country}:${s}` : undefined; };

export const hasSpots = (code: string): boolean => !!SPOTS[code];
export function spot(p: Person): string {
  const k = sideKey(p);
  const list = (k && SIDE_SPOTS[k]) || SPOTS[p.country];
  return list ? pickPlace(p, list, 9301) : L('海辺の町', 'a seaside town');
}
export function abroad(p: Person): string {
  const list = sideKey(p) === 'DEU:E' ? EAST_BLOC : ABROAD[p.country];
  return list ? pickPlace(p, list, 9302) : L('外国', 'another country');
}
