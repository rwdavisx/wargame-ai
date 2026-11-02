# Grand campaign map: joining Italy '43 and Salerno '43

`stitch.py` writes `data/grand43/parts/stitched.json`: the two transcribed maps on one grid, plus `ids.json` (each game's hex id
to the grand map's) for the later phases.

## How the maps meet

`fit.py` fits each map's hex grid to the ground from the towns printed on it (`towns.py`, positions to about a
kilometre). A rotation, one scale and a shift per map, least squares over 79 Salerno and 87 Italy towns:

| map | km per hex | rotation | rms error |
|---|---|---|---|
| Salerno '43 | 3.81 | 38.0° | 1.6 km |
| Italy '43 | 3.83 | 39.0° | 1.7 km |

Same scale, same orientation (map "up" is about north-west, along the peninsula). Salerno's hexes fall on Italy's grid
with no column offset (mean −0.3, sd 0.17) and 27.5 rows lower (sd 0.29). The two maps shade opposite columns half a
hex down (Salerno the odd, Italy the even), so Salerno (c, r) is Italy (c, r + 28) in an odd column and (c, r + 27)
in an even one. Then Italy's last rows (27, 28 in two sea columns) meet Salerno's first (28): the printed maps join
edge to edge, overlapping in two sea hexes only, and the coast of the Bay of Naples and the rivers run straight on
across the join.

The grand map keeps Italy's convention and moves every row 14 down (`ROW_SHIFT`), leaving room north of the Italy map
for the Adriatic front: on the fitted grid Ortona lies at about row −8, Pescara −13, Termoli at column 59, Foggia at
column 58, row 28 (all before the shift).

## The Adriatic extension (data/grand43/parts/extension.json)

No printed map covers the Eighth Army's front, so it is drawn from the ground, in the printed maps' own manner:

- `geo.py`: the grid on the ground (the fit above) and elevation from the public Terrarium tiles (AWS open data).
- `calibrate.py`: for every printed land hex, the spread of heights inside it; a hex is hill where the 90th less the
  10th percentile is over 70 m, which reproduces the designers' clear/hill choice on 92% of the 1,291 printed land hexes.
- `mtn.py`: a small logistic model of the printed maps' mountain hexsides (height of the ground between the hexes,
  the hexes' heights and roughness), at the threshold that gives the printed maps' own density of them; it agrees
  with the designers on 61% of their mountain hexsides (they are partly a judgement of where the massifs are).
- `extend.py`: columns 30–66, rows 0–50 where the printed maps have no hex: 1,161 land hexes, the sea within 3 hexes
  of the new coast, mountain hexsides, and rivers traced from the ground (water run downhill over a filled surface, a
  river from 90 km² of catchment, a major river from 900 km²), snapped onto the hex edges nearest their course. The
  Sangro, Trigno, Biferno, Fortore and Pescara come out at their real mouths.
- `extend_places.py` with `wiki_places.py`: 110 towns at their English Wikipedia positions (Palena, Quadri, Palata
  and Riccia by hand, to about a kilometre, their articles having no readable coordinates), the larger ones cities;
  the main roads of 1943 (the Via Adriatica, the two arms of the SS 17, the SS 87 and SS 90, and the lateral roads
  that mattered: the Sangro and Trigno valleys, Ortona–Orsogna, Lanciano–Casoli–Roccaraso, Isernia–Agnone–Vasto),
  routed hex by hex through the towns they ran through. Routes are reconstructions, to be checked against period maps.
- `render_check.py` draws the whole map for checking by eye.

## Still to do on the map

- Salerno '43 has one kind of river and Italy '43 two (major rivers only crossed as a first hex): Salerno's rivers are
  minor for now; the Sele and the Calore may deserve major.
- Entry areas carry their game as a prefix (IE1, SE2, …); the ones on the old inner edges go once the extension is in.
- Salerno-only marks (its 8th Army sector, drop zones, the naval line) and both games' VP hexes are kept as they are
  until the scenario's victory rules are set.

## Rules: Italy '43 with Salerno '43's landings

`rules.json` is Italy '43's tables with `system: "italy43"`, plus Salerno '43's invasion, airdrop, landing-point and
variable-strength tables. The engine reads that as Italy '43's rules throughout (combat, Determined Defense, rivers by
class, Operational Movement, fortifications, trucks, scheduled withdrawals) with Salerno's landings (`RULES.landings`):
turn 1 opens with the Invasion phase; later waves sail through the Floating Reserve to a beachhead or a port the
Allies hold, 24 landing points a 2-day turn (Salerno's 12 a day). Naples is a port once taken; until then units due
"in Naples" come by sea instead. Salerno's daily rules that do not carry over: the north-edge VPs, the 16th Panzer
Division's withdrawal by rule (it leaves on its 1943 date instead), the Eighth Army sector.

Entry areas: G1-G5 on the north edge are German (the roads to Rome, Sora, L'Aquila and Ancona); A1-A9 on the south
and south-east edges are German until the Eighth Army comes up (`rules.entryOpens`: turn 6 for A1-A5, 20 September,
turn 7 for A6-A9); German units still waiting in one then are lost.

## Turn track and victory

43 turns: 2-day turns from 9 September (GT1 = 9-10 Sept) to 10 October, then Italy '43's own track (GT = Italy
turn + 11). One VP total for both fronts (83 VP in 59 hexes). The benchmark for each turn is the VP the Allies held at
its end in 1943 (`merge.py`'s table of dates), two less until turn 9 (the landing battle's first week, which the
counters fight more slowly than the history); six VP above it wins at once, six below loses. A scenario is won
on its last turn's benchmark: 32 VP for the Race (turn 16), 51 for the Campaign and the Winter Line (turn 43).
AI-against-AI play (elite against elite) keeps close to it: four full campaigns ended on 51, 49, 52 and 30 VP, two
Winter Lines on 51 and 54, the Races on 32-37.

## Counters

Italy '43's counter wherever a unit is in both games (its scale is the grand campaign's; Salerno's split landing
counters, such as 128 Bde (-) and the 5th Hampshires, are one Italy counter); Salerno '43's for the units only it has
(16th Panzer, the 1st Parachute battalions, the Commandos, the beach groups, the 5th British and 1st Canadian
Divisions); new counters by analogy for the rest (`build_oob.py`, `NEW`: the research's `suggestedValues`). New
Indian and New Zealand counters use the British colours.

Set-ups: **campaign** (9 September) is Salerno '43's cards with the German formations its north edge brings in
placed where they stood (Hermann Göring round Naples and Caserta, 15th Panzergrenadier along the Gulf of Gaeta), the
3rd Panzergrenadier coming from Rome, and the 29th, 26th and 1st Parachute coming up from Calabria and Apulia
through the A areas. Italy '43's removals that were really moves to the Adriatic (the 26th Panzer, 29th
Panzergrenadier, 305th Division) are dropped: those units stay. **winter** (1 November) is Italy '43's Bernhard Line
cards in the west and, east of them, each unit at its research position nearest 2 November, kept on its own side of
the Trigno front of 28 October.

## Still open

- The Adriatic roads and the new counters' values are reconstructions; the research files say which are uncertain.
- The Termoli landing (3 October) is not modelled as a landing: the Commandos enter with the Eighth Army.
- The Salerno map's rivers are all minor; the Sele and the Calore may deserve major.
