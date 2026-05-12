import { describe, expect, it } from 'vitest';

import {
  affinityDeltaForConversation,
  applyAffinityChange,
  applyRomanticAffinityChange,
  romanticAffinityDelta,
} from '../src/social';
import { createVillager, setNextId } from '../src/villager';
import type { Villager } from '../src/types';

function makeVillager(name: string, overrides: Partial<Villager> = {}): Villager {
  return createVillager('peasant', 30, 'male', {
    name,
    health: 90,
    hunger: 10,
    socialNeed: 65,
    wealth: 10,
    reputation: 40,
    personality: {
      sociable: 0.8,
      hardworking: 0.6,
      pious: 0.4,
      thrifty: 0.3,
    },
    friendships: {},
    romanticAffection: {},
    quarreled: {},
    jobLeads: [],
    secrets: [],
    gossipKnows: [],
    lastTavernActions: [],
    ...overrides,
  });
}

describe('tavern affinity updates', () => {
  it('increases affinity for a positive conversation', () => {
    setNextId(1);
    const alice = makeVillager('Alice');
    const bob = makeVillager('Bob');
    alice.friendships[bob.id] = 20;

    const delta = affinityDeltaForConversation(alice, bob, 'deep-talk');

    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(5);
  });

  it('decreases affinity for a quarrel', () => {
    setNextId(1);
    const alice = makeVillager('Alice');
    const bob = makeVillager('Bob');
    alice.friendships[bob.id] = 45;

    const delta = affinityDeltaForConversation(alice, bob, 'quarrel');

    expect(delta).toBeLessThan(0);
    expect(delta).toBeGreaterThanOrEqual(-5);
  });

  it('dampens positive gains when friendship is already high', () => {
    setNextId(1);
    const alice = makeVillager('Alice');
    const bob = makeVillager('Bob');

    alice.friendships[bob.id] = 10;
    const lowFriendshipDelta = affinityDeltaForConversation(alice, bob, 'chat');

    alice.friendships[bob.id] = 90;
    const highFriendshipDelta = affinityDeltaForConversation(alice, bob, 'chat');

    expect(lowFriendshipDelta).toBeGreaterThan(highFriendshipDelta);
  });

  it('applies the computed delta to friendship bounds safely', () => {
    setNextId(1);
    const alice = makeVillager('Alice');
    const bob = makeVillager('Bob');
    alice.friendships[bob.id] = 97;

    const delta = applyAffinityChange(alice, bob, 'declare-affection');

    expect(delta).toBeGreaterThan(0);
    expect(alice.friendships[bob.id]).toBeLessThanOrEqual(100);
  });

  it('grows romantic affection for romantic actions', () => {
    setNextId(1);
    const alice = makeVillager('Alice');
    const bob = makeVillager('Bob');
    alice.friendships[bob.id] = 55;

    const delta = romanticAffinityDelta(alice, bob, 'flirt');

    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(4);
  });

  it('dampens romantic gains when affection is already high', () => {
    setNextId(1);
    const alice = makeVillager('Alice');
    const bob = makeVillager('Bob');
    alice.friendships[bob.id] = 70;

    alice.romanticAffection[bob.id] = 5;
    const lowAffectionDelta = romanticAffinityDelta(alice, bob, 'declare-affection');

    alice.romanticAffection[bob.id] = 85;
    const highAffectionDelta = romanticAffinityDelta(alice, bob, 'declare-affection');

    expect(lowAffectionDelta).toBeGreaterThan(highAffectionDelta);
  });

  it('applies romantic affection changes within bounds safely', () => {
    setNextId(1);
    const alice = makeVillager('Alice');
    const bob = makeVillager('Bob');
    alice.friendships[bob.id] = 60;
    alice.romanticAffection[bob.id] = 99;

    const delta = applyRomanticAffinityChange(alice, bob, 'declare-affection');

    expect(delta).toBeGreaterThanOrEqual(0);
    expect(alice.romanticAffection[bob.id]).toBeLessThanOrEqual(100);
  });
});
