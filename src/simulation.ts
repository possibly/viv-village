import type { VillageState, Villager, Season, Occupation } from './types';
import type { LogEntry } from './types';
import { createVillager, tavernChance, workOutput, setNextId, getNextId } from './villager';

const DAYS_PER_SEASON = 91;
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

function season(day: number): Season {
  return SEASONS[Math.floor(((day - 1) % 365) / DAYS_PER_SEASON)] ?? 'winter';
}

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function rand() { return Math.random(); }

function log(state: VillageState, text: string, type: LogEntry['type'] = 'info') {
  state.log.push({ year: state.year, day: state.day, season: state.season, text, type });
}

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

export function simulateDay(state: VillageState): void {
  state.season = season(state.day);
  const alive = state.villagers.filter(v => v.alive);
  state.tavernVisits = 0;

  // --- MORNING: hunger & health ---
  for (const v of alive) {
    v.hunger = Math.min(100, v.hunger + 8);
  }

  // feed from bread then grain
  let fedCount = 0;
  for (const v of alive) {
    if (v.hunger > 20) {
      if (state.bread > 0) {
        state.bread -= 1;
        v.hunger = Math.max(0, v.hunger - 40);
        fedCount++;
      } else if (state.grain >= 2) {
        state.grain -= 2;
        v.hunger = Math.max(0, v.hunger - 30);
        fedCount++;
      }
    }
  }

  // --- WORK PHASE ---
  let grainProduced = 0;
  let breadProduced = 0;
  let toolsProduced = 0;
  let healingDone = 0;
  let merchantGold = 0;
  let tavernIncome = 0;

  const seasonMod = { spring: 0.8, summer: 1.0, autumn: 1.2, winter: 0.1 };
  const farmMod = seasonMod[state.season];

  for (const v of alive) {
    if (v.daysIll > 0) {
      v.activity = 'ill';
      continue;
    }
    v.activity = 'working';
    const out = workOutput(v, state.fieldFertility * farmMod);
    grainProduced    += out.grain        ?? 0;
    breadProduced    += out.bread        ?? 0;
    toolsProduced    += (out.tools       ?? 0);
    healingDone      += out.healing      ?? 0;
    merchantGold     += out.gold         ?? 0;
    tavernIncome     += out.tavernIncome ?? 0;

    // worker earns wages
    const wage = v.occupation === 'farmer' ? 0.3 :
                 v.occupation === 'peasant' ? 0.1 : 0.5;
    v.wealth += wage * v.personality.hardworking;
  }

  state.grain  = Math.max(0, state.grain  + grainProduced);
  state.bread  = Math.max(0, state.bread  + breadProduced);
  state.tools  = Math.max(0, state.tools  + toolsProduced);
  state.treasury += merchantGold * 0.1 + tavernIncome * 0.2;

  // miller converts grain to flour if baker present
  const millerCount  = alive.filter(v => v.occupation === 'miller').length;
  const bakerCount   = alive.filter(v => v.occupation === 'baker').length;
  if (millerCount > 0 && bakerCount > 0 && state.grain > 10) {
    const milled = Math.min(state.grain * 0.3, millerCount * 5);
    state.grain -= milled;
    state.bread += milled * bakerCount * 0.8;
  }

  // herbalist heals ill villagers
  if (healingDone > 0) {
    const ill = alive.filter(v => v.daysIll > 0);
    for (const v of ill) {
      if (rand() < healingDone * 0.15) {
        v.daysIll = 0;
        v.activity = 'resting';
      }
    }
  }

  // --- HEALTH DECAY ---
  for (const v of alive) {
    if (v.hunger > 70) v.health -= rnd(2, 5);
    if (v.daysIll > 0) {
      v.health -= rnd(1, 4);
      v.daysIll++;
    }
    // natural recovery if fed and healthy
    if (v.hunger < 30 && v.daysIll === 0) {
      v.health = Math.min(100, v.health + 0.5);
    }
    v.age += 1 / 365;
  }

  // --- EVENING: TAVERN ---
  if (state.season !== 'winter' || rand() < 0.3) {
    for (const v of alive) {
      if (v.occupation === 'innkeeper') {
        v.activity = 'working';
        continue;
      }
      if (rand() < tavernChance(v)) {
        const cost = Math.floor(rnd(1, 3));
        if (v.wealth >= cost) {
          v.wealth -= cost;
          v.socialNeed = Math.max(0, v.socialNeed - 35);
          v.activity = 'at_tavern';
          state.tavernVisits++;
          // innkeeper earns
          const keeper = alive.find(v => v.occupation === 'innkeeper');
          if (keeper) keeper.wealth += cost * 0.8;
        }
      }
    }
  }

  // social need grows for those not at tavern
  for (const v of alive) {
    if (v.activity !== 'at_tavern') {
      v.socialNeed = Math.min(100, v.socialNeed + 3);
    }
  }

  // --- DEATHS ---
  for (const v of alive) {
    let deathChance = 0;
    if (v.health <= 0) deathChance = 1;
    else if (v.health < 20) deathChance = 0.15;
    else if (v.age > 65) deathChance = 0.002 * (v.age - 60);
    else if (v.age > 55) deathChance = 0.001;

    if (rand() < deathChance) {
      v.alive = false;
      const cause = v.daysIll > 0 ? 'illness' : v.hunger > 80 ? 'starvation' : v.age > 55 ? 'old age' : 'poor health';
      log(state, `${v.name} (${Math.floor(v.age)}), ${v.occupation}, died of ${cause}.`, 'death');
      // widow spouse
      if (v.spouseId) {
        const sp = state.villagers.find(x => x.id === v.spouseId);
        if (sp) sp.spouseId = null;
      }
    }
  }

  // --- BIRTHS ---
  const aliveNow = state.villagers.filter(v => v.alive);
  const marriedWomen = aliveNow.filter(v =>
    v.gender === 'female' && v.spouseId !== null && v.age >= 16 && v.age <= 42
  );
  for (const mother of marriedWomen) {
    const birthChance = 0.003 * (mother.health / 100);
    if (rand() < birthChance) {
      const baby = createVillager('peasant', 0, Math.random() < 0.5 ? 'male' : 'female');
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
  const singleMen = aliveNow.filter(v => v.gender === 'male' && v.spouseId === null && v.age >= 18 && v.age <= 50);
  const singleWomen = aliveNow.filter(v => v.gender === 'female' && v.spouseId === null && v.age >= 16 && v.age <= 45);
  if (singleMen.length > 0 && singleWomen.length > 0 && rand() < 0.02) {
    const m = singleMen[Math.floor(rand() * singleMen.length)];
    const f = singleWomen[Math.floor(rand() * singleWomen.length)];
    m.spouseId = f.id;
    f.spouseId = m.id;
    log(state, `${m.name} and ${f.name} were married.`, 'marriage');
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
