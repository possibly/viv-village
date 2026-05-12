/**
 * Viv-powered tavern social simulation.
 * Runs 10 evenings; villagers form friendships, fall in love, share job leads, quarrel, and reconcile.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
import { tavernChance } from './villager.js';
import type { Villager } from './types.js';

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
  villagers: Villager[],
  eveningNum: number,
): Promise<void> {
  const alive = villagers.filter(v => v.alive);

  // Decide who visits the tavern tonight
  const tavernSet = new Set<number>();
  for (const v of alive) {
    if (v.occupation === 'innkeeper') {
      tavernSet.add(v.id);
      v.activity = 'working';
      continue;
    }
    const p = tavernChance(v);
    if (Math.random() < p) {
      const cost = 1 + Math.floor(Math.random() * 2);
      if (v.wealth >= cost) {
        v.wealth -= cost;
        // Don't pre-reduce socialNeed — Viv actions (chat, gossip, confide) handle it
        v.activity = 'at_tavern';
        tavernSet.add(v.id);
      }
    }
  }

  const goers = alive.filter(v => tavernSet.has(v.id));
  const actors = goers.filter(v => v.occupation !== 'innkeeper');

  console.log(`\n=== Evening ${eveningNum} — ${goers.length} villagers at the tavern ===`);

  if (goers.length < 2) {
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

  // Each actor takes one action via the selector
  for (const v of actors) {
    try {
      await selectAction({
        initiatorID:    toUID(v),
        actionSelector: 'pick-evening-action',
      });
    } catch {
      // No eligible action — villager has a quiet drink
    }
  }

  // Report new actions
  const newActionIDs = actionUIDs.slice(actionsBefore);
  let quietCount = 0;

  for (const actionID of newActionIDs) {
    const action = entities[actionID] as unknown as ActionView;
    if (!action) continue;

    const text = action.report ?? action.gloss ?? '(no description)';
    console.log(`  ${text}`);

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

  timestamp += 24;
}

// ─── Print final social state ─────────────────────────────────────────────────
function printSocialSummary(villagers: Villager[]): void {
  const alive = villagers.filter(v => v.alive);

  console.log('\n\n════════════════════════════════════════════════');
  console.log('  Social Summary After 10 Evenings at the Tavern');
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
  const state = createVillage();

  // Advance a week so food/work systems are running
  for (let d = 0; d < 7; d++) simulateDay(state);

  const alive = state.villagers.filter(v => v.alive);

  // Seed small acquaintance scores — villagers know each other from daily life
  for (const v of alive) {
    for (const o of alive) {
      if (o.id !== v.id) {
        v.friendships[o.id] = Math.floor(Math.random() * 6); // 0–5 starting acquaintance
        // Seed initial romantic attraction for ~15% of pairs (pre-existing crushes)
        if (Math.random() < 0.15) {
          v.romanticAffection[o.id] = Math.floor(Math.random() * 8 + 3); // 3–10
        }
      }
    }
  }

  // Sprinkle a bit of initial gossip so share-gossip fires occasionally
  for (const v of alive) {
    if (Math.random() < 0.4) v.gossipKnows.push('local rumor');
  }

  console.log('╔══════════════════════════════════════╗');
  console.log('║   Viv Village — Tavern Simulation    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Population: ${alive.length}  |  Season: ${state.season}  |  Year ${state.year}`);
  console.log(`Actions available: chat, deep-talk, flirt, declare-affection,`);
  console.log(`  buy-a-round, share-gossip, confide, share-job-tip,`);
  console.log(`  offer-mentorship, toast-the-village, quarrel, reconcile`);

  initializeVivRuntime({ contentBundle: TAVERN_BUNDLE, adapter: ADAPTER });

  for (let evening = 1; evening <= 10; evening++) {
    await runEvening(state.villagers, evening);
  }

  printSocialSummary(state.villagers);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
