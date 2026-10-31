# Map art checks

The painted map (src/ui/render/terrain.ts) bends coasts and terrain edges organically, so it can drift from the
hexes it stands for. These scripts measure that against the map data.

1. With the dev server running (`npx vite --port 5199`), render a game's terrain to a PNG:
   `node tools/map-art/terrain-dump.cjs salerno43 /tmp/art/salerno43.png` (writes the bounds beside it).
2. `python3 tools/map-art/coast_paint.py salerno43 /tmp/art` reports, for every coastal hex, how much of it is
   painted as the other element: land hexes painted as sea, sea hexes painted as land. Every land hex's middle
   must stay land; the shoreline should wander in the sea hexes, not the land ones.
