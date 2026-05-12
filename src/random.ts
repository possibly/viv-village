let state = 0x12345678;

function normalizeSeed(seed: number): number {
  const normalized = Math.trunc(seed) >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function setRandomSeed(seed: number): void {
  state = normalizeSeed(seed);
}

export function random(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomBetween(min: number, max: number): number {
  return min + random() * (max - min);
}
