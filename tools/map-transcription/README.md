# Map transcription scripts

These scripts turned photos of the physical map into `data/map.json`. The photos themselves aren't in the repository.

1. `mappers.py` holds, for each photo, the pixel positions of known hex-number labels. `grid.py` fits a locally weighted homography from the hex grid to each photo, which copes with paper curvature.
2. `sample.py` + `classify.py` sample every hex centre and classify it as clear, hill, dark mountain shading or sea by colour. `finalize_terrain.py` applies manual corrections.
3. `hexsides.py` detects river hexsides (the dark blue river line), `mtnedges.py` detects hexsides crossing dark mountain shading, and `roads.py` detects minor-road crossings.
4. `build_map.py` combines everything with the hand-traced major roads, passes, cities, towns, ports, VP hexes, beaches and entry areas.
5. A second check: `audit.py` draws `data/map.json` over each photo, `recheck.py` re-measures hex terrain and how much of each hexside the mountain shading covers, and `apply_recheck.py` applies those measurements plus the corrections made by eye in `fixes_photos.txt` (rivers, roads, coastal hexes, towns).
6. `annot.py`, `zoomgrid.py`, `ruler.py` and `render.py` draw overlays for checking the result against the photos.

They expect the photo paths and an `../out` working directory set up as in `mappers.py`. Edit `PHOTOS` there to re-run with new photos.
7. A third check: `excerpts.py` fits the grid to the map excerpts printed in the living rules (pages 27 and 29), and `measure_excerpt.py`, `road_trace.py`, `towns_excerpt.py` and `photo_roads.py` compare them and the photos with the data. `apply_fixes.py` applies the corrections in `fixes_excerpts.txt` and `fixes_audit.txt`, each with its evidence. `spots.py` (photo beside data overlay around listed hexes or hexsides) and `hexsheet.py` (one outlined hex per tile, for town circles) draw the review sheets; `review.py` writes PNG with `REVIEW_EXT=png`.
8. `tests/data/map.test.ts` holds the map invariants and `tests/data/rulebook-hexes.test.ts` every hex the rulebook names; both list the real oddities of the printed map by hand.
