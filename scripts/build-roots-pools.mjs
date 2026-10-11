// identity.json に、民族・カーストで使う名前の伝統を足す (何度走らせても同じ結果)。
// ウイグル: 姓の代わりに父の名を後ろに付ける。チベット: 姓がなく、二つの名を並べる。
// ネパールのダリット・マデシは、名は nepali のまま、姓だけ集団に多いものにする (from で名を借りる)
import fs from 'node:fs';

const file = new URL('../src/data/identity.json', import.meta.url);
const d = JSON.parse(fs.readFileSync(file, 'utf8'));

const uyghurMale = ['Abdulla', 'Ablimit', 'Ahmatjan', 'Alim', 'Erkin', 'Ilham', 'Memet', 'Tursun', 'Yusup', 'Nurmemet', 'Abduweli', 'Ekrem', 'Qurban', 'Rozi', 'Hesen', 'Tahir', 'Osman', 'Perhat', 'Mamut', 'Ehmet', 'Dilshat', 'Ablikim', 'Yasin', 'Muhter'];
const uyghurFemale = ['Aynur', 'Gulnar', 'Mehriban', 'Patigul', 'Rabiye', 'Zulpiye', 'Ayshem', 'Gulnisa', 'Mihrigul', 'Nurgul', 'Ayjamal', 'Dilnur', 'Gulzar', 'Hanzohra', 'Meryem', 'Nigare', 'Parida', 'Rahile', 'Sajide', 'Tajigul', 'Zohre', 'Buhelchem', 'Dilber', 'Gulbahar'];
const tibetanMale = ['Tenzin', 'Tashi', 'Dorje', 'Sonam', 'Nyima', 'Dawa', 'Kelsang', 'Norbu', 'Lobsang', 'Jampa', 'Tsering', 'Pasang', 'Gyaltsen', 'Thupten', 'Ngawang', 'Karma', 'Phuntsok', 'Choephel', 'Lhakpa', 'Wangchuk'];
const tibetanFemale = ['Pema', 'Lhamo', 'Dolma', 'Yangchen', 'Dechen', 'Tsering', 'Sonam', 'Kalsang', 'Yeshe', 'Dawa', 'Nyima', 'Chodon', 'Lhadon', 'Tsomo', 'Pasang', 'Drolkar', 'Kunsang', 'Rinzin', 'Diki', 'Metok'];
const tibetanSecond = ['Dorje', 'Tsering', 'Gyatso', 'Wangmo', 'Namgyal', 'Phuntsok', 'Norbu', 'Dolma', 'Tashi', 'Wangdu', 'Gyaltsen', 'Lhamo', 'Rinchen', 'Sangmo', 'Tenzin', 'Choedon', 'Dhondup', 'Yangkyi', 'Jamyang', 'Palden'];

d.pools.uyghur = { male: uyghurMale, female: uyghurFemale, family: uyghurMale, order: 'given-first', sep: ' ' };
d.pools.tibetan = { male: tibetanMale, female: tibetanFemale, family: tibetanSecond, order: 'given-first', sep: ' ' };
// 丘陵のダリット (カミ・ダマイ・サルキ) と、平野のダリットに多い姓
d.pools.nepali_dalit = { from: 'nepali', family: ['Bishwakarma', 'BK', 'Nepali', 'Pariyar', 'Sunar', 'Sarki', 'Mijar', 'Damai', 'Kami', 'Ram', 'Paswan', 'Sada'] };
// マデシ (平野のカースト)。ネパールのムスリムの多くも平野に住む
d.pools.nepali_madhesi = { from: 'nepali', family: ['Yadav', 'Mandal', 'Karn', 'Mahato', 'Jha', 'Singh', 'Gupta', 'Sah', 'Thakur', 'Mishra', 'Shah', 'Chaudhary', 'Kushwaha', 'Sahani'] };
d.pools.nepali_muslim = { from: 'urdu_muslim', family: ['Ansari', 'Miya', 'Khan', 'Siddiqui', 'Shekh', 'Alam'] };

// 韓国の都市に光州を足す (人口約142万人で6番目。2020年人口住宅総調査)。都市は順位が下ほど生まれにくい (identity.ts の pickCity)
const kor = d.countries.KOR;
if (!kor.cities.includes('光州')) { kor.cities.push('光州'); kor.citiesEn.push('Gwangju'); }

fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
