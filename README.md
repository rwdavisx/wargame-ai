# Salerno '43 Digital

A browser version of GMT Games' **Salerno '43** for owners of the physical game, with a computer opponent. You can play either side against the built-in AI, let Claude command the other side, play hot-seat, or watch two AIs play each other.

This is a personal play aid. It contains no GMT artwork or rulebook text. The map is an original rendering of hex data transcribed from photos of the owner's map, and you need your own copy of the game for the actual rules and counters.

## Running it

```bash
npm install
npm run dev        # open the printed URL (usually http://localhost:5173)
npm test           # engine and AI tests
npm run build      # static build in dist/ (open with any static web server)
npm run selfplay -- campaign 1 3   # three AI-vs-AI games from the command line
```

The game autosaves in your browser after every action. You can export and import save files from the **Setup** tab.

## Playing

- **Setup tab:** choose who controls each side: Human, Computer (the built-in AI) or Claude. The default is you as the Allies against the computer as the Germans. Start the Campaign Game (22 turns) or the Invasion Scenario (8 turns) here.
- **Each game turn:** weather, then the Allied player turn, then the German player turn. Each player turn has initial, movement, combat, recovery and supply phases, and the Allied turn ends with a victory check. Phases that need no decisions run automatically.
- **Initial phase:** spend replacement steps and resupply fired artillery (ASUs) with supply points.
- **Movement phase:** click a unit, then a highlighted hex. Green hexes let the unit continue; orange hexes are in an enemy zone of control, where it must stop. The numbers show MP used. Reserve and reinforcement units are listed under **Waiting to enter**: click one, then a blue landing or entry hex. Switch to strategic movement for roads-only double movement. **Undo** works for moves made this phase.
- **Combat phase:** click a red-tinted enemy hex. Pick attackers and support (air, naval gunfire, artillery), check the odds and column shifts, then click **Attack!**. If the defenders leave the hex, choose whether to advance into it.
- **Map:** drag to pan, scroll or use the buttons to zoom, and hover a hex for details. **Aa** toggles labels.

## The AI opponents

- **Built-in AI** (`src/ai/heuristic.ts`): plans coordinated assaults on targets where it can reach good odds, scores positions by objectives, terrain, threat and supply, and picks attacks by expected step-loss exchange. The Germans counterattack hard in the early turns and turn defensive later; the Allies build up and then push. It is quick and plays either side.
- **Claude** (`src/ai/claude.ts`): Claude acts as commander. Each movement phase it gets a situation report and returns a target hex for each unit. Each combat phase it picks from the legal attack options and their odds. The engine turns those orders into legal moves, so an illegal order can't break the game. Replacements, advances and any API failure fall back to the built-in AI. Paste an Anthropic API key in **Setup**. The key stays in your browser's local storage and is sent only to `api.anthropic.com`. The default model is Claude Opus 5.5, and refusals fall back automatically on the server.

## What's accurate and what's provisional

The build environment couldn't reach gmtgames.com or other game sites, so the rulebook, counter manifest, set-up cards and player-aid tables couldn't be downloaded. What came from where:

| Area | Source | Status |
|---|---|---|
| Map: 851 hexes of terrain, rivers, mountain hexsides, passes, roads, cities, towns, ports, VP hexes, beaches, entry areas, 8th Army sector | Your six map photos, calibrated to the hex grid and classified per hex, with roads traced by hand | Transcribed; check it against your map (see below) |
| Turn record track, weather table, supply points, replacement schedule, VP benchmarks, map notes (turn 1 half MA, 8th Army road cost, Salerno port bonus) | The map sheet | Taken from the map |
| Sequence of play | The map sheet | Taken from the map |
| Combat results table, column shifts, movement costs, zone-of-control, supply and retreat rules | Stand-ins modelled on the game system | **Provisional**: `data/rules.json` |
| Order of battle: units, strengths, set-up hexes, arrival turns | Historical OOB, with beaches and entry areas from the map | **Provisional**: `data/oob.json` |
| Victory: Allied VP vs the benchmark at game end (sudden death optional) | Benchmarks from the map; how they're applied is a guess | **Provisional**: `data/rules.json` → `victory` |

To make the game match your copy:

1. **Rules tables:** edit `data/rules.json` (CRT, shifts, terrain costs, stacking, supply ranges). The in-game **Tables** tab shows the current values.
2. **Counters and set-up:** edit `data/oob.json`. Each unit has a template (step values as `[attack, defense, move]`, full strength first), a `start` (`hex`, `beach` or `reserve`) or an `arrive` (`turn` and `at`: `reserve`, `airdrop`, `hex:XXXX`, or an entry area such as `N1` or `S2`).
3. **Map fixes:** open **Setup → Map editor** and click any hex to change its terrain, city, VP, port and its six hexsides (river, mountain, pass, road). Edits apply immediately and persist in the browser. **Export map.json** to save them into `data/map.json` for good.

Photos of the counter sheet, the set-up cards and the player-aid cards would let the provisional values be replaced with the real ones.

### Known map uncertainties

- **Minor roads** were detected automatically, so some are missing or extra. Major roads were traced by hand.
- **Mountain hexsides** are hexsides crossing the map's dark mountain shading, detected by colour. Mountain passes are the seven `)(` symbols.
- Coastal hexes whose centre falls in the sea but which contain land (the beach hexes 2709–2712 and 2614–2618) are treated as clear land.
- The exact hexes of the north, east and south entry areas, and the 8th Army sector boundary line, are approximate.

## Project layout

```
data/          map.json (transcribed map), rules.json, oob.json
src/engine/    rules engine: hex grid, movement, combat, supply, phases, victory
src/ai/        built-in heuristic AI, Claude AI, self-play
src/ui/        React UI: SVG map, counters, sidebar, map editor
scripts/       command-line self-play and game logs
tests/         vitest tests for the engine and the AI
tools/map-transcription/   Python scripts used to turn the photos into map.json
```
