// Renders a game's whole terrain in the browser and saves it as PNG with its bounds, for comparing with the photos.
// Usage: node terrain-dump.cjs <game> <out.png>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [game, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  await p.goto('http://localhost:5199/');
  await p.waitForTimeout(1500);
  const res = await p.evaluate(async (game) => {
    const games = await import('/src/games/index.ts');
    games.selectGame(game);
    const terrain = await import('/src/ui/render/terrain.ts');
    try { indexedDB.deleteDatabase('s43-terrain'); } catch {}
    const img = await terrain.renderTerrain();
    const c = document.createElement('canvas');
    c.width = img.image.width;
    c.height = img.image.height;
    c.getContext('2d').drawImage(img.image, 0, 0);
    return { png: c.toDataURL('image/png'), bounds: img.bounds, scale: img.image.width / img.bounds.w };
  }, game);
  fs.writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
  fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify({ bounds: res.bounds, scale: res.scale }));
  console.log(game, res.bounds, res.scale);
  await b.close();
})();
