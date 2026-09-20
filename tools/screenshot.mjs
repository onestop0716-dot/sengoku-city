// 実描画のスクリーンショットを撮る（headless Chromium + SwiftShader）。描画を変えたら必ず目視確認に使う。
// 使い方: node tools/screenshot.mjs out.png [seed] [cityId] [size] [追加スクリプト] [quality]
// Playwright が必要（npm i -g playwright && npx playwright install chromium）。PLAYWRIGHT_PATH で場所を指定できる。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import { spawn } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [,, outPath, seed = '12345', city = 'chen', size = '96', extra = '', quality = ''] = process.argv;
const server = spawn('node', [root + '/tools/serve.mjs'], { env: { ...process.env, PORT: '8092' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:8092/');
await page.waitForSelector('#start-btn');
await page.selectOption('#start-nation', city === 'chen' ? 'chu' : city === 'xianyang' ? 'qin' : 'qi');
await page.selectOption('#start-city', city);
await page.fill('#start-seed', seed);
await page.selectOption('#start-size', size);
await page.click('#start-btn');
await page.waitForFunction(() => window.__game && window.__game.world.day > 1, null, { timeout: 15000 });
// 見本の街を作る（ロジックのコマンドで）
await page.evaluate(async (extra) => {
  const { world, reg, loop } = window.__game;
  const { applyCommand } = await import('./src/sim/commands.js');
  const cx = world.map.w >> 1, cy = world.map.h >> 1;
  applyCommand(world, reg, { type: 'road.build', x0: cx - 12, y0: cy + 4, x1: cx + 12, y1: cy + 4 });
  applyCommand(world, reg, { type: 'road.build', x0: cx - 12, y0: cy - 4, x1: cx + 12, y1: cy - 4 });
  applyCommand(world, reg, { type: 'road.build', x0: cx + 8, y0: cy - 8, x1: cx + 8, y1: cy + 8 });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 11, y0: cy + 1, x1: cx + 7, y1: cy + 3 }, zoneId: 'res_commoner' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 11, y0: cy - 3, x1: cx - 1, y1: cy - 1 }, zoneId: 'res_shi' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 1, y0: cy - 3, x1: cx + 7, y1: cy - 1 }, zoneId: 'res_noble' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 11, y0: cy + 5, x1: cx + 7, y1: cy + 9 }, zoneId: 'farm_millet' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 9, y0: cy - 7, x1: cx + 14, y1: cy + 7 }, zoneId: 'farm_rice' });
  world.services.water = new Uint8Array(world.map.w * world.map.h).fill(1);
  world.money = 1e9;
  const { tick } = await import('./src/sim/world.js');
  for (let d = 0; d < 400; d++) tick(world, reg);
  loop.setSpeedIndex(0);
  if (extra) await new Function('world', 'reg', 'return (async () => {' + extra + '})()')(world, reg);
}, extra);
if (quality) { await page.click('#hud-settings'); await page.click(`input[name=quality][value=${quality}]`); await page.click('#settings-close'); }
await page.waitForTimeout(1500);
await page.screenshot({ path: outPath });
const info = await page.evaluate(() => ({ buildings: window.__game.world.buildings.size, renderer: window.__game.rendererInfo?.() }));
console.log(outPath, JSON.stringify(info), 'errors:', errors.length ? errors : 'なし');
await browser.close(); server.kill();
