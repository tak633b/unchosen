// 飼った犬と猫の記録。人の輪に並べるための、横に置くだけの記録で、乱数は使わない (主人公の人生は変わらない)
import type { Memory, Person, PetLife, Tie } from './person';
import { clamp } from './rng';

export const PET_ID = 100000; // 人の id と重ならない番号
const PET_MEM = 20;

// 今いるペットの記録。古いセーブで記録が無ければ、今の姿から作る
export function petRec(p: Person): PetLife | undefined {
  if (!p.pet) return undefined;
  const live = (p.pets ?? []).find((x) => x.alive);
  if (live) return live;
  const rec: PetLife = { id: PET_ID + (p.pets?.length ?? 0), kind: p.pet.kind, name: p.pet.name, since: Math.max(0, p.age - p.pet.age), age: p.pet.age, alive: true, bond: 60, mem: [] };
  p.pets = [...(p.pets ?? []), rec];
  return rec;
}

export function petJoined(p: Person, text: string): void {
  const rec = petRec(p)!;
  rec.mem = [{ age: p.age, text, d: 0 }];
}

// 一緒の出来事。近さが少し上がる
export function petMoment(p: Person, text: string, d = 3): void {
  const rec = petRec(p);
  if (!rec) return;
  rec.bond = clamp(rec.bond + d, 0, 100);
  rec.mem = [...rec.mem, { age: p.age, text, d } as Memory].slice(-PET_MEM);
}

export function petAged(p: Person): void {
  const rec = petRec(p);
  if (rec && p.pet) rec.age = p.pet.age;
}

export function petDied(p: Person, text: string): void {
  const rec = petRec(p);
  if (!rec) return;
  rec.alive = false;
  rec.diedAt = p.age;
  rec.mem = [...rec.mem, { age: p.age, text, d: 0 }].slice(-PET_MEM);
}

// 人の輪に並べる形。kind (犬・猫) は pet に入れる
export function petTies(p: Person): Tie[] {
  petRec(p);
  return (p.pets ?? []).map((x) => ({
    id: x.id, role: 'pet', pet: x.kind, name: x.name, sex: 'F', age: x.age, alive: x.alive, bond: x.bond, mem: x.mem,
    since: x.since, ...(x.diedAt !== undefined ? { diedAt: x.diedAt } : {}),
  }) as Tie);
}
