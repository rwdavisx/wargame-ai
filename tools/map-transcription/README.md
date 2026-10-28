# Map transcription scripts

These scripts turned photos of the physical map into `data/map.json`. The photos themselves aren't in the repository.

1. `mappers.py` holds, for each photo, the pixel positions of known hex-number labels. `grid.py` fits a locally weighted homography from the hex grid to each photo, which copes with paper curvature.
2. `sample.py` + `classify.py` sample every hex centre and classify it as clear, hill, dark mountain shading or sea by colour. `finalize_terrain.py` applies manual corrections.
3. `hexsides.py` detects river hexsides (the dark blue river line), `mtnedges.py` detects hexsides crossing dark mountain shading, and `roads.py` detects minor-road crossings.
4. `build_map.py` combines everything with the hand-traced major roads, passes, cities, towns, ports, VP hexes, beaches and entry areas.
5. A second check: `audit.py` draws `data/map.json` over each photo, `recheck.py` re-measures hex terrain and how much of each hexside the mountain shading covers, and `apply_recheck.py` applies those measurements plus the corrections made by eye in `fixes_photos.txt` (rivers, roads, coastal hexes, towns).
6. `annot.py`, `zoomgrid.py`, `ruler.py` and `render.py` draw overlays for checking the result against the photos.

They expect the photo paths and an `../out` working directory set up as in `mappers.py`. Edit `PHOTOS` there to re-run with new photos.
