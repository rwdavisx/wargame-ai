# Italy '43 map transcription

`data/italy43/map.json` comes from six overlapping photos of the owner's map (NW, N, NE, SW, S, SE; the photos
themselves aren't in the repository).

1. Each photo was calibrated on the printed hex numbers: `anchors/<KEY>.json` holds the pixel position of each
   label used, for a locally weighted homography (`tools/map-transcription/grid.py`, `Mapper`, sigma 3). On this
   map the EVEN columns sit half a hex lower, and a label's centre is about 0.37 hex above the hex centre.
2. Every hex and hexside in each photo was read at zoom (colour sampling checked by eye) into `source/<KEY>.json`:
   terrain, cities (major = name in capitals), towns, landmarks, VPs, rivers (major = thick with a dark outline;
   river-with-marsh counts as major), lakes, mountain hexsides, passes, roads, the Gustav and Bernhard Lines, the
   8th Army zone sections and the entry areas.
3. `source/fixes.json` holds corrections over the readings, each with its evidence.
4. `build_map.py` merges the photos (most confident reading first, then the photo whose middle is nearest), adds
   the rules' own facts (a full Mountain hex is a hill hex with six mountain hexsides, 2.2.2; a major road joins
   the Naples hexes, 5.2.3), and lists every disagreement between photos in `report.md`.
5. `render.py` draws the result for checking against the photos.

`tests/data/italy-map.test.ts` checks the map against the rulebook and the set-up cards.
