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
const [vw, vh] = (process.env.VIEWPORT || '1280x800').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().startsWith('DBG')) console.log(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:8092/');
await page.waitForSelector('#start-tab-new'); await page.click('#start-tab-new');
await page.selectOption('#start-nation', city === 'chen' ? 'chu' : city === 'xianyang' ? 'qin' : 'qi');
await page.selectOption('#start-city', city);
await page.fill('#start-seed', seed);
await page.selectOption('#start-size', size);
await page.click('#start-btn');
await page.waitForFunction(() => window.__game && window.__game.world.day > 1, null, { timeout: 15000 });
// 見本の街を作る（ロジックのコマンドで）
const perf = await page.evaluate(async (extra) => {
  const { world, reg, loop } = window.__game;
  const { applyCommand } = await import('./src/sim/commands.js');
  const { tick } = await import('./src/sim/world.js');
  const cx = world.map.w >> 1, cy = world.map.h >> 1;
  world.money = 1e9;
  world.services.water = new Uint8Array(world.map.w * world.map.h).fill(1);
  // 見本の街: マップの大きさに応じた碁盤目の道路と区画
  const R = Math.round(world.map.w * 0.28);
  for (let y = cy - R; y <= cy + R; y += 8) applyCommand(world, reg, { type: 'road.build', x0: cx - R, y0: y, x1: cx + R, y1: y });
  for (let x = cx - R; x <= cx + R; x += 12) applyCommand(world, reg, { type: 'road.build', x0: x, y0: cy - R, x1: x, y1: cy + R });
  const zonesList = ['res_commoner', 'res_commoner', 'farm_millet', 'res_shi', 'farm_rice', 'res_commoner', 'res_noble', 'farm_wheat'];
  let zi = 0;
  for (let y = cy - R; y < cy + R; y += 8) for (let x = cx - R; x < cx + R; x += 12) {
    applyCommand(world, reg, { type: 'zone.set', rect: { x0: x + 1, y0: y + 1, x1: x + 11, y1: y + 3 }, zoneId: zonesList[zi++ % zonesList.length] });
    applyCommand(world, reg, { type: 'zone.set', rect: { x0: x + 1, y0: y + 5, x1: x + 11, y1: y + 7 }, zoneId: zonesList[zi++ % zonesList.length] });
  }
  const t0 = performance.now();
  for (let d = 0; d < 400; d++) tick(world, reg);
  const tickMs = (performance.now() - t0) / 400;
  loop.setSpeedIndex(0);
  if (extra) await new Function('world', 'reg', 'tick', 'applyCommand', 'return (async () => {' + extra + '})()')(world, reg, tick, applyCommand);
  return { tickMs: +tickMs.toFixed(2), buildings: world.buildings.size, map: world.map.w };
}, extra);
if (quality) { await page.evaluate(() => { document.getElementById('settings').style.display = 'block'; }); await page.click(`input[name=quality][value=${quality}]`); await page.click('#settings-close'); }   // 設定は ≡ メニューの中なので直接開く
await page.waitForTimeout(1500);
await page.screenshot({ path: outPath });
// 描画時間の目安: 30フレーム描いて平均（この環境はソフトウェア描画なので実機より大幅に遅い）
const frame = await page.evaluate(async () => {
  const { orbit, THREE } = window.__game;
  const t0 = performance.now(); let n = 0;
  await new Promise((r) => { const step = () => { n++; if (performance.now() - t0 > 2000 || n >= 30) r(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  return { msPerFrame: +((performance.now() - t0) / n).toFixed(1), renderer: window.__game.rendererInfo?.(), fps: +window.__game.loop.stats.fps.toFixed(1) };
});
console.log(outPath, JSON.stringify({ ...perf, ...frame }), 'errors:', errors.length ? errors : 'なし');
await browser.close(); server.kill();
