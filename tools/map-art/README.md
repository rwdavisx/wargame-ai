# Map art

The painted map (src/ui/render/terrain.ts) bends coasts and terrain edges organically, so it can drift from the
hexes it stands for. Where the printed map's coastline cuts through a hex, the hex carries a trace of it.

## The traced coastline

`coast_masks.py` traces the printed coastline from photos of the map into `data/<game>/map.json`:

- `coast` on every coastal hex that is part land and part sea on the printed map (a land hex that is not all land,
  a sea hex that holds some land): 17 rows of 19 cells a sixteenth of the hex's height apart, five hex digits a row
  with bit j set where cell j is land. The renderer draws these hexes cell by cell (src/ui/render/coast.ts), so a
  beach hex with the shore through its middle, or a headland with a sliver of coast, looks as printed; towns and
  roads in a hex whose middle is water stand on its land.
- `allSea` on a hexside between two land hexes with water all along it (Agropoli and the beach hex north of it;
  Gaeta and Formia). Units cannot move, attack, retreat or advance across it, no ZOC or ZOC bond reaches across
  it and no Line of Supply is traced across it, as for a lake hexside.

The photos are not in the repository. Run it in report mode first and compare the check sheet with the photos:

    python3 tools/map-art/coast_masks.py salerno43                       # report and check sheet
    python3 tools/map-art/coast_masks.py italy43 <folder of the six photos>
    ... --write                                                          # write the masks into map.json

Pale lettering on the water can read as land (LETTERING boxes), and where a coast meets a hex corner on a photo
seam the all-sea test needs an eye (KEEP_OPEN); both lists are in the script.

## Checks

1. With the dev server running (`npx vite --port 5199`), render a game's terrain to a PNG:
   `node tools/map-art/terrain-dump.cjs salerno43 /tmp/art/salerno43.png` (writes the bounds beside it).
2. `python3 tools/map-art/coast_paint.py salerno43 /tmp/art` reports how far the paint strays from the trace in
   the traced hexes, and for every other coastal hex how much of it is painted as the other element. An untraced
   land hex's middle must stay land; the shoreline should wander in the sea hexes, not the land ones.
