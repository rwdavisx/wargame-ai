# Salerno '43 Digital

A browser version of GMT Games' **Salerno '43** for owners of the physical game, with a computer opponent. You can play either side against the built-in AI, let Claude command the other side, play hot-seat, or watch two AIs play each other.

This is a personal play aid. It contains no GMT artwork or rulebook text. The map is an original rendering of hex data transcribed from photos of the owner's map, the tables and set-up come from the owner's player aids, and the rules are implemented in the program's own code. You need your own copy of the game for the rulebook and counters.

![Opening Allied turn](docs/game.png)

## Running it

```bash
npm install
npm run dev        # open the printed URL (usually http://localhost:5173)
npm test           # engine and AI tests
npm run build      # static build in dist/ (open with any static web server)
npm run selfplay -- short 1 3      # three AI-vs-AI games from the command line
```

The first launch paints the map (a few seconds); the result is cached in the browser, so later launches start straight at the title screen. The game autosaves after every action and **Continue** on the title screen picks it up. Save files can be exported and imported from the pause menu (**Esc**).

### On your phone

1. On your computer, in the project folder, run:

   ```bash
   npm run phone
   ```

   It builds the game and prints two addresses. Use the **Network** one, for example `http://192.168.1.20:4173`.
2. Connect your phone to the same WiFi and open that address in Safari or Chrome.
3. Optional: use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android) to get a full-screen app icon.

If the phone can't connect, allow Node through your computer's firewall when asked (on Windows, choose Private networks). The computer must stay on while you play. Saves live on the phone, separate from the computer's browser. `npm run phone:dev` does the same with the development server, which reloads when the code changes.

On a touch screen:

- **Drag** to pan and **pinch** to zoom.
- **Tap** a unit to select it and see its details.
- **Tap a highlighted hex** to preview the route, then **tap it again** (or **Move here**) to carry out the move or advance. Cancel, or tap elsewhere, to back out.
- **Tap an enemy hex** to see the attack and its odds, then **tap it again** (or **Attack!**) to attack.
- The action bar along the bottom holds everything for the current step. **Details** opens the full orders sheet (replacements, artillery, choosing attackers); **▾ Close** lowers it again.

### With friends, online

The shared claude.ai page of the game can host online games, so friends can play from their own phones.

1. **Share the page.** In the page's **Share** menu on claude.ai, invite each friend by email as an **Editor** (and leave public link sharing off: only Editors and the owner can write to the shared game). Each friend needs a claude.ai account.
2. **Host.** Title screen → **Play with friends** → **Host a new game**. Choose **Versus** (you against a friend, one side each) or **Co-op** (you and a friend command the same side together against the computer, at the difficulty you pick), your side, the scenario, the start and the optional rules.
3. **Join.** The friend opens the same page, taps **Play with friends**, and taps **Join as …** on your game. Anyone else with access can **Watch**.

Every order goes to the shared game at once and plays out on the other screens at the computer's pace: the other player's attacks on your units open the battle panel so you watch their roll, their landing rolls appear on the landing panel, and you answer your own defence decisions and retreats. A badge under the top bar shows who else is here and whether your moves have reached the shared game. Leave whenever you like; **Play with friends → Resume** picks the game up again on any device. In co-op either partner may move any unit; if both act at the same moment, plain moves and orders are both kept when they still hold after the partner's; anything else (an attack, a phase end) is taken back with a message so it can be given again. The host's device runs the computer side, or the partner's while the host is away. Undo works for your own last move until someone acts after it.

The game is stored as its setup and the list of every action taken; the dice come from the game's seed, so each device replays the list to the same position (`src/net/`). Running the development server with `?fakenet=ann` in one tab and `?fakenet=bob` in another plays an online game between two tabs of one browser.

## Playing

### Starting an operation

1. **Title screen → New operation.** Pick the Avalanche Scenario (8 turns) or the Campaign Game (22 turns), then your role: the Allies, the Germans, both sides (hot-seat) or neither (watch the AIs fight). Choose the opponent (the built-in AI at Recruit, Regular, Veteran or Elite difficulty, or Claude with your API key) the start (**D-Day landings**, the standard start where the Allies roll for each beach, or **Allies already ashore**, the S1.4 tournament start where the Germans move first) and the optional rules 25.1 (Disengagement, on by default), 25.2 (Reconnaissance units) and 25.3 (Limited supply from ports).
2. **Briefing.** A short dispatch with your side's situation and objectives. Click **Begin** to go to the map.

### The screen

- **Top bar:** your side, the turn and date, the phases of the current player turn, the VP gauge against the turn's benchmark, the weather, supply points, support available and the sound, settings and menu buttons.
- **Action bar** (bottom): what to do now, and the buttons for it. With nothing selected it shows the phase, **Next unit** / **Next target**, **Land** for reserves, **Details**, **Undo** and **End phase** (which asks again if units have not moved or you have not attacked). With a unit selected it shows its movement modes; with an enemy hex selected, the attack odds, support toggles and **Attack!**.
- **Command panel** (right, collapsible; **Details** on phones): the **Orders** tab for the current phase, **Forces** (every unit, with waiting reinforcements), **Log** and **Rules** (the tables the engine uses).
- **Unit card** (bottom left): the selected unit with its strengths, steps, status and position. Click a stack on the map again to cycle through its units, or pick one from the card.
- **Minimap** (bottom): click or drag to jump around the map.
- **Event feed:** what just happened, in plain words, with an icon and colour for each kind of event (orange for combat, red for losses, amber for retreats, blue for landings and drops, green for reinforcements) and the units named in their side's colour. Click an entry with a hex to jump there. The **Log** tab keeps the whole game, grouped by turn and phase.
- **Battle panel:** every attack, yours or the computer's, opens it beside the map (on the right, or as a sheet along the bottom of a phone held upright). The camera frames the battle and marks the attacked hex and the attackers; you can still pan and zoom, and **▾ Map** (or **V**) folds the panel to a strip to look around. It shows both sides' counters, the odds column and the results the die can give, then steps through the battle: **Roll** (Space or Enter) and watch the die land, see the result explained, and, when the defender must give ground, the decision and the Determined Defense roll, then the losses on both sides. **Settings → Combat → Quick result only** skips the stepping and shows just the result card.
- **Since your last turn:** after the computer's turn a card lists what it did (moves, attacks, losses, captures); click a line to jump to it.
- **Map bar** (on the minimap; on phones, the layers button on the left opens it): one button per map mode, as in grand-strategy games, and switches for the map's layers: **Counters**, place **Names**, **Ports & VP** markers, the hex **Grid**, **Hex no.** (hex numbers, as the log gives them) and unit **Cues**. Hover a mode to read what it shows; ✕ hides the bar and the layers button brings it back.
- **Map modes** (map bar, or **M** / **Shift+M**): Normal, Supply (in, out of supply, isolated, supply sources), Control (ground held, the front line, VP hexes and the army boundary), Enemy threat (where the enemy can move and strike next turn, shaded by how much strength can arrive, with a chip on each of your stacks giving that strength against your defense), Zones of control, Support range (naval gunfire and artillery), Terrain (movement costs and hexsides) and Stacking. Each mode shows a legend.
- **An enemy unit's reach**: select an enemy unit to see where it can move on its next turn (dashed) and the hexes it could then attack.
- **Before you end a phase** (Settings → Display, on by default): the first press of End lists what you may regret (stacks over the limit, units that cannot trace supply, objectives left empty within the enemy's reach, and in the combat phase attacks at good odds not taken). Tap a line to see it on the map; press End again to end the phase anyway.
- **Turn alerts** in online games (Settings → Display): when the other player hands the game back, the phone buzzes (where the browser allows it), a bugle call sounds and the page title says so; in the lobby the games waiting on you are marked **Your move** and listed first.
- **Cues** (on by default; toggle in the map mode menu or Settings): a green marker on units that can still act this phase, the odds over enemy hexes you can attack, the movement left on units that have moved, and markers like the printed ones for disrupted, out of supply and full retreat.
- **Banners** announce each new phase and player turn. During the computer's turn the camera follows its moves (turn this off in Settings) and returns to your view afterwards.
- **Camera:** drag to pan, wheel, pinch or **+**/**−** to zoom, arrows or WASD to scroll. Next unit and Next target bring the camera to the unit.
- **Mouse and keyboard:** **left-click** selects a unit (again to cycle through a stack) or shows a hex and its units; it never moves or attacks. **Right-click** a highlighted hex to move, land, drop, advance or retreat there; right-click a red enemy hex to see the odds and right-click it again to attack. Right-click where there is nothing to do, or **Esc**, backs out of the current step; Esc with nothing selected opens the pause menu. The cursor shows what a right-click will do (move or attack). **Settings → Mouse controls → Left-click does everything** brings back the older scheme: left-click moves and attacks too, and right-click only backs out. **N** or **Tab**: next unit or target. **Z**: undo. **H**: Hold, the selected unit stands still for the rest of the phase. **F**: Sleep, it stays put on later turns too until you wake it, give it an order, or an enemy is next to it at the start of your movement phase (sleeping units show a Zz marker). The End button stays locked while any unit that can still move (in the movement phase) or attack (in the combat phase) has neither acted nor been told to hold or sleep; pressing it takes you to the next one waiting. **Space**: end the phase. **Enter**: confirm or attack. **1–5**: movement mode.

### Counters

Counters follow the printed ones: olive for the US, tan for the British, brown for the Canadians, grey for the Germans (blue-grey for Hermann Göring and the paratroopers), with a yellow band along the top of 8th Army units. The NATO box carries the division's colour and the unit type (X infantry, oval armour, oval and slash armoured recon, X with wheels motorized, X with oval mechanized, a canopy for airborne, E engineers, a dot for artillery). Above the box is the unit size (II, III, X, with (-) for detached parts), up the left side the unit's name, and beside it the black stacking-points box. Along the bottom: attack (with the tank rating raised), defense (in a red box for elite units) and movement; artillery reads S (defense) movement with its range in the circle. A flipped unit shows the white stripe of the printed back: thin on a 3-step unit's middle step, wide on a last step.

### Highlight colours

| Colour | Meaning |
|---|---|
| Blue | The unit can move here and continue, or land, drop or enter here |
| Amber | The unit can move here but must stop (or a landing would overstack) |
| Red | An enemy hex you can attack |
| Violet | A hex you can advance or break through into |
| Green | A retreat destination you can choose |

Hovering a destination draws the path the unit will take and its cost.

### Turn by turn

With a mouse, "right-click" below means the default controls; with **Left-click does everything** it is a left-click, and on a touch screen a tap on the hex and a second tap to confirm.

- **Turn 1:** the Invasion phase opens the landing panel: roll the Invasion table for each beach (or Roll all) and watch the assault units come ashore; the result (Adv 1 or 2, and a lost step at Uncle on 1-2) shows on the beach's row. The computer, when it commands the Allies, rolls its beaches one by one too. Units that may still advance can move tactically, and the Commandos at Vietri may attack Salerno. Then the German player turn (half movement), then the Allied player turn, when the follow-up wave lands.
- **Later turns:** weather, the German player turn, the Allied player turn, then the victory check. Each player turn has initial, movement, combat, recovery and supply phases. Phases that need no decisions run automatically.
- **Initial phase:** drop airborne units (select one, right-click a blue hex), spend replacements (they are lost if unused; eliminated units come back in the Floating Reserve, a friendly Entry Area, or a supplied hex with their division or corps ASU; 3-step units come back as their Remnant), and ready fired artillery with supply points. From turn 16 the German player may declare the abandonment of the 8th Army sector, which happens in the Supply Phase.
- **Movement phase:** click a unit (or **Next unit**), then right-click a highlighted hex. Pick, in the action bar, **Normal**, **Extended** (+3 MP, never into an enemy zone of control), **Tactical** (one or two hexes, the only way across some mountain and river hexsides) or, for the Germans, **Truck** and **Truck + Ext**. The Allied floating reserve and follow-up wave come in with **Land** in the action bar (or **Waiting to enter** under Details): pick one, then a blue beach or port hex (landing points and port capacity are tracked; amber means the hex would be overstacked). A 2 or 3 LP unit can reach a capacity-1 port in two turns. A unit on a beachhead or port can go **By sea** to another one (up to 3 LP a turn) or back to the Floating Reserve. Units on an edge hex or in an entry area can move between entry areas. **Full Retreat** and **Auto DS** (right-click a red enemy hex, 10-1 or better) are here too. **Undo** works for moves made this phase. Stacking is checked when the phase ends.
- **Combat phase:** right-click a red enemy hex (or **Next target**): every eligible unit attacks by default and the action bar shows the odds, with toggles for air, naval and artillery support. Right-click the hex again or press **Attack!** to attack. To choose the attackers, click (or tap) their counters in the action bar to leave them out or add them back, or click one of your stacks on the map to take the whole stack in or out; the odds update as you go. Select one of your units before targeting to start the attack with just its stack. For the full list, open **Units…**: tick the attackers (units in an Entry Area that did not move may attack the map hexes next to it), pick the Main Assault Force if more than one division is involved, add support (air, naval gunfire, Valiant/Warspite, artillery), check the odds and column shifts, then click **Attack!**. To advance, pick the units in the action bar and right-click a violet hex, then **Finish advance**. Select one of your hexes next to the enemy to **Disengage**.
- **Breakthrough Combat:** when an attack earns an advance of 2 or more, tick units and **Form group** (in the vacated hex, or with the ticked stack). The group spends its advance hex by hex: right-click violet hexes to move or red hexes to attack again (no artillery, air or naval support). A won breakthrough lets it enter the attacked hex for free; only DR4 and DS let it keep going. The other attackers advance afterwards.
- **Defending:** when your units get a retreat result, the battle screen gives you two cards: **Retreat** (fall back, no more losses) or **Make a stand** (a Determined Defense roll, or a Desperate Defense when retreat is impossible), with defensive support, what to prefer when the result offers Hold or Delay, and how far to fall back on a Delay. The computer waits while you decide.
- **Retreats:** the program proposes the best retreat under the retreat priorities. When you are human and other destinations are equally legal, you are asked to keep it or right-click another green hex.

### Settings

Open from the title screen or the top bar: who commands each side, the computer's difficulty, the Claude key and model, computer speed, animation speed, how combat is shown (step through it and roll, or quick result), camera follow, each side's standing order for defensive air support, grid, place names and unit cues, mouse controls (right-click to move and attack, or left-click does everything), sound and volume, background music (on or off, its own volume, next track, and **Add music files…** to play your own tracks, kept in your browser), and (in game) the map editor. Music files placed in `music/` are bundled with the game (see `music/README.md` for what may go there and how to credit it).

## The AI opponents

- **Built-in AI** (`src/ai/heuristic.ts`, `src/ai/reach.ts`, `src/ai/evaluate.ts`): it works out where every enemy unit could move and attack next turn (following terrain, roads and zones of control, not just distance) and the odds it could bring against each hex. Every move is weighed by the risk it adds or removes across the whole position (expected step losses, and the victory points at stake: artillery, beach groups, towns), against the ground it gains. So it guards its guns, garrisons beaches and towns the enemy could walk into, keeps its screens in mind, and goes for the enemy's exposed artillery and beach groups. It plans coordinated assaults, picks each attack and its support by the expected exchange, leaves out attackers the odds don't need, makes the Determined Defense, advance and Breakthrough decisions, and keeps its stacks inside the limit. The Germans counterattack hard in the early turns and turn defensive later; the Allies build up, hold their perimeter and push when they fall behind the VP benchmark. It plays either side.
- **Difficulty** (New operation or Settings): **Recruit** plays with large errors, overlooks moves and attacks, and judges danger by distance only. **Regular** reads the threat but makes noticeable mistakes (about as strong as the earlier AI). **Veteran** (the default) makes small ones. **Elite** makes none. None of the levels cheats: they see the same map you do, never the dice.
- **Claude** (`src/ai/claude.ts`): Claude acts as commander. Each movement phase it gets a situation report and returns a target hex for each unit. Each combat phase it picks from the legal attack options and their odds. The engine turns those orders into legal moves, so an illegal order can't break the game. The invasion and initial phases, defense choices, advances and any API failure fall back to the built-in AI. Paste an Anthropic API key in **New operation** or **Settings**. The key stays in your browser's local storage and is sent only to `api.anthropic.com`. The default model is Claude Opus 5.5, and refusals fall back automatically on the server.

`npx vite-node scripts/arena.ts [games] [scenario] [level]` plays the AI against the original rule-of-thumb AI (frozen in `scripts/baseline/`) from both sides. In the Avalanche scenario the original German AI beat the original Allied one in 6 games out of 10. Against that same original Allied AI, the German AI wins about 2 in 10 at Recruit, 6 in 10 at Regular, 7–8 in 10 at Veteran and 9–10 in 10 at Elite, holding the Allies to about 2 VP. As the Allies, Veteran and Elite win about 2 in 3 against the original German AI. Elite against Elite favours the Germans (about 9 games in 10), so as the Allied player expect a hard fight at the top levels. `npx vite-node scripts/duel.ts [seed] [side] [level]` prints one such game's log.

## Sources and accuracy

| Area | Source |
|---|---|
| Map: 851 hexes of terrain, rivers, mountain hexsides, passes, roads, cities, towns, ports, VP hexes, beaches, entry areas, 8th Army sector | Your six map photos, calibrated to the hex grid and classified per hex, with roads traced by hand |
| Combat results table, Determined Defense table, column shifts, terrain effects, invasion, airdrop, disengagement, isolation, rally, variable strength and landing-point tables | Your player-aid cards (`data/rules.json`) |
| Order of battle, set-up hexes, reinforcement schedule, replacements | Your two set-up cards (`data/oob.json`) |
| Sequence of play, movement modes, zones of control and bonds, Main Assault Force, retreats, Full Retreat, advance after combat, supply and isolation, landings, entry areas, 8th Army, victory | The living rules (August 2022), implemented in the program's own code |

The tables in `data/rules.json` are what the engine uses; the **Rules** tab shows them. Descriptions there are the program's own summaries, not rulebook text.

### Simplifications and assumptions

- **Steps:** reduced strengths and stacking points come from the backs of the owner's counters. Units with a blank back have one step. The 3-stacking-point regiments and brigades become their Remnant after their second loss; 131/7A Bde has no Remnant and is eliminated instead.
- **Automatic choices:** which unit takes a step loss is picked by the program (the owner loses its least valuable step; a step the opponent chooses is the most valuable one). Supply points left over in the Supply Phase are spent on fired ASUs automatically. Defensive air support follows each side's standing order from Settings instead of being asked attack by attack.
- Old saves from the earlier provisional version are ignored.

### Correcting the data

1. **Rules tables:** edit `data/rules.json`.
2. **Counters and set-up:** edit `data/oob.json`. Each unit has `a`, `d`, `m` (full strength), `sp`, a category (`cat`), a `start` (`hex`, `beach` or `followUp`) or an `arrive` (`turn` and `at`: `reserve`, `airdrop`, `hex:XXXX`, an edge `N`/`S`/`E` or an entry area such as `S2`).
3. **Counter backs:** `"back": "a-d-m"` is the reverse of a counter and `"backSp"` its stacking points when they differ from the front; `"back": "none"` marks a one-step counter. A unit without `back` falls back to an estimate (each step -2 attack and -2 defense).
4. **Map fixes:** open **Settings → Open the map editor** during a game and click any hex to change its terrain, city, VP, port and its six hexsides (river, mountain, pass, road). Edits apply immediately and persist in the browser. **Export map.json** to save them into `data/map.json` for good.

### Known map uncertainties

The map was checked twice against the photos. The second pass drew the data over every photo and corrected it hexside by hexside (`tools/map-transcription/recheck.py`, `apply_recheck.py`, `fixes_photos.txt`).

- **Mountain hexsides** follow the rulebook definition: the shading must cover the whole hexside, and every land side of a fully shaded hex counts. Sides where the shading only partly covers the side are not mountain hexsides. Borderline sides were judged by eye.
- **Minor roads** were detected automatically and then checked by eye. A few may still be missing or extra, especially where a road runs exactly along a hexside.
- Coastal hexes are land when their centre is land or they hold a town (Castellabate). The beach hexes 2709–2712 and 2614–2618, whose centres fall in the sea, are treated as clear land.
- The exact hexes of the north, east and south entry areas, and the 8th Army sector boundary line, are approximate.

## Interface

The menus, dialogs, forms, tabs and buttons are built with [Astryx](https://astryx.atmeta.com/), Meta's open-source React design system (React 19), styled by a custom "wartime" theme (`src/ui/astryx/wartimeTheme.ts`): olive surfaces, brass accents and the game's condensed type. The map, the counters, the battle and landing panels and the map bar remain the game's own drawing. The game's older element defaults sit in a CSS layer below Astryx's (`src/ui/astryx/astryx.css`), so Astryx components keep their own styling.

## Project layout

```
data/          map.json (transcribed map), rules.json, oob.json
src/engine/    rules engine: hex grid, movement, ZOC bonds, combat, breakthroughs, retreats, supply, phases, victory
src/ai/        built-in heuristic AI, Claude AI, self-play
src/net/       online play: the shared game (setup + action list in chunks), seats, sync and replay; a local stand-in store for tests and two-tab development
src/ui/        React UI
  astryx/          the Astryx theme, CSS layer order and shared compositions (choice cards, section labels)
  App.tsx          screen flow: loading, title, new operation, online lobby, briefing, game
  NetLobby.tsx     Play with friends: the games on the page, hosting, joining
  screens.tsx      title, new operation, briefing and how-to-play screens
  GameScreen.tsx   in-game controller: AI loop, selection, highlights, dialogs
  MapView.tsx      map camera, overlays, unit stacks, animations, minimap
  hud.tsx          top bar, banners, event feed, unit card, combat card, menus
  Sidebar.tsx      command panel tabs and the map editor
  render/          painted terrain (canvas, cached in IndexedDB), hex geometry, NATO-style unit counters
  sound.ts         synthesized sound effects (WebAudio)
  theme.css        the interface theme
  dev/Gallery.tsx  every counter on one page, dev builds only (open /#gallery)
scripts/       command-line self-play and game logs
tests/         vitest tests for the engine and the AI
tools/map-transcription/   Python scripts used to turn the photos into map.json
```
