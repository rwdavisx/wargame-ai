# The grand campaign: Salerno '43 and Italy '43 joined

How `data/grand43` is built, in order (each step reads the one before):

1. `stitch.py`: the two transcribed maps on one grid (`data/grand43/parts/stitched.json`) and `ids.json` (each game's
   hex id to the grand map's).
2. `extend.py`: the sectors no printed map covers, drawn from the ground (`parts/extension.json`), below.
3. `extend_places.py`: their towns and roads, ports and airfields.
4. `merge.py`: the playable map (`data/grand43/map.json`): the joins repaired, entry areas, victory hexes with the date
   each fell in 1943 (`vp_dates.json`), the Bernhard and Gustav positions across the Adriatic sector, Naples as a
   port; then `backdrop.py` adds the ground beyond the map's frame for the painter only (`meta.backdrop`).
5. `build_oob.py`: the counters, both set-ups, the turn track, benchmarks and tables (`oob.json`, `rules.json`).

`scripts/grand.ts` plays it AI against AI and prints a line a turn (`NOAUTO=1` plays on past an automatic victory).

## How the printed maps meet

`fit.py` fits each map's hex grid to the ground from the towns printed on it (`towns.py`, positions to about a
kilometre). A rotation, one scale and a shift per map, least squares over 79 Salerno and 87 Italy towns:

| map | km per hex | rotation | rms error |
|---|---|---|---|
| Salerno '43 | 3.81 | 38.0° | 1.6 km |
| Italy '43 | 3.83 | 39.0° | 1.7 km |

Same scale, same orientation (map "up" is about north-west, along the peninsula). Salerno's hexes fall on Italy's grid
with no column offset (mean −0.3, sd 0.17) and 27.5 rows lower (sd 0.29). The two maps shade opposite columns half a
hex down (Salerno the odd, Italy the even), so Salerno (c, r) is Italy (c, r + 28) in an odd column and (c, r + 27)
in an even one. The printed maps join edge to edge. The grand map keeps Italy's convention and moves every row 14
down (`ROW_SHIFT`), leaving room north of the Italy map.

## The drawn sectors

No printed map covers the Adriatic front, Apulia and Basilicata south of it (Potenza, Melfi, Cerignola: the Eighth
Army's approach), or Lazio north of the Italy map (Littoria, Frosinone, Sora: the roads to Rome). They are drawn
from the ground in the printed maps' own manner, so the whole frame is playable (3,683 hexes, 3,193 of them land):

- `geo.py`: the grid on the ground (the fit above) and elevation from the public Terrarium tiles (AWS open data).
- `calibrate.py`: a hex is hill where the 90th less the 10th percentile of the heights inside it is over 70 m,
  which reproduces the designers' clear/hill choice on 92% of the printed land hexes.
- `mtn.py`: a small logistic model of the printed maps' mountain hexsides, at the threshold that gives their own
  density; it agrees with the designers on 61% of their mountain hexsides. The lowest 3% of the mountain hexsides
  are passes, about the printed maps' share.
- `extend.py`: rivers traced from the ground (water run downhill over a filled surface; a river from 220 km² of
  catchment, a major river from 1,200 km², the cut-offs that give the printed maps' density of each: about 30 river
  and 7 major-river hexsides per 100 land hexes), snapped onto the hex edges nearest their course. The Sangro,
  Trigno, Biferno, Fortore, Pescara and Ofanto come out at their real mouths.
- `extend_places.py`: towns to the printed maps' density (about one land hex in six): the places the history names,
  then the largest comune in each hex from the GeoNames gazetteer (`comuni.py` → `comuni.json`; GeoNames,
  www.geonames.org, CC BY 4.0), the larger ones cities, named as in 1943 (Littoria, not Latina). Roads: the main
  roads of 1943 as the towns they ran through (the Via Adriatica, the Appia, the Casilina, the Tiburtina, the SS 17,
  87, 90 and 93, the valley roads), then a minor road to every town not on one, and between neighbouring towns the
  network leaves far apart: some 62 road hexsides per 100 land hexes against the printed maps' 72, the mountains of
  the Abruzzo being emptier. Roads keep off mountain hexsides and passes, as on the printed maps. Termoli, Ortona and
  Pescara are ports, Foggia and Amendola airfields. Routes are reconstructions, to be checked against period maps.
- `render_check.py` draws the whole map for checking by eye (`MERGED=1` for the playable map).

## The joins

`merge.py` leads on every road that stops short of a town, a port or the map's edge (most were roads that ran off a
printed map's edge) to the nearest road it does not already reach, joins every piece of road cut off from the
network (the Terracina roads on Italy '43's map, two stubs on Salerno '43's south edge), joins each river that stops
at a join to the river across it, and leads a printed river whose upper course was off its map a few hexsides up its
valley from the elevation data. Result: one road network, no road ending in open country, 55 roads across the joins.

## Rules: Italy '43 with Salerno '43's landings

`rules.json` is Italy '43's tables with `system: "italy43"`, plus Salerno '43's invasion, airdrop, landing-point and
variable-strength tables. The engine reads that as Italy '43's rules throughout (combat, Determined Defense, rivers by
class, Operational Movement, fortifications, trucks, scheduled withdrawals) with Salerno's landings (`RULES.landings`):
day 1 opens with the Invasion phase; later waves sail through the Floating Reserve to a beachhead or a port the
Allies hold, 12 landing points a day. Naples is a port once taken; until then units due "in Naples" come by sea. In
September the weather is Salerno '43's daily track (`weatherSeasons`), from October Italy '43's, and Salerno's
landing-day movement rules apply on day 1.

Entry areas: G1-G5 on the north edge are German (the Appia, the Casilina, the road to Avezzano, the Tiburtina and the
Via Adriatica); A1-A7 on the south and east edges are German until the Eighth Army comes up (`rules.entryOpens`: the
Calabrian roads on day 11, the Basento valley road on day 12, the roads from Bari on days 13-15); German units still
waiting in one then are lost.

## Turn track and victory

54 turns: a day each from 9 to 30 September (Salerno '43's scale: its day d is turn d), then Italy '43's own track
(turn = Italy turn + 22). One VP total for both fronts (86 VP in 61 hexes).

The benchmark is, in September, the VP the Allies held at the end of each day in 1943 (`merge.py`'s table of dates,
one less in the first twelve days); September's landing battle is fought out with it as a guide only. From 1 October
it is held to the game's own pace as well: the median of AI-against-AI campaigns (elite against elite, `pace.py` →
`pace_ai.json`), taken as the least that pace reaches from each turn on, less one, and never below 1943's. The game's
Allies run ahead of 1943 because they move through an emptier south than the real one (no demolitions, no supply
limits) and score for the German guns they catch. From 11 October six VP above the benchmark wins at once and six
below loses. A scenario is won on its last turn's benchmark: 34 VP for the Race (turn 27, 10 October), 55 for the
Campaign and the Winter Line (turn 54). In the six calibration campaigns the Allies ended on 55-57, in two Winter
Lines on 54.

## Counters

Italy '43's counter wherever a unit is in both games; Salerno '43's for the units only it has (16th Panzer, the 1st
Parachute battalions, the Commandos, the beach groups, the 5th British and 1st Canadian Divisions); new counters by
analogy for the rest (`build_oob.py`, `NEW`, with when and where each comes and goes in `ARR`). New Indian and New
Zealand counters use the British colours.

Set-ups: **campaign** (9 September) is Salerno '43's cards, with the German formations its north edge brings in
standing where they were that day (Hermann Göring round Naples and Caserta, 15th Panzergrenadier along the Gulf of
Gaeta), each held until the day Salerno '43 brings it in, and those Salerno '43 never brings in watching the coast
until the enemy comes near; the 3rd Panzergrenadier comes from Rome, the 29th, 26th and 1st Parachute up from Calabria
and Apulia. Italy '43's removals that were really moves to the Adriatic (the 26th Panzer, 29th Panzergrenadier, 305th
Division) are dropped. **winter** (1 November) is Italy '43's Bernhard Line cards in the west and, east of them, each
unit at its research position nearest 2 November, kept on its own side of the Trigno front of 28 October.

## Still open

- The drawn sectors' roads and the new counters' values are reconstructions; the research files say which are
  uncertain.
- The Termoli landing (3 October) is not modelled as a landing: the Commandos enter with the Eighth Army.
- The Salerno map's rivers are all minor; the Sele and the Calore may deserve major.
