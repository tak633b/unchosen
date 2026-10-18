// その年にその土地を治めていた国の名前。国の一覧 (countries.json) はいまの国境と国名なので、
// 1900年に「インド」で生まれた人の出生の記録は「イギリス領インド」、1925年の「韓国」は「日本統治下の朝鮮」になる。
// 国の名前が変わった年 (独立・併合・占領) には、その国にいる人の人生に一行が残る (history.ts)。
// 区切りは年単位 (その年の途中で変わっても、その年から新しい名前)。
// ponytail: 国の中で治める国の違った地域 (西ウクライナはオーストリア領・ポーランド領など) は、国の大部分に合わせている
import { byCode } from './countries';
import { L } from '../i18n';

// [この年から, 日本語の名前, 英語の名前, その年に起きたこと (日本語), (英語)]。名前が null なら、いまの国名
type Seg = [number, string | null, string | null, string?, string?];
const T: Record<string, Seg[]> = {};
const add = (codes: string[], segs: Seg[]) => { for (const c of codes) T[c] = segs; };

// ---- 植民地をまとめて書く -----------------------------------------------------------------
const indep = (y: number, ja: string, en: string): Seg => [y, null, null, `${ja}が独立した。`, `${en} became independent.`];
const colony = (ja: string, en: string, y: number, nowJa: string, nowEn: string): Seg[] => [[0, ja, en], indep(y, nowJa, nowEn)];
const AOF: [string, string] = ['フランス領西アフリカ', 'French West Africa'];
const AEF: [string, string] = ['フランス領赤道アフリカ', 'French Equatorial Africa'];
const OTTOMAN: [string, string] = ['オスマン帝国', 'the Ottoman Empire'];
const RUSSIA: [string, string] = ['ロシア帝国', 'the Russian Empire'];
const AH: [string, string] = ['オーストリア＝ハンガリー', 'Austria-Hungary'];
const YUG: [string, string] = ['ユーゴスラビア', 'Yugoslavia'];
const USSR: [string, string] = ['ソビエト連邦', 'the Soviet Union'];
const BRITISH_INDIA: [string, string] = ['イギリス領インド', 'British India'];
const INDOCHINA: [string, string] = ['フランス領インドシナ', 'French Indochina'];

// ヨーロッパ
add(['DEU'], [[0, 'ドイツ帝国', 'the German Empire'], [1918, null, null, '11月、皇帝が退位し、ドイツは共和国になった。', 'In November the Kaiser abdicated and Germany became a republic.'],
  [1945, '連合国占領下のドイツ', 'Allied-occupied Germany', '5月、ドイツは降伏し、四つの占領地区に分けられた。', 'In May Germany surrendered and was divided into four occupation zones.'],
  [1949, null, null, '西と東に、二つのドイツの国が生まれた。', 'Two German states were founded, one in the west and one in the east.']]);
add(['AUT'], [[0, ...AH], [1918, null, null, '帝国が崩れ、オーストリアは共和国になった。', 'The empire collapsed, and Austria became a republic.'],
  [1938, 'ドイツに併合されたオーストリア', 'Austria annexed to Germany', '3月、ドイツ軍が国境を越え、オーストリアはドイツに併合された。', 'In March German troops crossed the border, and Austria was annexed to Germany.'],
  [1945, null, null, '戦争が終わり、オーストリアは再び一つの国になった (連合国の占領は1955年まで続いた)。', 'The war ended, and Austria became a country of its own again (Allied occupation lasted until 1955).']]);
add(['HUN'], [[0, ...AH], [1918, null, null, '帝国が崩れ、ハンガリーは独立した国になった。', 'The empire collapsed, and Hungary became an independent state.']]);
add(['CZE'], [[0, ...AH], [1918, 'チェコスロバキア', 'Czechoslovakia', '10月、チェコスロバキアの独立が宣言された。', 'In October Czechoslovakia declared its independence.'],
  [1939, 'ドイツ占領下のベーメン・メーレン保護領', 'the German-occupied Protectorate of Bohemia and Moravia'],
  [1945, 'チェコスロバキア', 'Czechoslovakia', '5月、ドイツの占領が終わった。', 'In May the German occupation came to an end.'],
  [1993, null, null, 'チェコスロバキアが二つに分かれ、チェコが一つの国になった。', 'Czechoslovakia split in two, and the Czech Republic became a state of its own.']]);
add(['SVK'], [[0, ...AH], [1918, 'チェコスロバキア', 'Czechoslovakia', '10月、チェコスロバキアの独立が宣言された。', 'In October Czechoslovakia declared its independence.'],
  [1939, 'スロバキア国 (ドイツの保護国)', 'the Slovak State (a German client state)', '3月、スロバキアはドイツの保護のもとで「独立」した。', 'In March Slovakia became "independent" under German protection.'],
  [1945, 'チェコスロバキア', 'Czechoslovakia', '戦争が終わり、チェコスロバキアに戻った。', 'The war ended, and Czechoslovakia was restored.'],
  [1993, null, null, 'チェコスロバキアが二つに分かれ、スロバキアが一つの国になった。', 'Czechoslovakia split in two, and Slovakia became a state of its own.']]);
// ユーゴスラビアの中の時代 (1918年の王国・1941年の枢軸による分割・1945年の作り直し)
const yug = (occJa: string, occEn: string): Seg[] => [
  [1918, ...YUG, '戦争が終わり、南スラブの新しい王国 (のちのユーゴスラビア) に組み入れられた。', 'The war ended, and the land became part of the new South Slav kingdom (later Yugoslavia).'],
  [1941, occJa, occEn],
  [1945, ...YUG, '戦争が終わり、ユーゴスラビアが作り直された。', 'The war ended, and Yugoslavia was rebuilt.']];
const SCG: Seg = [2003, 'セルビア・モンテネグロ', 'Serbia and Montenegro', 'ユーゴスラビアの名がなくなり、セルビア・モンテネグロになった。', 'The name Yugoslavia was dropped, and the country became Serbia and Montenegro.'];
const NDH: [string, string] = ['クロアチア独立国 (枢軸の傀儡国家)', 'the Independent State of Croatia (an Axis puppet)'];
add(['HRV'], [[0, ...AH], ...yug(...NDH), [1991, null, null, 'クロアチアがユーゴスラビアからの独立を宣言した。', 'Croatia declared independence from Yugoslavia.']]);
add(['SVN'], [[0, ...AH], ...yug('ドイツとイタリアの占領下のスロベニア', 'German- and Italian-occupied Slovenia'), [1991, null, null, 'スロベニアがユーゴスラビアから独立した。', 'Slovenia became independent from Yugoslavia.']]);
add(['BIH'], [[0, ...AH], ...yug(...NDH), [1992, null, null, 'ボスニア・ヘルツェゴビナが独立を宣言した。', 'Bosnia and Herzegovina declared independence.']]);
add(['SRB'], [[0, null, null], ...yug('ドイツ占領下のセルビア', 'German-occupied Serbia'), SCG, [2006, null, null, 'モンテネグロが離れ、セルビアは一つの国になった。', 'Montenegro left, and Serbia became a state of its own.']]);
add(['MNE'], [[0, null, null], ...yug('イタリア占領下のモンテネグロ', 'Italian-occupied Montenegro'), SCG, [2006, null, null, '国民投票で、モンテネグロが独立した。', 'In a referendum, Montenegro voted for independence.']]);
add(['MKD'], [[0, ...OTTOMAN], [1913, 'セルビア王国', 'the Kingdom of Serbia', 'バルカン戦争のあと、この土地はセルビアの領土になった。', 'After the Balkan Wars, the land became part of Serbia.'],
  ...yug('ブルガリア占領下のマケドニア', 'Bulgarian-occupied Macedonia'),
  [1991, 'マケドニア', 'Macedonia', 'マケドニアがユーゴスラビアから独立した。', 'Macedonia became independent from Yugoslavia.'],
  [2019, null, null, '国の名が北マケドニアになった。', 'The country was renamed North Macedonia.']]);
add(['ALB'], [[0, ...OTTOMAN], [1912, null, null, '11月、アルバニアがオスマン帝国からの独立を宣言した。', 'In November Albania declared independence from the Ottoman Empire.'],
  [1939, 'イタリアに併合されたアルバニア', 'Albania annexed to Italy'],
  [1944, null, null, '占領が終わった。', 'The occupation came to an end.']]);
add(['BGR'], [[0, 'ブルガリア公国', 'the Principality of Bulgaria'], [1908, null, null, 'ブルガリアがオスマン帝国からの完全な独立を宣言した。', 'Bulgaria declared full independence from the Ottoman Empire.']]);
add(['POL'], [[0, 'ロシア帝国領ポーランド', 'Russian Poland'], [1918, null, null, '11月、ポーランドが123年ぶりに独立した国として戻ってきた。', 'In November Poland returned as an independent state after 123 years.'],
  [1939, 'ドイツとソ連の占領下のポーランド', 'German- and Soviet-occupied Poland'],
  [1945, null, null, '戦争が終わった。国境は西へ動かされ、ソ連の勢力のもとの国になった。', 'The war ended. The borders were moved west, and the country fell under Soviet control.']]);
const baltic = (nowJa: string, nowEn: string, back: number): Seg[] => [[0, ...RUSSIA], [1918, null, null, `${nowJa}が独立を宣言した。`, `${nowEn} declared independence.`],
  [1940, ...USSR, '6月、ソ連軍が入り、ソ連に組み入れられた。', 'In June the Soviet army moved in, and the country was absorbed into the Soviet Union.'],
  [1941, `ドイツ占領下の${nowJa}`, `German-occupied ${nowEn}`, '6月、ドイツ軍が攻めこんだ。', 'In June the German army invaded.'],
  [1944, ...USSR, 'ソ連軍が戻ってきた。', 'The Soviet army returned.'],
  [back, null, null, `${nowJa}がソ連から独立した。`, `${nowEn} regained its independence from the Soviet Union.`]];
add(['LTU'], baltic('リトアニア', 'Lithuania', 1990));
add(['LVA'], baltic('ラトビア', 'Latvia', 1991));
add(['EST'], baltic('エストニア', 'Estonia', 1991));
add(['FIN'], [[0, 'フィンランド大公国 (ロシア帝国)', 'the Grand Duchy of Finland (Russian Empire)'], [1917, null, null, '12月、フィンランドが独立を宣言した。', 'In December Finland declared independence.']]);
const soviet = (nowJa: string, nowEn: string, ussrFrom: number, occ?: [number, number]): Seg[] => [[0, ...RUSSIA],
  // ウクライナとベラルーシの内戦は目録 (rus-civil-war) のニュースが書いている
  occ ? [1918, `内戦のさなかの${nowJa}`, `${nowEn} in civil war`] : [1918, `内戦のさなかの${nowJa}`, `${nowEn} in civil war`, '革命のあと、町の上の旗が何度も変わった。', 'After the revolution, the flags over the town changed again and again.'],
  [ussrFrom, ...USSR, 'ソ連軍が入り、ソビエトの共和国になった。', 'The Red Army arrived, and the land became a Soviet republic.'],
  ...(occ ? [[occ[0], `ドイツ占領下の${nowJa}`, `German-occupied ${nowEn}`] as Seg, [occ[1], ...USSR, 'ソ連軍が戻ってきた。', 'The Soviet army returned.'] as Seg] : []),
  [1991, null, null, `${nowJa}がソ連から独立した。`, `${nowEn} became independent from the Soviet Union.`]];
add(['UKR'], soviet('ウクライナ', 'Ukraine', 1920, [1941, 1944]));
add(['BLR'], soviet('ベラルーシ', 'Belarus', 1920, [1941, 1944]));
add(['GEO'], soviet('ジョージア', 'Georgia', 1921));
add(['ARM'], soviet('アルメニア', 'Armenia', 1920));
add(['AZE'], soviet('アゼルバイジャン', 'Azerbaijan', 1920));
for (const [c, ja, en] of [['KAZ', 'カザフスタン', 'Kazakhstan'], ['UZB', 'ウズベキスタン', 'Uzbekistan'], ['TKM', 'トルクメニスタン', 'Turkmenistan'], ['KGZ', 'キルギス', 'Kyrgyzstan'], ['TJK', 'タジキスタン', 'Tajikistan']]) add([c], soviet(ja, en, 1920));
add(['MDA'], [[0, ...RUSSIA], [1918, 'ルーマニア', 'Romania', 'ベッサラビアはルーマニアに組み入れられた。', 'Bessarabia was joined to Romania.'],
  [1940, ...USSR, '6月、ソ連軍が入り、ソ連に組み入れられた。', 'In June the Soviet army moved in, and the land was absorbed into the Soviet Union.'],
  [1941, 'ルーマニア', 'Romania', 'ルーマニア軍とドイツ軍が攻めこんだ。', 'Romanian and German armies invaded.'], [1944, ...USSR, 'ソ連軍が戻ってきた。', 'The Soviet army returned.'],
  [1991, null, null, 'モルドバがソ連から独立した。', 'Moldova became independent from the Soviet Union.']]);
add(['RUS'], [[0, ...RUSSIA], [1917, '革命と内戦のさなかのロシア', 'Russia in revolution and civil war'],
  [1922, ...USSR, 'ソビエト連邦が生まれた。', 'The Soviet Union was founded.'], [1992, null, null, 'ソ連がなくなり、ロシア連邦になった。', 'The Soviet Union was dissolved, and Russia became the Russian Federation.']]);
add(['IRL'], [[0, 'イギリス (グレートブリテン及びアイルランド連合王国)', 'the United Kingdom of Great Britain and Ireland'],
  [1922, 'アイルランド自由国', 'the Irish Free State', 'アイルランド自由国が生まれ、イギリスの支配を離れた。', 'The Irish Free State was founded, leaving British rule.'],
  [1937, null, null, '新しい憲法で、国の名はアイルランドになった。', 'A new constitution renamed the country Ireland.']]);
// 1940年の占領の始まりは、目録の出来事のニュースが書いている
const occupied = (from: number, to: number, ja: string, en: string): Seg[] => [from === 1914 ? [from, `ドイツ占領下の${ja}`, `German-occupied ${en}`, 'ドイツ軍が攻めこみ、国は占領された。', 'The German army invaded, and the country was occupied.'] : [from, `ドイツ占領下の${ja}`, `German-occupied ${en}`], [to, null, null, '占領が終わった。', 'The occupation came to an end.']];
add(['NOR'], [[0, 'スウェーデン＝ノルウェー', 'Sweden-Norway'], [1905, null, null, 'ノルウェーがスウェーデンとの連合を解き、独立した。', 'Norway dissolved its union with Sweden and became independent.'], ...occupied(1940, 1945, 'ノルウェー', 'Norway')]);
add(['DNK'], [[0, null, null], ...occupied(1940, 1945, 'デンマーク', 'Denmark')]);
add(['NLD'], [[0, null, null], ...occupied(1940, 1945, 'オランダ', 'the Netherlands')]);
add(['BEL'], [[0, null, null], ...occupied(1914, 1918, 'ベルギー', 'Belgium'), ...occupied(1940, 1944, 'ベルギー', 'Belgium')]);
add(['LUX'], [[0, null, null], ...occupied(1914, 1918, 'ルクセンブルク', 'Luxembourg'), ...occupied(1940, 1944, 'ルクセンブルク', 'Luxembourg')]);
add(['FRA'], [[0, null, null], [1940, 'ドイツ占領下とヴィシー政権のフランス', 'German-occupied and Vichy France', '6月、フランスは降伏し、国の北半分がドイツに占領された。', 'In June France surrendered, and the northern half of the country was occupied by Germany.'],
  [1944, null, null, '8月、パリが解放された。', 'In August Paris was liberated.']]);
add(['MLT'], colony('イギリス領マルタ', 'British Malta', 1964, 'マルタ', 'Malta'));
add(['CYP'], colony('イギリス統治下のキプロス', 'British-ruled Cyprus', 1960, 'キプロス', 'Cyprus'));
add(['TUR'], [[0, ...OTTOMAN], [1923, null, null, '10月、トルコ共和国の成立が宣言された。', 'In October the Republic of Turkey was proclaimed.']]);

// 中東・北アフリカ
const mandate = (ja: string, en: string, y: number, nowJa: string, nowEn: string, from = 1920): Seg[] => [[0, ...OTTOMAN],
  [from, ja, en, 'オスマン帝国が負け、この土地は委任統治になった。', 'The Ottoman Empire had lost the war, and the land was placed under a mandate.'], indep(y, nowJa, nowEn)];
add(['SYR'], mandate('フランス委任統治領シリア', 'French Mandate Syria', 1946, 'シリア', 'Syria'));
add(['LBN'], mandate('フランス委任統治領レバノン', 'French Mandate Lebanon', 1943, 'レバノン', 'Lebanon'));
add(['IRQ'], mandate('イギリス委任統治領メソポタミア', 'British Mandate Mesopotamia', 1932, 'イラク', 'Iraq'));
add(['JOR'], mandate('トランスヨルダン (イギリス委任統治)', 'Transjordan (British mandate)', 1946, 'ヨルダン', 'Jordan', 1921));
add(['ISR'], [...mandate('イギリス委任統治領パレスチナ', 'Mandatory Palestine', 1948, 'イスラエル', 'Israel').slice(0, 2), [1948, null, null]]);
add(['PSE'], [...mandate('イギリス委任統治領パレスチナ', 'Mandatory Palestine', 1948, '', '').slice(0, 2),
  [1948, 'ヨルダンとエジプトの統治下のパレスチナ', 'Jordanian- and Egyptian-held Palestine', '委任統治が終わり、戦争になった。西岸はヨルダン、ガザはエジプトの手に移った。', 'The mandate ended in war. The West Bank passed to Jordan and Gaza to Egypt.'],
  [1967, 'イスラエル占領下のパレスチナ', 'Israeli-occupied Palestine']]);
add(['SAU'], [[0, 'ネジドとヒジャーズ', 'Nejd and Hejaz'], [1932, null, null, 'サウジアラビア王国が生まれた。', 'The Kingdom of Saudi Arabia was proclaimed.']]);
add(['KWT'], colony('イギリス保護下のクウェート', 'British-protected Kuwait', 1961, 'クウェート', 'Kuwait'));
add(['BHR'], colony('イギリス保護下のバーレーン', 'British-protected Bahrain', 1971, 'バーレーン', 'Bahrain'));
add(['QAT'], colony('イギリス保護下のカタール', 'British-protected Qatar', 1971, 'カタール', 'Qatar'));
add(['ARE'], [[0, '休戦海岸 (イギリス保護領)', 'the Trucial States (British protectorate)'], [1971, null, null, 'アラブ首長国連邦が生まれた。', 'The United Arab Emirates was founded.']]);
add(['IRN'], [[0, 'ペルシア', 'Persia'], [1935, null, null, '国の名が、外国でもイランと呼ばれることになった。', 'The country asked the world to call it Iran instead of Persia.']]);
add(['EGY'], [[0, 'イギリス占領下のエジプト', 'British-occupied Egypt'], [1922, null, null, '2月、エジプトが王国として独立した (イギリス軍は残った)。', 'In February Egypt became an independent kingdom (British troops stayed).']]);
add(['AFG'], [[0, 'イギリス保護下のアフガニスタン', 'British-protected Afghanistan'], [1919, null, null, 'アフガニスタンがイギリスから外交の独立を取り戻した。', 'Afghanistan won back control of its foreign affairs from Britain.']]);
add(['DZA'], colony('フランス領アルジェリア', 'French Algeria', 1962, 'アルジェリア', 'Algeria'));
add(['TUN'], colony('フランス保護領チュニジア', 'the French protectorate of Tunisia', 1956, 'チュニジア', 'Tunisia'));
add(['MAR'], [[0, null, null], [1912, 'フランス保護領モロッコ', 'the French protectorate of Morocco', 'モロッコがフランスとスペインの保護領になった。', 'Morocco became a French and Spanish protectorate.'], indep(1956, 'モロッコ', 'Morocco')]);
add(['LBY'], [[0, 'オスマン帝国領トリポリタニア', 'Ottoman Tripolitania'], [1912, 'イタリア領リビア', 'Italian Libya', 'イタリア軍が上陸し、この土地はイタリアの植民地になった。', 'Italian troops landed, and the land became an Italian colony.'],
  [1943, 'イギリスとフランスの軍政下のリビア', 'British- and French-administered Libya', 'イタリア軍が追い出され、イギリスとフランスの軍政になった。', 'The Italians were driven out, and British and French military administration began.'], indep(1951, 'リビア', 'Libya')]);
add(['SDN'], colony('英エジプト領スーダン', 'Anglo-Egyptian Sudan', 1956, 'スーダン', 'Sudan'));

// 南アジア・東アジア・東南アジア・オセアニア
add(['IND'], [[0, ...BRITISH_INDIA], [1947, null, null]]);
add(['PAK'], [[0, ...BRITISH_INDIA], [1947, null, null]]);
add(['BGD'], [[0, ...BRITISH_INDIA], [1947, '東パキスタン', 'East Pakistan'], [1971, null, null]]);
add(['LKA'], [[0, 'イギリス領セイロン', 'British Ceylon'], [1948, 'セイロン', 'Ceylon', '2月、セイロンがイギリスから独立した。', 'In February Ceylon became independent from Britain.'], [1972, null, null, '国の名がスリランカになった。', 'The country was renamed Sri Lanka.']]);
add(['MMR'], [[0, 'イギリス領ビルマ', 'British Burma'], [1942, '日本占領下のビルマ', 'Japanese-occupied Burma'],
  [1945, 'イギリス領ビルマ', 'British Burma', 'イギリスの統治が戻った。', 'British rule returned.'], [1948, 'ビルマ', 'Burma', '1月4日、ビルマがイギリスから独立した。', 'On 4 January Burma became independent from Britain.'],
  [1989, null, null, '国の英語の名がミャンマーになった。', 'The country was renamed Myanmar.']]);
add(['MDV'], colony('イギリス保護下のモルディブ', 'British-protected Maldives', 1965, 'モルディブ', 'the Maldives'));
add(['KOR'], [[0, '大韓帝国', 'the Korean Empire'], [1910, '日本統治下の朝鮮', 'Korea under Japanese rule', '8月、韓国は日本に併合された。', 'In August Korea was annexed by Japan.'],
  [1945, 'アメリカ軍政下の南朝鮮', 'US-occupied southern Korea', '8月15日、日本が降伏し、朝鮮は解放された。北緯38度線の南にはアメリカ軍が入った。', 'On 15 August Japan surrendered and Korea was liberated. American troops took over south of the 38th parallel.'],
  [1948, null, null, '8月15日、大韓民国の成立が宣言された。', 'On 15 August the Republic of Korea was proclaimed.']]);
add(['CHN'], [[0, '清', 'the Qing Empire'], [1912, '中華民国', 'the Republic of China', '清の皇帝が退位し、中華民国が生まれた。', 'The Qing emperor abdicated, and the Republic of China was born.'],
  [1949, null, null]]);
add(['JPN'], [[0, null, null], [1945, '連合国占領下の日本', 'Allied-occupied Japan', '8月、日本は降伏し、連合国の占領が始まった。', 'In August Japan surrendered, and the Allied occupation began.'],
  [1952, null, null, '4月、講和条約が発効し、日本は主権を取り戻した。', 'In April the peace treaty took effect, and Japan regained its sovereignty.']]);
add(['MNG'], [[0, '清 (外モンゴル)', 'the Qing Empire (Outer Mongolia)'], [1911, 'ボグド・ハーン政権のモンゴル', 'the Bogd Khanate of Mongolia', '清が倒れ、モンゴルは独立を宣言した。', 'The Qing collapsed, and Mongolia declared independence.'],
  [1924, null, null, 'モンゴル人民共和国が生まれた。', "The Mongolian People's Republic was proclaimed."]]);
add(['VNM'], [[0, ...INDOCHINA], [1945, null, null, '9月2日、ハノイでベトナムの独立が宣言された。フランスとの戦争はこのあとも続いた。', 'On 2 September Vietnamese independence was proclaimed in Hanoi. The war with France went on.']]);
add(['LAO'], [[0, ...INDOCHINA], indep(1953, 'ラオス', 'Laos')]);
add(['KHM'], [[0, ...INDOCHINA], indep(1953, 'カンボジア', 'Cambodia')]);
add(['THA'], [[0, 'シャム', 'Siam'], [1939, null, null, '国の名がシャムからタイになった。', 'The country was renamed from Siam to Thailand.']]);
const japanese = (ja: string, en: string, y: number, back: string, backEn: string): Seg[] => [[y, `日本占領下の${ja}`, `Japanese-occupied ${en}`], [1945, back, backEn, '日本が降伏し、もとの支配が戻った。', 'Japan surrendered, and the old rulers returned.']];
add(['MYS'], [[0, 'イギリス領マラヤ', 'British Malaya'], ...japanese('マラヤ', 'Malaya', 1942, 'イギリス領マラヤ', 'British Malaya'),
  [1957, 'マラヤ連邦', 'the Federation of Malaya', '8月31日、マラヤがイギリスから独立した。', 'On 31 August Malaya became independent from Britain.'], [1963, null, null, 'マレーシアが生まれた。', 'Malaysia was founded.']]);
add(['SGP'], [[0, 'イギリス領海峡植民地', 'the British Straits Settlements'], ...japanese('シンガポール (昭南島)', 'Singapore (Syonan)', 1942, 'イギリス領シンガポール', 'British Singapore'),
  [1963, 'マレーシア', 'Malaysia', 'シンガポールはマレーシアの一部になった。', 'Singapore became part of Malaysia.'], indep(1965, 'シンガポール', 'Singapore')]);
add(['IDN'], [[0, 'オランダ領東インド', 'the Dutch East Indies'], [1942, '日本占領下の東インド', 'Japanese-occupied East Indies'],
  [1945, null, null]]);
add(['PHL'], [[0, 'アメリカ領フィリピン', 'the American-ruled Philippines'], ...japanese('フィリピン', 'the Philippines', 1942, 'アメリカ領フィリピン', 'the American-ruled Philippines'),
  [1946, null, null, '7月4日、フィリピンがアメリカから独立した。', 'On 4 July the Philippines became independent from the United States.']]);
add(['TLS'], [[0, 'ポルトガル領ティモール', 'Portuguese Timor'], [1975, 'インドネシア占領下の東ティモール', 'Indonesian-occupied East Timor'], indep(2002, '東ティモール', 'East Timor')]);
add(['PNG'], colony('オーストラリア統治下のパプアとニューギニア', 'Australian-administered Papua and New Guinea', 1975, 'パプアニューギニア', 'Papua New Guinea'));
add(['FJI'], colony('イギリス領フィジー', 'British Fiji', 1970, 'フィジー', 'Fiji'));
add(['SLB'], colony('イギリス領ソロモン諸島', 'the British Solomon Islands', 1978, 'ソロモン諸島', 'the Solomon Islands'));

// サハラより南のアフリカ
for (const [c, y, ja, en] of [['SEN', 1960, 'セネガル', 'Senegal'], ['MLI', 1960, 'マリ', 'Mali'], ['GIN', 1958, 'ギニア', 'Guinea'], ['CIV', 1960, 'コートジボワール', "Côte d'Ivoire"],
  ['NER', 1960, 'ニジェール', 'Niger'], ['MRT', 1960, 'モーリタニア', 'Mauritania']] as const) add([c], colony(...AOF, y, ja, en));
add(['BFA'], [[0, ...AOF], [1960, 'オートボルタ', 'Upper Volta', 'オートボルタが独立した。', 'Upper Volta became independent.'], [1984, null, null, '国の名がブルキナファソになった。', 'The country was renamed Burkina Faso.']]);
add(['BEN'], [[0, ...AOF], [1960, 'ダホメ', 'Dahomey', 'ダホメが独立した。', 'Dahomey became independent.'], [1975, null, null, '国の名がベナンになった。', 'The country was renamed Benin.']]);
for (const [c, ja, en] of [['GAB', 'ガボン', 'Gabon'], ['COG', 'コンゴ共和国', 'the Republic of the Congo'], ['CAF', '中央アフリカ共和国', 'the Central African Republic'], ['TCD', 'チャド', 'Chad']] as const) add([c], colony(...AEF, 1960, ja, en));
add(['CMR'], [[0, 'ドイツ領カメルーン', 'German Kamerun'], [1916, 'フランス委任統治領カメルーン', 'French Cameroun', 'ドイツ軍が負け、この土地はフランスとイギリスに分けられた。', 'The German forces were beaten, and the land was divided between France and Britain.'], indep(1960, 'カメルーン', 'Cameroon')]);
add(['TGO'], [[0, 'ドイツ領トーゴ', 'German Togoland'], [1914, 'フランス統治下のトーゴ', 'French Togo', 'ドイツ軍が負け、この土地はフランスとイギリスに分けられた。', 'The German forces were beaten, and the land was divided between France and Britain.'], indep(1960, 'トーゴ', 'Togo')]);
add(['MDG'], colony('フランス領マダガスカル', 'French Madagascar', 1960, 'マダガスカル', 'Madagascar'));
add(['COM'], colony('フランス領コモロ', 'the French Comoros', 1975, 'コモロ', 'the Comoros'));
add(['DJI'], colony('フランス領ソマリ海岸', 'French Somaliland', 1977, 'ジブチ', 'Djibouti'));
add(['MUS'], colony('イギリス領モーリシャス', 'British Mauritius', 1968, 'モーリシャス', 'Mauritius'));
add(['ETH'], [[0, null, null], [1936, 'イタリア占領下のエチオピア', 'Italian-occupied Ethiopia', '5月、イタリア軍がアディスアベバに入った。', 'In May the Italian army entered Addis Ababa.'],
  [1941, null, null, '皇帝が都に戻り、イタリアの占領が終わった。', 'The emperor returned to the capital, and the Italian occupation ended.']]);
add(['SOM'], colony('イタリア領とイギリス領のソマリランド', 'Italian and British Somaliland', 1960, 'ソマリア', 'Somalia'));
add(['KEN'], colony('イギリス領東アフリカ (ケニア)', 'British East Africa (Kenya)', 1963, 'ケニア', 'Kenya'));
add(['UGA'], colony('イギリス保護領ウガンダ', 'the Uganda Protectorate', 1962, 'ウガンダ', 'Uganda'));
add(['TZA'], [[0, 'ドイツ領東アフリカ', 'German East Africa'], [1919, 'イギリス委任統治領タンガニーカ', 'British Tanganyika', 'ドイツが負け、この土地はイギリスの委任統治になった。', 'Germany had lost, and the land became a British mandate.'], indep(1961, 'タンガニーカ', 'Tanganyika')]);
for (const [c, ja, en] of [['RWA', 'ルワンダ', 'Rwanda'], ['BDI', 'ブルンジ', 'Burundi']] as const) add([c], [[0, 'ドイツ領東アフリカ', 'German East Africa'],
  [1916, 'ベルギー統治下のルアンダ＝ウルンディ', 'Belgian Ruanda-Urundi', 'ベルギー軍が入り、ドイツの支配が終わった。', 'Belgian troops arrived, and German rule ended.'], indep(1962, ja, en)]);
add(['COD'], [[0, 'コンゴ自由国 (ベルギー国王の私領)', "the Congo Free State (King Leopold's)"], [1908, 'ベルギー領コンゴ', 'the Belgian Congo', 'コンゴはベルギー国王の私領から、ベルギーの植民地になった。', "The Congo passed from the king's private domain to a Belgian colony."], indep(1960, 'コンゴ', 'the Congo')]);
for (const [c, y, cja, cen, ja, en] of [['AGO', 1975, 'ポルトガル領アンゴラ', 'Portuguese Angola', 'アンゴラ', 'Angola'], ['MOZ', 1975, 'ポルトガル領モザンビーク', 'Portuguese Mozambique', 'モザンビーク', 'Mozambique'],
  ['GNB', 1974, 'ポルトガル領ギニア', 'Portuguese Guinea', 'ギニアビサウ', 'Guinea-Bissau'], ['CPV', 1975, 'ポルトガル領カーボベルデ', 'Portuguese Cape Verde', 'カーボベルデ', 'Cape Verde'],
  ['GNQ', 1968, 'スペイン領ギニア', 'Spanish Guinea', '赤道ギニア', 'Equatorial Guinea'], ['NGA', 1960, 'イギリス領ナイジェリア', 'British Nigeria', 'ナイジェリア', 'Nigeria'],
  ['SLE', 1961, 'イギリス領シエラレオネ', 'British Sierra Leone', 'シエラレオネ', 'Sierra Leone'], ['GMB', 1965, 'イギリス領ガンビア', 'British Gambia', 'ガンビア', 'the Gambia'],
  ['ZMB', 1964, 'イギリス領北ローデシア', 'British Northern Rhodesia', 'ザンビア', 'Zambia'], ['MWI', 1964, 'イギリス領ニヤサランド', 'British Nyasaland', 'マラウイ', 'Malawi'],
  ['BWA', 1966, 'イギリス保護領ベチュアナランド', 'the Bechuanaland Protectorate', 'ボツワナ', 'Botswana'], ['LSO', 1966, 'イギリス領バストランド', 'British Basutoland', 'レソト', 'Lesotho'],
  ['GHA', 1957, 'イギリス領ゴールドコースト', 'the British Gold Coast', 'ガーナ', 'Ghana']] as const) add([c], colony(cja, cen, y, ja, en));
add(['SWZ'], [[0, 'イギリス保護領スワジランド', 'the British protectorate of Swaziland'], [1968, 'スワジランド', 'Swaziland', 'スワジランドが独立した。', 'Swaziland became independent.'], [2018, null, null, '国の名がエスワティニになった。', 'The country was renamed Eswatini.']]);
add(['ZWE'], [[0, 'イギリス領南ローデシア', 'British Southern Rhodesia'], [1965, 'ローデシア', 'Rhodesia', '白人の政府が、イギリスからの独立を一方的に宣言した。', 'The white minority government unilaterally declared independence from Britain.'], indep(1980, 'ジンバブエ', 'Zimbabwe')]);
add(['NAM'], [[0, 'ドイツ領南西アフリカ', 'German South West Africa'], [1915, '南アフリカ統治下の南西アフリカ', 'South African-ruled South West Africa', '南アフリカ軍が入り、ドイツの支配が終わった。', 'South African troops arrived, and German rule ended.'], indep(1990, 'ナミビア', 'Namibia')]);
add(['ZAF'], [[0, 'イギリス領ケープとボーア人の共和国', 'the British Cape and the Boer republics'], [1910, null, null, '南アフリカ連邦が生まれた。', 'The Union of South Africa was founded.']]);

// 南北アメリカ
for (const [c, y, cja, cen, ja, en] of [['JAM', 1962, 'イギリス領ジャマイカ', 'British Jamaica', 'ジャマイカ', 'Jamaica'], ['TTO', 1962, 'イギリス領トリニダード・トバゴ', 'British Trinidad and Tobago', 'トリニダード・トバゴ', 'Trinidad and Tobago'],
  ['GUY', 1966, 'イギリス領ギアナ', 'British Guiana', 'ガイアナ', 'Guyana'], ['SUR', 1975, 'オランダ領スリナム', 'Dutch Suriname', 'スリナム', 'Suriname']] as const) add([c], colony(cja, cen, y, ja, en));
add(['PAN'], [[0, 'コロンビア', 'Colombia'], [1903, null, null, '11月、パナマがコロンビアから独立した。', 'In November Panama broke away from Colombia.']]);
add(['HTI'], [[0, null, null], [1915, 'アメリカ占領下のハイチ', 'US-occupied Haiti', 'アメリカの海兵隊が上陸した。', 'US Marines landed.'], [1934, null, null, 'アメリカ軍が去った。', 'The American troops left.']]);
add(['DOM'], [[0, null, null], [1916, 'アメリカ占領下のドミニカ共和国', 'US-occupied Dominican Republic', 'アメリカの海兵隊が上陸した。', 'US Marines landed.'], [1924, null, null, 'アメリカ軍が去った。', 'The American troops left.']]);

const segAt = (code: string, year: number): Seg | undefined => {
  const segs = T[code];
  if (!segs) return undefined;
  let s: Seg | undefined;
  for (const x of segs) if (year >= x[0]) s = x;
  return s ?? segs[0];
};

// その年にその土地を治めていた国の名前。いまの国名と同じなら undefined
export function polityName(code: string, year: number): string | undefined {
  const s = segAt(code, year);
  return s?.[1] ? L(s[1], s[2]!) : undefined;
}
// 出生の記録に書く国の名前 (1949年までの生まれだけ、当時の名前にする)
export const bornIn = (code: string, year: number): string => (year < 1950 && polityName(code, year)) || byCode(code).name;
// その年に名前が変わったなら、起きたことの一行。
// 目録の出来事のニュースが同じことを書いている年 (インドとパキスタンの独立・イスラエルの建国・中華人民共和国の成立・
// 第二次世界大戦の占領の始まり・ロシアの内戦など) は、一行を持たない
export function polityChange(code: string, year: number): string | undefined {
  const s = segAt(code, year);
  return s && s[0] === year && s[3] ? L(s[3], s[4]!) : undefined;
}
export const POLITY_CODES = Object.keys(T);
