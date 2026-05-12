import { beforeEach, describe, expect, it } from 'vitest';

import { createVillage, setRandomSeed, simulateDay } from '../src/simulation';
import { createVillager, setNextId } from '../src/villager';
import type { VillageState, Villager } from '../src/types';

function makeVillager(
  occupation: Villager['occupation'],
  overrides: Partial<Villager>,
): Villager {
  return createVillager(occupation, overrides.age ?? 30, overrides.gender ?? 'male', {
    name: overrides.name ?? `${occupation}-tester`,
    health: 100,
    hunger: 0,
    socialNeed: 0,
    wealth: 0,
    spouseId: null,
    childrenIds: [],
    personality: {
      sociable: 0,
      hardworking: 1,
      pious: 0,
      thrifty: 1,
    },
    ...overrides,
  });
}

function makeState(villagers: Villager[], overrides: Partial<VillageState> = {}): VillageState {
  return {
    year: 1,
    day: 1,
    season: 'spring',
    grain: 0,
    bread: 0,
    tools: 0,
    treasury: 0,
    villagers,
    nextId: villagers.length + 1,
    log: [],
    charts: [],
    tavernVisits: 0,
    fieldFertility: 1,
    ...overrides,
  };
}

describe('simulation seeding and day progression', () => {
  beforeEach(() => {
    setNextId(1);
  });

  it('creates the same starting village for the same seed', () => {
    setRandomSeed(123);
    const first = createVillage();

    setRandomSeed(123);
    const second = createVillage();

    expect(second).toMatchObject({
      grain: first.grain,
      bread: first.bread,
      tools: first.tools,
      treasury: first.treasury,
      fieldFertility: first.fieldFertility,
      nextId: first.nextId,
    });
    expect(second.villagers).toHaveLength(100);
    expect(second.villagers.slice(0, 5)).toEqual(first.villagers.slice(0, 5));
  });

  it('changes the generated village when the seed changes', () => {
    setRandomSeed(123);
    const first = createVillage();

    setRandomSeed(456);
    const second = createVillage();

    expect(second.villagers[0]).not.toEqual(first.villagers[0]);
  });

  it('simulates a deterministic work, feed, and milling day', () => {
    setNextId(1);
    const farmer = makeVillager('farmer', {
      name: 'Farmer',
      hunger: 50,
      wealth: 5,
    });
    const miller = makeVillager('miller', {
      name: 'Miller',
      gender: 'female',
      hunger: 50,
      wealth: 5,
    });
    const baker = makeVillager('baker', {
      name: 'Baker',
      gender: 'female',
      hunger: 50,
      wealth: 5,
    });
    const innkeeper = makeVillager('innkeeper', {
      name: 'Inn',
      age: 40,
      hunger: 10,
      wealth: 20,
    });

    const state = makeState([farmer, miller, baker, innkeeper], {
      grain: 20,
      bread: 2,
    });

    setRandomSeed(1);
    simulateDay(state);

    expect(state.day).toBe(2);
    expect(state.season).toBe('spring');
    expect(state.grain).toBeCloseTo(14.82, 6);
    expect(state.bread).toBeCloseTo(6.58, 6);
    expect(state.treasury).toBeCloseTo(0.364, 6);
    expect(state.tavernVisits).toBe(0);
    expect(farmer.hunger).toBe(18);
    expect(miller.hunger).toBe(18);
    expect(baker.hunger).toBe(28);
    expect(innkeeper.wealth).toBeCloseTo(20.5, 6);
    expect(farmer.activity).toBe('working');
  });

  it('records charts every ten days and rolls the year with a seeded fertility value', () => {
    setNextId(1);
    const villager = makeVillager('peasant', {
      name: 'Solo',
      age: 70,
    });
    const state = makeState([villager], {
      day: 365,
      season: 'winter',
    });

    setRandomSeed(8);
    simulateDay(state);

    expect(state.year).toBe(2);
    expect(state.day).toBe(1);
    expect(state.fieldFertility).toBeCloseTo(1.1680072808638216, 12);
    expect(state.log.at(-1)).toMatchObject({
      year: 2,
      day: 1,
      type: 'event',
      text: 'Year 2 begins. Field fertility: 117%.',
    });

    state.day = 10;
    setRandomSeed(5);
    simulateDay(state);

    expect(state.charts).toHaveLength(1);
    expect(state.charts[0]).toMatchObject({
      year: 2,
      day: 10,
      population: 1,
      grain: 0,
    });
    expect(state.charts[0].avgWealth).toBeCloseTo(0.2, 6);
  });
});
