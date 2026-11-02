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

## The Adriatic extension (data/grand43/extension.json)

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
