# Salerno '43 Digital

A browser version of GMT Games' **Salerno '43** for owners of the physical game, with a computer opponent. You can play either side against the built-in AI, let Claude command the other side, play hot-seat, or watch two AIs play each other.

This is a personal play aid. It contains no GMT artwork or rulebook text. The map is an original rendering of hex data transcribed from photos of the owner's map, the tables and set-up come from the owner's player aids, and the rules are implemented in the program's own code. You need your own copy of the game for the rulebook and counters.

## Running it

```bash
npm install
npm run dev        # open the printed URL (usually http://localhost:5173)
npm test           # engine and AI tests
npm run build      # static build in dist/ (open with any static web server)
npm run selfplay -- short 1 3      # three AI-vs-AI games from the command line
```

The game autosaves in your browser after every action. You can export and import save files from the **Setup** tab.

## Playing

- **Setup tab:** choose who controls each side: Human, Computer (the built-in AI) or Claude. The default is you as the Allies against the computer as the Germans. Start the Campaign Game (22 turns) or the Avalanche Scenario (8 turns) here, with or without the optional rules 25.2 (Reconnaissance units) and 25.3 (Limited supply from ports). Each side's standing order for defensive air support is set here too.
- **Turn 1:** the Invasion phase lands the Allied assault waves automatically (each beach gets its invasion roll; see the log). Units that may still advance can move tactically, and the Commandos at Vietri may attack Salerno. Then the German player turn (half movement), then the Allied player turn, when the follow-up wave lands.
- **Later turns:** weather, the German player turn, the Allied player turn, then the victory check. Each player turn has initial, movement, combat, recovery and supply phases. Phases that need no decisions run automatically.
- **Initial phase:** drop airborne units (select one, click a blue hex), spend replacements (they are lost if unused; eliminated units come back in the Floating Reserve, a friendly Entry Area, or a supplied hex with their division or corps ASU; 3-step units come back as their Remnant), and ready fired artillery with supply points. From turn 16 the German player may declare the abandonment of the 8th Army sector, which happens in the Supply Phase.
- **Movement phase:** click a unit, then a highlighted hex. Green hexes let the unit continue; orange hexes are where it must stop. Pick **Normal**, **Extended** (+3 MP, never into an enemy zone of control), **Tactical** (one or two hexes, the only way across some mountain and river hexsides) or, for the Germans, **Truck** and **Truck + Ext**. The Allied floating reserve and follow-up wave are under **Waiting to enter**: click one, then a blue beach or port hex (landing points and port capacity are tracked; orange means the hex would be overstacked). A 2 or 3 LP unit can reach a capacity-1 port in two turns. A unit on a beachhead or port can go **By sea** to another one (up to 3 LP a turn) or back to the Floating Reserve. Units on an edge hex or in an entry area can move between entry areas. **Full Retreat** and **Auto DS** (click a red enemy hex, 10-1 or better) are here too. **Undo** works for moves made this phase. Stacking is checked when the phase ends.
- **Combat phase:** click a red-tinted enemy hex. Tick the attackers (units in an Entry Area that did not move may attack the map hexes next to it), pick the Main Assault Force if more than one division is involved, add support (air, naval gunfire, Valiant/Warspite, artillery), check the odds and column shifts, then click **Attack!**. To advance, tick units and click a purple hex. Select one of your hexes next to the enemy to **Disengage**.
- **Breakthrough Combat:** when an attack earns an advance of 2 or more, tick units and **Form group** (in the vacated hex, or with the ticked stack). The group spends its advance hex by hex: click purple hexes to move or red hexes to attack again (no artillery, air or naval support). A won breakthrough lets it enter the attacked hex for free; only DR4 and DS let it keep going. The other attackers advance afterwards.
- **Defending:** when your units get a retreat result you choose **Retreat** or **Determined Defense**, with defensive support, what to prefer when the result offers Hold or Delay, and how far to fall back on a Delay, even during the computer's turn.
- **Retreats:** the program proposes the best retreat under the retreat priorities. When you are human and other destinations are equally legal, you are asked to keep it or click another blue hex.
- **Map:** drag to pan, scroll or use the buttons to zoom, and hover a hex for details. **Aa** toggles labels.

## The AI opponents

- **Built-in AI** (`src/ai/heuristic.ts`): plans coordinated assaults on targets where it can reach good odds, scores positions by objectives, terrain, threat, supply and beachhead security, and picks attacks by expected step-loss exchange. It also makes the Determined Defense and advance decisions. The Germans counterattack hard in the early turns and turn defensive later; the Allies build up and then push. It plays either side.
- **Claude** (`src/ai/claude.ts`): Claude acts as commander. Each movement phase it gets a situation report and returns a target hex for each unit. Each combat phase it picks from the legal attack options and their odds. The engine turns those orders into legal moves, so an illegal order can't break the game. The invasion and initial phases, defense choices, advances and any API failure fall back to the built-in AI. Paste an Anthropic API key in **Setup**. The key stays in your browser's local storage and is sent only to `api.anthropic.com`. The default model is Claude Opus 5.5, and refusals fall back automatically on the server.

The built-in AI also forms Breakthrough Groups and answers the defender's decisions. In AI-vs-AI testing the Germans win most games (the Allies win about 3 in 10 Avalanche games and fewer campaigns), so as the German player expect an easier opponent than as the Allies. The Allied AI gets bolder when it falls behind the VP benchmark.

## Sources and accuracy

| Area | Source |
|---|---|
| Map: 851 hexes of terrain, rivers, mountain hexsides, passes, roads, cities, towns, ports, VP hexes, beaches, entry areas, 8th Army sector | Your six map photos, calibrated to the hex grid and classified per hex, with roads traced by hand |
| Combat results table, Determined Defense table, column shifts, terrain effects, invasion, airdrop, disengagement, isolation, rally, variable strength and landing-point tables | Your player-aid cards (`data/rules.json`) |
| Order of battle, set-up hexes, reinforcement schedule, replacements | Your two set-up cards (`data/oob.json`) |
| Sequence of play, movement modes, zones of control and bonds, Main Assault Force, retreats, Full Retreat, advance after combat, supply and isolation, landings, entry areas, 8th Army, victory | The living rules (August 2022), implemented in the program's own code |

The tables in `data/rules.json` are what the engine uses; the **Tables** tab shows them. Descriptions there are the program's own summaries, not rulebook text.

### Simplifications and assumptions

- **Reduced strengths:** until the counter backs are entered (see below), each lost step costs 2 attack and 2 defense, and a unit has as many steps as its stacking points (1 to 3). Silhouetted tanks, ASUs, beachheads, garrisons and remnants have one step.
- **Automatic choices:** which unit takes a step loss is picked by the program (the owner loses its least valuable step; a step the opponent chooses is the most valuable one). Supply points left over in the Supply Phase are spent on fired ASUs automatically. Defensive air support follows each side's standing order from Setup instead of being asked attack by attack.
- **Not included:** the Tournament set-up (S1.4), which needs the back of the Allied At Start card.
- Old saves from the earlier provisional version are ignored.

### Correcting the data

1. **Rules tables:** edit `data/rules.json`.
2. **Counters and set-up:** edit `data/oob.json`. Each unit has `a`, `d`, `m` (full strength), `sp`, a category (`cat`), a `start` (`hex`, `beach` or `followUp`) or an `arrive` (`turn` and `at`: `reserve`, `airdrop`, `hex:XXXX`, an edge `N`/`S`/`E` or an entry area such as `S2`).
3. **Counter backs:** add `"back": "a-d-m"` to a unit for the values on the reverse of its counter (a 3-step unit then becomes its Remnant after the second loss), or `"back": "none"` for a counter with a single step. Units without `back` keep the estimate above.
4. **Map fixes:** open **Setup → Map editor** and click any hex to change its terrain, city, VP, port and its six hexsides (river, mountain, pass, road). Edits apply immediately and persist in the browser. **Export map.json** to save them into `data/map.json` for good.

### Known map uncertainties

- **Minor roads** were detected automatically, so some are missing or extra. Major roads were traced by hand.
- **Mountain hexsides** are hexsides crossing the map's dark mountain shading, detected by colour. Mountain passes are the seven `)(` symbols.
- Coastal hexes whose centre falls in the sea but which contain land (the beach hexes 2709–2712 and 2614–2618) are treated as clear land.
- The exact hexes of the north, east and south entry areas, and the 8th Army sector boundary line, are approximate.

## Project layout

```
data/          map.json (transcribed map), rules.json, oob.json
src/engine/    rules engine: hex grid, movement, ZOC bonds, combat, breakthroughs, retreats, supply, phases, victory
src/ai/        built-in heuristic AI, Claude AI, self-play
src/ui/        React UI: SVG map, counters, sidebar, map editor
scripts/       command-line self-play and game logs
tests/         vitest tests for the engine and the AI
tools/map-transcription/   Python scripts used to turn the photos into map.json
```
