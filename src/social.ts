import type { Villager } from './types';

const POSITIVE_ACTION_WEIGHTS: Record<string, number> = {
  chat: 0.4,
  'deep-talk': 0.75,
  flirt: 0.3,
  'declare-affection': 0.45,
  'buy-a-round': 0.5,
  'share-gossip': 0.2,
  confide: 0.7,
  'share-job-tip': 0.45,
  'offer-mentorship': 0.55,
  'toast-the-village': 0.1,
  reconcile: 0.9,
};

const NEGATIVE_ACTION_WEIGHTS: Record<string, number> = {
  quarrel: 1.1,
};

const ROMANTIC_ACTION_WEIGHTS: Record<string, number> = {
  flirt: 0.5,
  'flirt-back': 0.85,
  'declare-affection': 1.1,
  'deep-talk': 0.2,
  confide: 0.25,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moodScore(v: Villager): number {
  const health = (v.health - 50) / 50;
  const hunger = -v.hunger / 100;
  const social = (v.socialNeed - 50) / 50;
  return clamp(health * 0.45 + hunger * 0.25 + social * 0.3, -1, 1);
}

function compatibility(a: Villager, b: Villager): number {
  const sociable = 1 - Math.abs(a.personality.sociable - b.personality.sociable);
  const pious = 1 - Math.abs(a.personality.pious - b.personality.pious);
  const thrift = 1 - Math.abs(a.personality.thrifty - b.personality.thrifty);
  const diligence = 1 - Math.abs(a.personality.hardworking - b.personality.hardworking);
  return clamp(sociable * 0.35 + pious * 0.15 + thrift * 0.2 + diligence * 0.3, 0, 1);
}

export function affinityDeltaForConversation(
  actor: Villager,
  other: Villager,
  actionName: string,
): number {
  const positiveWeight = POSITIVE_ACTION_WEIGHTS[actionName] ?? 0;
  const negativeWeight = NEGATIVE_ACTION_WEIGHTS[actionName] ?? 0;
  const direction = positiveWeight > 0 ? 1 : negativeWeight > 0 ? -1 : 0;
  if (direction === 0) return 0;

  const baseWeight = positiveWeight || negativeWeight;
  const existingFriendship = actor.friendships[other.id] ?? 0;
  const normalizedFriendship = clamp(existingFriendship / 100, 0, 1);
  const relationMomentum = direction > 0
    ? 0.55 + (1 - normalizedFriendship) * 0.55
    : 0.7 + normalizedFriendship * 0.45;
  const personalityFit = 0.55 + compatibility(actor, other) * 0.9;
  const moodInfluence = 1 + (moodScore(actor) + moodScore(other)) * 0.22 * direction;
  const sociabilityBoost = 0.9 + ((actor.personality.sociable + other.personality.sociable) / 2) * 0.3;

  const rawDelta = baseWeight * relationMomentum * personalityFit * moodInfluence * sociabilityBoost * 4;
  const signedDelta = direction * rawDelta;
  return Math.round(clamp(signedDelta, -5, 5));
}

export function applyAffinityChange(
  actor: Villager,
  other: Villager,
  actionName: string,
): number {
  const delta = affinityDeltaForConversation(actor, other, actionName);
  if (delta === 0) return 0;

  actor.friendships[other.id] = clamp((actor.friendships[other.id] ?? 0) + delta, 0, 100);
  return delta;
}

export function romanticAffinityDelta(
  actor: Villager,
  other: Villager,
  actionName: string,
): number {
  const baseWeight = ROMANTIC_ACTION_WEIGHTS[actionName] ?? 0;
  if (baseWeight === 0) return 0;

  const existingAffection = actor.romanticAffection[other.id] ?? 0;
  const existingFriendship = actor.friendships[other.id] ?? 0;
  const normalizedAffection = clamp(existingAffection / 100, 0, 1);
  const normalizedFriendship = clamp(existingFriendship / 100, 0, 1);
  const personalityFit = compatibility(actor, other);
  const moodBlend = (moodScore(actor) + moodScore(other)) / 2;
  const openness = 0.75 + actor.personality.sociable * 0.2 - actor.personality.thrifty * 0.1;
  const relationshipReadiness =
    0.45 +
    personalityFit * 0.35 +
    normalizedFriendship * 0.35 +
    Math.max(0, moodBlend) * 0.15;
  const saturationResistance = 0.35 + (1 - normalizedAffection) * 0.75;

  const rawDelta = baseWeight * openness * relationshipReadiness * saturationResistance * 4;
  return Math.round(clamp(rawDelta, 0, 4));
}

export function applyRomanticAffinityChange(
  actor: Villager,
  other: Villager,
  actionName: string,
): number {
  const delta = romanticAffinityDelta(actor, other, actionName);
  if (delta === 0) return 0;

  actor.romanticAffection[other.id] = clamp((actor.romanticAffection[other.id] ?? 0) + delta, 0, 100);
  return delta;
}
