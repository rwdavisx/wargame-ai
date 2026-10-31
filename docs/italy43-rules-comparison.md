# Italy '43 against Salerno '43: a case-by-case rules comparison for the engine

> Written in our own words from a reading of both rulebooks; the rulebooks govern. File and function names refer to the engine as of the multi-game refactor.

Written 2026-10-31 for the engineer who will make `src/engine` play both games.

**Sources read in full**
- Italy '43 rulebook text (extracted from the owner's PDF; not in the repository, GMT 2025 printing "ITALY43_Rules-2G", 36 pages): sections 1 to 25, S1 to S3, Play Notes, Hints on Play, Rule Reminders, Extended Example of Play, Historical Notes, the "Important Differences" box on page 34, and the index.
- Salerno '43 Living Rules, August 2022 (not in the repository): everything from 1.0 through S2, the hints, design notes, OOB notes and extended example.
- `data/salerno43/rules.json`, `data/italy43/rules.json`, `tools/rules-audit/cases.json` and `inventory/*.json`.
- Engine at HEAD `ddd21d0`. The work in progress alongside it: per-scenario set-ups and `REMNANT_POOLS` in `data.ts`, the `mountain` and `heavyHowitzer` categories in `types.ts`, and a new `data/italy43/oob.json`. I read that work and the advice below assumes it lands. File and function names refer to HEAD plus that work.
- Two photos, used only to settle doubts the text raised: the Italy TEC (the owner's photo `aid-tec.jpg`) and the turn and weather track (the owner's photo `map-sw-turntrack.jpg`).

**Where the extracted text is garbled or incomplete**
- Italy: the body text is clean, though the two columns are interleaved line by line, so I rebuilt each paragraph from its two halves. Figures are not in the text at all: the movement, ZOC Bond, retreat, tank-shift and Pontoon diagrams, the extended-example maps, and the Bernhard Line set-up illustration on page 34.
- Salerno: the 5.8 Truck Markers paragraph is split across 6.0. I rebuilt it as: two German non-mechanized units in supply may move as mechanized with MA 5, may move adjacent to the enemy if they do not use Extended Movement, and have attack 0. The 12.2 bullet list is split around 12.1. The 11.4.1 result list is scrambled, so I relied on `data/salerno43/rules.json` for it. The 15.2.4 action-cost table has lost its columns. **18.4.6 Evacuations is in the index, but its text is missing from the extract.**
- Italy S2.3 item 2 says the two 82nd Airborne regiments are "on garrison duty in Salerno". Salerno is not on the Italy map, and the rule's own heading says "Naples Garrison". I treat this as a misprint for Naples.

Labels used in section 3: **SAME** (identical in substance; the Salerno case is given), **CHANGED** (same idea, different details), **NEW** (no Salerno equivalent), and **N/A-SALERNO** (a Salerno rule that Italy does not have; listed separately in 3.2).

---

## 1. Summary

The two games share one rules system. Section numbers 1 to 17 line up almost one for one. The core is unchanged: 6-point stacking with one free silhouetted tank, ZOCs and Hex and Hexside ZOC Bonds, Tactical and Extended Movement, the Main Assault Force (MAF) with a 20-point cap on each side, the 1-3 to 7-1 CRT with Auto DS at 10-1, Determined Defense (DD) with a Lead Unit and coloured CRT cells, the retreat-elimination rules, Disrupted and Full Retreat states, Breakthrough Combat, supply (5 hexes overland then any length of road), Line of Communications (LOC) and isolation attrition, ASUs fired and readied with Supply Points, the replacement types, the weather track that sets air and Supply Points, and VP benchmarks with automatic victory at ±5. Roughly half of Italy's numbered cases carry over unchanged, about two fifths change in detail, and the rest are new.

What makes Italy a different game is this:

1. **No invasion and no navy.** There are no Turn 1 rules, beachheads, ports, Floating Reserve, Landing Points, airdrops, variable-strength garrisons, Luftwaffe or battleships. The game starts on land with the German player turn, Naples is the Allied base, and the Allies have S1 and S2 from Turn 1.
2. **A new CRT shape** (Italy 10.1). Each cell carries its own advance (Adv 1, Adv 2 or Adv 2+, where 2+ gives mechanized units a third hex by road or into clear terrain). D1 retreats 2 hexes, not 3. There is no "Dis" result.
3. **Determined Defense rolls two dice** on a 10-row table with F, H and P results. "Desperate Defense" is folded into 11.4.3 and the Delay result is gone. Battle markers replace City Battle markers and also apply to Fortifications. A minor city or Level 1 fort absorbs one Partial result; a major city or Level 2 fort absorbs two.
4. **German Fortifications** (Italy 18). One build step per German Initial Phase; Level 1 and Level 2 forts; all 8 Level 1 forts must be started before any is finished; Level 2 forts only on or behind the Gustav Line. A fort gives 1 or 2 column shifts left and uses the City-or-Fort DD column.
5. **Movement changes.**
   - Operational Movement (5.2.2): within 2 hexes of an enemy unit, mechanized units pay 1 MP per road hex.
   - Extended Movement gives +3 to mechanized units but only +2 to non-mechanized units.
   - Both sides get two Truck markers.
   - Major rivers appear.
   - Vehicles may now cross minor rivers in normal movement (+2 MP), except in Rain.
   - The 8th Army Zone is divided into sections that pass to the Allies on Turns 8, 11 and 15.
6. **Combat modifier changes.**
   - The Elite shift is redefined: the MAF must be mostly elite, or contain an elite infantry unit plus a tank. The defender's elite units no longer cancel it.
   - New: a Low Quality shift and a Defensive Artillery shift.
   - The Allies have one Naval marker, not two.
   - The defender doubles when every attacker attacks across a mountain hexside.
   - Defending *in* a marsh no longer doubles.
   - Plain Rain gives no column shift; only Rain-and-Mud does.
   - Major rivers halve every attacker.
7. **Weather extras.** A Mud box. On weather rolls of 2 to 4, one Nebelwerfer and the Heavy Howitzer flip to Ready for free. When the marker loops from F back to A, every Division ASU on the map flips to Ready. Naples adds +1 Allied Supply Point a turn from Turn 14 and +2 from Turn 24.
8. **New unit rules.** Mountain infantry (seven units), the US Heavy Howitzer (forces rerolls of 6s on DD), two Nebelwerfers, and the recon step-loss rule as standard.
9. **Order-of-battle mechanics.** A card-driven schedule of Withdrawals, Returns and Removals, with replacements forfeited when a scheduled unit is already eliminated. French and Italian nationalities fight inside the "US Army", against the British.
10. **Retreat changes.** New direction guidelines. A retreat may stop in a fort or after crossing a mountain hexside. Vehicles die crossing minor rivers only in Rain. Infantry are no longer killed by crossing two mountain hexsides.
11. **Entry Areas.** No attacks into or out of them, and ASUs cannot support from them.
12. **Breakthrough.** A group makes at most one breakthrough attack, cannot continue after a DR4 or DS, may attack through passes, and neither side may use support shifts.
13. **Three scenarios** (S1, 7 turns; S2, Turns 13 to 32; S3, 32 turns). Benchmarks start on Turn 2.
14. **Optional rules.** Half Effectiveness drops to optional; Major Assault and Pontoon Bridges are new.

**Engine readiness, bluntly.** `data/italy43/rules.json` cannot be loaded today. `src/engine/data.ts:buildRules` reads `r.supply.overlandHexes`, and the Italy file has no `supply` block, so loading throws a TypeError. It also has no `invasion`, `airdrop`, `variableStrength`, `landingPoints`, `combat.nonMechAdvanceCap`, `oosAdvanceCap` or `halfEffAdvanceCap`.

Several Salerno rules run unconditionally:
- Turn 1 German MA halving and Allied tactical-only movement: `movement.ts:movementAllowance`, `allowedModes`, `entryModes`.
- Montecorvino hex `2811` and the Salerno port hex `2707`: `game.ts:readySupport`, `landingCapacity`, `supply.ts:salernoPortOpen`. On the Italy map, 2707 is Monte Lungo.
- The Campanella naval row: `combat.ts:NAVAL_MIN_ROW`.
- Mined ports: `supply.ts:MINED_PORTS`.
- The south edge turning Allied on Turn 11: `SOUTH_EDGE_ALLIED_TURN`.
- The 16th Panzer withdrawal: `WITHDRAWAL`, which `data/italy43/oob.json` does not define, so `doInitial` would throw.

Three data mappings would mis-assign Italy units:
- `data.ts:buildUnits` flags any Allied unit arriving at S1 to S3 as 8th Army. In Italy that is every Allied reinforcement from the south edge.
- `units.ts:nationGroup` maps French and Italian units to "CW". Italy 8.6.2 puts them in the US Army.
- `game.ts:replPool` sends French and Italian units to the British replacement pool.

---

## 2. Section mapping (Italy → Salerno)

| Italy | Title | Salerno | Notes |
|---|---|---|---|
| 1.0 | Introduction | 1.0 | Abbreviations: Italy adds MAF, OM, LOC, NW. |
| 2.0–2.3 | Contents, Map, Pieces | 2.0–2.3 | Italy adds 2.2.4 (rivers through city centres). |
| 3.0 | Sequence of Play | 3.0 | Italy adds the weather free flips, scheduled withdrawals and fortification building. |
| 4.0 | Stacking | 4.0 | Same. |
| 5.0 | Land Movement | 5.0 | 5.1–5.6 match 5.1–5.6. Italy 5.7 Trucks ← Salerno 5.8. Italy 5.8 8th Army Boundary: closest is S2.3.3/S2.3.4. Italy 5.9 Weather ← Salerno 22.4. Salerno 5.7 (½ Eff) → Italy 25.2 (optional). |
| 6.0 | Zones of Control | 6.0 | Same. |
| 7.0 | ZOC Bonds | 7.0 | Same numbering. |
| 8.0 | Combat | 8.0 | 8.1–8.3 ↔ 8.1–8.3. Italy 8.3.2/8.3.3 ← Salerno 8.6.1/8.6.2. Italy 8.4.1–8.4.4 ← 8.4.1–8.4.4. Italy 8.5 ← Salerno 8.4.5. Italy 8.6 ← Salerno 8.5. Italy 8.7 ← 8.7. |
| 9.0 | Combat Modifiers | 9.0 | Italy 9.2 (Troop Quality) ← Salerno 9.7 (Elite). Italy 9.7 (Terrain) ← Salerno 9.8. Italy 9.8 (Parenthesized) ← Salerno 8.4.6. Salerno 9.2 (shift summary) has no numbered Italy case. |
| 10.0 | Combat Results | 10.0 | Same numbering. |
| 11.0 | Determined Defense | 11.0 | Italy 11.3 DD Support ← Salerno 11.3 Defensive Support. Italy 11.4.3 ← Salerno 11.4.4 + 11.5. Italy 11.4.4 ← Salerno 11.5.4. Italy 11.5 Battle markers ← Salerno 11.6.2. Italy 11.6 ← Salerno 11.6.3. |
| 12.0 | Retreats | 12.0 | Italy 12.1.2 (Stopping) ← Salerno 12.1.5. Italy 12.1.5 (Stacks) ← Salerno 12.1.2. |
| 13.0 | Disruption and Recovery | 13.0 | Same numbering. |
| 14.0 | Advance After Combat | 14.0 | Italy 14.2.1/14.2.2 ← 14.2.1. Italy 14.2.3 ← Salerno 14.2.2. |
| 15.0 | Breakthrough Combat | 15.0 | Italy 15.2.4 (Splitting) ← Salerno 15.2.9. Italy 15.2.5 (Changing Directions) ← part of Salerno 15.2.4. Salerno 15.2.5 is implicit in Italy. |
| 16.0 | Supply and Isolation | 16.0 | Same numbering. |
| 17.0 | ASUs | 17.0 | Same numbering. |
| 18.0 | Fortifications | — | New. Salerno 18 (Beachheads, Ports, Naval Transport) is N/A. |
| 19.0 | Special Units | 19.0 | Italy 19.1 ← 19.1. Italy 19.2 Recon ← Salerno 25.2 (optional there). 19.3 and 19.4 are new. Salerno 19.2–19.4 are N/A. |
| 20.0 | Replacements | 20.0 | Same numbering. 20.1.3 is new. |
| 21.0 | Reinforcements & Entry Areas | 21.0 | Italy 21.3 ← Salerno 21.3.1/21.3.3/21.3.4/21.4. Italy 21.4.1 ← Salerno 21.3.2. Italy 21.4.2 ← Salerno 21.5. Salerno 21.6 is N/A. |
| 22.0 | Withdrawals, Returns, Removals | — | New. Closest Salerno case is S2.2 (16th Pz withdrawal). |
| 23.0 | Weather Phase | 22.0 | Renumbered. Italy 23.1 ← 22.1, 23.2 ← 22.2.1, 23.3 ← 22.3, 23.4 ← 22.4/22.5. |
| 24.0 | VPs and Automatic Victory | 23.0 | Renumbered. Italy 24.1 ← 23.1, 24.2 ← 23.2. |
| — | — | 24.0 Turn 1 Special Rules | N/A in Italy. |
| 25.0 | Optional Rules | 25.0 | Italy 25.1 Major Assault is new. Italy 25.2 ½ Eff ← Salerno 5.7. Italy 25.3 Pontoon Bridges is new. Italy 25.4 Disengagement ← Salerno 25.1. Salerno 25.2 → Italy 19.2; Salerno 25.3 is N/A. |
| S1 | Across the Volturno | S1 Avalanche | Each is the game's short opening scenario. |
| S2 | The Bernhard Line | — | Mid-campaign start; no Salerno equivalent. |
| S3 | Campaign | S2 Campaign | |

---

## 3. Every Italy '43 case, classified

### 1–2 Introduction, contents, map, pieces

- **1.0 Introduction — SAME (Salerno 1.0).** Abbreviations only.
- **2.1 Inventory — CHANGED (Salerno 2.1).** Two dice instead of one, needed for the 2d6 DD table and the optional Major Assault. Nothing to code.
- **2.2.1 Scale — SAME (2.2.1).** Hexes are about 3.8 km across.
- **2.2.2 Mountains — SAME (2.2.2).** Mountains are hexside features, the whole hexside must be mountain, and a full Mountain hex is a Hill with six Mountain hexsides. Already in `game.ts:fullMountainHex`.
- **2.2.3 Hex Terrain Classification — CHANGED (2.2.3).** A clear/hill hex takes its *predominant* terrain (Salerno used the terrain at the hex centre). A city in a hill hex is a City for every purpose. This is a map-encoding decision only.
- **2.2.4 Rivers and Cities — NEW.** A river running through the middle of a City hex (Benevento) has no effect on movement or combat. In map data, simply do not mark those hexsides as rivers.
- **2.3.1 Types — CHANGED (2.3.1).** Combat units versus markers. Italy has no beachhead or variable-strength units.
- **2.3.2 How to Read the Units — CHANGED (2.3.2).**
  - MA is defined as the MPs spent without Extended Movement. Salerno defined it as the most a unit may spend and still attack.
  - Italy no longer forbids attacking after Extended Movement. In practice the gap is tiny, because Extended Movement may not enter an EZOC. It matters only where a vehicle's ZOC does not reach across a mountain hexside. `combat.ts:validateAttackers` refuses such attacks; it may keep doing so as a conservative reading.
  - New counter marks: a triangle means the unit begins or enters reduced; a blue box means it starts frozen; a black box means it is a garrison (S3.3); a green circle marks recon; a white outline means the unit cannot form ZOC Bonds; the ASU shows its turn of arrival.
  - Troop Quality is used for the Troop Quality shifts (9.2: Elite and the new Low Quality shift), the DD modifier (11.2.4) and the Rally table (13.5). Salerno used it for the Elite shift, the DD modifier and Rally, so the only new use is the Low Quality shift.
- **2.3.3 Summary of Unit Types — CHANGED (2.3.3).**
  - Non-mechanized: Infantry, Airborne, Glider, Mountain, Commando/Ranger and Special Service Force; all are infantry type.
  - Mechanized: Mechanized/Panzergrenadier and Motorized (both infantry type), and Nebelwerfer, ASU, Recon and Tank (Sherman, M10, PzKw IV, StuG), which are the vehicle types.
  - Gone: Engineer, Garrison, Beachhead.
  - Italy no longer says infantry types double in marsh, city and hill; see 9.7.
  - Engine: add `mountain` to `data.ts:INFANTRY_TYPES` (done). Treat 1SSF as both infantry type and mountain.
- **2.3.4 Unit Colors — CHANGED (2.3.4).**
  - Allied: US green, British khaki, French blue, Italian aqua green.
  - German: Wehrmacht grey, Luftwaffe medium blue.
  - No Canadians.
  - Nationality now matters for Army grouping (8.6) and replacements (20.1.3). `units.ts:nationGroup` and `supportNation` must map `FR` and `IT` to the US Army; today they become "CW".
- **2.3.5 Steps — SAME (2.3.5).** 1 to 3 steps; a 3-step unit's second loss may bring in a Remnant.

### 3 Sequence of Play — CHANGED (Salerno 3.0)

- **A. Weather Phase.**
  1. Roll for weather.
  2. Set the Air and Naval markers.
  3. Add Supply Points.
  4. **NEW step:** flip one Nebelwerfer and the Heavy Howitzer to Ready if the roll allows (23.3.3).

  The F→A loop flip happens here too (23.3.4).
- **B.1 Initial Phase**, in any order:
  - Spend SPs to ready ASUs.
  - Take replacements.
  - Place reinforcements.
  - **NEW:** withdraw or remove units on schedule (22.0).
  - **NEW, German only:** start or complete one Fortification (18.1).

  Salerno's free Nebelwerfer flip in this phase and its Allied landings and airdrops are gone.
- **B.2 Movement:** move (Truck markers allowed), Auto DS, voluntary Full Retreat. Naval Transport is gone.
- **B.3 Combat:** attacks or (optional) Disengagement, then the Auto DS advances.
- **B.4 Recovery:** recover or rally; remove Replacement, Truck and ½ Eff markers.
- **B.5 Supply:** check supply, roll isolation attrition, spend SPs to ready ASUs.
- Italy says ASUs may be readied twice a turn, in the Initial and Supply Phases. It drops Salerno's "except the Nebelwerfer", so Nebelwerfers can be readied with SPs (see 19.1).
- **C.** The Allied player turn mirrors the German one.
- **D. Victory Check Phase.**
- Engine: `game.ts:phaseOrder` is unchanged. `doWeather`, `doInitial` and `newGame` need the additions. `newGame` must start Italy in the German Initial Phase with no 'invasion' phase (see section 5).

### 4 Stacking

- **4.1 Stacking Limits — SAME (4.1).** 6 Stacking Points for both sides; markers are free.
- **4.2 Stacking Values — CHANGED (4.2).** Values now run 0 to 4 (Salerno 0 to 3). The British 22nd Armoured Brigade is a 4. Units with a printed 0 stack freely. Nothing to change in `units.ts:stackPoints`.
- **4.3 Silhouetted Tank Units — SAME (4.3).** The first is free; each further one costs 1 SP. Italy silhouetted tanks print no stacking value. `data.ts:buildUnits` derives `silhouette = tank && sp <= 1`; use the counter's explicit `silhouette` flag instead. The Italy OOB has one, and a null `sp` must not break the derivation.
- **4.4 Stacking Restrictions — SAME (4.4).**

### 5 Land Movement

- **5.1 The Basics — SAME (5.1).**
- **5.2.1 Road Movement — SAME (5.2).** Road rate, a bridge wherever a road crosses a river, road rate into and out of EZOCs, mixed road and cross-country movement. Salerno's pointer to S2.3.4 (8th Army roads) is gone.
- **5.2.2 Operational Movement — NEW.**
  - When a mechanized unit enters a road hex that is within 2 hexes of any enemy unit, the road costs 1 MP.
  - Otherwise the road costs ½ MP (minor) or ⅓ MP (major).
  - Enemy units in Full Retreat still count (13.3.3).
  - Engine: in `movement.ts:stepCost`, for `mech` (including trucked units) on a road, set the cost to `RULES.movement.majorRoad.operational` (or `minorRoad.operational`) whenever any enemy combat unit is within distance 2 of `to`. Precompute a "within 2 of enemy" set in `reachable`. The Salerno `alliedMechRoadIn8thSector` line must be gated off for Italy; the Italy rules have no such key.
- **5.2.3 Roads and City Terrain — NEW.** City terrain never cuts a road, and a Major Road links all three Naples hexes. Map data only.
- **5.3 Extended Movement — CHANGED (5.3).** Mechanized units get +3 MPs and non-mechanized units +2 (Salerno: +3 for everyone). It still may not enter an EZOC, and a unit starting in an EZOC may use it if its first hex leaves the EZOC. Engine: `data.ts:buildRules` hard-codes `extendedBonus: 3`. Make it `{mech: 3, inf: 2}` in data, and choose by `d.mech` (or truck) in `movement.ts:movementAllowance`.
- **5.4 Tactical Movement — SAME (5.4).** One or two hexes, no MPs, may attack; stop on entering an EZOC; no crossing enemy bonds or prohibited hexsides. Italy states outright that a unit using it may not also use normal or Extended Movement.
- **5.5 Rivers and Movement — CHANGED (5.5).**
  - Unbridged **minor** river: +1 MP for non-mechanized units, +2 MP for mechanized units (including PG and motorized). In Salerno, infantry paid +1 and vehicles could cross only as the first hex of a Tactical Move and became ½ Eff.
  - Unbridged **major** river (new terrain; a river-with-marsh hexside counts as major, per the TEC): any unit may cross only if it starts adjacent, uses Tactical Movement and crosses with its first hex.
  - No ½ Eff marker unless optional rule 25.2 is in play.
  - A canal is a minor river; a lake hexside is an all-sea hexside (TEC).
  - Engine `movement.ts:stepCost`: replace the `hs.river` block with `minor: cost += mech ? 2 : 1` and `major: firstHexOnly = true` for every unit. Block vehicles in Rain (5.9). The map needs `river: 'minor' | 'major'`.
- **5.6 Mountain Hexsides — CHANGED (5.6).**
  - Infantry-type units (including mechanized infantry: Rule Reminder 2) may cross a non-road, non-pass mountain hexside only by Tactical Movement, starting adjacent, as their first hex.
  - Vehicles cross only at roads or passes.
  - No ½ Eff (optional 25.2 only).
  - Mountain units are the exception (19.3): they need not start adjacent.
  - Engine `stepCost`: keep `firstHexOnly`. Exempt `def.mountain` from it, but keep them Tactical-only (TEC: "Inf. Type: TM"). Do not set `halfEff` unless the option is on.
- **5.7 Trucks — CHANGED (Salerno 5.8).**
  - Both sides now get trucks (Salerno: German only).
  - Each turn each side may truck any two Good Order non-mechanized units that are in supply *at the start of their Movement Phase* (Salerno: at the moment of use).
  - They get MA 5 and move as mechanized units.
  - They may not attack that Combat Phase (Salerno gave attack 0, same effect), but they *may end their move in an EZOC*.
  - The marker comes off in the Recovery Phase.
  - Engine: `movement.ts:truckOk` drops `sideOf(u) === 'German'`. Judge supply from the unit's state at the start of the Movement Phase (store it in `enterPhase('movement')`). Trucks are used per side per turn, and `s.trucksUsed` is already reset in each player's Movement Phase.
- **5.8 The 8th Army Boundary Line — NEW** (no Salerno equivalent; S2.3.3 was a different, unit-based boundary).
  - **5.8.1** East of the boundary lies the 8th Army Zone, which is not played. It has four sections: E1, E2, E3 and N4. All start German-controlled.
    - From Turn 8, E1 is Allied. Any Axis units there are moved by the German player, in his Initial Phase, into E2 and become Disrupted.
    - From Turn 11, E2 is Allied, and its Axis units move to E3, Disrupted.
    - From Turn 15, E3 is Allied, and its Axis units move to N4, Disrupted.
  - **5.8.2** Allied units may never enter the zone voluntarily.
    - An Allied unit forced to retreat into a German-controlled section is eliminated.
    - One forced into an Allied section must leave it as fast as possible.
    - The Allies may trace a Line of Supply through Allied sections.
    - By 8.1 and 14.5, Allied units also may not attack into, or advance into, zone hexes.
  - **5.8.3** German units may enter and act in sections still friendly to them and trace supply through them.
  - Engine: replace the Salerno `sector8: boolean` map flag with `zone8: 'E1'|'E2'|'E3'|'N4'` per hex, plus a schedule `{E1: 8, E2: 11, E3: 15}`.
    - Movement and retreat checks go in `movement.ts:reachable` / `stepCost` (Allied: prohibited; German: only German sections) and `retreat.ts:allRetreats` (an Allied unit entering a German section is lost).
    - Supply checks go in `supply.ts:overland` and `makeCtx` (only friendly sections).
    - Add a relocation step in `game.ts:doInitial` for the German player on Turns 8, 11 and 15.
    - All of Salerno's `army8` / `abandon8th` / `purge8thSector` / `S2.3.x` code must be gated off.
- **5.9 Movement and Weather — CHANGED (Salerno 22.4).** In Rain and in Rain-and-Mud, vehicles may not move, attack or retreat across any unbridged river, major or minor. Salerno forbade moving and attacking across in Rain and killed vehicles retreating across in any weather. Engine `stepCost` already returns null for vehicles in rain; keep that for both river types.

### 6 Zones of Control

- **6.1 General Rule — SAME (6.1).** Six hexes, not across all-sea hexsides; vehicle ZOCs cross mountain hexsides only at roads and passes; every combat unit has a ZOC.
- **6.2 ZOCs and Movement — SAME (6.2).** Stop on entering, +0 MP to enter, +2 MP to leave, EZOC to EZOC allowed unless a bond is in the way. The Full Retreat exception (no +2) is cited from 13.3.2; Salerno put it in 13.3.4. The engine already applies it to every Full Retreat unit.
- **6.3 Other Effects — SAME (6.3).**

### 7 ZOC Bonds

- **7.1 How to Form — SAME in substance (7.1).**
  - Good Order units without the white outline form bonds when two hexes apart.
  - Silhouetted tanks and ASUs have a ZOC but form no bond. Salerno said "free-stacking units".
  - Engine `zoc.ts:bondsOf` tests `d.silhouette || d.sp === 0`. Use the counter's white-outline flag (`noZocBond` in the OOB transcription) instead, because Italy silhouetted tanks may have a null `sp`.
- **7.2 Effects — SAME (7.2).**
- **7.3 Breaking — SAME (7.3).**
- **7.4 Intersecting — SAME (7.4).**
- **7.5 Bonds with Entry Areas — SAME (7.5).** Hexside bonds only, and only with a friendly area. Engine: `bondsOf` treats an area with no control entry as German. Italy's S1 and S2 are always Allied (21.2.1), so seed `s.control` for them in `newGame`.
- **7.6.1 Mountain Hexsides — CHANGED (7.6.1).**
  - No bond across two mountain hexsides that have **neither a road nor a pass**. Salerno said "non-road", and the engine was "fixed" so that a road-less pass does not lift the block. In Italy a pass *does* lift it for non-vehicle anchors.
  - Vehicles still need a road; a pass is not enough.
  - Engine `zoc.ts:bondsOf/routeOk`: for Italy, use `crossesMountainWithoutRoad` (non-road, non-pass) in the two-hexside test, and keep `mountainWithoutRoad` for `legOk` on vehicle-only anchors.
- **7.6.2 The Coast — SAME (7.6.2).** No bond across an all-sea hexside or anchored on the coast.
- **7.6.3 Major Rivers — CHANGED (7.6.3).** No bond across two major-river hexsides. Two minor, or one minor and one major, are fine. Salerno had no major rivers. Engine `routeOk`: add `!(isMajor(a,c) && isMajor(c,b))`.

### 8 Combat

- **8.1 The Basics — SAME (8.1).**
- **8.2 Multi-Hex Combat — SAME (8.2).**
- **8.3.1 Procedure — CHANGED (8.3).**
  - Four steps; Salerno had five, its step 3 being variable strength.
  - Step 2 shifts now include Troop Quality (elite and low quality), Fortifications and Weather.
  - The defender declares Defensive Air **and Artillery** support.
  - Odds are rounded down to N-1, and may exceed 10-1.
- **8.3.2 Minimum and Maximum Odds — CHANGED (8.6.1).**
  - The attack must *start* at 1-3 or better before any shift.
  - If net shifts push it below 1-3, it is resolved on 1-3.
  - 8-1 and 9-1 use the 7-1 column; 10-1 or better is an automatic DS.
  - Salerno allowed a 1-4 lifted to 1-3 by shifts, and the engine does that.
  - Engine `combat.ts:computeOdds`: replace `if (pre < 0) fail` with `if (baseIndex < 0) fail`, and never fail on a negative net. A 1-3 attack in Mud must be legal; today it fails because the rain shift is in `pre`.
- **8.3.3 Column Shifts — SAME (8.6.2).** Imaginary columns beyond 7-1; limits applied to the net shift.
- **8.4.1 MAF — SAME (8.4.1).** The text says "one Formation", but the 8.4.4 play note allows an independent unit as the MAF.
- **8.4.2 Formation Definition — CHANGED (8.4.2).** The formations are divisions, Darby's Rangers (3 battalions) and the British 23rd Armoured Brigade. Salerno's second was the Commando Brigade. Engine: in `src/games/italy43/data.ts`, `independentFormations` must **not** list '23 Armd Bde'; Salerno lists it as independent.
- **8.4.3 Attachments — CHANGED (8.4.3).**
  - Up to **two** attachments for both sides: one silhouetted tank plus one infantry or recon unit of any size, each stacked with a MAF unit.
  - Salerno allowed the Allies one silhouetted tank or one battalion, and the Germans any one unit.
  - Rule Reminder 4: French and Italian units may attach only to a US formation. 8.6.2 adds that US units may attach to French or Italian units and vice versa.
  - "Infantry" here most likely means infantry type (2.3.3).
  - Engine `combat.ts:attachCandidates` / `mafMembers`: change `attach?: string` to `attach?: string[]` (at most one silhouetted tank plus at most one infantry-type or recon unit), applied to both sides.
- **8.4.4 Independent Units — CHANGED (8.4.4).**
  - White bar or white box, except 2/509, 1SSF and 9th Commando, which have their own colours.
  - **NEW:** white-box Remnants are independent, but coloured-box Remnants stay in their formation, which matters for MAF and Division ASU support.
  - Engine `data.ts:buildUnits`: a Remnant standing in for a unit should take that unit's `division` when its counter is coloured.
- **8.5 Combat Strength Limits — SAME (8.4.5).** 20 points a side, applied after halving and doubling.
- **8.6.1 British Army — CHANGED (8.5.1).**
  - The British are a separate Army from US, French and Italian units. The two may not attack together, but may defend together and bond.
  - British Corps ASUs and British air support only British units.
  - Engine: `nationGroup` gives US for US, FR and IT; `CW` (British) otherwise. `validateAttackers` is already keyed on it.
- **8.6.2 US Army — NEW detail.** French units and the Italian 1st Motorized Brigade count as US Army: they use US Corps ASUs and US air and may attack with US units.
- **8.7.1 Auto DS — CHANGED (8.7.1).**
  - Still 10-1 in the Movement Phase.
  - MAF, the 20-point cap, Allied restrictions and the Rain-and-Mud shift apply.
  - Troop Quality (elite *and* low quality), Fortification and Tank shifts count; Air, Naval and Artillery do not.
  - Survivors retreat 4 hexes in Full Retreat.
  - Engine `computeOdds(autoDs)`: add the low-quality and fortification shifts. Variable-strength handling is irrelevant.
- **8.7.2 Advance After Combat — SAME (8.7.2).**

### 9 Combat Modifiers

- **9.1 Halving and Doubling — CHANGED (9.1).**
  - Never halved or doubled more than once; halve per unit, rounding up.
  - Reasons to halve:
    - not in the MAF;
    - a vehicle attacking out of a marsh or across a minor river;
    - **any** unit attacking across a major river;
    - any unit across a mountain hexside, except mountain units;
    - ½ Eff (optional);
    - Out of Supply;
    - Disrupted when defending.
  - Engine `computeOdds/evalMaf`: halved = `!member || OOS || halfEff || (vehicle && (minorRiver || fromMarsh)) || majorRiver || ((mountain||pass) && !def.mountain)`. Today it misses the marsh-origin vehicle case and the major river. Applying the factor once is already correct.
- **9.2.1 Elite Shift — CHANGED (Salerno 9.7).**
  - One shift right if either a majority of the MAF's units (counted by units, not steps) are elite, or the MAF holds an elite infantry-type unit plus any tank unit.
  - The defender's elite units no longer cancel it (Play Notes, "Elite vs Elite").
  - Engine `computeOdds`: replace `members.some(elite) && !defenders.some(elite)` with the new test.
- **9.2.2 Low Quality Penalty — NEW.** If every attacking unit is low quality, one shift left. Engine: add to `computeOdds` (also for Auto DS).
- **9.3.1 Attacker's Tank Shift — SAME in substance (9.3.1).** The best rating is taken among MAF units; the engine already does this.
- **9.3.2 Defender's Tank Shift — SAME (9.3.2).**
- **9.3.3 Tank Shifts and Terrain — CHANGED (9.3.3).**
  - No tank shift against a hex that is Hill, Marsh, full Mountain, City **or Fortification**.
  - Tanks attacking across a river or mountain hexside **or out of a marsh** cannot earn it, but still deny it.
  - Engine `combat.ts:tankTerrainOk`: add "no completed fort in the hex"; the marsh-origin case is already handled.
- **9.3.4 Tank Destroyers — SAME (9.3.4).** −1 rating when attacking. Italy TDs per the OOB: US 601, 776, 636, 645 (list them in `games/italy43/data.ts`).
- **9.4 Air Support — CHANGED (9.4).**
  - One shift left or right, with no range.
  - US and British markers need a ground unit of their **Army** in the combat.
  - At most one air marker per combat.
  - No German air in Italy.
  - Engine: `combat.ts:markerFor` and `defensiveSupportOptions` key on `supportNation`; with FR and IT mapped to US this works. `game.ts:readySupport` must not create `GE-air` or look at hex 2811.
- **9.5.1 Division Support — SAME (9.5.1).** The supported unit of the division need not be in the MAF.
- **9.5.2 Corps Support — CHANGED (9.5.2).** An Allied Corps ASU may shift (or give the +1 DD modifier) only for combats involving its own Army. Same mechanics. `readyAsusFor` already filters by `nationGroup`.
- **9.5.3 Two Artillery Shifts — SAME (9.5.3).** At most Division plus Corps/Naval.
- **9.5.4 Defensive Artillery Support — NEW.**
  - The defender may flip one Ready Division or Corps ASU in range for one shift left.
  - A Division ASU needs a unit of its division in the defending hex.
  - The defender never gets more than one artillery/naval shift.
  - The same ASU cannot also give the DD +1 (17.6.2); a second ASU can (Play Notes).
  - Engine: in `computeOdds`, beside the defensive-air block, add a defender ASU choice using `readyAsusFor(s, enemy, target, defenderIds)`. Add a standing order like `options.defensiveAir`, or a pending decision. Spend it in `resolveAttack`. **Not in Breakthrough Combat** (15.2.7).
  - Whether the Allied naval marker may give a *defensive* CRT shift is unclear: "Artillery/Naval" in 9.5.4 hints yes, 9.6 is silent. See Appendix B.
- **9.6 Naval Support — CHANGED (9.6).**
  - **One** Allied Naval marker (Salerno: one US and one British), usable once per game turn when available.
  - Target within 2 hexes of the off-map sea (example: Castel Volturno, hex 1815).
  - It counts as Corps support: never with a Corps ASU.
  - It may support units of both Armies.
  - No Campanella Point limit.
  - Engine: `combat.ts:NAVAL_MIN_ROW = 4` and `gunfireSea` are Salerno-specific. Make the off-map sea area map data (`MAP.offMapSea` or a hex flag).
  - Replace the `${nation}-naval` keys with a single `AL-naval` key: in `markerFor`, `readySupport`, `defensiveSupportOptions` and `newGame`'s initial `support.ready`.
  - The battleship DRM path must be off.
- **9.7 Terrain and Combat — CHANGED (9.8).**
  - Hills and Cities double every defender except silhouetted tanks and ASUs. This covers recon and non-silhouetted tank units such as the 22nd Armoured Brigade (historical notes).
  - **Defending in a Marsh no longer doubles.** The defender doubles only if every attacker attacks out of a marsh.
  - **New:** the defender doubles if every attacker attacks across a mountain hexside. Vehicles may attack across a mountain hexside only at a road or pass, at half strength (TEC note 4).
  - Rivers: the defender doubles if every attacker is across a river. Vehicles are halved across minor rivers, bridged or not; everyone is halved across major rivers.
  - **Combinations:** the "every attacker" test passes if each attacker is across some mix of mountain hexside, river hexside, or out of a marsh. It never stacks with Hill/City doubling (9.1).
  - Engine `combat.ts:defenseOf`: `terrainDoubles` must drop `marsh`. The `allAcrossRiver` predicate must accept `river || mountain || pass || origin marsh` for each attacker.
- **9.8 Parenthesized Units — SAME (Salerno 8.4.6).**
- **9.9 Other Modifiers — CHANGED (9.9).**
  - Disrupted defenders are halved; Full Retreat units defend at 0; Out of Supply attackers are halved.
  - **Only Rain-and-Mud gives one shift left;** plain Rain (box E) gives none.
  - Engine `computeOdds`: key the shift on `weatherBox(s).crtShiftLeft` (or `mud`), not `rain`. Italy box E has `rain: true` with no shift.

### 10 Combat Results

- **10.1 Explanation of Combat Results — CHANGED (10.1).**
  - DS: the defender loses one step (attacker's pick); survivors retreat 4 hexes in Full Retreat; no DD.
  - DR4: retreat 4 hexes in Full Retreat; no DD.
  - D1: lose one step, then retreat **2** hexes Disrupted or make a DD (Salerno: 3).
  - A1/D1, DR2, DRX, A1/DR2 and EX are as in Salerno.
  - A1: the attacker loses a step.
  - **There is no "Dis" result.**
  - The advance length now comes from the cell's own Adv 1, Adv 2 or Adv 2+ code (14.2). Salerno gave each result a fixed advance per unit type: DS 4/2, DR4 3/2, D1 3/2, others 2.
  - Engine `combat.ts:resolveAttack`:
    - `dist = r === 'D1' ? 3 : 2` becomes 2 for Italy (make it data: `results.D1.retreat`).
    - The `Dis` branch is unused.
    - DS's `cell.adv || 4` and the Auto DS cell `{adv: 4}` must become the Italy maximum, "2+".
  - `combat.ts:parseCell` must accept `2+`. Today `DR4/2+r` → strip `r` → `DR4/2+` fails the `\/(\d)$` match, so the result string becomes `DR4/2+` with advance 0, which is a live bug for the Italy CRT. Return `{adv: 2, bonus: true}`.
- **10.2.1 Who Picks — SAME (10.2.1).**
- **10.2.2 Step Loss Guidelines — SAME (10.2.2).**
- **10.3 Indicating Step Losses — SAME (10.3).**
- **10.4.1 Remnants — SAME (10.4.1) plus notes.** The US glider regiment uses the airborne Remnant. Mountain infantry may use infantry Remnants but lose their mountain abilities. Pools in the OOB: GE-INF ×4, GE-MOT ×1, US ×3, BR ×3, FR ×2, plus named single remnants. The British have only three Remnants (Hints).
- **10.4.2 Remnants Not Mandatory — SAME (10.4.2).** The engine gap noted in the inventory (the owner cannot decline) carries over.
- **10.4.3 Remnant Elimination — SAME (10.4.3).**

### 11 Determined Defense

- **11.1 In General — SAME (11.1).**
- **11.2.1 Procedure — CHANGED (11.2.1).**
  - Roll **two dice**.
  - Columns: "City or Fortification" (City hexes or a fort), "Clear" (clear hex with no town), "Other" (everything else).
  - Engine `combat.ts:defenderHexTerrain`: return 'City' when the hex has a completed fort.
  - `resolveDefense`: roll 2d6 and look up the row through `RULES.dd.rows` (Italy `determinedDefense.rolls` = [2,4,5,…,12], where row 0 covers 2–3 and the last row covers 12 or more), clamping the modified total to at least 2. The Salerno path (1d6, clamp 1–7, `table[col][eff-1]`) stays for Salerno.
- **11.2.2 CRT Background Colors — SAME (11.2.2).** Orange gives −1; red allows no DD.
- **11.2.3 Lead Units — SAME (11.2.3).**
- **11.2.4 Die Roll Modifiers — SAME (11.2.4).** +1 elite lead, −1 low-quality lead, −1 orange cell, +1 DD Support; maximum +2 (no battleship +3).
- **11.3 DD Support — CHANGED (Salerno 11.3).**
  - One Ready Air, ASU or Naval marker in range, of the Lead Unit's **Army** (Salerno: nationality).
  - A Division ASU needs a unit of its division in the hex.
  - Declare before rolling; at most +1.
  - The naval marker serves both Armies (9.6).
  - Engine: `resolveDefense` and `defensiveSupportOptions` compare `supportNation`; with the Army mapping this works. Add the single naval key.
- **11.4.1 List of Results — CHANGED (11.4.1).**
  - Results are F (fail), H (hold) and P (partial: Battle marker), each with losses written attacker/defender: 0/0, 0/1 (Lead Unit loses a step), 1*/1 (both lose a step; the defender picks the attacker's, which must come from the MAF), 1/0 (the attacker loses a step of his choice).
  - Salerno's D (Delay) and 1/dis H are gone.
  - Engine `resolveDefense`: the parser splits on space and `/`; Italy writes `0/1 F`. Map `F` to fail and ignore the `0`.
- **11.4.2 Single Step Defenders — SAME (11.4.2).**
- **11.4.3 Failed Determined Defense — CHANGED (Salerno 11.4.4 + 11.5 Desperate Defense).**
  - On F the defender retreats unless it has no retreat path.
  - If **every** unit would die retreating, the Lead Unit loses a step (unless it just lost one in a 0/1 F) and the defender rolls again, treating each later F as 0/1 F, until it holds or is wiped out.
  - The DD Support modifier applies to every roll.
  - Differences from Salerno:
    - The name "Desperate Defense" is dropped.
    - The port/beachhead eligibility (Salerno 11.5.2, second bullet) is gone.
    - Delay rules are gone.
    - Italy does not say whether a new Lead Unit may be chosen after each failure (Salerno 11.5.3 allowed it). The rulebook example simply moves on to the only unit left.
  - Engine: `resolveAttack`'s `desperate` flag must drop `retreatCutsSupply`. Keep the per-failure `loseStep`. Remove the Delay logic.
- **11.4.4 Vehicle Units with No Retreat — SAME (Salerno 11.5.4).** Those that can retreat do; the rest fight on.
- **11.5.1 Battle Markers — CHANGED (Salerno 11.6.2).**
  - Used only when attacking a City (minor or major) or a Fortification.
  - Earned on a P result.
  - An F in a city or fort is treated like any other F.
- **11.5.2 Minor Cities and Level 1 Forts — CHANGED (11.6.2).**
  - The first P places Battle 1 and cancels the retreat.
  - A P in a *later* turn counts as F: remove the marker, the defenders retreat 2 hexes Disrupted, and the attacker gets a Limited Advance. Salerno turned a second P into a Delay (1–3 hexes).
  - If the defender has no retreat path, apply the P's step losses and roll again until H or no steps are left, treating any P (0/0, 1/0, 0/1, 1*/1) as 0/1 F.
- **11.5.3 Major Cities and Level 2 Forts — NEW.**
  - These absorb two P results: the first places Battle 1, the second flips it to Battle 2.
  - The third P forces the 2-hex Disrupted retreat with a Limited Advance; the no-retreat-path case is as in 11.5.2.
  - Engine: `s.cityBattle[hex]` becomes a count with a capacity of 1 or 2 (major city flag, or fort level). `resolveDefense`: `if (P && count >= capacity) → forced retreat 2 + Limited Advance`.
- **11.6 Removing Battle Markers — CHANGED (Salerno 11.6.3).**
  - Removed in any Movement or Combat Phase when the attacking side moves into the hex, or once a Movement Phase ends with no enemy next to it.
  - Salerno removed it when the defender left or when no enemy was adjacent, checked at any time.
  - Engine `game.ts:dropCityBattles`: run on attacker entry, and at the end of each Movement Phase for the no-adjacent test.

### 12 Retreats

- **12.1.1 Length of Retreat — SAME (12.1.1).**
- **12.1.2 Stopping a Retreat — CHANGED (Salerno 12.1.5).**
  - A retreat may stop early on entering a friendly City, **a Fortification**, or **after crossing a mountain hexside**.
  - The stop hex may not be in an EZOC unless a friendly combat unit not in the retreat is already there.
  - Salerno allowed City, or a beachhead for the Allies.
  - Engine `retreat.ts:friendlyCityOrBh`: add a friendly completed fort, add "previous step crossed a mountain hexside", drop the beachhead test, and add the EZOC condition.
- **12.1.3 Retreat Direction Guidelines — CHANGED (12.1.3).** In priority order:
  1. avoid elimination;
  2. move away from the original hex each step if possible;
  3. **toward a Supply Source** if possible (new);
  4. end in supply.

  Salerno's guideline 3 (only the first hex may be in an EZOC) and guideline 5 (avoid mountain hexsides) are **gone**. Engine `retreat.ts:retreatChoices`: drop the `laterZoc` and `halfEff` filters for Italy and add a "distance to the nearest supply source decreases" filter.
- **12.1.4 Overstacking — SAME (12.1.4).**
- **12.1.5 Stacks — SAME (Salerno 12.1.2).** The existing engine gap (stacks cannot split) remains.
- **12.2 Elimination Due to a Retreat — CHANGED (12.2).**
  - The causes are unchanged: an enemy-occupied hex; crossing or entering an enemy bond; two consecutive vacant EZOC hexes; stopping in an EZOC (one extra hex allowed); off the map except into a friendly Entry Area; prohibited hexes or hexsides; terrain (12.3).
  - **New:** entering the same hex twice in one retreat.
  - Dropped: Salerno's "MA of 0".
  - Engine `allRetreats`: the DFS already forbids revisits through `visited`, so this is satisfied.
- **12.3.1 Rivers and Retreat — CHANGED (12.3.1).** A vehicle that must retreat over an unbridged **major** river is lost whatever the weather; over an unbridged **minor** one, only in Rain or Mud. Salerno killed them across any unbridged river. With optional 25.3, a Pontoon lets vehicles retreat across a major river. Engine `allRetreats/evaluate`: make the `hs.river` test conditional on river class and `weatherBox(s).rain`.
- **12.3.2 Mountain Hexsides and Retreat — CHANGED (12.3.2).** Vehicles die crossing a non-road, non-pass mountain hexside. **Other units suffer nothing** (no ½ Eff, no elimination for two crossings; the "Important Differences" box confirms this). Engine `evaluate`: drop `mountainCount >= 2 → lost` and the `halfEff` add for Italy.
- **12.4 Elimination Does Not Reduce the Advance — SAME (12.4).**
- **12.5 Combat Against Previously Retreated Units — SAME (12.5).**

### 13 Disruption and Recovery

- **13.1.1 In General — SAME (13.1.1).**
- **13.1.2 How Units Become Disrupted — CHANGED (13.1.2).** Any unit that retreats because of a CRT result is Disrupted; there is no "Dis" result.
- **13.1.3 Full Retreat — SAME (13.1.3).**
- **13.2.1 Penalties — SAME (13.2.1).**
- **13.2.2 Abilities Retained — SAME (13.2.2).** Italy says "defensive Tank Shift", which is the same thing.
- Salerno 13.2.3 (no effect on other units) has no Italy case. It is harmless and implied.
- **13.3.1 Full Retreat Benefit — SAME (13.3.1).**
- **13.3.2 Full Retreat Penalties — CHANGED (13.3.2).**
  - (a) The +2 MP EZOC-exit exemption now sits here, for every Full Retreat unit.
  - (b) **New:** if an EX removes the last Good Order or Disrupted step in a hex, the Full Retreat units left there automatically retreat 2 hexes.
  - (c) **Elimination happens only at the start of an *enemy* Movement or Combat Phase** (Salerno: any Movement or Combat Phase).
  - Engine:
    - (b) In `resolveAttack`'s EX branch, after the losses, call `retreatStack` on the remaining Full Retreat defenders (2 hexes).
    - (c) In `retreat.ts:eliminateExposedFullRetreat`, skip units of `s.activeSide`.
- **13.3.3 Abilities Retained — CHANGED (13.3.3).** Full Retreat units still bar enemy Extended Movement next to them, **and count for Operational Movement (5.2.2)**.
- **13.3.4 Voluntary Full Retreat — SAME (13.3.4).**
- **13.4 Recovery Phase — SAME (13.4).**
- **13.5 Rally Table — CHANGED (13.5).** 1–4 no change, 5–6 recover. Modifiers: **+2 in a City or a completed Fortification** (Salerno: beachhead or City), +1 elite, −1 low quality, clamped 1–6. Engine `game.ts:doRecovery`: the loader reads `rally.bhOrCityDrm`, while Italy's key is `cityOrFortDrm`. Add the fort test and drop the beachhead test.

### 14 Advance After Combat

- **14.1 The Basics — SAME (14.1).** ASUs never advance (17.2).
- **14.2.1 Adv 1, Adv 2 — CHANGED (14.2.1).** The number of hexes comes from the cell.
- **14.2.2 Adv 2+ — NEW.**
  - Mechanized units may advance a third hex if that hex is entered along a road or is Clear terrain.
  - Non-mechanized units never advance more than 2.
  - Engine:
    - `combat.ts:advanceAllowance` must give mechanized units 3 when the cell is 2+, 2 otherwise.
    - `advanceDestinations` must allow the third step only along a road hexside or into a clear hex.
    - The OOB `maxAdv: 4` for mechanized categories is harmless but should be 3.
- **14.2.3 Limited Advance — CHANGED (Salerno 14.2.2).** Into the vacated hex only, after an EX or a successful DD that leaves the hex empty, or a retreat forced by repeated Partial results (11.5). Salerno's Delay trigger is gone.
- **14.3 Advance in Any Direction — SAME (14.3).**
- **14.4.1 EZOCs — SAME (14.4.1).**
- **14.4.2 Enemy ZOC Bonds — SAME (14.4.2).**
- **14.5 Terrain and Advance — CHANGED (14.5).**
  - No advance into a hex or across a hexside forbidden in movement.
  - **Must stop on entering a City or Marsh** (unless following a road through the marsh).
  - Mountain hexsides: vehicles never cross a non-road, non-pass one; other units cross only as the first hex, into the hex they attacked. **No ½ Eff** unless 25.2 is used.
  - **Major rivers:** first hex only, into the attacked hex.
  - Differences from Salerno:
    - Salerno stopped advances in **Hills** (unless by road) and restricted **every** unbridged river crossing to the first hex. Italy has no Hill stop and puts no restriction on **minor** rivers.
    - Italy adds a City stop.
  - Engine `combat.ts:advanceDestinations` and `breakthrough.ts:stepCheck`:
    - Remove the hill stop and the `hillRoad` logic.
    - Add a city stop.
    - Apply the river first-hex rule to major rivers only.
    - Stop setting `halfEff` in `applyAdvance` when the option is off.
  - The TEC marks the *Mountain Pass* row's advance cell "(14.5)", which can be read as putting passes under the first-hex rule too (Appendix B).

### 15 Breakthrough Combat

- **15.1 In General — SAME (15.1).** An advance of 2 or more allows it.
- **15.2.1 Sequence — CHANGED (15.2.1).**
  - A group makes **at most one** breakthrough combat.
  - If it succeeds, the group either enters the vacated hex and stops, or stays where it attacked from and stops.
  - Salerno let a group that scored DR4 or DS keep advancing and attack again.
  - Engine `breakthrough.ts:finishBreakthroughCombat`: `mayContinue` is always false for Italy.
- **15.2.2 The Breakthrough Group — SAME (15.2.2).**
- **15.2.3 Forming the Group — SAME (15.2.3).** It costs 1 hex.
- **15.2.4 Splitting — SAME (Salerno 15.2.9).**
- **15.2.5 Changing Directions — SAME (part of Salerno 15.2.4).** Declining the vacated hex costs 1 hex. The examples confirm that an attack costs 1 hex and that entering after a success is free.
- **15.2.6 Eligible Targets — CHANGED (15.2.6).** No breakthrough attack across mountain or river hexsides except along roads **and passes** (Salerno: roads only). Engine `breakthrough.ts:targetCheck` and `combat.ts:validateAttackers(breakthrough)`: allow `hs.pass`.
- **15.2.7 Resolving — CHANGED (15.2.7).** **Neither** attacker nor defender may use ASU, Air or Naval shifts (Salerno: only the attacker was barred). Engine `computeOdds`: skip defensive air (and the new defensive artillery) when `bt`.
- **15.2.8 Failed Breakthrough — SAME (15.2.8).** Italy adds that the group stops in the hex it attacked from.
- **15.3 Against Previously Retreated Units — SAME (15.3).**
- **15.4 Breakthrough and Auto DS — SAME (15.4).** One group per Auto DS; the play note now says "2-6 hexes".

### 16 Supply and Isolation

- **16.1 Supply Phase — SAME (16.1).**
- **16.2.1 German Supply Sources — CHANGED (16.2.1).** The North Entry Areas (N1–N4) plus any friendly East Entry Area (Salerno: N1, N2 and friendly S/E areas).
- **16.2.2 Allied Supply Sources — CHANGED (16.2.2).** Any friendly-controlled **Naples** city hex, any south-edge Entry Area (S1, S2 from Turn 1), any friendly East Entry Area. No beachheads or ports. Engine `supply.ts:supplySources`: Allied sources become "Naples hexes controlled by the Allies" (a map list `MAP.alliedBase` or a hex flag) plus friendly areas. Drop `beachheadHexes` and `usablePorts`.
- **16.3.1 In General — SAME (16.3.1).**
- **16.3.2 Overland Portion — SAME, with additions (16.3.2).**
  - 5 hexes; marsh off-road counts 2.
  - No crossing all-sea hexsides, or mountain hexsides except by road or pass.
  - **Mountain units may cross one adjacent non-road, non-pass mountain hexside (19.3).**
  - A unit in a full Mountain hex without road or pass is always out of supply, though not necessarily isolated. Salerno's note said "without a road", but the engine already admits passes.
  - No enemy hex, no enemy bond, no two consecutive EZOC hexes (friendly units cancel EZOCs).
  - Engine `supply.ts:overland`: allow the first step across a mountain hexside when the traced unit is a mountain unit. The checker is per hex today, so it needs a per-unit flag.
- **16.3.3 Road Portion — SAME (16.3.3).**
- **16.3.4 Control Markers — CHANGED (16.3.4).**
  - Control applies only to City and VP hexes (no ports). There are no control markers in the box.
  - A vacant enemy City or VP hex blocks a LOS.
  - **A vacant German fort marks German control and blocks an Allied LOS and LOC (18.2.1).**
  - Engine `supply.ts:makeCtx/enemyControlled`: drop `d.port`. The default owner must come from scenario data, not `?? 'German'`, because Naples starts Allied. Add the vacant-fort block for Allied traces.
- **16.4 Out of Supply Penalties — SAME (16.4).**
- **16.5.1 Isolation Defined — SAME (16.5.1).**
- **16.5.2 Isolation Attrition — SAME (16.5.2).**
- **16.5.3 Table — SAME (16.5.3).** 1–4 lose a step, 5–6 no effect.
- **16.5.4 Procedure — SAME (16.5.4).**
- **16.5.5 Modifiers — SAME (16.5.5).** +2 for a LOS to a friendly City or Corps ASU (not cumulative); +1 for Allied units on Clear turns.
- **16.5.6 Permanent Elimination — SAME (16.5.6).**

### 17 Artillery Support Units

- **17.1 In General — SAME (17.1).**
- **17.2 Properties — CHANGED slightly (17.2).**
  - No stacking value; one step; ZOC but no bond; **never advance after combat** (Salerno: not after shifting).
  - Replaced only with a Special replacement and returned Fired.
  - The Corps ASU gives the isolation modifier; ASUs never lead a DD; Corps and Division ASUs are return locations.
- **17.3 Moving ASUs — CHANGED (17.3).**
  - ASUs are vehicles.
  - An ASU that used **only Tactical Movement** may give a shift.
  - One that moves **more than two hexes** becomes Disrupted (Salerno: more than one hex).
  - Engine `game.ts:applyAction('move')` tests `u.hexesMoved > 1` → make it data, 2 for Italy.
  - `combat.ts:readyAsusFor`: an ASU that moved this turn by normal or Extended Movement may not fire (literal reading; Appendix B).
- **17.4 Range — SAME (17.4).** Traced to the defender's hex, for attack, defense and DD.
- **17.5 Ready and Fired Sides — SAME (17.5).** 1 SP readies one ASU in the Initial or Supply Phase, if it is Good Order and can trace a LOS at that moment. The pointer to 19.1 is new.
- **17.6.1 Offensive Support — SAME (17.6.1).**
- **17.6.2 Defensive Support — CHANGED (17.6.2).** An ASU gives either one shift left (9.5.4) **or** +1 on a DD roll (Salerno: only the DD +1).
- **17.6.3 Restrictions — CHANGED (17.6.3).**
  - The ASU must be in range, Ready and Good Order (the ½ Eff clause is gone).
  - It may support its own hex, may fire while adjacent to the enemy, and may fire while stacked with a unit taking a replacement.
  - Division ASUs support only their own division; German Corps ASUs and Nebelwerfers support any German combat; Allied Corps ASUs follow 8.6.
- **17.7 Artillery in Ground Combat — SAME (17.7).**

### 18 Fortifications — all NEW (Salerno 18 is beachheads, see 3.2)

- **18.1.1 In General.** In each German Initial Phase the German player may either start one fort (place it on its "Under Construction" side) or complete one (flip it). Any land hex, cities included.
- **18.1.2 Level 2.** A completed Level 1 fort may be upgraded the same way: put the Level 2 marker on top while it is being built. When the Level 2 is done, the Level 1 marker is removed and may be reused.
- **18.1.3 Restrictions.**
  - The counter mix limits the number; removed forts may be rebuilt. The Play Notes say at most 12 forts on the map. The Bernhard set-up in oob.json uses 8 Level 1 forts plus a pool of 4 Level 2 forts.
  - The hex must be in German supply when the fort is started and when it is completed.
  - No start or finish in an EZOC unless a friendly combat unit is in the hex.
  - No start or finish in a hex with a Battle marker.
  - **All 8 Level 1 forts must have been started before any is completed.**
  - **Level 2 only on or behind the Gustav Line.**
- **18.1.4 Enemy Adjacent.** If an enemy unit is adjacent, starting or completing needs a d6 roll of 3–6. On 1–2 the build for that turn is lost.
- **18.2.1 Vacant Forts.** A vacant fort is a marker, so it cannot be attacked and does not slow movement or advance. It shows German control and blocks Allied LOS and LOC.
- **18.2.2 Effects.** Level 1 gives 1 column shift left, Level 2 gives 2, cumulative with terrain doubling. No tank shift either way. DD uses the City-or-Fort column and may earn Battle markers.
- **18.2.3 Removal.** The owner may remove a fort at any time in his own turn; it must be removed when an enemy unit enters the hex.
- Scenario: **S1 ignores forts entirely** (S1.3 item 2).
- Engine work:
  - New state `s.forts: Record<HexId, {level: 1|2, building?: 1|2}>` plus `s.fortStarted` (a count of Level 1 forts begun).
  - A new action `buildFort` (start, complete or upgrade) in the German Initial Phase, with the checks above and the 3–6 roll.
  - In `computeOdds`: a fort shift of −1 or −2 (including Auto DS), and no tank shift.
  - `defenderHexTerrain` returns 'City' for a fort; `resolveDefense` uses Battle-marker capacity 1 or 2.
  - `doRecovery` gives the rally +2 in a fort; `retreat` may stop in a fort.
  - `supply.makeCtx` treats a vacant fort as blocking for Allied traces.
  - Remove the fort when an Allied unit enters (in `moveAlong`, `applyAdvance` and `breakthrough.moveGroup`).
  - Map data must hold the Gustav Line ("on or behind").
  - Fort effects should count only for *completed* forts. Rally explicitly says "completed"; for the other effects it is implied (Appendix B).

### 19 Special Units

- **19.1 Nebelwerfer Regiments — CHANGED (19.1).**
  - The Germans have **two** (71 and 56). Each shifts and gives the DD +1 like a Corps ASU.
  - Free flip: in the Weather Phase, on a weather roll of 2–4, the German may ready **one** Nebelwerfer that is in supply and in Good Order (23.3.3). Salerno readied the 71st free every German Initial Phase if it was in supply.
  - Since 3.0 drops Salerno's "except the Nebelwerfer", Nebelwerfers may also be readied with SPs.
  - Engine: move the Nebelwerfer flip out of `game.ts:doInitial` into `doWeather` (one unit, roll 2–4). In `doSupply`, drop the `cat !== 'nebelwerfer'` exclusion from SP readying for Italy.
- **19.2 Reconnaissance Units — CHANGED (Salerno 25.2, optional there; standard here).**
  - A recon unit, or **a stack of only recon units**, ignores the step loss of a D1 or DS (not the retreat); EX, DRX and A1/D1 losses apply normally.
  - No DD in the same Combat Phase in which this was used.
  - Engine `resolveAttack/reconAlone`: drop the `s.options.recon` gate and require "every defender is recon" instead of `ids.length === 1`.
- **19.3 Mountain Units — NEW.** Seven units, 1SSF included, get four benefits:
  1. They may cross a mountain hexside in movement without starting adjacent to it.
  2. They are not halved attacking across one.
  3. They get no ½ Eff for crossing one.
  4. Their LOS may cross one adjacent non-road, non-pass mountain hexside.

  They lose all of this as a Remnant (10.4.1).

  Engine: add `UnitDef.mountain` (done). Use it in `movement.stepCost/reachable` (exempt from the start-adjacent and first-hex tests), `combat.evalMaf` (no mountain halving), `supply.overland` (one free mountain step) and `losses.loseStep` (a Remnant does not inherit it).

  Data check: `data/italy43/oob.json` flags 6 French and German mountain units **plus the two French Remnants** (8 in all) but **not US-1SSF**. The rule says seven, counting 1SSF. Flag 1SSF and unflag the Remnants.
- **19.4 Heavy Howitzers — NEW.** The US 8-inch unit (OOB `US-M1`, stacking value 0).
  - It is an ASU in every respect, but it gives no shift and no DD +1.
  - If it is stacked with a **US Army Corps ASU** and fired together with that Corps ASU's CRT shift, the defender must reroll each 6 on a DD roll of that combat. If both dice are 6, both are rerolled; a 6 on a reroll stands.
  - It flips to Fired when used, even if the defender makes no DD.
  - It readies **only** free in the Weather Phase, on a weather roll of 2–4, if it is in supply and Good Order. Never with SPs.
  - Engine: `AttackPlan.heavy?: string`. Validate stacked with a Corps ASU in `plan.asus`; presumably it must also be in its own range. Store it on `pendingDefense`. In `resolveDefense`, roll 2d6 and reroll 6s once. Exclude it from `doSupply` SP readying and from `readyAsusFor` shift options. Ready it in `doWeather`.

### 20 Replacements

- **20.1.1 In General — SAME (20.1.1).**
- **20.1.2 Types — CHANGED (20.1.2).**
  - **Infantry** replacements serve Infantry, **Mountain**, Motorized and PG units, but not the Special list.
  - **Special** replacements serve Commandos, Rangers, Fallschirmjäger/Airborne, Glider, **the 100th/34th (Nisei) battalion, 1SSF**, ASUs and Recon. They may also be used as Infantry.
  - **Tank/Panzer** replacements serve Tank **and Recon** units.
  - Gone: Salerno's Garrison (Infantry) and Engineer (Special).
  - Engine:
    - `UnitDef.repl` must allow a list, e.g. recon `['armor','special']`.
    - `game.ts:applyReplacement/spend` must try each allowed type.
    - Per-unit overrides are needed: `US-100` and 1SSF take Special, though their categories (infantry, ranger) would say Infantry or already Special.
- **20.1.3 Nationality — NEW.** A replacement may be used only on its own nationality: FR, IT, Br, US or Ge. The Hints say Allied elite units need Special or French replacements.
  - Engine: `types.ts:ReplPool` gains `'FR' | 'IT'`.
  - `game.ts:replPool` must map by nation; today FR and IT fall into BR.
  - `doInitial` must loop over Allied pools `['BR','US','FR','IT']`.
  - `emptyRepl` and `s.replacements` need the new pools.
- **20.2 Restrictions — CHANGED (20.2).** In supply and Good Order; at most one per unit per turn. **New bullet:** replacements are lost when a scheduled removal is already eliminated (22.2.2).
- **20.3.1 Eligible Locations — CHANGED (20.3.1).**
  - A returning unit goes to a **friendly Entry Area** (both sides; the Allies have no Floating Reserve), or to a hex with a friendly Corps ASU (**not a Nebelwerfer**) or with its own Division ASU, in supply at that moment.
  - Never adjacent to an enemy combat unit.
  - Engine `applyReplacement`: remove the `fifthArmy → reserve` branch. Allied units go to S1/S2 or an ASU hex. The Corps ASU test already uses `cat === 'corpsAsu'`.
- **20.3.2 Overstacking — SAME (20.3.2).**
- **20.3.3 ASUs Return Fired — SAME (20.3.3).**
- **20.3.4 3-Step Units — SAME (20.3.4).**
- **20.3.5 Remnants — SAME (20.3.5).** Italy adds that the unit comes back where the Remnant stood; the engine already does this.
- **20.4 Replacement Markers — CHANGED (20.4).** At most one hex of movement; **no moving into, out of or between Entry Areas** (Salerno: no moving between areas, no naval transport); no attacking, advancing or Disengagement. No combat at all out of the hex, though ASUs there may still fire. Removed in Recovery.

### 21 Reinforcements and Entry Areas

- **21.1.1 Placement — CHANGED (21.1.1).**
  - Reinforcements are placed in the owner's Initial Phase, in the Entry Area printed on the card.
  - A code "N1–3" lets the German choose N1, N2 or N3.
  - The Allies use S1/S2 or **Naples** (see 21.1.2). No Floating Reserve.
  - Engine `doInitial`: parse `at` values like "N1-3" and "S1/S2" (the `UnitSetup.arrive.at` mentions "S1/S2").
- **21.1.2 Naples — NEW.** Allied units arriving "at Naples" are placed in any of the three Naples city hexes, keeping to stacking limits where possible, and move normally that turn. Engine: an arrival kind `{kind:'pending', at:'Naples'}` → a chooser among the Naples hexes.
- **21.1.3 Entry onto the Map — SAME (21.1.3).** Full MA including Extended Movement, paying the first hex's cost (road rate if any). A unit may stay, or move to an adjacent friendly area.
- **21.2.1 Friendly and Enemy Entry Areas — CHANGED (21.2.1).**
  - **N1–N4 are always German; S1 and S2 are always Allied.**
  - No entering or retreating into an enemy area.
  - Salerno: everything German until the Allied Turn 11 turned S1–S3 Allied, and an east area fell to the first Allied unit to enter it.
  - Engine: `game.ts:doInitial`'s `SOUTH_EDGE_ALLIED_TURN` block must be off. `newGame` should set `control.S1 = control.S2 = 'Allied'`. East areas follow 5.8's section schedule.
- **21.2.2 East Edge Entry Areas — CHANGED (21.2.2).** Not used for reinforcements ("perhaps in a later expansion"), but they are supply sources when friendly (16.2).
- **21.3 Properties — CHANGED (21.3.1, 21.3.3, 21.3.4, 21.4).**
  - No stacking limit.
  - ZOCs do not extend into or out of an area. A unit may enter the map straight into an EZOC, but not into or across an enemy bond. A unit may anchor a Hexside Bond on a friendly area.
  - **No attacking into an area and no attacking out of one, and ASUs in an area may not support.** Salerno allowed attacks onto the map from an area, and ASU support to adjacent hexes.
  - Retreat off the map into an enemy area eliminates the unit. Into a friendly area, the unit is placed there Disrupted or in Full Retreat, and must be Good Order to come back on.
  - Engine:
    - `combat.ts:adjacentForCombat` must return false for units in an area.
    - `readyAsusFor` must exclude `where.kind === 'entry'`.
    - `validateAttackers`: the stacking check for attackers from an area becomes moot.
- **21.4.1 Movement into an Entry Area — SAME (Salerno 21.3.2).** 1 MP, or one hex by Tactical Movement; the unit stops and may not leave before the next turn.
- **21.4.2 Movement Between Entry Areas — CHANGED (Salerno 21.5).** Costs the whole MA; Good Order only; no limit on numbers. **S2 is not adjacent to E1.** Salerno's N1–N2 (Germans only) and N2–E5 restrictions, and its no-attack/no-support-after-moving clause, are gone. Area adjacency must be map data.

### 22 Withdrawals, Returns and Removals — all NEW

- **22.1 Withdrawals and Returns.**
  - A unit the card says withdraws is taken off at once, whatever its supply or position, and placed on the turn track for its return turn, keeping its current step level.
  - If it is in the Eliminated Box when due, it does not return unless it receives a replacement. A replacement may be spent on a withdrawn unit while it is off the map.
  - It returns like a reinforcement.
- **22.2.1 Removal.** Gone for good, to the Permanently Removed box.
- **22.2.2 Eliminated Removals.**
  - If a unit due for removal is in the Eliminated Box or the Remnant Display, its owner forfeits one replacement step of that nationality due that turn.
  - If a group removal finds two or more of its units there, the owner forfeits **all** of that nationality's replacements that turn.
  - A US unit's loss never costs the British their replacements, nor the other way round. No penalty if the unit is only reduced.
- Rule Reminder 5 repeats this. The Play Note under S1 says the first three German units to go carry a stripe.
- Engine:
  - The `UnitEvent` (`remove | withdraw | return | release`) is the right shape.
  - In `doInitial` for the owning side: process the events first; compute the forfeit before handing out replacements (`s.replacements[pool]` set to zero, or reduced by one); then replacements.
  - `vpBreakdown`: a removed or withdrawn ASU is *not* in the Eliminated Box, so it does not count for VPs.
  - Salerno's `withdraw16Pz` and the `WITHDRAWAL` export must be optional; `data/italy43/oob.json` has none, and `doInitial` dereferences `WITHDRAWAL.turn`.

### 23 Weather Phase (Salerno 22)

- **23.1 Track and Table — CHANGED (22.1).**
  - One die moves the marker 0, 1 or 2 boxes; past F it loops to A.
  - The loop triggers 23.3.4.
  - Italy states no "from Turn 2" rule because both start scenarios begin with the weather already done (S2.3.1, S3.3.1).
  - Salerno's track starts in box A; Italy's starts in E (campaign) or B (Bernhard).
- **23.2 Air and Naval Markers — SAME (22.2.1).** The box sets which markers are made Ready. There is no Luftwaffe (Salerno 22.2.2/22.2.3 are N/A).
- **23.3.1 Supply Points — SAME (22.3.1).** Points per the box; **cap 19 per side**.
- **23.3.2 Port of Naples — CHANGED (Salerno 22.3.2 Salerno port).** From Turn 14 the Allies get +1 SP each Weather Phase; from Turn 24, +2 instead. This is unconditional. Salerno's bonus depended on capturing Salerno and on the starred boxes. Engine `doWeather`: replace `alliedPortBonus && salernoPortOpen` with `RULES.naplesSupplyBonus` by turn (the data has it).
- **23.3.3 Nebelwerfer and Heavy Howitzer — NEW.** On a weather roll of 2–4, the German may at once ready one Nebelwerfer and the Allies the Heavy Howitzer. The flip cannot be saved; it is lost if no unit qualifies. Both units must be in supply and Good Order (19.1, 19.4).
- **23.3.4 Division ASU Supply Bonus — NEW.**
  - When the marker loops from F to A, at once ready every Fired Division ASU **on the map**, including when a 2-box move jumps over A. This does not apply to units in the Eliminated Box or to reinforcements arriving that turn.
  - Corps ASUs and Nebelwerfers do not benefit.
  - Engine `doWeather`: `looped = s.weather + adv >= n`, then ready all `def.asu === 'division'` units with `where.kind === 'map'`.
  - The rule does not say whether Disrupted Division ASUs flip (13.2.1 forbids readying Disrupted ASUs); Appendix B.
- **23.4 Other Effects — CHANGED (22.4, 22.5).**
  - Clear: Allied +1 on isolation rolls.
  - Cloudy: no effect.
  - **Rain:** vehicles may not move, attack or retreat across unbridged rivers. **No CRT shift.**
  - **Rain-and-Mud (new box F):** as Rain, plus one shift left on every attack.
  - Salerno's Rain gave the shift.

### 24 Victory Points and Automatic Victory (Salerno 23)

- **24.1.1 In General — CHANGED (23.1.1).** Only the Allies score. VP hexes carry red circles with their value. A hex counts only if Allied-controlled with a LOS to an Allied-controlled **Naples** hex or a friendly Entry Area in the Victory Check Phase. Salerno traced to a port, beachhead or friendly area. Engine `vpBreakdown` uses `supplyChecker`; with the new Allied sources it works.
- **24.1.2 Critical Units — SAME (23.1.2).**
  - −1 per Allied airborne or glider regiment in the Eliminated Box (not a 1-step battalion or a regiment standing as a Remnant).
  - −1 per Allied ASU eliminated; +1 per German ASU eliminated.
  - The effect is temporary: undone by a replacement.
  - Engine: keep. Drop the BH, N1/N2 and isolated-hex branches (Salerno 23.1.3, 23.1.4, S2.4) for Italy.
- **24.2.1 Benchmarks and Automatic Victory — CHANGED (23.2).**
  - Benchmarks run **from Turn 2** (Salerno: Turn 4).
  - The Allies win at once in the Victory Check Phase with benchmark +5 or more, or 20 or more VPs.
  - The Germans win at once at the end of any turn when the Allies are 5 or more short.
  - Engine `doVictoryCheck` is data-driven already (it reads benchmarks with `null` before Turn 2).

### 25 Optional Rules

- **25.1 Major Assault — NEW (25.1.1–25.1.3).**
  - Declared in the phasing player's Combat Phase.
  - For each extra SP spent (at most 2), roll one extra die (at most 3 dice) and use any one of them.
  - A Ready Corps ASU must take part and give its Corps shift, which rules out naval support in practice.
  - Not available in Auto DS or Breakthrough, since neither may use ASUs.
  - Engine: `AttackPlan.majorAssault?: 1|2` → `resolveAttack` rolls `1 + n` dice. The pick should be the attacker's choice (or the best for the AI), and SPs are spent. Add an option flag in `GameOptions`.
- **25.2 Half Effectiveness — CHANGED (Salerno 5.7, standard there).**
  - Optional now.
  - It is triggered only by a non-mountain unit crossing a mountain hexside off road or pass (in movement or advance), or a vehicle crossing an unbridged river. Naval transport and airdrops are gone.
  - Effects unchanged: attack halved; advance at most 1 hex; no voluntary act that would earn a second marker; no attacking across mountains (vehicles: across rivers). Removed in Recovery; not placed if the unit does not end adjacent to the enemy.
  - Engine: gate every `halfEff` placement (`reachable`, `applyAdvance`, `allRetreats`, `arriveBySea`) behind `options.halfEff`. Exempt mountain units.
- **25.3 Pontoon Bridges — NEW.**
  - No counters. A pontoon exists across a major-river hexside whenever both hexes on that hexside hold friendly combat units. The moving unit may be one of them; status and supply do not matter.
  - It appears and vanishes the moment that condition holds or ends, in the Movement and Combat Phases.
  - A pontoon-forming unit that has not moved may still move after others have used the crossing.
  - Effect, in Clear and Cloudy weather only: a unit may cross that hexside without starting adjacent, and vehicles may retreat across it.
  - Pontoons are washed out in Rain.
  - Engine:
    - `movement.ts:stepCost`: a major-river crossing is not first-hex-only when the destination hex holds a friendly combat unit (the moving unit itself occupies the origin) and the weather is not rain.
    - `retreat.ts:evaluate`: a vehicle survives a major-river crossing on the same condition.
    - The rule says the two hexes "tangent to the River hexside". I read that as the two hexes the hexside separates, which is what the example shows (Appendix B).
- **25.4 Disengagement — CHANGED (Salerno 25.1).**
  - Table: 1–2 Fail, 3 Success with −1 step, 4–6 Success.
  - Modifiers: +1 mechanized (all of the stack); **+1 elite (all of the stack); −1 low quality (any unit)**; clamped 1–6.
  - Eligible: any unit (Disrupted ones too) that has not attacked, **is not under a Replacement marker, and is adjacent to an enemy unit**.
  - Roll per unit or per stack.
  - Success: retreat 1–2 hexes and become Disrupted (or Full Retreat if already Disrupted), following all retreat rules. Salerno's extra "not into an EZOC unless a friend is there" clause is dropped, but 12.2 kills a unit stopping in an EZOC anyway.
  - Engine `combat.ts:resolveDisengage`: add the elite and low-quality modifiers from `RULES.disengagement` (Italy keys `eliteDrm`, `lowQualityDrm`), and require an adjacent enemy.

### Scenario rules, Play Notes, Hints and Rule Reminders

- **S1.1–S1.3, S2.1–S2.3, S3.1–S3.3** are described in section 5. As a class they are NEW (S2) or CHANGED (S1 against Avalanche, S3 against Salerno's Campaign).
- Rule-relevant points from the **Play Notes and Hints**:
  - The 20-point cap makes most attacks 1-1 before shifts. A defender with 11 or more in a hex holds the attacker to 1-1.
  - The attacker has five shifts available (Artillery, Corps, Air, Tank, Elite); Naval counts as Corps. The German defender has three (Artillery, Tank, Forts).
  - Forts: at most 12 on the map.
  - Elite PG units take Infantry replacements; FJ units need Special.
  - Recon units are good delayers.
  - The Hints suggest Minturno (hex 1908) for a Level 2 fort and Mt Camino / San Pietro for Level 1 forts.
- **Rule Reminders:**
  1. An attachment must be stacked with a MAF unit.
  2. Mechanized infantry are not vehicles.
  3. No advancing from EZOC to EZOC except into or out of the vacated hex.
  4. French and Italian units attach only to US formations.
  5. Replacement forfeit on scheduled removals.
  6. Level 2 forts only on the Gustav Line.

### 3.2 N/A-SALERNO: Salerno rules with no counterpart in Italy '43

The engine must switch every one of these off for Italy (gate them by game data, not `GAME_ID` checks where possible).

| Salerno case | Rule | Where it lives in the engine |
|---|---|---|
| 2.3.1, 18.1.x | Beachhead units: combat units that never move, a supply source, the special BH defense strength, never replaced, −1 VP | `supply.ts:beachheadHexes`, `combat.ts:defenseOf` BH block, `retreat.ts:friendlyCityOrBh`, `game.ts:vpBreakdown`, `doRecovery` (+2 rally) |
| 5.7 (as a standard rule) | ½ Eff from naval transport and airdrops (the rest moved to optional 25.2) | `game.ts:arriveBySea`, airdrop table |
| 5.8 | German-only trucks with judged-at-the-instant supply (replaced by Italy 5.7) | `movement.ts:truckOk` |
| 8.4.2 | Commando Brigade as a formation | `games/salerno43/data.ts` |
| 8.4.3 | Asymmetric single attachment (Allied tank or battalion, German any unit) | `combat.ts:attachCandidates` |
| 8.5.2, S2.3, S2.3.1–S2.3.7 | 8th Army units: no joint attacks with 5th Army, the boundary line (one unit across), 8th-sector roads at 1 MP, East Edge areas for the 8th Army only, no 8th Army remnants, the German "abandon the 8th Army sector" option from Turn 16 | `data.ts` (`army8`), `combat.ts:validateAttackers`, `movement.ts:stepCost` (`alliedMechRoadIn8thSector`), `game.ts:endOfMovement`, `abandon8thSector`, `purge8thSector`, action `abandon8th` |
| 9.6 (parts) | Separate US and CW naval markers; no naval support north of Campanella Point | `combat.ts:NAVAL_MIN_ROW`, `markerFor` |
| 10.1 "Dis" | Disruption-only CRT result | `combat.ts:resolveAttack` branch |
| 11.4.3, 11.6.1 | Hold-or-Delay choice; the Delay result (retreat 1–3, Limited Advance) | `combat.ts:resolveDefense` |
| 11.5.2 (second bullet) | Desperate Defense to keep a port or beachhead in supply | `combat.ts:retreatCutsSupply` |
| 12.1.3 guidelines 3 and 5 | Only the first retreat hex may be in an EZOC; avoid mountain hexsides | `retreat.ts:retreatChoices` |
| 12.1.5 (BH part) | Allied retreat may stop at a beachhead | `retreat.ts:friendlyCityOrBh` |
| 12.2 "MA of 0" | Units with MA 0 die if they retreat | `retreat.ts:evaluate` |
| 12.3.2 (parts) | Infantry ½ Eff on a mountain retreat; death on two crossings | `retreat.ts:evaluate` |
| 14.5 (parts) | Advances stop in Hills; unbridged minor-river crossings first hex only; ½ Eff on a mountain advance | `combat.ts:advanceDestinations`, `breakthrough.ts:stepCheck` |
| 15.2.1 (part) | A Breakthrough Group may continue after a DR4/DS | `breakthrough.ts:finishBreakthroughCombat` |
| 16.2.2 (parts) | Ports and beachheads as Allied supply; south edge Allied from Turn 11 | `supply.ts:supplySources`, `usablePorts`, `SOUTH_EDGE_ALLIED_TURN` |
| 16.3.4 (port part) | Ports as control hexes | `supply.ts:makeCtx` |
| 18.2–18.4 | Ports (Sorrento and Torre Annunziata mined), Floating Reserve, Naval Transport, Landing Points (12/turn; cost by SP), port and BH capacity, 2-turn transfers, port-to-port moves (3 LP/turn), Evacuations (18.4.6, text missing from extract) | `game.ts:landingHexes`, `arriveBySea`, `navalDestinations`, `landingCapacity`, `receiveMode`, `lpCost`, `supply.ts:MINED_PORTS` |
| 19.2 | Torre Annunziata garrison (frozen until Turn 3 or Allies within 3) | `game.ts:afterMoveChecks` releases *every* frozen unit within 3 hexes of an Allied unit; Italy's frozen units need their own release rules (S3.3) |
| 19.3 | Variable-strength units (0,0,0,1,1,2) | `combat.ts:resolveAttack`, `defenseOf` |
| 19.4 | Battleships Valiant and Warspite (+1, twice, from Turn 8) | `combat.ts`, `game.ts:doWeather` (`BATTLESHIPS_TURN`) |
| 20.1.2 (parts) | Garrison (infantry) and Engineer (special) replacement types | OOB categories |
| 20.3.1 (part) | 5th Army returns to the Floating Reserve | `game.ts:applyReplacement` |
| 21.1.1–21.1.2 (parts) | 5th Army reinforcements to the Floating Reserve, landing by sea | `game.ts:doInitial` (`reserve`) |
| 21.2.1 (parts) | S1–S3 become Allied on Allied Turn 11; east areas fall on entry | `game.ts:doInitial`, `applyAction('enter')` |
| 21.2.3 | Allies and Germans coexisting in N1/N2 | `movement.ts:entryDestinations` |
| 21.3.4 | Attacking onto the map from an Entry Area; ASU support from an area | `combat.ts:adjacentForCombat`, `readyAsusFor` |
| 21.5 (parts) | N1–N2 for Germans only; no N2–E5 move; no attack or support after changing area | `game.ts:applyAction('changeArea')` |
| 21.6 | Allied airborne reinforcements and the airlanding table | `game.ts:landingHexes`, `applyAction('land')` |
| 22.2.2, 22.2.3 | Luftwaffe air marker in box C; Montecorvino airfield (hex 2811) | `game.ts:readySupport` |
| 22.3.2 | Salerno port +1 SP (hex 2707: **Monte Lungo on the Italy map**) | `game.ts:doWeather`, `supply.ts:salernoPortOpen`, `game.ts:landingCapacity` |
| 23.1.3 | −1 VP per lost beachhead | `game.ts:vpBreakdown` |
| 23.1.4 | North-edge VPs (N1 5, N2 4) | `game.ts:updateNorthVp`, `vpBreakdown`, `movement.ts:entryDestinations` |
| 24.1–24.4 | Turn 1: Invasion Combat Phase and Invasion CRT, German MA halved, Allies tactical only, Follow-Up Wave, Sugar beach | `game.ts:newGame` (`phase: 'invasion'`), `runInvasion`, `landBeach`, **`movement.ts:movementAllowance` (halving), `allowedModes` and `entryModes` (tactical only): these fire on every game's Turn 1 today** |
| 25.2 (optional) | Recon rule as an option (standard in Italy 19.2) | `s.options.recon` |
| 25.3 | Limited supply from ports | `game.ts:portSupplied` |
| S1.4 | Tournament start | `OPTIONAL_START` |
| S2.2 | 16th Panzer withdrawal on Turn 14 | `game.ts:withdraw16Pz`, `WITHDRAWAL` |
| S2.4 | Isolated German VP hexes count at the end; BH VPs ignored | `game.ts:vpBreakdown(final)`, `endGame` (`need = short ? 8 : 20`) |

---

## 4. Tables and numbers

### 4.1 Every number the rules give, compared

"S-json" means `data/salerno43/rules.json` and "I-json" means `data/italy43/rules.json`. "Hard-coded" means the value sits in `data.ts:buildRules` or engine code rather than JSON.

| Item | Italy '43 (case) | Salerno '43 (case) | S-json | I-json | Remarks |
|---|---|---|---|---|---|
| Stacking limit | 6 SP (4.1) | 6 (4.1) | 6 | 6 | Same. |
| Stacking values printed | 0–4 (4.2) | 0–3 (4.2) | — | — | The 22nd Armd Bde is a 4. |
| Free silhouetted tanks | first free, others 1 SP each (4.3) | same | — | — | |
| Extended Movement | +3 mech, +2 non-mech (5.3) | +3 all (5.3) | hard-coded 3 | absent | Needs data. |
| Tactical Movement | 1–2 hexes (5.4) | same | hard-coded 2 | — | |
| Road cost, mech | ⅓ major, ½ minor; **1 within 2 hexes of an enemy unit** (5.2.2) | ⅓, ½ (example); 1 for Allied mech in the 8th sector (S2.3.4) | 0.3334 / 0.5; 8th 1 | 0.3334 / 0.5; `operational: 1` | OM radius 2 is not in data. |
| Road cost, non-mech | 1 (TEC) | 1 | 1 | 1 | |
| Clear / Hill / Marsh / City entry | 1/1, 1/2, 2/4 (stop unless road), 1/1 (TEC) | same costs; Salerno had no marsh stop | yes | yes | Italy marsh stops a unit unless it follows a road. |
| Mountain pass | +1 non-mech, +2 mech (TEC) | +1/+2 | 1/2 | 1/2 | |
| Minor river (unbridged) | +1 non-mech, +2 mech; vehicles barred in Rain (5.5, 5.9) | +1 infantry; vehicles first-hex tactical + ½ Eff (5.5) | `riverInf` 1 | 1/2 | |
| Major river | Tactical only, start adjacent, first hex; vehicles barred in Rain (5.5) | none | — | yes | |
| EZOC enter / exit | +0 / +2 (exit free in Full Retreat) (6.2, 13.3.2) | same | exit 2 | 0 / 2 / FR 0 | |
| Trucks | 2 per side per turn, MA 5 (5.7) | 2 German, MA 5 (5.8) | hard-coded | absent | |
| 8th Army sections | E1 Allied from T8, E2 from T11, E3 from T15; N4 always German (5.8.1) | — | — | turnNotes only | Needs data. |
| Combat strength cap | 20 per side, after halving/doubling (8.5) | 20 (8.4.5) | hard-coded 20 | absent | |
| Minimum odds | 1-3 **before** shifts; below 1-3 after shifts → 1-3 (8.3.2) | <1-3 not allowed after net shifts (8.6) | — | — | Engine change. |
| Max column / auto DS | 8-1 and 9-1 on 7-1; ≥10-1 → DS (8.3.2) | same (8.6.1) | columns | columns | Same. |
| CRT columns | 1-3, 1-2, 1-1, 2-1 … 7-1 | same | same | same | Rows differ, see the CRT. |
| D1 retreat | 2 hexes (10.1) | 3 (10.1) | in `results` | in `results` | Engine hard-codes 3. |
| DR2 and others | 2 | 2 | | | |
| DR4 / DS retreat | 4, Full Retreat | 4 | | | |
| Advance lengths | from CRT: Adv 1, Adv 2, Adv 2+ (mech +1 by road or into clear) (14.2) | DS 4/2, DR4 3/2, D1 3/2, others 2; non-mech max 2 (10.1, 14.2.1) | in CRT | in CRT | |
| Non-mech advance cap | 2 (14.2.2) | 2 (14.2.1) | 2 | absent | |
| Out of Supply advance cap | 2 (16.4) | 2 | 2 | absent | |
| ½ Eff advance cap | 1 (25.2, optional) | 1 (5.7) | 1 | absent | |
| Attachments | 2: one silhouetted tank + one infantry/recon (8.4.3) | 1 (8.4.3) | — | — | |
| Attacker shifts | Tank, Air, Division, Corps or Naval, Elite (+1 each); Low Quality −1 (9.2–9.6) | Tank, Air, Div, Corps or Naval, Elite (9.2) | yes | yes | |
| Defender shifts | Tank, Air, **Artillery (max 1 incl. naval)**, Fort L1 1 / L2 2; Mud −1 on all attacks (9.5.4, 18.2.2, 23.4) | Tank, Air; Rain −1 (9.2) | tank/air/rain | tank/air/artillery/fort/rainAndMud | |
| Artillery shifts (attacker) | max 2: Division + Corps/Naval (9.5.3) | same | | | |
| Naval markers | **1**, range 2 hexes from the off-map sea, once per turn, both Armies (9.6) | 2 (US, CW), range 2, not north of Campanella (9.6) | `navalRange` 2 in OOB | **lists BR+US**, see 4.3 | |
| Air markers | US (XII ASC), BR (TBF) per the OOB; none German | US, BR, GE | | | |
| Weather boxes | A Clear, B Clear, C Cloudy, D Cloudy, E Rain, F Rain-and-Mud (track photo) | A, B Clear; C "Air Support"; D, E Cloudy; F Rain | | yes | |
| Weather movement | roll → 0/1/2 boxes; 2–4 = 1 box (examples: 3 → 1, 5 → 2) (23.1) | same table | 1:0, 2–4:1, 5–6:2 | same | Rolls 1 and 6 are not in the text; the table photo is cut off at the top. |
| Supply Points per box (Allied/German) | A 2/1, B 2/1, C 2/2, D 2/2, E 0/1, F 0/1 (track photo; 23.3.1 example A = 1 German, 2 Allied) | A 1/1 (+port), B 1/1 (+port), C 1/2, D 2/1, E 2/2, F 0/0 | | matches photo | |
| SP cap | 19 per side (23.3.1) | 19 (22.3.1) | `supply.supplyPointCap` 19 | **absent** | Loader hard-codes 19. |
| Naples SP bonus | +1 from T14, +2 from T24 (23.3.2) | Salerno +1 on starred boxes (22.3.2) | — | `naplesSupplyBonus` | |
| Free ASU flips | 1 Nebelwerfer + Hv How on weather roll 2–4 (23.3.3); all on-map Division ASUs on the F→A loop (23.3.4) | 71st Nebelwerfer free each German Initial Phase (19.1) | — | `freeFlipOnRolls` [2,3,4] | |
| SP per ASU flip | 1 (17.5) | 1 | | | |
| ASU moves before Disruption | more than **2** hexes; only an ASU using Tactical Movement may shift (17.3) | more than 1 (17.3) | hard-coded `> 1` | absent | |
| Overland LOS | 5 hexes, marsh off-road 2 (16.3.2) | 5 (16.3.2) | `supply.overlandHexes` 5 | **absent** | |
| Road portion / LOC | unlimited; LOC unlimited overland + one adjacent mountain hexside (16.3.3, 16.5.1) | same | | | |
| Isolation | 1–4 lose a step; +2 City or Corps ASU; +1 Allied in Clear; not on the first turn (16.5) | same | same | same | |
| DD table | 2d6; 10 rows (2–3, 4, 5 … 11, 12+); +1 elite, −1 LQ, −1 orange, +1 support; max +2 (11.2) | 1d6, 7 rows; max +2 (+3 with battleships) | 1d6 | 2d6 with `rolls` | |
| Battle markers | minor city / L1 fort: 1 P absorbed; major city / L2 fort: 2 (11.5) | City: 1 P, then Delay (11.6.2) | — | `battleMarkers: true` only | |
| Rally | 5–6; +2 City or completed fort, +1 elite, −1 LQ (13.5) | 5–6; +2 BH or City | `bhOrCityDrm` 2 | `cityOrFortDrm` 2 | Key name differs. |
| Disengagement | 1–2 Fail, 3 Success −1 step, 4–6 Success; +1 all mech, +1 all elite, −1 any LQ (25.4.2) | same table; +1 all mech only (25.1.2) | mech 1 | mech/elite/LQ | |
| Forts | 8 Level 1 (all started before any finished), Level 2 (4 per OOB; max 12 forts on the map per the Play Notes); 1 build step per German Initial Phase; 3–6 needed when an enemy is adjacent; −1 / −2 columns (18) | — | — | `fortification.columnShiftLeft` [1,2] | |
| Replacement steps | German 35 (21 Inf, 9 Special, 5 Tank); US 28 (14/7/7); BR 13 (7/3/3); FR 1 Special (T30); IT 1 Inf (T31) | 18 each side (Design Notes) | 18/18 | as listed | From the JSON; spot-checked against the turn-track photo. |
| Benchmarks | from T2: 1,2,3,4,5,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,14,15,15,16,16,16,17,17,17,18 for T2–T32 (24.2.1) | from T4: 6,7,7,7,8,8,8,9,9,10,10,11,11,12,12,14,16,18,20 for T4–T22 | yes | yes | |
| Automatic victory | Allied: ≥ benchmark +5 or ≥ 20 VP; German: ≤ benchmark −5 (24.2.1) | same (23.2) | hard-coded 5, 20 | absent | |
| VPs for units | −1 Allied airborne/glider regiment, −1 Allied ASU, +1 German ASU (24.1.2) | same + BH −1 + N1 5 / N2 4 | | | |
| Scenario length and win | S1: T1–7, ≥ 7 VP. S2: T13–32, ≥ 18. S3: T1–32, ≥ 18 | S1: T1–8, ≥ 8. S2: T1–22, ≥ 20 | | | `endGame` hard-codes 8/20. |
| Starting SP (Allied/German) | S1 & S3: 0/1. S2: 3/1 | 0/3 | OOB | OOB `setups` | |
| Starting weather | S1 & S3: box E; S2: box B | A | | OOB setups | |
| Starting VP | S2: 10 | — | | OOB setups (`vp: 10`) | See 5. |
| Frozen-unit release radius | 3 hexes (S3.3.3) | 3 (19.2) | | | |
| Naval target example | Castel Volturno (1815) | Salerno | | | |

### 4.2 Answers to the `_todo` in `data/italy43/rules.json`

The file has a single `_todo`: *"stacking limit, supply ranges, supply point cap, automatic victory margins: confirm from the rulebook comparison"*.

- **Stacking limit:** 6 Stacking Points for both sides (Italy 4.1). Values 0–4 (4.2); one silhouetted tank per hex is free and each further one costs 1 (4.3). Confirmed as `stacking.limit: 6`.
- **Supply ranges:**
  - The overland part of a Line of Supply is at most **5 hexes**, counting each off-road marsh hex as 2, and ends at a road hex or a source (16.3.2). The road part has **no length limit** (16.3.3).
  - A Line of Communications has an unlimited overland part and may cross one non-road, non-pass mountain hexside next to the unit (16.5.1).
  - Mountain units' LOS may also cross one such hexside (19.3).
  - Naval support reaches **2 hexes** from the off-map sea (9.6).
  - ASU range is printed on each counter (17.4). Division ASUs on the set-up cards read 4, per the OOB transcription.
  - Add `"supply": {"overlandHexes": 5, "supplyPointCap": 19}` to the Italy file. `buildRules` crashes without it.
- **Supply Point cap:** 19 per player (23.3.1).
- **Automatic victory margins:**
  - From **Turn 2**, in the Victory Check Phase, the Allies win with 5 or more above the benchmark, or 20 or more VPs.
  - The Germans win when the Allies are 5 or more below the benchmark at the end of any turn (24.2.1).
  - Scenario end conditions are in section 5: S1 needs ≥ 7 at the end of T7; S2 and S3 need ≥ 18 at the end of T32.

### 4.3 Values in `data/italy43/rules.json` the rulebook contradicts, or that are incomplete

1. **`weather.track[A|B].naval: ["BR","US"]` contradicts 9.6.** Italy has *one* Naval Support marker serving both Armies. The track photo prints "Yes" in A and B, and the Allied Support Markers box shows one naval counter. Under the engine's per-nation keys this would create two naval markers a turn. Use something like `"naval": true` (or `["AL"]`).
2. **`movement.mountainHexside: {inf: "tactical", mech: "prohibited"}` uses the wrong split.** 5.6 and the TEC divide **infantry types** (which include motorized and PG units, both mechanized) from **vehicles**. Rule Reminder 2 says mechanized infantry *can* cross mountain hexsides. A loader that reads "mech" as `def.mech` would wrongly bar PG and motorized units. Key it as `{infantryType: "tactical", vehicle: "prohibited"}`, plus the mountain-unit exception (19.3: no start-adjacent requirement).
3. **`combat.modifiers.attackerHalved`** misses the mountain-unit exception (19.3: not halved across mountains) and the once-only rule (9.1). The entry "across a mountain (9.1)" should cite 9.7 too. Minor.
4. **`terrainCombat.marsh.advance: "stop"`** loses the road exception: an advance stops in a marsh *unless following a road* (14.5; TEC note 2). `movement.terrain.marsh.stopUnlessRoad` has it right.
5. **`terrainCombat.city.battleMarkers: true`** cannot express 11.5.2/11.5.3. The capacity is 1 Partial for a **minor** city and 2 for a **major** city (Naples is the major city named in capitals on the TEC). Fort level 1 or 2 likewise. Add `battleCapacity: {minorCity: 1, majorCity: 2, fort1: 1, fort2: 2}`, and mark major cities in the map.
6. **CRT `_key`: "r = red (full retreat, no Determined Defense)".** Red means only "no DD allowed" (11.2.2). Full Retreat comes from the result itself (DR4 or DS, 13.1.3). This is wording only; every red cell is a DR4 or DS.
7. **`determinedDefense.drms`** has no maximum. 11.2.4 caps the total at +2 (DD Support +1 plus elite +1). Add `"max": 2`.
8. **`weather.track[E].rain: true`.** The engine's `rain` flag currently means "one column left"; in Italy only F (`crtShiftLeft: 1`) shifts (23.4). Not wrong as data, but the engine must read `crtShiftLeft`/`mud`.
9. **`turnNotes["8"]` / `["11"]` / `["15"]` say "Entry area E1 (E2, E3) becomes Allied".** 5.8.1 speaks of zone *sections* changing hands, with Axis units relocated and Disrupted. The East Entry Areas presumably follow their sections (16.2 makes friendly East areas supply sources), but the map must confirm the section/area correspondence.
10. **Missing keys the loader needs or the rules require:**
    - `supply` (the crash);
    - extended bonus by mech or non-mech (3/2);
    - truck count and MA (2 / 5);
    - OM radius (2);
    - strength cap (20);
    - auto DS ratio (10);
    - auto victory margin and VP (5 / 20);
    - advance caps (non-mech 2, OOS 2, ½ Eff 1);
    - ASU disruption threshold (2 hexes);
    - fort rules (8 Level 1 before completing; Level 2 count; 3–6 build roll);
    - Heavy Howitzer reroll;
    - Major Assault (max 2 extra dice, 1 SP each);
    - 8th Army section schedule;
    - scenario win thresholds (7 / 18 / 18).

Values checked and correct:
- the CRT against every rulebook example (Turn 1 X: 1-1 roll 6 = DR2 Adv 2; Y: 1-1 roll 3 = EX; Turn 2 A and E: 3-1 roll 6 = D1; F: 2-1 roll 5 = DR2 Adv 2);
- the DD "Other" column against the 11.4.3 example (5+1 = F, 3 = 0/1 F, 8 = 0/1 H);
- weather SPs (A 2/1, E 0/–, F 0/1, B 2/1 from the examples and the photo);
- benchmarks (photo);
- the Naples bonus;
- isolation, rally and disengagement;
- all 32 turns of the replacement schedule against the photo, assuming the box icons mean X = infantry, oval = tank, plain = special;
- TEC costs and the minor/major river split (photo).

### 4.4 What `data/salerno43/rules.json` says that Italy changes (for the data-driven refactor)

| Salerno key | Salerno value | Italy |
|---|---|---|
| `movement.alliedMechRoadIn8thSector` | 1 | none |
| `movement.turn1GermanHalfMaRoundUp`, `turn1AlliedTacticalOnly` | true | false (the engine ignores these keys and hard-codes the behaviour) |
| `combat.defenderShifts.rain` | −1 | Mud only |
| `combat.battleshipDrm` | 1 | none |
| `combat.nonMechAdvanceCap/oosAdvanceCap/halfEffAdvanceCap` | 2/2/1 | same values; Italy file lacks the keys |
| `determinedDefense` | 1d6 tables | 2d6 tables |
| `rally.bhOrCityDrm` | 2 | `cityOrFortDrm` 2 |
| `invasion`, `airdrop`, `variableStrength`, `landingPoints` | present | none |
| `supply.salernoPortOpenRadius` | 2 | none |
| `weather.track[].alliedPortBonus` | A, B | none (Naples schedule instead) |
| `victory.benchmarks` | from T4 | from T2 |

---

## 5. Scenario rules for Italy '43

**Common to every scenario**
- The German player moves first each turn (3.0; TRT box 1).
- Turn record: 32 turns from Oct 1–2 to Dec 29–31, 1943. Most turns cover 3 days; Turns 1–5 cover 2 days and Turn 31 covers 4.
- Automatic victory (24.2) is checked in every Victory Check Phase from Turn 2. S2 and S3 say "if no Automatic Victory has already happened"; S1 does not repeat the phrase, but 24.2 is a general rule.

### S1 Across the Volturno (the first half-month of the campaign)
- **Length:** 7 turns. Begins on Turn 1 and ends in the Victory Check Phase of Turn 7. The TRT's box 7 reads "End Scen. #1".
- **Set-up:** the Campaign Game set-up and reinforcement cards and the Campaign at-start data of S3.1. So: Allied SP 0, German SP 1, weather marker in box E, Remnants and Truck markers available. The OOB maps `volturno` to the `campaign` set-up.
- **Special rules:**
  1. Every S3 special rule applies (see below).
  2. **No Fortification rules at all.** Construction is assumed to happen back on the historical Gustav Line, so no fort is started or completed in S1.
- Note: the first three German units due to be withdrawn or removed carry a stripe along their top edge as a reminder.
- **Victory:** the Allies win with **7 or more VPs** at the end of Turn 7; otherwise the Germans win. The Turn 7 benchmark is 6, so an automatic Allied win at T7 would need 11 or more.

### S2 The Bernhard Line (1 November to the end of 1943)
- **Length:** 20 turns. Begins on **Turn 13** and ends in the Victory Check Phase of Turn 32.
- **Set-up:** the Bernhard Line set-up and reinforcement cards. Page 34 of the rulebook has an illustration of the starting position, which is not in the text.
  - The OOB `setups.bernhard` starts Level 1 forts at 1908, 2108, 2308 and 2707 completed, and at 2405, 2406, 2508 and 2504 under construction, with a pool of 4 Level 2 forts.
  - All 8 Level 1 forts have therefore been started, so completions are allowed from the first German Initial Phase.
- **Starting SPs:** Allied 3, German 1.
- **Starting Allied VPs:** 10. The engine computes VPs from control, so the set-up must give the Allies control of VP hexes worth 10, net of any German ASUs starting in the Eliminated Box at +1 each. Otherwise a base offset is needed; the map is needed to check.
- **Markers:** weather marker in box B (Clear), turn marker on 13, phase marker on the Sequence of Play track; every other marker set aside.
- **Special rules:**
  1. Play opens with the German player turn; Turn 13's Weather Phase counts as already done. Box B is Clear, but whether the Allied air and naval markers start Ready is not stated. The cards place them; the OOB transcription has a `support` entry for this.
  2. **Naples garrison:** 325G/82 and 505/82 garrison Naples and **stay put for the whole scenario**. The text says "in Salerno", a misprint for Naples.
  3. **Formia garrison:** S3.3 item 4 applies (below).
  4. **Port of Naples:** the Allies get +1 SP a turn (23.3.2), and +2 from Turn 24 onward. S2 starts on Turn 13, so the +1 starts at Turn 14 per 23.3.2, and the TRT shows "NAPLES +1 Supply" on Turn 14. This item seems to mean the bonus is in force from the start; if so, read it as +1 from Turn 13 (Appendix B).
- **Victory:** unless an automatic victory has happened, the Allies win with **18 or more VPs** at the end of Turn 32; otherwise the Germans win.

### S3 The Campaign Game
- **Length:** 32 turns. Begins on Turn 1 and ends in the Victory Check Phase of Turn 32.
- **Set-up:** the Campaign Game set-up and reinforcement cards.
- **Starting SPs:** Allied 5th Army 0, German 10th Army 1.
- **Available from the start:** Remnants, Fortification markers and Truck markers.
- **Other markers:** weather in box **E** (Rain), turn marker on Turn 1, phase marker on the Sequence of Play track; the rest aside.
- **Victory:** unless an automatic victory has happened, the Allies need **18 or more VPs** at the end of Turn 32. The design note says the Allies must take at least one Gustav Line hex to win, and that the historical 17 VPs at the end of 1943 counts as a German victory.
- **Special rules:**
  1. Play opens with the German player turn; Turn 1's Weather Phase counts as done. The extended example confirms that Turn 1 gives no weather roll and no SPs, so the Allies start with 0 SP. The marker starts in E (Rain): no air or naval support, and vehicles may not cross unbridged rivers.
  2. **3rd PG Division:** its two units starting in hex **2706** may not move on Turn 1. The German card lists a "release units in hex 2706" notice on Turn 2.
  3. **15th PG Division:**
     - **Seven** of its units begin frozen on coastal-defence duty in the Gulf of Gaeta (blue corner box on the counters).
     - Each is released when an Allied unit comes within **3 hexes** of it.
     - **All but the recon battalion at Formia** are released as soon as any Allied unit crosses the **Volturno**.
     - The Formia recon stays frozen until **Turn 14**.
     - The extended example's figure labels show "until Turn 14", "until an Allied unit crosses the Volturno", and "within 3 hexes or crosses the Volturno".
  4. **Formia garrison:**
     - A German unit must be in Formia (hex **1706**) at all times unless the Allies capture it.
     - The 33/15PG recon battalion begins as the garrison and is freed on Turn 14.
     - On **Turn 12** the 267/94 regiment enters the game *in* Formia itself and remains there for the rest of the game unless the Allies force it out.
  5. **Naples garrison:**
     - The three 82nd Airborne units must stay in Naples until released or removed.
     - They may attack, defend and take replacements while there.
     - If any of them is forced to retreat out of Naples by a CRT result, all three are released.
     - The **504/82** is released on **Turn 11** in any case.
     - The extended example, in its Turn 1 notes, says they "cannot move".
- **Engine work for S1 and S3:**
  - `newGame` must start at German Initial on Turn 1 (or 13 for S2) with no Weather Phase, using the start weather box and SPs from `setups`.
  - Freezing must be modelled per unit:
    - 3rd PG: until Turn 2.
    - 15th PG: release on proximity to *that* unit, or on any Allied crossing of a Volturno hexside. This needs Volturno hexsides marked in the map.
    - Formia recon: until Turn 14, never released by proximity.
    - Garrisons: Naples units may not leave Naples, but may attack and receive replacements; whether they may advance out is unclear. The Formia unit stays.
  - `game.ts:afterMoveChecks` today releases *any* frozen unit within 3 hexes of an Allied move; it must become per-unit conditions.
  - Applying S3's special rules in S1 is automatic, because S1 uses the same set-up.

---

## 6. What we still need from the player to build Italy '43

Already in hand (photos with the owner, data in the repo):
- the rulebook text;
- player-aid photos (TEC, tables, sequence; the owner's photo `aid-*.jpg`, `crt.jpg`);
- all four set-up cards (`card-*.jpg`), transcribed into the `data/italy43/oob.json` (140 counters);
- six map photos (`map-n-cassino`, `map-ne-isernia`, `map-nw-terracina`, `map-s-naples`, `map-se-benevento`, `map-sw-turntrack`) plus zoom crops.

Still needed, and what each must give us:

1. **The full map, hex by hex.** The photos may be enough if they cover every hex sharply; any fold, glare or cut edge needs a re-shoot. For every hex and hexside:
   - Hex number and land/sea, and the edge of the non-playable sea area that counts for naval range (9.6).
   - Terrain by predominant cover (2.2.3): clear, hill, marsh, full mountain.
   - Town and Landmark marks (the DD Clear/Other column).
   - **City hexes, marked minor or major** (major = Naples's three hexes; any other?), and which cities start Allied-controlled. Naples at least, in each scenario.
   - Hexside features: road (major or minor, including roads running off the map edge), mountain hexside (all of the hexside), mountain pass, **minor river or canal**, **major river**, river-with-marsh (counts as major), lake (counts as all-sea), all-sea/coast. Also the rivers through city centres to drop (Benevento, 2.2.4).
   - **Which hexsides are the Volturno** (for the S3.3 release).
   - VP hexes and their red-circle values.
   - Entry Areas: N1, N2, N3, N4, S1, S2 and the East Entry Areas. For each: the map-edge hexes it touches, which areas count as adjacent (21.4.2: S2 is not adjacent to E1), and whether the East areas are named E1–E3 like the zone sections.
   - **The 8th Army boundary line**, and which section (E1, E2, E3, N4) each zone hex belongs to.
   - **The Gustav Line**: which hexes are "on" it and which side is "behind" (18.1.3). The Bernhard Line is printed too, but no rule uses it.
   - Place names (Formia 1706, Castel Volturno 1815, Minturno 1908, Monte Lungo 2707, Villa Literno 2018 and others) for the log.
   - Printed tracks and boxes we have not photographed straight on:
     - the **Weather Table** (the top of `map-sw-turntrack.jpg` cuts off the box names and which rolls give 0 boxes; I infer 1 → 0, 2–4 → 1, 5–6 → 2);
     - the General Records Track;
     - the Remnant Display (how many Remnants of each type, and which are white-box independent or coloured formation Remnants, per 8.4.4);
     - the Eliminated and Permanently Removed boxes.
2. **Counter backs.** The reduced side of every 2- and 3-step unit (attack-defense-move, the stacking value if it changes, and quality if the colour box changes). Also:
   - the fronts of the seven units seen only reduced on the cards (III/129/15PG, III/115/15PG, II/1/HG, HG/HG recon, I/9/26Pz, HG I+II tank, 71/29PG);
   - the 26 Pz Division ASU's Ready side and range;
   - every Remnant counter's values.
3. **The marker sheet.** How many Level 1 forts (the rule says 8) and Level 2 forts (4 is my inference from "12 at most"); Battle markers (1/2 sides); Truck markers (the cards say 2 a side); the single Naval marker; the US and British Air markers and their names; Replacement markers.
4. **Per-counter facts the cards may not show clearly:**
   - The white outline (no ZOC Bond): every silhouetted tank, TD, ASU and the Heavy Howitzer, and anything else outlined.
   - Silhouette versus non-silhouette tank units.
   - Elite and low-quality boxes.
   - Mountain status: the rule says 7 units; confirm 1SSF is one, and whether any French or German Remnant counter has its own mountain symbol.
   - Tank-destroyer yellow boxes.
   - The Heavy Howitzer's range.
   - Which units have the "triangle" (arrive reduced).
5. **The legend of the replacement icons** on the turn track (which shape is Infantry, Special or Tank), to confirm the JSON's reading. Also confirm that the blue French box on Turn 30 is a Special.
6. **Rulebook figures** that the text extraction lost:
   - the page 34 Bernhard Line set-up illustration (to cross-check `setups.bernhard`);
   - the extended-example maps on pages 26–31 (to cross-check the Campaign set-up and the frozen units);
   - the Pontoon Bridge example diagram on page 22 (to settle "tangent").
7. **Any errata, FAQ or living-rules update** for Italy '43, if the player has one. Several ambiguities below would be settled by it.

---

## Appendix A — Engine change checklist by file

**`src/engine/data.ts`**
- `buildRules`: make data-driven: `supply` (overland, cap), extended bonus by mech/non-mech, truck count and MA, OM radius, strength cap, auto DS ratio, auto victory margin and VP, advance caps, ASU disruption hexes, naval range.
  - Make `invasion`/`airdrop`/`variableStrength`/`landingPoints` optional.
  - Read Italy's DD `dice`/`rolls`, `rally.cityOrFortDrm`, `disengagement.eliteDrm`/`lowQualityDrm`, `naplesSupplyBonus`, `weather.freeFlipOnRolls`, `crtShiftLeft`/`mud`.
  - Allow replacement pools FR and IT.
- `buildUnits`:
  - `army8` must not be derived from S-area arrival for Italy.
  - Take `silhouette` from the counter.
  - Add a `noZocBond` flag.
  - Add `mountain`; make sure Remnants do not inherit it.
  - Allow a list of replacement types per unit (recon: Tank or Special; 1SSF and the 100th: Special).
  - Give coloured-box Remnants their formation.
  - The Heavy Howitzer is an ASU but never shifts.
- Exports: `WITHDRAWAL`, `OPTIONAL_START`, `STARTING_SP` and `BATTLESHIPS_TURN` must all be optional. Italy's start SPs and weather live in `setups`.

**`src/engine/units.ts`**
- `nationGroup`: FR and IT → US (US Army); BR → CW.
- `supportNation`: likewise.

**`src/engine/movement.ts`**
- `movementAllowance`: gate the Turn 1 German halving (Salerno 24.3); extended bonus by `d.mech`.
- `allowedModes` / `entryModes`: gate the Turn 1 Allied tactical-only rule (Salerno 24.4).
- `truckOk`: both sides; supply judged at the start of the Movement Phase.
- `stepCost`:
  - OM: road cost 1 within 2 hexes of an enemy.
  - Minor river +1/+2, vehicles barred in rain.
  - Major river: first hex Tactical for all units, vehicles barred in rain, Pontoon exception.
  - Mountain exception for mountain units.
  - No ½ Eff unless the option is on.
  - 8th Army zone sections.
- `reachable`: zone sections; the trucked "may end in EZOC" rule is already allowed.

**`src/engine/zoc.ts`**
- `bondsOf`: the white-outline flag; the two-mountain test is non-road **and non-pass** for non-vehicle anchors; no bond across two major rivers; control of S1 and S2.

**`src/engine/combat.ts`**
- `computeOdds`:
  - Minimum odds checked on the base column; clamp negative nets to 1-3.
  - New Elite test; Low Quality shift; fort shift; Mud shift instead of rain.
  - Defensive artillery shift; no defensive support in breakthrough.
  - Single naval marker; data-driven naval range.
  - Halving: major river, marsh-origin vehicles, mountain units exempt.
  - Two attachments; Major Assault.
- `defenseOf`: no marsh doubling in the hex; "every attacker across mountain, river or out of marsh" doubles; no BH or variable logic for Italy.
- `tankTerrainOk`: no tank shift against a fort.
- `parseCell`: handle `2+`.
- `resolveAttack`:
  - D1 retreats 2; DS/Auto DS advance "2+"; no Dis.
  - Recon rule standard, for recon-only stacks.
  - EX exposing Full Retreat units → auto retreat 2.
  - Heavy Howitzer bookkeeping.
- `resolveDefense`:
  - 2d6 rows; F/H/P parsing; max +2; Heavy Howitzer rerolls.
  - Battle-marker capacity 1 or 2 with forced retreat and Limited Advance.
  - "Desperate" only when every unit would die.
  - No Delay.
- `advanceAllowance` / `advanceDestinations` / `applyAdvance`: Adv 2+ third hex for mechanized units by road or into clear; city and marsh stops; no hill stop; the first-hex river rule for major rivers only; no ½ Eff unless the option is on.
- `adjacentForCombat` and `readyAsusFor`: nothing from Entry Areas; an ASU that moved other than Tactically may not fire.
- `resolveDisengage`: elite and LQ modifiers; must be adjacent to an enemy.

**`src/engine/retreat.ts`**
- `retreatChoices`: Italy guidelines (toward a supply source; drop the later-EZOC and mountain filters).
- `allRetreats/evaluate`: river deaths by class and weather; Pontoon; no infantry mountain penalty; zone sections.
- `friendlyCityOrBh`: city, fort, or after a mountain crossing; plus the EZOC condition.
- `eliminateExposedFullRetreat`: only units of the non-phasing side.

**`src/engine/supply.ts`**
- `supplySources`: Allied = Naples hexes + friendly areas.
- `makeCtx`: control defaults per scenario, not `?? 'German'`; no ports; vacant forts block Allied traces; zone sections.
- `overland`: one free mountain step for mountain units.
- Gate `SOUTH_EDGE_ALLIED_TURN`, `MINED_PORTS` and `salernoPortOpen`.

**`src/engine/losses.ts`**
- `remnantFor`: per-type pools (done).
- A Remnant does not keep mountain abilities.
- The owner may decline a Remnant: the existing gap.

**`src/engine/breakthrough.ts`**
- `finishBreakthroughCombat`: `mayContinue = false`.
- `targetCheck`: passes allowed.
- `stepCheck`: Italy 14.5 terrain.

**`src/engine/game.ts`**
- `newGame`: start phase, turn, weather box, SPs, VP base, control (Naples, S1, S2), and support markers from the scenario's setup; no invasion; one naval key.
- `readySupport`: no GE air, no 2811; one naval marker.
- `doWeather`: Naples bonus by turn; free flips of one Nebelwerfer and the Heavy Howitzer on 2–4; Division ASU loop flip; no battleships.
- `doInitial`:
  - Scheduled events: withdraw, return, remove, release; replacement forfeit.
  - Arrivals at "N1-3" and "Naples".
  - FR and IT pools.
  - The 8th Army section hand-over and relocation on Turns 8, 11 and 15.
  - Fort building (or a separate action).
  - No Salerno Turn 11 or 16th Panzer code.
  - Remove the free Nebelwerfer flip.
- `doRecovery`: rally +2 in a city or completed fort; Battle-marker removal timing moves to the end of the Movement Phase and to attacker entry.
- `doSupply`: Nebelwerfers may be readied with SPs; the Heavy Howitzer may not.
- `vpBreakdown`: drop BH, N1/N2 and isolated-hex counting for Italy.
- `endGame`: win thresholds from scenario data (7/18/18).
- `applyReplacement`: Allied returns to S1/S2 or an ASU hex; types by unit list; nationality pools; replacements on withdrawn units.
- `afterMoveChecks`: per-unit release conditions (S3.3); no blanket 3-hex release.
- `applyAction('move')`: ASU disruption after more than 2 hexes.
- New actions: `buildFort`, `removeFort`; Major Assault and Heavy Howitzer fields on `attack`.
- Gate `landingHexes`/`arriveBySea`/`navalDestinations`, `abandon8th` and the invasion `2707` target.

**`src/engine/types.ts`**
- `ReplPool` + `FR`, `IT`.
- `GameState.forts`, `fortStarted`; `cityBattle` as a count with capacity; `zone8Owner`.
- `GameOptions.halfEff`, `majorAssault`, `pontoons`, `disengagement`.

**`src/games/italy43/data.ts`** (new)
- `independentFormations` without '23 Armd Bde'.
- `tankDestroyers`: US-601, US-776, US-636, US-645.
- `noDivision` as needed (2/509, 1SSF and 9 Cmdo are independent per 8.4.4).

---

## Appendix B — Ambiguities to settle (my reading in brackets)

1. **9.5.4 / 9.6:** may the Allied naval marker give a *defensive* CRT shift? 9.5.4 caps the defender at one "Artillery/Naval" shift, but 9.6 lists only offensive and DD uses. [Allow it as the defender's single artillery-type shift, mirroring 9.5.4's wording; confirm.]
2. **14.5 and the TEC Mountain Pass row "(14.5)":** do *passes* also restrict an advance to the first hex into the attacked hex for non-vehicles? [The text bullet says "Mountain hexsides" without qualification. I would apply first-hex-only to road-less, pass-less mountain hexsides only, as Salerno and the engine do, and treat the TEC's "(14.5)" as a pointer. Confirm.]
3. **17.3:** may an ASU that moved 1–2 hexes by *normal* movement still fire? ["Only Tactical Movement may provide a shift" reads as no.]
4. **23.3.4:** does the F→A loop also ready *Disrupted* Division ASUs? 13.2.1 forbids readying Disrupted ASUs. [Follow 13.2.1: ready only Good Order units.]
5. **11.4.3:** after a failed roll with no retreat path, may the defender pick a new Lead Unit? Salerno 11.5.3 said yes; Italy is silent. [Allow it.]
6. **15.2.7:** is DD Support (+1 DRM, not a shift) allowed against Breakthrough Combat? [Yes: only *shifts* are barred.]
7. **19.4:** must the Heavy Howitzer be in range of the target? [Yes: it is "an ASU with all the same properties".]
8. **19.3:** may a mountain unit cross two mountain hexsides in one 2-hex Tactical Move? [Nothing forbids it once the start-adjacent and first-hex requirements are lifted; confirm.]
9. **25.3:** "both hexes *tangent* to the River hexside" means the two hexes the hexside separates. [The example shows units on opposite banks.]
10. **18.x:** do *under-construction* forts do anything (block LOS, give a rally bonus, stop a retreat)? [No; only completed forts. Rally says "completed" explicitly.]
11. **S3.3 item 3:** is the Formia recon released early when an Allied unit comes within 3 hexes? [No: it is frozen until Turn 14, and the Formia garrison rule keeps a German unit there anyway.]
12. **S3.3 item 5 / S2.3 item 2:** may the Naples garrison advance after combat out of Naples? [No: "must remain in Naples".]
13. **S2.3 item 4:** is the Naples +1 SP in force on Turn 13 itself? 23.3.2 starts it on Turn 14, but S2 starts on 13 after a completed Weather Phase. [Starting SP 3 probably already includes Turn 13's income; give +1 from Turn 14.]
14. **S2.1 "Starting Allied VPs: 10":** a printed figure, while the engine computes VPs. [Check that the Bernhard set-up's control yields 10; otherwise add a base offset.]
15. **8.4.3:** does "Infantry" in the attachment rule mean any infantry-type unit, motorized and PG included? [Yes, per the † list in 2.3.3.]
16. **8th Army zone:** are the East Entry Areas the same E1–E3 as the zone sections, and is N4 both a zone section and a North Entry Area? [The map must show it.]
17. **5.7:** may trucked units Disengage (25.4)? [Not addressed; they "may not attack", which says nothing of Disengagement. Allow it.]
