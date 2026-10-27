// 「怖い場面を除く」。ON のあいだ、このブラウザで生きる人生 (主人公・家族・輪の人・同じ1秒の人) では、
// 自死・他殺・暴力の被害やけんか・麻薬の運び役・身代金目的の誘拐の場面が起きない。
// 死因から外したぶんは、ほかの死因から引き直す (causes.ts の violentShares)。亡くなる確率そのものは変えないので、寿命の分布は変わらない。
// ほかに外すもの: incidents.ts の HEAVY、justice.ts のけんか、decisions の heavy、自死の率を上げる「しんどい時期」の倍率 (life.ts)。
// 歴史の出来事 (戦争・虐殺・飢饉。worldevents.ts) は、その時代に生まれた人に実際に起きたことなので残す
let on = false;
export const gentle = (): boolean => on;
export function setGentle(v: boolean): void { on = v; }
