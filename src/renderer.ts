import type { VillageState, Villager } from './types';

const SEASON_EMOJI: Record<string, string> = {
  spring: '🌱', summer: '☀️', autumn: '🍂', winter: '❄️',
};

export function renderAll(state: VillageState) {
  renderStats(state);
  renderLog(state);
  renderVillagers(state);
  renderChart(state);
}

function el(id: string) { return document.getElementById(id)!; }

function renderStats(s: VillageState) {
  const alive = s.villagers.filter(v => v.alive);
  const pop = alive.length;
  const avgHealth = (alive.reduce((a, v) => a + v.health, 0) / (pop || 1)).toFixed(0);
  const avgHunger = (alive.reduce((a, v) => a + v.hunger, 0) / (pop || 1)).toFixed(0);
  const ill = alive.filter(v => v.daysIll > 0).length;
  const atTavern = alive.filter(v => v.activity === 'at_tavern').length;

  el('stat-year').textContent = `Year ${s.year}, Day ${s.day}`;
  el('stat-season').textContent = `${SEASON_EMOJI[s.season]} ${s.season.charAt(0).toUpperCase() + s.season.slice(1)}`;
  el('stat-pop').textContent = `${pop}`;
  el('stat-grain').textContent = `${s.grain.toFixed(0)} bu`;
  el('stat-bread').textContent = `${s.bread.toFixed(0)} loaves`;
  el('stat-tools').textContent = `${s.tools.toFixed(0)}`;
  el('stat-treasury').textContent = `${s.treasury.toFixed(0)} coins`;
  el('stat-health').textContent = `${avgHealth}%`;
  el('stat-hunger').textContent = `${avgHunger}%`;
  el('stat-ill').textContent = `${ill}`;
  el('stat-tavern').textContent = `${atTavern} tonight`;
}

function renderLog(s: VillageState) {
  const container = el('log');
  const recent = s.log.slice(-120).reverse();
  container.innerHTML = recent.map(entry => {
    const cls = `log-${entry.type}`;
    const label = `[Yr${entry.year} ${entry.season.slice(0,3).toUpperCase()} d${entry.day}]`;
    return `<div class="log-entry ${cls}"><span class="log-label">${label}</span> ${entry.text}</div>`;
  }).join('');
}

function renderVillagers(s: VillageState) {
  const alive = s.villagers.filter(v => v.alive);
  const container = el('villagers');
  container.innerHTML = alive.map(v => villagerCard(v)).join('');
  const vc = document.getElementById('vcount');
  if (vc) vc.textContent = `(${alive.length})`;
}

function villagerCard(v: Villager): string {
  const actIcon: Record<string, string> = {
    sleeping: '😴', working: '⚒️', resting: '🏠', at_tavern: '🍺',
    praying: '🙏', trading: '💰', farming: '🌾', ill: '🤒',
  };
  const icon = actIcon[v.activity] ?? '•';
  const healthBar = bar(v.health, '#4caf50');
  const hungerBar = bar(100 - v.hunger, '#ff9800');
  const married = v.spouseId ? ' ♥' : '';
  const children = v.childrenIds.length > 0 ? ` (${v.childrenIds.length} ch.)` : '';
  return `
    <div class="vcard ${v.activity === 'at_tavern' ? 'vcard--tavern' : ''} ${v.daysIll > 0 ? 'vcard--ill' : ''}">
      <div class="vcard-top">
        <span class="vcard-icon">${icon}</span>
        <span class="vcard-name">${v.name}${married}</span>
        <span class="vcard-occ">${v.occupation}</span>
      </div>
      <div class="vcard-meta">${Math.floor(v.age)}y${children} · ${v.wealth.toFixed(0)}c</div>
      <div class="vcard-bars">
        ${healthBar}
        ${hungerBar}
      </div>
    </div>`;
}

function bar(pct: number, color: string): string {
  const w = Math.max(0, Math.min(100, pct)).toFixed(0);
  return `<div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
}

export function renderChart(s: VillageState) {
  const canvas = document.getElementById('chart') as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const pts = s.charts;
  if (pts.length < 2) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const maxPop = Math.max(...pts.map(p => p.population), 1);
  const maxGrain = Math.max(...pts.map(p => p.grain), 1);

  function xOf(i: number) { return (i / (pts.length - 1)) * W; }
  function yOfPop(p: number) { return H - (p / maxPop) * (H - 10) - 5; }
  function yOfGrain(g: number) { return H - (g / maxGrain) * (H - 10) - 5; }

  // grain line
  ctx.beginPath();
  ctx.strokeStyle = '#c8a84b';
  ctx.lineWidth = 1.5;
  pts.forEach((p, i) => {
    i === 0 ? ctx.moveTo(xOf(i), yOfGrain(p.grain)) : ctx.lineTo(xOf(i), yOfGrain(p.grain));
  });
  ctx.stroke();

  // population line
  ctx.beginPath();
  ctx.strokeStyle = '#4caf50';
  ctx.lineWidth = 2;
  pts.forEach((p, i) => {
    i === 0 ? ctx.moveTo(xOf(i), yOfPop(p.population)) : ctx.lineTo(xOf(i), yOfPop(p.population));
  });
  ctx.stroke();

  // legend
  ctx.font = '11px monospace';
  ctx.fillStyle = '#4caf50';
  ctx.fillText(`Pop: ${pts[pts.length-1].population}`, 6, 16);
  ctx.fillStyle = '#c8a84b';
  ctx.fillText(`Grain: ${pts[pts.length-1].grain.toFixed(0)}`, 6, 30);
}
