export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Gender = 'male' | 'female';

export type Occupation =
  | 'farmer'
  | 'blacksmith'
  | 'carpenter'
  | 'miller'
  | 'baker'
  | 'priest'
  | 'innkeeper'
  | 'merchant'
  | 'herbalist'
  | 'peasant';

export type Activity =
  | 'sleeping'
  | 'working'
  | 'resting'
  | 'at_tavern'
  | 'praying'
  | 'trading'
  | 'farming'
  | 'ill';

export type Personality = {
  sociable: number;   // 0–1
  hardworking: number;
  pious: number;
  thrifty: number;
};

export interface WorkResult {
  grain: number;
  bread: number;
  tools: number;
  healing: number;
  gold: number;
  tavernIncome: number;
}

export interface Villager {
  id: number;
  name: string;
  age: number;
  gender: Gender;
  occupation: Occupation;
  health: number;       // 0–100
  hunger: number;       // 0–100 (0 = full, 100 = starving)
  socialNeed: number;   // 0–100
  wealth: number;       // coins
  personality: Personality;
  spouseId: number | null;
  childrenIds: number[];
  activity: Activity;
  alive: boolean;
  daysMarried: number;
  daysIll: number;
  // social fields populated by tavern Viv sim
  friendships: Record<number, number>;   // villager id -> friendship score 0–100
  romanticInterest: number | null;       // id of the person they're attracted to
  romanticAffection: Record<number, number>; // id -> affection score 0–100
  jobLeads: { fromId: number; occupation: Occupation; note: string }[];
  reputation: number;   // 0–100, social standing
  secrets: string[];    // confided secrets they carry
  gossipKnows: string[]; // gossip they've heard
  quarreled: Record<number, boolean>; // id -> whether they've quarreled
  lastTavernActions: string[]; // viv action names from most recent evening
}

export interface VillageState {
  year: number;
  day: number;          // 1–365
  season: Season;
  grain: number;        // bushels
  bread: number;        // loaves
  tools: number;        // tool units
  treasury: number;     // village coin
  villagers: Villager[];
  nextId: number;
  log: LogEntry[];
  charts: ChartPoint[];
  tavernVisits: number; // this day
  fieldFertility: number; // 0.5–1.5
}

export interface LogEntry {
  year: number;
  day: number;
  season: Season;
  text: string;
  type: 'info' | 'event' | 'death' | 'birth' | 'marriage' | 'tavern' | 'social';
}

export interface ChartPoint {
  year: number;
  day: number;
  population: number;
  grain: number;
  avgHealth: number;
  avgWealth: number;
}
