/**
 * Viv-powered tavern social simulation.
 * For each simulated day, the village sim runs first, then the tavern runs 10 Viv micro-steps
 * using the villagers who the low-fidelity evening step already sent to the tavern.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  initializeVivRuntime,
  selectAction,
  EntityType,
} from '@siftystudio/viv-runtime';
import type {
  HostApplicationAdapter,
  VivInternalState,
  ActionView,
  EntityView,
  UID,
  CharacterMemories,
} from '@siftystudio/viv-runtime';
import set from 'lodash/set.js';

import { createVillage, simulateDay } from './simulation.js';
import type { Villager, VillageState } from './types.js';

// ─── Bundle ──────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const TAVERN_BUNDLE = JSON.parse(
  readFileSync(join(__dirname, 'content/tavern_bundle.json'), 'utf-8'),
);

// ─── UID helpers ─────────────────────────────────────────────────────────────
const toUID  = (v: { id: number }): UID => `v-${v.id}`;
const fromUID = (u: UID): number => parseInt(u.slice(2), 10);

const TAVERN_UID: UID = 'tavern';
const HOME_UID:   UID = 'home';

// ─── Shared sim state ─────────────────────────────────────────────────────────
type AnyView = Record<string, unknown> & { entityType: string; id: UID };
const entities:    Record<UID, AnyView> = {};
const charUIDs:    Set<UID>             = new Set();
const actionUIDs:  UID[]                = [];
let vivState:      VivInternalState | null = null;
let timestamp      = 0;

type Snapshot = {
  schemaVersion: string;
  timestamp: number;
  entities: Record<UID, AnyView>;
  vivInternalState: VivInternalState;
};

type CliOptions = {
  days: number;
  snapshotPath: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { days: 7, snapshotPath: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--days' || arg === '-d') && argv[i + 1]) {
      opts.days = Math.max(0, parseInt(argv[++i], 10) || 0);
      continue;
    }
    if ((arg === '--snapshot' || arg === '-s') && argv[i + 1]) {
      opts.snapshotPath = argv[++i];
      continue;
    }
  }

  return opts;
}

function emptyVivInternalState(): VivInternalState {
  return {
    actionQueues: {},
    planQueue: [],
    activePlans: {},
    queuedConstructStatuses: {},
    actionEmbargoes: {},
    lastMemoryDecayTimestamp: null,
  };
}

function buildSnapshot(): Snapshot {
  return {
    schemaVersion: TAVERN_BUNDLE.metadata?.schemaVersion ?? '0.10.1',
    timestamp,
    entities: structuredClone(entities),
    vivInternalState: structuredClone(vivState ?? emptyVivInternalState()),
  };
}

function saveSnapshot(snapshotPath: string): void {
  const snapshot = buildSnapshot();
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}

// ─── Adapter ─────────────────────────────────────────────────────────────────
const ADAPTER: HostApplicationAdapter = {
  provisionActionID: () => randomUUID() as UID,

  getEntityView: (id) => {
    const e = entities[id];
    if (!e) throw new Error(`Entity not found: ${id}`);
    return structuredClone(e) as unknown as EntityView;
  },

  getEntityLabel: (id) => (entities[id]?.name as string) ?? id,

  updateEntityProperty: (id, path, value) => {
    if (!entities[id]) throw new Error(`Cannot update missing entity: ${id}`);
    set(entities[id], path, value);
  },

  saveActionData: (id, data) => {
    if (!actionUIDs.includes(id)) actionUIDs.push(id);
    entities[id] = data as unknown as AnyView;
  },

  getCurrentTimestamp: () => timestamp,

  getEntityIDs: (type, locationID?) => {
    switch (type) {
      case EntityType.Character:
        if (locationID !== undefined)
          return [...charUIDs].filter(id => entities[id]?.location === locationID);
        return [...charUIDs];
      case EntityType.Location:
        return [TAVERN_UID, HOME_UID];
      case EntityType.Action:
        return [...actionUIDs];
      default:
        return [];
    }
  },

  getVivInternalState: () => structuredClone(vivState),
  saveVivInternalState: (s) => { vivState = structuredClone(s); },

  saveCharacterMemory: (charID, actionID, memory) => {
    const view = entities[charID];
    if (!view) return;
    const mems = view.memories as CharacterMemories ?? {};
    mems[actionID] = memory;
    view.memories = mems;
  },

  saveItemInscriptions: () => {},

  debug: { validateAPICalls: false },
};

// ─── Build / update entity view for a villager ───────────────────────────────
function registerVillager(v: Villager, all: Villager[], atTavern: boolean): void {
  const id = toUID(v);
  charUIDs.add(id);

  // Pre-populate relational dicts so Viv += never hits undefined
  const friendships:      Record<string, number>  = {};
  const romanticAffection: Record<string, number>  = {};
  const quarreled:         Record<string, boolean> = {};
  for (const o of all) {
    if (o.id === v.id) continue;
    const oUID = toUID(o);
    friendships[oUID]       = v.friendships[o.id]       ?? 0;
    romanticAffection[oUID] = v.romanticAffection[o.id] ?? 0;
    quarreled[oUID]         = v.quarreled[o.id]         ?? false;
  }

  entities[id] = {
    entityType: EntityType.Character,
    id,
    name:                v.name,
    age:                 v.age,
    occupation:          v.occupation,
    health:              v.health,
    hunger:              v.hunger,
    socialNeed:          v.socialNeed,
    wealth:              v.wealth,
    reputation:          v.reputation,
    is_single:           v.spouseId === null,
    personality_thrifty: v.personality.thrifty,
    has_gossip:          v.gossipKnows.length > 0,
    location:            atTavern ? TAVERN_UID : HOME_UID,
    memories:            (entities[id]?.memories as CharacterMemories) ?? {},
    friendships,
    romanticAffection,
    quarreled,
    romanticInterest:    v.romanticInterest !== null ? toUID({ id: v.romanticInterest }) : null,
  };
}

// ─── Sync entity view state back into Villager ───────────────────────────────
function syncBack(v: Villager): void {
  const e = entities[toUID(v)];
  if (!e) return;

  v.wealth    = Math.max(0, (e.wealth    as number) ?? v.wealth);
  v.socialNeed = Math.max(0, Math.min(100, (e.socialNeed as number) ?? v.socialNeed));
  v.reputation = Math.max(0, Math.min(100, (e.reputation as number) ?? v.reputation));

  if (typeof e.romanticInterest === 'string' && e.romanticInterest.startsWith('v-')) {
    v.romanticInterest = fromUID(e.romanticInterest as UID);
  }

  if (e.has_gossip === false) v.gossipKnows = [];

  const fs = e.friendships as Record<string, number>;
  for (const [u, score] of Object.entries(fs)) {
    v.friendships[fromUID(u as UID)] = Math.max(0, Math.min(100, score ?? 0));
  }

  const ra = e.romanticAffection as Record<string, number>;
  for (const [u, score] of Object.entries(ra)) {
    v.romanticAffection[fromUID(u as UID)] = Math.max(0, Math.min(100, score ?? 0));
  }

  const q = e.quarreled as Record<string, boolean>;
  for (const [u, val] of Object.entries(q)) {
    v.quarreled[fromUID(u as UID)] = val;
  }
}

// ─── Run one evening at the tavern ───────────────────────────────────────────
async function runEvening(
  state: VillageState,
  villagers: Villager[],
  eveningNum: number,
): Promise<void> {
  const alive = villagers.filter(v => v.alive);
  const tavernSet = new Set<number>(
    alive
      .filter(v => v.activity === 'at_tavern' || v.occupation === 'innkeeper')
      .map(v => v.id),
  );
  const goers = alive.filter(v => tavernSet.has(v.id));
  const actors = goers.filter(v => v.occupation !== 'innkeeper' && v.age >= 16);

  console.log(`\n=== Evening ${eveningNum} — ${goers.length} villagers at the tavern ===`);

  if (goers.length < 2 || actors.length === 0) {
    console.log('  (Too quiet tonight.)');
    timestamp += 24;
    return;
  }

  // Register/update ALL alive villagers so location filtering works
  for (const v of alive) {
    registerVillager(v, alive, tavernSet.has(v.id));
  }
  entities[TAVERN_UID] = { entityType: EntityType.Location, id: TAVERN_UID, name: 'The Tavern' };
  entities[HOME_UID]   = { entityType: EntityType.Location, id: HOME_UID,   name: 'Home' };

  const actionsBefore = actionUIDs.length;
  const stepsPerEvening = 10;
  const ticksPerStep = 1;

  // Run exactly 10 high-fidelity Viv micro-steps inside this one low-fidelity evening.
  // Every attendee gets one action attempt on each tick.
  for (let step = 0; step < stepsPerEvening; step++) {
    for (const actor of actors) {
      try {
        await selectAction({
          initiatorID: toUID(actor),
        });
      } catch {
        // No eligible action for this actor on this micro-step.
      }
    }
    timestamp += ticksPerStep;
  }

  // Report new actions
  const newActionIDs = actionUIDs.slice(actionsBefore);
  let quietCount = 0;
  const nightlyActionNames = new Map<number, string[]>();

  for (const actionID of newActionIDs) {
    const action = entities[actionID] as unknown as ActionView;
    if (!action) continue;

    const text = action.report ?? action.gloss ?? '(no description)';
    console.log(`  ${text}`);
    const actorId = typeof action.initiator === 'string' && action.initiator.startsWith('v-')
      ? fromUID(action.initiator)
      : null;
    if (actorId !== null) {
      const actionNames = nightlyActionNames.get(actorId) ?? [];
      actionNames.push(action.name);
      nightlyActionNames.set(actorId, actionNames);
    }
    state.log.push({
      year: state.year,
      day: state.day - 1,
      season: state.season,
      text,
      type: 'social',
    });

    // Record job leads on recipient villagers
    if (action.name === 'share-job-tip') {
      const fromV = alive.find(v => toUID(v) === action.initiator);
      const toUIDs = action.recipients ?? [];
      if (fromV && toUIDs.length > 0) {
        const toV = alive.find(v => toUID(v) === toUIDs[0]);
        if (toV) {
          const dup = toV.jobLeads.some(l => l.fromId === fromV.id && l.occupation === fromV.occupation);
          if (!dup) {
            toV.jobLeads.push({
              fromId:     fromV.id,
              occupation: fromV.occupation,
              note:       `${fromV.name} said there is work in the ${fromV.occupation} trade.`,
            });
          }
        }
      }
    }
  }

  for (const v of alive) {
    v.lastTavernActions = nightlyActionNames.get(v.id) ?? [];
  }

  const quietVillagers = actors.filter(v => {
    return !newActionIDs.some(id => {
      const a = entities[id] as unknown as ActionView;
      return a?.initiator === toUID(v);
    });
  });
  for (const v of quietVillagers) {
    quietCount++;
    if (quietCount <= 2) console.log(`  ${v.name} nurses their drink quietly.`);
  }
  if (quietCount > 2) console.log(`  (${quietCount - 2} others sit quietly too.)`);

  // Sync Viv entity views back to Villager objects
  for (const v of alive) syncBack(v);
}

// ─── Print final social state ─────────────────────────────────────────────────
function printSocialSummary(villagers: Villager[]): void {
  const alive = villagers.filter(v => v.alive);

  console.log('\n\n════════════════════════════════════════════════');
  console.log('  Social Summary After Tavern Simulation');
  console.log('════════════════════════════════════════════════\n');

  // ── Top friendships
  const friendPairs: Array<{ a: Villager; b: Villager; score: number }> = [];
  for (const v of alive) {
    for (const [idStr, score] of Object.entries(v.friendships)) {
      const id = parseInt(idStr, 10);
      if (id > v.id) {
        const other = alive.find(x => x.id === id);
        if (other && (score as number) > 0) {
          friendPairs.push({ a: v, b: other, score: score as number });
        }
      }
    }
  }
  friendPairs.sort((a, b) => b.score - a.score);

  console.log('Top Friendships:');
  if (friendPairs.length === 0) {
    console.log('  None formed.');
  } else {
    for (const { a, b, score } of friendPairs.slice(0, 8)) {
      const bar = '█'.repeat(Math.floor(score / 10));
      console.log(`  ${a.name} ↔ ${b.name}  ${bar}  (${score.toFixed(0)} pts)`);
    }
  }

  // ── Romantic interests
  console.log('\nRomantic Interests:');
  let romCount = 0;
  for (const v of alive) {
    if (v.romanticInterest !== null) {
      const target = alive.find(x => x.id === v.romanticInterest);
      if (target) {
        const aff = (v.romanticAffection[target.id] ?? 0).toFixed(0);
        const mutual = target.romanticInterest === v.id ? ' ♥ mutual' : '';
        console.log(`  ${v.name} → ${target.name}  (affection: ${aff})${mutual}`);
        romCount++;
      }
    }
  }
  if (romCount === 0) console.log('  None declared yet.');

  // ── Job leads
  console.log('\nJob Leads Shared:');
  let leadCount = 0;
  for (const v of alive) {
    for (const lead of v.jobLeads) {
      const mentor = alive.find(x => x.id === lead.fromId);
      console.log(`  ${v.name} heard of ${lead.occupation} work from ${mentor?.name ?? 'someone'}`);
      leadCount++;
    }
  }
  if (leadCount === 0) console.log('  None shared.');

  // ── Active feuds (deduplicated pairs)
  console.log('\nOngoing Feuds:');
  const feudSeen = new Set<string>();
  let feudCount = 0;
  for (const v of alive) {
    for (const [idStr, q] of Object.entries(v.quarreled)) {
      if (!q) continue;
      const id = parseInt(idStr, 10);
      const pairKey = [v.id, id].sort((a, b) => a - b).join('-');
      if (feudSeen.has(pairKey)) continue;
      feudSeen.add(pairKey);
      const other = alive.find(x => x.id === id);
      if (other) {
        console.log(`  ${v.name} ✗ ${other.name}`);
        feudCount++;
      }
    }
  }
  if (feudCount === 0) console.log('  No active feuds.');

  // ── Most reputable
  console.log('\nMost Reputable Villagers:');
  const byRep = [...alive].sort((a, b) => b.reputation - a.reputation);
  for (const v of byRep.slice(0, 5)) {
    console.log(`  ${v.name} (${v.occupation}):  reputation ${v.reputation.toFixed(0)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const state = createVillage();
  let seededSocialState = false;

  console.log('╔══════════════════════════════════════╗');
  console.log('║   Viv Village — Tavern Simulation    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Starting population: ${state.villagers.filter(v => v.alive).length}`);
  console.log(`Days: ${options.days}`);
  console.log(`Actions available: chat, deep-talk, flirt, declare-affection,`);
  console.log(`  buy-a-round, share-gossip, confide, share-job-tip,`);
  console.log(`  offer-mentorship, toast-the-village, quarrel, reconcile`);

  initializeVivRuntime({ contentBundle: TAVERN_BUNDLE, adapter: ADAPTER });

  for (let day = 1; day <= options.days; day++) {
    simulateDay(state);

    const alive = state.villagers.filter(v => v.alive);
    if (!seededSocialState) {
      for (const v of alive) {
        for (const o of alive) {
          if (o.id === v.id) continue;
          v.friendships[o.id] = v.friendships[o.id] ?? Math.floor(Math.random() * 6);
          if (v.romanticAffection[o.id] === undefined && Math.random() < 0.15) {
            v.romanticAffection[o.id] = Math.floor(Math.random() * 8 + 3);
          }
        }
        if (v.gossipKnows.length === 0 && Math.random() < 0.4) {
          v.gossipKnows.push('local rumor');
        }
      }
      seededSocialState = true;
    }

    console.log(`\nDay ${day}: Year ${state.year}, day ${state.day - 1}, ${state.season}`);
    await runEvening(state, state.villagers, day);
  }

  printSocialSummary(state.villagers);

  if (options.snapshotPath) {
    saveSnapshot(options.snapshotPath);
    console.log(`\nSnapshot written to ${options.snapshotPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
