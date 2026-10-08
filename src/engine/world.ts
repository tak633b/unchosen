// 暦年の統計 (国×年) と国連の生命表を読み込む。大きいので最初の読み込みには入れず、生まれる前に一度だけ読む
import { setEra, type Era } from './countries';
import { setMortality, type Mortality } from './lifetable';

let loading: Promise<void> | null = null;
export function loadWorld(): Promise<void> {
  loading ??= Promise.all([import('../data/era.json'), import('../data/mortality.json')]).then(([e, m]) => {
    setEra(e.default as unknown as Era);
    setMortality(m.default as unknown as Mortality);
  });
  return loading;
}
