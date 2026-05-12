import type { VillageState, Villager, Season, Occupation, WorkResult } from './types';
import type { LogEntry } from './types';
import { createVillager, tavernChance, workOutput, setNextId, getNextId } from './villager';
import { random, randomBetween, setRandomSeed } from './random';

const DAYS_PER_SEASON = 91;
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_WORK_MODIFIER: Record<Season, number> = {
  spring: 0.8,
  summer: 1.0,
  autumn: 1.2,
  winter: 0.1,
};

function season(day: number): Season {
  return SEASONS[Math.floor(((day - 1) % 365) / DAYS_PER_SEASON)] ?? 'winter';
}

function rnd(min: number, max: number) {
  return randomBetween(min, max);
}

function rand() { return random(); }

function log(state: VillageState, text: string, type: LogEntry['type'] = 'info') {
  state.log.push({ year: state.year, day: state.day, season: state.season, text, type });
}

type WorkSummary = WorkResult;

const OCCUPATION_WEIGHTS: [Occupation, number][] = [
  ['farmer', 40],
  ['peasant', 20],
  ['blacksmith', 5],
  ['carpenter', 5],
  ['miller', 4],
  ['baker', 6],
  ['priest', 3],
  ['innkeeper', 3],
  ['merchant', 5],
  ['herbalist', 4],
  ['farmer', 5], // extra weight
];

function randomOccupation(): Occupation {
  const total = OCCUPATION_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [occ, w] of OCCUPATION_WEIGHTS) {
    r -= w;
    if (r <= 0) return occ;
  }
  return 'farmer';
}

export function createVillage(): VillageState {
  setNextId(1);
  const villagers: Villager[] = [];

  // seed ~100 villagers with a natural age distribution
  for (let i = 0; i < 100; i++) {
    const ageRoll = rand();
    let age: number;
    if (ageRoll < 0.18) age = Math.floor(rnd(0, 14));
    else if (ageRoll < 0.80) age = Math.floor(rnd(15, 55));
    else age = Math.floor(rnd(56, 75));

    const occ: Occupation = age < 12 ? 'peasant' : randomOccupation();
    villagers.push(createVillager(occ, age));
  }

  // marry some adults
  const singles = villagers.filter(v => v.age >= 16 && v.spouseId === null);
  const males = singles.filter(v => v.gender === 'male');
  const females = singles.filter(v => v.gender === 'female');
  const pairs = Math.min(males.length, females.length, 30);
  for (let i = 0; i < pairs; i++) {
    const m = males[i];
    const f = females[i];
    m.spouseId = f.id;
    f.spouseId = m.id;
    m.daysMarried = Math.floor(rnd(0, 3650));
    f.daysMarried = m.daysMarried;
  }

  return {
    year: 1,
    day: 1,
    season: 'spring',
    grain: 800,
    bread: 200,
    tools: 40,
    treasury: 100,
    villagers,
    nextId: getNextId(),
    log: [],
    charts: [],
    tavernVisits: 0,
    fieldFertility: 1.0,
  };
}

export function simulateDay(state: VillageState, options: { skipTavern?: boolean } = {}): void {
  state.season = season(state.day);
  const alive = state.villagers.filter(v => v.alive);
  state.tavernVisits = 0;

  advanceMorningNeeds(alive);
  runFeedingPhase(state, alive);
  const workSummary = runWorkPhase(state, alive);
  processMilling(state, alive);
  processHealing(alive, workSummary.healing);
  applyHealthDecay(alive);
  if (!options.skipTavern) {
    runTavernPhase(state, alive);
  }
  growSocialNeed(alive);
  applySocialAftermath(state, alive);
  processDeaths(state, alive);

  // --- BIRTHS ---
  const aliveNow = state.villagers.filter(v => v.alive);
  const marriedWomen = aliveNow.filter(v =>
    v.gender === 'female' && v.spouseId !== null && v.age >= 16 && v.age <= 42
  );
  for (const mother of marriedWomen) {
      const birthChance = 0.003 * (mother.health / 100);
    if (rand() < birthChance) {
      const baby = createVillager('peasant', 0, rand() < 0.5 ? 'male' : 'female');
      baby.wealth = 0;
      baby.hunger = 0;
      state.villagers.push(baby);
      mother.childrenIds.push(baby.id);
      const father = state.villagers.find(v => v.id === mother.spouseId);
      if (father) father.childrenIds.push(baby.id);
      log(state, `${mother.name} gave birth to ${baby.name}.`, 'birth');
    }
  }

  // --- MARRIAGES ---
  if (!tryRomanticMarriage(state, aliveNow)) {
    const singleMen = aliveNow.filter(v => v.gender === 'male' && v.spouseId === null && v.age >= 18 && v.age <= 50);
    const singleWomen = aliveNow.filter(v => v.gender === 'female' && v.spouseId === null && v.age >= 16 && v.age <= 45);
    if (singleMen.length > 0 && singleWomen.length > 0 && rand() < 0.02) {
      const m = singleMen[Math.floor(rand() * singleMen.length)];
      const f = singleWomen[Math.floor(rand() * singleWomen.length)];
      m.spouseId = f.id;
      f.spouseId = m.id;
      log(state, `${m.name} and ${f.name} were married.`, 'marriage');
    }
  }

  // --- RANDOM EVENTS (every ~30 days) ---
  if (rand() < 1 / 30) {
    randomEvent(state, aliveNow);
  }

  // --- CHILDREN GROW UP ---
  for (const v of aliveNow) {
    if (v.age >= 12 && v.occupation === 'peasant' && Math.floor(v.age) === 12 && rand() < 0.3) {
      v.occupation = randomOccupation();
    }
  }

  // --- CHART SNAPSHOT every 10 days ---
  if (state.day % 10 === 0) {
    const pop = aliveNow.length;
    const avgHealth = aliveNow.reduce((s, v) => s + v.health, 0) / (pop || 1);
    const avgWealth = aliveNow.reduce((s, v) => s + v.wealth, 0) / (pop || 1);
    state.charts.push({
      year: state.year,
      day: state.day,
      population: pop,
      grain: state.grain,
      avgHealth,
      avgWealth,
    });
  }

  // advance day
  state.day++;
  if (state.day > 365) {
    state.day = 1;
    state.year++;
    state.fieldFertility = 0.7 + rand() * 0.8; // annual variation
    log(state, `Year ${state.year} begins. Field fertility: ${(state.fieldFertility * 100).toFixed(0)}%.`, 'event');
  }
}

export { setRandomSeed };

function advanceMorningNeeds(villagers: Villager[]): void {
  for (const villager of villagers) {
    villager.hunger = Math.min(100, villager.hunger + 8);
  }
}

function runFeedingPhase(state: VillageState, villagers: Villager[]): void {
  for (const villager of villagers) {
    if (villager.hunger <= 20) {
      continue;
    }

    if (state.bread > 0) {
      state.bread -= 1;
      villager.hunger = Math.max(0, villager.hunger - 40);
      continue;
    }

    if (state.grain >= 2) {
      state.grain -= 2;
      villager.hunger = Math.max(0, villager.hunger - 30);
    }
  }
}

function runWorkPhase(state: VillageState, villagers: Villager[]): WorkSummary {
  const summary: WorkSummary = {
    grain: 0,
    bread: 0,
    tools: 0,
    healing: 0,
    gold: 0,
    tavernIncome: 0,
  };
  const fertility = state.fieldFertility * SEASON_WORK_MODIFIER[state.season];

  for (const villager of villagers) {
    if (villager.daysIll > 0) {
      villager.activity = 'ill';
      continue;
    }

    villager.activity = 'working';
    const output = workOutput(villager, fertility);
    summary.grain += output.grain;
    summary.bread += output.bread;
    summary.tools += output.tools;
    summary.healing += output.healing;
    summary.gold += output.gold;
    summary.tavernIncome += output.tavernIncome;
    villager.wealth += wageFor(villager) * villager.personality.hardworking;
  }

  state.grain = Math.max(0, state.grain + summary.grain);
  state.bread = Math.max(0, state.bread + summary.bread);
  state.tools = Math.max(0, state.tools + summary.tools);
  state.treasury += summary.gold * 0.1 + summary.tavernIncome * 0.2;

  return summary;
}

function processMilling(state: VillageState, villagers: Villager[]): void {
  const millerCount = villagers.filter(v => v.occupation === 'miller').length;
  const bakerCount = villagers.filter(v => v.occupation === 'baker').length;
  if (millerCount === 0 || bakerCount === 0 || state.grain <= 10) {
    return;
  }

  const milled = Math.min(state.grain * 0.3, millerCount * 5);
  state.grain -= milled;
  state.bread += milled * bakerCount * 0.8;
}

function processHealing(villagers: Villager[], healingDone: number): void {
  if (healingDone <= 0) {
    return;
  }

  for (const villager of villagers) {
    if (villager.daysIll <= 0) {
      continue;
    }
    if (rand() < healingDone * 0.15) {
      villager.daysIll = 0;
      villager.activity = 'resting';
    }
  }
}

function applyHealthDecay(villagers: Villager[]): void {
  for (const villager of villagers) {
    if (villager.hunger > 70) villager.health -= rnd(2, 5);
    if (villager.daysIll > 0) {
      villager.health -= rnd(1, 4);
      villager.daysIll++;
    }
    if (villager.hunger < 30 && villager.daysIll === 0) {
      villager.health = Math.min(100, villager.health + 0.5);
    }
    villager.age += 1 / 365;
  }
}

function runTavernPhase(state: VillageState, villagers: Villager[]): void {
  if (state.season === 'winter' && rand() >= 0.3) {
    return;
  }

  const innkeeper = villagers.find(v => v.occupation === 'innkeeper');
  for (const villager of villagers) {
    if (villager.occupation === 'innkeeper') {
      villager.activity = 'working';
      continue;
    }
    if (rand() >= tavernChance(villager)) {
      continue;
    }

    const cost = Math.floor(rnd(1, 3));
    if (villager.wealth < cost) {
      continue;
    }

    villager.wealth -= cost;
    villager.socialNeed = Math.max(0, villager.socialNeed - 35);
    villager.activity = 'at_tavern';
    state.tavernVisits++;
    if (innkeeper) innkeeper.wealth += cost * 0.8;
  }
}

function growSocialNeed(villagers: Villager[]): void {
  for (const villager of villagers) {
    if (villager.activity !== 'at_tavern') {
      villager.socialNeed = Math.min(100, villager.socialNeed + 3);
    }
  }
}

function applySocialAftermath(state: VillageState, villagers: Villager[]): void {
  for (const villager of villagers) {
    const feudCount = Object.values(villager.quarreled).filter(Boolean).length;
    if (feudCount > 0) {
      villager.reputation = Math.max(0, villager.reputation - Math.min(0.6, feudCount * 0.15));
    }

    if (villager.occupation === 'peasant' && villager.age >= 16 && villager.jobLeads.length > 0 && rand() < 0.03) {
      const lead = villager.jobLeads[Math.floor(rand() * villager.jobLeads.length)];
      if (lead.occupation !== 'peasant') {
        villager.occupation = lead.occupation;
        log(state, `${villager.name} took up ${lead.occupation} work after following a tavern lead.`, 'social');
      }
    }
  }
}

function tryRomanticMarriage(state: VillageState, villagers: Villager[]): boolean {
  const eligible = villagers.filter(v =>
    v.alive &&
    v.spouseId === null &&
    ((v.gender === 'male' && v.age >= 18 && v.age <= 50) || (v.gender === 'female' && v.age >= 16 && v.age <= 45))
  );

  for (const v of eligible) {
    if (v.romanticInterest === null) continue;
    const other = villagers.find(x => x.id === v.romanticInterest);
    if (!other || !other.alive || other.spouseId !== null) continue;
    if (other.romanticInterest !== v.id) continue;
    if ((v.romanticAffection[other.id] ?? 0) < 30) continue;
    if ((other.romanticAffection[v.id] ?? 0) < 30) continue;
    if (rand() >= 0.12) continue;
    v.spouseId = other.id;
    other.spouseId = v.id;
    log(state, `${v.name} and ${other.name} were married after a well-known courtship.`, 'marriage');
    return true;
  }

  return false;
}

function processDeaths(state: VillageState, villagers: Villager[]): void {
  for (const villager of villagers) {
    if (rand() >= deathChanceFor(villager)) {
      continue;
    }

    villager.alive = false;
    const cause = villager.daysIll > 0
      ? 'illness'
      : villager.hunger > 80
        ? 'starvation'
        : villager.age > 55
          ? 'old age'
          : 'poor health';
    log(state, `${villager.name} (${Math.floor(villager.age)}), ${villager.occupation}, died of ${cause}.`, 'death');
    if (villager.spouseId) {
      const spouse = state.villagers.find(other => other.id === villager.spouseId);
      if (spouse) spouse.spouseId = null;
    }
  }
}

function wageFor(villager: Villager): number {
  if (villager.occupation === 'farmer') return 0.3;
  if (villager.occupation === 'peasant') return 0.1;
  return 0.5;
}

function deathChanceFor(villager: Villager): number {
  if (villager.health <= 0) return 1;
  if (villager.health < 20) return 0.15;
  if (villager.age > 65) return 0.002 * (villager.age - 60);
  if (villager.age > 55) return 0.001;
  return 0;
}

function randomEvent(state: VillageState, alive: Villager[]) {
  const events = [
    // good
    { w: 8,  fn: () => { state.grain += 100; log(state, 'A traveling merchant sold extra grain to the village.', 'event'); } },
    { w: 5,  fn: () => { const v = alive[Math.floor(rand() * alive.length)]; v.health = Math.min(100, v.health + 30); log(state, `${v.name} recovered miraculously from poor health.`, 'event'); } },
    { w: 4,  fn: () => { state.treasury += 50; log(state, 'The lord granted a small tax relief to the village.', 'event'); } },
    { w: 6,  fn: () => { state.bread += 60; log(state, 'A festival donation filled the village stores with bread.', 'event'); } },
    { w: 3,  fn: () => { state.tools += 10; log(state, 'Wandering craftsmen left behind tools before moving on.', 'event'); } },
    // bad
    { w: 6,  fn: () => {
        const count = Math.floor(rnd(3, 10));
        const victims = shuffle(alive).slice(0, count);
        for (const v of victims) { v.daysIll = 1; v.health -= 10; }
        log(state, `A sickness spread through the village, afflicting ${count} people.`, 'event');
    }},
    { w: 5,  fn: () => { const loss = Math.floor(state.grain * 0.2); state.grain -= loss; log(state, `Rats destroyed ${loss} bushels of grain in the stores.`, 'event'); } },
    { w: 4,  fn: () => { const tax = Math.floor(state.treasury * 0.3 + 20); state.treasury = Math.max(0, state.treasury - tax); log(state, `Tax collectors arrived and took ${tax} coins from the treasury.`, 'event'); } },
    { w: 3,  fn: () => { state.fieldFertility *= 0.7; log(state, 'A blight struck the fields, reducing their fertility.', 'event'); } },
    { w: 2,  fn: () => {
        const v = alive.find(x => x.occupation === 'blacksmith' || x.occupation === 'carpenter');
        if (v) { v.health -= 30; log(state, `${v.name} was injured in a workshop accident.`, 'event'); }
    }},
    // neutral
    { w: 5,  fn: () => { log(state, 'Pilgrims passed through the village on their way to the cathedral.', 'event'); } },
    { w: 4,  fn: () => { log(state, 'A wandering minstrel entertained the village at the tavern last night.', 'tavern'); } },
    { w: 3,  fn: () => { log(state, 'Rumors of war in distant lands reached the village.', 'event'); } },
  ];

  const total = events.reduce((s, e) => s + e.w, 0);
  let r = rand() * total;
  for (const e of events) {
    r -= e.w;
    if (r <= 0) { e.fn(); return; }
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
