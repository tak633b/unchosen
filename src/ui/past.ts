// 前世の記録: 終わった人生をこの端末に最大10件残す。
// 入りきらない (容量の上限) ときは古いものから落として、新しい人生を必ず残す
export const MAX_PAST = 10;
const KEY = 'lives';

export const addLife = <T>(list: T[], life: T, max = MAX_PAST): T[] => [life, ...list].slice(0, max);

type Store = Pick<Storage, 'setItem'>;
const local = (): Store | null => { try { return localStorage; } catch { return null; } };

// 保存できた件数を返す (0 なら保存できなかった)
export function storeLives<T>(list: T[], store: Store | null = local()): number {
  if (!store) return 0;
  for (let n = list.length; n > 0; n--) {
    try {
      store.setItem(KEY, JSON.stringify(list.slice(0, n)));
      return n;
    } catch {
      // 容量が足りなければ1件減らしてもう一度
    }
  }
  return 0;
}
