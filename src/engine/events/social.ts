// 人との間で起きること: 治安、見知らぬ人、友だちの頼みごと。
import { yen } from '../economy';
import { bump, countryOf, decide, log, type Person } from '../person';
import { scaleOf } from './common';
import { L } from '../../i18n';
import { remember } from '../bonds';

// 頼みごとをしてくる友だちは、人の輪の中の一番近い友だち (p.friend はその名前)
const friendTie = (p: Person) => (p.ties ?? []).find((t) => t.role === 'friend' && t.name === p.friend && t.alive && t.until === undefined);

export function crime(p: Person): void {
  const c = countryOf(p);
  if (p.age >= 12 && p.rng() < (c.homicide / 1e5) * 25) {
    log(p, L('強盗にあい、けがをした。', 'Was robbed and hurt.'), 'hard');
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
      title: L('道に倒れている人', 'Someone collapsed'),
      text: L('道ばたで知らない人が倒れている。みんな足早に通り過ぎていく。', 'A stranger has collapsed by the road. People hurry past.'),
      options: [
        {
          label: L('病院に連れていく', 'Take them to hospital'), hint: L('時間とお金が少しかかる', 'Costs some time and money'),
          apply: (q) => {
            q.wealth -= scaleOf(q) * 0.01;
            log(q, L('病院まで付き添った。数日後、その人の家族がお礼に来た。', 'Went with a stranger to the hospital. A few days later, the family came to say thank you.'), 'family');
            bump(q, { bond: 4, happy: 3 });
          },
        },
        { label: L('誰かが助けるだろうと通り過ぎる', 'Walk on, someone else will help'), apply: (q) => { log(q, L('その日の夜は、なかなか寝つけなかった。', 'Could not sleep that night.'), 'hard'); bump(q, { happy: -2 }); } },
      ],
      auto: (q) => (q.rng() < 0.6 ? 0 : 1),
    });
  } else if (which === 1 && p.working) {
    decide(p, {
      title: L('からかわれている同僚', 'A mocked coworker'),
      text: L('職場で一人の同僚がいつも笑いものにされている。', 'One coworker is always the butt of the joke.'),
      options: [
        { label: L('かばう', 'Stand up for them'), hint: L('自分も目をつけられるかもしれない', 'Might become a target too'), apply: (q) => { log(q, L('同僚をかばった。それからその人とよく話すようになった。', 'Stood up for a coworker. The two talked often after that.'), 'work'); bump(q, { bond: 4, happy: 2 }); } },
        { label: L('見て見ぬふりをする', 'Look away'), apply: (q) => { log(q, L('何も言えなかった。気持ちが重かった。', 'Said nothing. It weighed heavily.'), 'hard'); bump(q, { happy: -2 }); } },
      ],
      auto: (q) => (q.rng() < 0.45 ? 0 : 1),
    });
  } else if (p.wealth > 0 && p.friend) {
    const amount = scaleOf(p) * 0.15;
    decide(p, {
      title: L('お金を貸してほしい', 'A loan for a friend'),
      text: L(`古い友だちの${p.friend}が、${yen(amount)}(日本の物価での感覚)を貸してほしいと言ってきた。`, `An old friend, ${p.friend}, asked to borrow ${yen(amount)}.`),
      options: [
        {
          label: L('貸す', 'Lend it'), hint: L('返ってくるとは限らない', 'It may not come back'),
          apply: (q) => {
            const f = friendTie(q);
            if (q.rng() < 0.5) friendLog(q, f, L(`${q.friend}は少しずつお金を返してくれた。`, `${q.friend} paid the money back, little by little.`), 'family', 6, 'lend_back');
            else { q.wealth -= amount; friendLog(q, f, L(`${q.friend}に貸したお金は返ってこなかった。`, `The money lent to ${q.friend} never came back.`), 'hard', -10, 'lend_lost'); }
            bump(q, { bond: 3 });
          },
        },
        { label: L('余裕がないと断る', 'Say no, money is tight'), apply: (q) => { friendLog(q, friendTie(q), L('事情を話して断った。気まずさが残った。', 'Explained and said no. It left things awkward.'), 'family', -6, 'lend_refused'); bump(q, { bond: -2 }); } },
      ],
      auto: (q) => (q.rng() < 0.5 ? 0 : 1),
    });
  }
}

function friendLog(p: Person, f: ReturnType<typeof friendTie>, text: string, kind: 'family' | 'hard', d: number, k: string): void {
  log(p, text, kind, false, undefined, f ? [f.id!] : undefined);
  if (f) remember(p, f, text, d, k);
}
