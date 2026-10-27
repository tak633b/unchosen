// 年を重ねた体: 40代の老眼と老眼鏡、難聴と補聴器、杖と手すり、歯を失うことと入れ歯。
// 手に入るかどうかは、国の豊かさ・家の暮らし向き・町か村かで決まる。
import { L } from '../../i18n';
import { byCode, type Country } from '../countries';
import { formatMoney } from '../economy';
import { bump, countryOf, log, type Person } from '../person';
import { clamp } from '../rng';
import { isPoor, isRich, scaleOf } from './common';
import { showRng } from '../crisis';

// 同じ人生の同じ年には同じ値。人生の乱数の流れ (p.rng) を動かさない
const roll = (p: Person, salt: number) => showRng(p.seed, p.age, salt)();
// 国の豊かさに家と土地の差を足した、手に入る見込み。安い物 (眼鏡・杖・入れ歯) は届かない割合のほうを家と土地で伸び縮みさせ、
// 高い物 (補聴器) は使う割合そのものを伸び縮みさせる (豊かな国の貧しい家でも老眼鏡はたいてい買える)
const reach = (p: Person, base: number, cheap = true) => clamp(cheap
  ? 1 - (1 - base) * (isRich(p) ? 0.6 : isPoor(p) ? 1.3 : 1) * (p.rural ? 1.2 : 1)
  : base * (isRich(p) ? 1.25 : isPoor(p) ? 0.6 : 1) * (p.rural ? 0.7 : 1), 0.03, 0.98);
const tier = (c: Country, rich: number, upper: number, lower: number, low: number) => (c.gdp >= 30000 ? rich : c.gdp >= 15000 ? upper : c.gdp >= 5000 ? lower : low);

// moments.json にある同じ話 (老眼鏡・補聴器・入れ歯の一行) は、ここで出すので重ねない
const SAME = ['reading-glasses', 'hearing-aid', 'dentures', 'walking-stick'];

export function ageing(p: Person): void {
  if (p.age < 40) return;
  for (const id of SAME) p.recent[id] ??= -1;
  const c = countryOf(p);
  presbyopia(p, c);
  hearing(p, c);
  teeth(p, c);
  cane(p, c);
}

// 老眼はほとんど誰にでも、40代のうちに来る (Fricke et al., Ophthalmology 2018)。
// 近くを見る眼鏡が要る人のうち持っている人は、高所得国で9割を超え、サハラ以南のアフリカでは1〜2割 (WHO 世界視覚報告 2019)
function presbyopia(p: Person, c: Country): void {
  if (p.recent.presbyopia !== undefined || p.age < 42 + Math.floor(showRng(p.seed, 0, 0x91a5)() * 7)) return;
  p.recent.presbyopia = p.age;
  const stat = L('近くを見る眼鏡が要る人のうち、持っている人は高所得国で9割を超え、低所得国では1〜2割 (WHO 世界視覚報告 2019)', 'Among people who need glasses for near vision, over 90% have them in high-income countries and 10 to 20% in low-income countries (WHO World Report on Vision 2019)');
  if (roll(p, 0x91a6) < reach(p, tier(c, 0.95, 0.8, 0.55, 0.3))) {
    p.wealth -= scaleOf(p) * 0.005;
    log(p, L('手元の字がかすむようになり、老眼鏡を作った。', 'Small print began to blur. Got a pair of reading glasses.'), 'ill', false, stat);
  } else {
    bump(p, { learn: -2 });
    log(p, L('手元の字がかすむようになった。老眼鏡は手に入らず、針に糸を通すのも細かい字を読むのも、人に頼むようになった。', 'Small print began to blur. Reading glasses were out of reach; threading a needle or reading fine print now meant asking someone else.'), 'ill', false, stat);
  }
}

// 生活に支障のある難聴は60代で1〜2割、80代で半分ほど (WHO 世界聴覚報告 2021)。年ごとの見込みを年齢で上げる。
// 補聴器が要る人のうち使っている人: 日本15%・米国3割・ドイツ37%・フランス41%・英国47% (JapanTrak 2022・EuroTrak・NIDCD)、低所得国は数% (WHO 2021)
const AID: Record<string, number> = { JPN: 0.15, KOR: 0.13, USA: 0.3, DEU: 0.37, FRA: 0.41, GBR: 0.47, DNK: 0.55, NOR: 0.45, CHE: 0.4, NLD: 0.38, ITA: 0.3 };
function hearing(p: Person, c: Country): void {
  if (p.recent.deaf !== undefined || p.age < 55 || roll(p, 0x91b0) >= 0.008 * 1.08 ** (p.age - 55)) return;
  p.recent.deaf = p.age;
  const aid = roll(p, 0x91b1) < reach(p, AID[c.code] ?? tier(c, 0.3, 0.15, 0.05, 0.02), false);
  const stat = L('世界で補聴器が要る人のうち、使っているのは2割ほど (WHO 世界聴覚報告 2021)', 'Worldwide, only about 1 in 5 people who need a hearing aid uses one (WHO World Report on Hearing 2021)');
  if (aid) {
    // 英国は国民保健サービス (NHS) で無料。ほかは1組で給料の1〜2か月分ほど
    const cost = c.code === 'GBR' ? 0 : scaleOf(p) * 0.08;
    p.wealth -= cost;
    bump(p, { happy: 2 });
    log(p, L(`耳が遠くなり、補聴器をつけた。${cost ? `${formatMoney(cost)}かかった。` : ''}鳥の声がこんなにうるさかったのかと驚いた。`, `Hearing faded, and got a hearing aid${cost ? ` for ${formatMoney(cost)}` : ''}. Was surprised at how loud the birds were.`), 'ill', false, stat);
  } else {
    bump(p, { bond: -2 });
    log(p, L('耳が遠くなった。集まりでは、話の輪から少しずつ外れるようになった。', 'Hearing faded. At gatherings, slowly drifted to the edge of the conversation.'), 'ill', false, stat);
  }
}

// 60歳以上の約4分の1が歯をすべて失っている (WHO 口腔保健の世界の現状 2022)。55歳から年に1%ほどずつ。
// 入れ歯の自己負担 (上下、購買力平価ドル): 米国 約2,000 (公的医療保険メディケアは歯科を含まない)・日本 約470 (保険で1〜3割)・
// ドイツ 約1,100 (定額補助のあと)・英国 約460 (NHS の料金帯3、2024年 306.80ポンド)・韓国 約850 (65歳から保険で3割)。ほかは国の医療費の自己負担割合で
const DENTURE: Record<string, number> = { USA: 2000, JPN: 470, DEU: 1100, GBR: 460, KOR: 850 };
function teeth(p: Person, c: Country): void {
  if (p.recent.toothless !== undefined || p.age < 55 || roll(p, 0x91c0) >= 0.011) return;
  p.recent.toothless = p.age;
  const cost = DENTURE[c.code] ? DENTURE[c.code] * c.gdp / byCode(c.code).gdp : c.gdp * 0.06 * Math.max(0.2, c.oop); // 2024年の額を、その年の豊かさで伸び縮み
  const afford = cost < Math.max(0, p.wealth) + scaleOf(p) * 0.15;
  if (afford && roll(p, 0x91c1) < reach(p, tier(c, 0.95, 0.85, 0.55, 0.25))) {
    p.wealth -= cost;
    log(p, L(`歯がほとんど抜けて、入れ歯を作った (${formatMoney(cost)})。しばらくは、好きだった硬いものが食べられなかった。`, `Lost most of the teeth and got dentures (${formatMoney(cost)}). For a while, the hard foods once loved were off the menu.`), 'ill', false,
      L('60歳以上の約4分の1が、歯をすべて失っている (WHO 2022)', 'About a quarter of people over 60 have lost all their teeth (WHO 2022)'));
  } else {
    bump(p, { health: -2 });
    log(p, L(`歯がほとんど抜けた。入れ歯は${formatMoney(cost)}かかると言われ、やわらかいものを食べて暮らすことにした。`, `Lost most of the teeth. Dentures would cost ${formatMoney(cost)}, so meals became soft food.`), 'ill');
  }
}

// 65歳以上で杖を使う人は米国で16%ほど、85歳を過ぎると3人に1人ほど (Gell et al., J Am Geriatr Soc 2015)。
// 体が弱っている人ほど早い。福祉用具が要る人のうち手に入る人は、低所得国で1割に満たないこともある (WHO・UNICEF 支援機器の世界報告 2022)
function cane(p: Person, c: Country): void {
  if (p.recent.cane !== undefined || p.age < 70) return;
  const need = 0.01 * 1.1 ** (p.age - 70) * (p.stats.health < 40 ? 1.5 : 1);
  if (roll(p, 0x91d0) >= need) return;
  p.recent.cane = p.age;
  const rails = (p.house || !!p.mortgage) && c.gdp >= 15000 && roll(p, 0x91d1) < 0.5;
  if (roll(p, 0x91d2) < reach(p, tier(c, 0.95, 0.85, 0.6, 0.35))) {
    log(p, rails ? L('足もとがおぼつかなくなり、杖をつくようになった。家の廊下と風呂場に手すりをつけた。', 'Footing grew unsteady. Started using a cane, and had handrails put in along the hall and in the bathroom.')
      : L('足もとがおぼつかなくなり、杖をつくようになった。', 'Footing grew unsteady. Started using a cane.'), 'old', false,
      L('65歳以上で杖を使う人は米国で約16% (Gell et al. 2015)', 'About 16% of Americans over 65 use a cane (Gell et al. 2015)'));
    if (rails) p.wealth -= scaleOf(p) * 0.03;
  } else {
    log(p, L('足もとがおぼつかなくなった。杖は手に入らず、手ごろな木の枝を削って杖にした。', 'Footing grew unsteady. With no cane to be had, whittled a sturdy branch into one.'), 'old');
  }
}
