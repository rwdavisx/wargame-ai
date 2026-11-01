# Grand campaign map: joining Italy '43 and Salerno '43

`stitch.py` writes `data/grand43/map.json`: the two transcribed maps on one grid, plus `ids.json` (each game's hex id
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

## Still to do on the map

- The Adriatic extension (columns ~41 to ~66, rows 0 to ~45): new hexes from elevation and map data.
- Salerno '43 has one kind of river and Italy '43 two (major rivers only crossed as a first hex): Salerno's rivers are
  minor for now; the Sele and the Calore may deserve major.
- Entry areas carry their game as a prefix (IE1, SE2, …); the ones on the old inner edges go once the extension is in.
- Salerno-only marks (its 8th Army sector, drop zones, the naval line) and both games' VP hexes are kept as they are
  until the scenario's victory rules are set.
