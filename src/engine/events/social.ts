// 人との間で起きること: 治安、見知らぬ人、友だちの頼みごと。
import { yen } from '../economy';
import { bump, countryOf, decide, log, type Person } from '../person';
import { scaleOf } from './common';

export function crime(p: Person): void {
  const c = countryOf(p);
  if (p.age >= 12 && p.rng() < (c.homicide / 1e5) * 25) {
    log(p, '強盗にあい、けがをした。', 'hard');
    bump(p, { happy: -6, health: -4 });
  }
}

export function dilemmas(p: Person): void {
  const r = p.rng;
  if (p.age < 16 || r() > 0.07) return;
  const which = Math.floor(r() * 3);
  const key = `dilemma-${which}`;
  if (p.age - (p.recent[key] ?? -99) < 15) return;
  p.recent[key] = p.age;
  if (which === 0) {
    decide(p, {
      title: '道に倒れている人',
      text: '道ばたで知らない人が倒れている。みんな足早に通り過ぎていく。',
      options: [
        {
          label: '病院に連れていく', hint: '時間とお金が少しかかる',
          apply: (q) => {
            q.wealth -= scaleOf(q) * 0.01;
            log(q, '病院まで付き添った。数日後、その人の家族がお礼に来た。', 'family');
            bump(q, { bond: 4, happy: 3 });
          },
        },
        { label: '誰かが助けるだろうと通り過ぎる', apply: (q) => { log(q, 'その日の夜は、なかなか寝つけなかった。', 'hard'); bump(q, { happy: -2 }); } },
      ],
      auto: (q) => (q.rng() < 0.6 ? 0 : 1),
    });
  } else if (which === 1 && p.working) {
    decide(p, {
      title: 'からかわれている同僚',
      text: '職場で一人の同僚がいつも笑いものにされている。',
      options: [
        { label: 'かばう', hint: '自分も目をつけられるかもしれない', apply: (q) => { log(q, '同僚をかばった。それからその人とよく話すようになった。', 'work'); bump(q, { bond: 4, happy: 2 }); } },
        { label: '見て見ぬふりをする', apply: (q) => { log(q, '何も言えなかった。気持ちが重かった。', 'hard'); bump(q, { happy: -2 }); } },
      ],
      auto: (q) => (q.rng() < 0.45 ? 0 : 1),
    });
  } else if (p.wealth > 0 && p.friend) {
    const amount = scaleOf(p) * 0.15;
    decide(p, {
      title: 'お金を貸してほしい',
      text: `古い友だちの${p.friend}が、${yen(amount)}(日本の物価での感覚)を貸してほしいと言ってきた。`,
      options: [
        {
          label: '貸す', hint: '返ってくるとは限らない',
          apply: (q) => {
            if (q.rng() < 0.5) log(q, `${q.friend}は少しずつお金を返してくれた。`, 'family');
            else { q.wealth -= amount; log(q, `${q.friend}に貸したお金は返ってこなかった。`, 'hard'); }
            bump(q, { bond: 3 });
          },
        },
        { label: '余裕がないと断る', apply: (q) => { log(q, '事情を話して断った。気まずさが残った。', 'family'); bump(q, { bond: -2 }); } },
      ],
      auto: (q) => (q.rng() < 0.5 ? 0 : 1),
    });
  }
}
