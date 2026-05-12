# Medieval Village Simulator

A TypeScript simulation of a medieval English village over five years (~100 inhabitants). Draws on historical patterns while keeping mechanics simple enough to run in a browser.

---

## What it models

### Population & demographics
- Starting village of ~100 people with a realistic age distribution (children, adults, elders)
- Births from married women of childbearing age, weighted by health
- Deaths from starvation, illness, old age, or critically poor health
- Marriages between eligible singles; widows/widowers remarry
- Children grow up and take an occupation at age 12

### Occupations
| Occupation | Primary output |
|---|---|
| Farmer | Grain (seasonal) |
| Miller | Converts grain → flour for bakers |
| Baker | Converts flour → bread |
| Blacksmith | Tools |
| Carpenter | Tools |
| Merchant | Village treasury income |
| Innkeeper | Runs the tavern; earns from visitors |
| Herbalist | Heals ill villagers |
| Priest | Community morale |
| Peasant | General labour |

Output scales with each worker's `hardworking` personality trait and current health.

### Seasons
| Season | Effect |
|---|---|
| Spring | 80% farm output (planting) |
| Summer | 100% farm output |
| Autumn | 120% farm output (harvest) |
| Winter | Near-zero farming; stored food is critical |

Annual field fertility varies randomly (0.7–1.5×), creating year-to-year harvest variance.

### Daily cycle
1. **Morning** — hunger accumulates for every villager
2. **Feeding** — village distributes bread first, then raw grain
3. **Work** — each villager produces according to occupation, health, season, and personality
4. **Mill → Bake chain** — millers convert grain to flour; bakers multiply it into bread
5. **Evening** — each villager independently decides whether to go to the tavern
6. **Health tick** — starvation and illness reduce health; well-fed villagers slowly recover

### Tavern decisions
Each evening, a villager weighs:
- Current `socialNeed` (builds daily, reset by a visit)
- `sociable` personality trait
- `thrifty` personality trait (discourages spending)
- Available coin (can't go broke)
- Health (ill villagers stay home)
- Priests go rarely; innkeepers run the place, not visit it

### Random events (~every 30 days)
- Disease outbreaks affecting multiple villagers
- Rat infestations destroying grain
- Tax collectors taking from the treasury
- Field blight reducing fertility
- Workshop accidents injuring craftsmen
- Traveling merchants bringing extra grain
- Charitable donations of bread
- Wandering minstrels at the tavern

### Villager personality
Each villager has four traits (0–1):
- `sociable` — tavern attendance, social need decay rate
- `hardworking` — work output multiplier
- `pious` — reduces tavern visits
- `thrifty` — resists spending at the tavern

---

## Data structures

```
VillageState
  villagers[]     — all ever-born villagers (alive flag)
  grain           — bushels in store
  bread           — loaves in store
  tools           — tool units
  treasury        — village coin
  fieldFertility  — current year multiplier
  log[]           — full chronicle (type: info | event | birth | death | marriage | tavern)
  charts[]        — snapshots every 10 days (population, grain, avgHealth, avgWealth)
```

---

## Running

```bash
npm install
npm run dev     # Vite dev server; output in browser console
npm run build   # Production bundle
```
