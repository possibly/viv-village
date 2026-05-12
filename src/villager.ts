import type { Villager, Occupation, Gender, Personality, Activity } from './types';
import { randomName } from './names';

let _nextId = 1;
export function setNextId(n: number) { _nextId = n; }
export function getNextId() { return _nextId; }

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randPersonality(): Personality {
  return {
    sociable: rnd(0.1, 0.9),
    hardworking: rnd(0.1, 0.9),
    pious: rnd(0.1, 0.9),
    thrifty: rnd(0.1, 0.9),
  };
}

export function createVillager(
  occupation: Occupation,
  age?: number,
  gender?: Gender,
  overrides?: Partial<Villager>,
): Villager {
  const g: Gender = gender ?? (Math.random() < 0.5 ? 'male' : 'female');
  return {
    id: _nextId++,
    name: randomName(g),
    age: age ?? Math.floor(rnd(16, 55)),
    gender: g,
    occupation,
    health: rnd(60, 100),
    hunger: rnd(0, 30),
    socialNeed: rnd(20, 60),
    wealth: occupationStartingWealth(occupation),
    personality: randPersonality(),
    spouseId: null,
    childrenIds: [],
    activity: 'sleeping',
    alive: true,
    daysMarried: 0,
    daysIll: 0,
    ...overrides,
  };
}

function occupationStartingWealth(occ: Occupation): number {
  const map: Record<Occupation, [number, number]> = {
    farmer: [5, 20],
    blacksmith: [15, 40],
    carpenter: [10, 30],
    miller: [20, 50],
    baker: [10, 25],
    priest: [20, 40],
    innkeeper: [30, 60],
    merchant: [40, 100],
    herbalist: [10, 30],
    peasant: [2, 10],
  };
  const [lo, hi] = map[occ];
  return Math.floor(rnd(lo, hi));
}

export function tavernChance(v: Villager): number {
  if (v.wealth < 2) return 0;
  if (v.health < 20 || v.daysIll > 0) return 0;
  let p = 0.1;
  p += v.personality.sociable * 0.4;
  p += (v.socialNeed / 100) * 0.3;
  p -= v.personality.thrifty * 0.15;
  if (v.occupation === 'priest') p -= 0.2;
  if (v.occupation === 'innkeeper') p = 0; // they run it, not visit
  return Math.max(0, Math.min(1, p));
}

export function workOutput(v: Villager, fertility: number): Partial<Record<string, number>> {
  if (!v.alive || v.activity === 'ill') return {};
  const effort = v.personality.hardworking * (v.health / 100) * (1 - v.hunger / 200);
  switch (v.occupation) {
    case 'farmer':    return { grain: effort * fertility * 2.5 };
    case 'miller':    return { flourReady: effort };
    case 'baker':     return { bread: effort * 3 };
    case 'blacksmith':return { tools: effort * 0.8 };
    case 'carpenter': return { tools: effort * 0.6 };
    case 'merchant':  return { gold: effort * 1.5 };
    case 'innkeeper': return { tavernIncome: effort * 2 };
    case 'herbalist': return { healing: effort };
    case 'priest':    return { morale: effort };
    default:          return { labor: effort };
  }
}

export function setActivity(v: Villager, a: Activity) {
  v.activity = a;
}

export function ageGroup(v: Villager): string {
  if (v.age < 5)  return 'infant';
  if (v.age < 15) return 'child';
  if (v.age < 60) return 'adult';
  return 'elder';
}
