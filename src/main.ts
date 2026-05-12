import './style.css';
import { createVillage, simulateDay } from './simulation';
import { renderAll } from './renderer';
import type { VillageState } from './types';

let state: VillageState;
let intervalId: number | null = null;
let speed = 150;
let running = false;
let currentDay = 0;
const MAX_DAYS = 5 * 365;

function init() {
  state = createVillage();
  currentDay = 0;
  renderAll(state);
  updateButtons();
  document.getElementById('status')!.textContent = 'Ready — press Start.';
}

function step() {
  if (currentDay >= MAX_DAYS) {
    stop();
    document.getElementById('status')!.textContent = '5 years complete.';
    return;
  }
  simulateDay(state);
  currentDay++;
  renderAll(state);
  const pct = ((currentDay / MAX_DAYS) * 100).toFixed(1);
  document.getElementById('status')!.textContent =
    `Day ${currentDay} / ${MAX_DAYS} (${pct}%)`;
}

function start() {
  if (running) return;
  running = true;
  intervalId = setInterval(step, speed) as unknown as number;
  updateButtons();
}

function stop() {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
  running = false;
  updateButtons();
}

function updateButtons() {
  (document.getElementById('btn-start') as HTMLButtonElement).disabled = running;
  (document.getElementById('btn-stop') as HTMLButtonElement).disabled = !running;
}

(window as any).simStart  = start;
(window as any).simStop   = stop;
(window as any).simStep   = step;
(window as any).simReset  = () => { stop(); init(); };
(window as any).setSpeed  = (ms: number) => { speed = ms; if (running) { stop(); start(); } };

init();
