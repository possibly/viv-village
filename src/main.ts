import { createVillage, simulateDay } from './simulation';

const state = createVillage();
const DAYS = 5 * 365;

for (let i = 0; i < DAYS; i++) {
  simulateDay(state);
}

const alive = state.villagers.filter(v => v.alive);
const avgHealth = (alive.reduce((s, v) => s + v.health, 0) / alive.length).toFixed(1);
const avgWealth = (alive.reduce((s, v) => s + v.wealth, 0) / alive.length).toFixed(1);
const births  = state.log.filter(e => e.type === 'birth').length;
const deaths  = state.log.filter(e => e.type === 'death').length;
const marriages = state.log.filter(e => e.type === 'marriage').length;

console.log('=== 5-Year Summary ===');
console.log(`Population:  ${alive.length} (started ~100)`);
console.log(`Avg health:  ${avgHealth}`);
console.log(`Avg wealth:  ${avgWealth} coins`);
console.log(`Grain store: ${state.grain.toFixed(0)} bushels`);
console.log(`Births:      ${births}`);
console.log(`Deaths:      ${deaths}`);
console.log(`Marriages:   ${marriages}`);
console.log(`Events:      ${state.log.filter(e => e.type === 'event').length}`);
console.log('\nLast 10 chronicle entries:');
state.log.slice(-10).forEach(e => console.log(` [Yr${e.year} ${e.season}] ${e.text}`));
