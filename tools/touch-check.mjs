// タッチ端末（iPad 相当）とマウスの操作を自動で確認する。使い方: node tools/touch-check.mjs [out.png]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = process.argv[2] || 'touch-check.png';
const server = spawn('node', [root + '/tools/serve.mjs'], { env: { ...process.env, PORT: '8093' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const startGame = async (page) => {
  await page.goto('http://localhost:8093/');
  await page.waitForSelector('#start-btn');
  await page.selectOption('#start-size', '128');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__game && window.__game.world.day > 1, null, { timeout: 20000 });
  await page.evaluate(() => { window.__game.loop.setSpeedIndex(0); window.__game.world.money = 1e6; });
};
const touchDrag = async (page, from, to, steps = 8) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (to[0] - from[0]) * i / steps, y: from[1] + (to[1] - from[1]) * i / steps }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};
const pinch = async (page, center, d0, d1, angle = 0, steps = 8) => {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d, a) => [{ x: center[0] - Math.cos(a) * d / 2, y: center[1] - Math.sin(a) * d / 2 }, { x: center[0] + Math.cos(a) * d / 2, y: center[1] + Math.sin(a) * d / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0, 0) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + (d1 - d0) * i / steps, angle * i / steps) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};

// --- iPad 相当
const ipad = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' });
const page = await ipad.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await startGame(page);
check('タッチ端末として判定', await page.evaluate(() => document.body.classList.contains('touch') && window.__game.device.touch));
check('操作ボタンが表示', await page.evaluate(() => getComputedStyle(document.getElementById('touchbar')).display === 'flex'));
check('ボタンの高さが 44px 以上', await page.evaluate(() => Array.from(document.querySelectorAll('#hud button, #touchbar button, #toolbar button')).every((b) => b.getBoundingClientRect().height >= 44 || b.offsetParent === null)));
check('操作の確認が既定で ON', await page.evaluate(() => window.__game.settings.confirmActions === true));
// 1本指ドラッグ = 移動
const t0 = await page.evaluate(() => [window.__game.orbit.state.target.x, window.__game.orbit.state.target.z]);
await touchDrag(page, [600, 400], [500, 350]);
const t1 = await page.evaluate(() => [window.__game.orbit.state.target.x, window.__game.orbit.state.target.z]);
check('1本指ドラッグでカメラが移動', Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) > 0.5, `${t0.map((v) => v.toFixed(1))} → ${t1.map((v) => v.toFixed(1))}`);
// ピンチ = ズーム、ひねり = 回転
const d0 = await page.evaluate(() => window.__game.orbit.state.distance);
await pinch(page, [600, 400], 100, 300);
const d1 = await page.evaluate(() => window.__game.orbit.state.distance);
check('ピンチで拡大（距離が縮む）', d1 < d0 * 0.8, `${d0.toFixed(1)} → ${d1.toFixed(1)}`);
const y0 = await page.evaluate(() => window.__game.orbit.state.yaw);
await pinch(page, [600, 400], 200, 200, 0.6);
const y1 = await page.evaluate(() => window.__game.orbit.state.yaw);
check('2本指のひねりで回転', Math.abs(y1 - y0) > 0.3, `yaw ${y0.toFixed(2)} → ${y1.toFixed(2)}`);
// 道路ツール: 1本指ドラッグ → 決定バー → 決定 → 元に戻す
await page.tap('#toolbar button[data-tool="road"]');
const roads0 = await page.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0));
await touchDrag(page, [500, 420], [700, 430]);
await page.waitForTimeout(300);
const barText = await page.evaluate(() => getComputedStyle(document.getElementById('confirm-bar')).display === 'flex' ? document.querySelector('#confirm-bar .ct').textContent : '');
check('ドラッグ後に決定バーが出る', /道路 \d+ マス/.test(barText), barText);
const roadsMid = await page.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0));
check('決定前は道路が増えない', roadsMid === roads0);
await page.tap('#confirm-bar [data-ok]');
const roads1 = await page.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0));
check('決定で道路が引かれる', roads1 > roads0, `${roads0} → ${roads1}`);
await page.tap('#touchbar [data-act="undo"]');
const roads2 = await page.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0));
check('元に戻すで道路が消える', roads2 === roads0, `${roads1} → ${roads2}`);
// ツール選択中も2本指はカメラ
const d2 = await page.evaluate(() => window.__game.orbit.state.distance);
await pinch(page, [600, 400], 300, 150);
const d3 = await page.evaluate(() => window.__game.orbit.state.distance);
check('ツール選択中も2本指でズーム', d3 > d2 * 1.2, `${d2.toFixed(1)} → ${d3.toFixed(1)}`);
check('2本指の後に決定バーが出ていない', await page.evaluate(() => getComputedStyle(document.getElementById('confirm-bar')).display === 'none'));
// 取消
await touchDrag(page, [500, 460], [650, 470]);
await page.tap('#confirm-bar [data-cancel]');
check('取消で何も起きない', await page.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0)) === roads0);
// 選択解除ボタン、タップ = 選択
await page.tap('#touchbar [data-act="esc"]');
check('✕ で選択ツールに戻る', await page.evaluate(() => document.querySelector('#toolbar button.active')?.dataset.tool === 'select'));
await page.tap('#view', { position: { x: 640, y: 400 } });
await page.waitForTimeout(200);
check('タップで情報パネルに座標が出る', await page.evaluate(() => /（\d+, \d+）/.test(document.getElementById('info').textContent)));
// 長押し（表示モード中は内訳）
await page.evaluate(() => window.__game.viewMode.set('water'));
await page.waitForTimeout(7000);
{ const cdp = await ipad.newCDPSession(page); const t = Date.now() / 1000; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 640, y: 420 }], timestamp: t }); await page.waitForTimeout(800); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t + 0.8 }); await cdp.detach(); }
check('長押しで内訳が出る', await page.evaluate(() => getComputedStyle(document.getElementById('view-tip')).display === 'block'));
await page.tap('#touchbar [data-act="esc"]');
// 用語のタップ
await page.tap('#hud [data-term="loyalty"]');
await page.waitForTimeout(100);
check('用語をタップで説明が出る', await page.evaluate(() => getComputedStyle(document.getElementById('tooltip')).display === 'block'));
await page.tap('#hud [data-term="loyalty"]');
check('もう一度タップで閉じる', await page.evaluate(() => getComputedStyle(document.getElementById('tooltip')).display === 'none'));
// パネルの開閉
await page.tap('.collapse-tab[data-for="toolbar"]');
check('建物一覧を閉じられる', await page.evaluate(() => document.getElementById('toolbar').classList.contains('collapsed')));
await page.tap('.collapse-tab[data-for="toolbar"]');
// 一時停止・速度ボタン
await page.tap('#touchbar [data-act="pause"]');
check('一時停止ボタンで再開', await page.evaluate(() => window.__game.loop.speedIndex > 0));
await page.tap('#touchbar [data-act="pause"]');
check('自動品質: タッチ端末は「中」から始まり、重ければ下がる', await page.evaluate(() => ['medium', 'low'].includes(window.__game.autoQ.level) && window.__game.settings.quality === 'auto' && window.__game.device.initialQuality === 'medium'));
check('manifest と apple-touch-icon', await page.evaluate(() => !!document.querySelector('link[rel=manifest]') && !!document.querySelector('link[rel=apple-touch-icon]')));
check('ページ全体がスクロールしない', await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && getComputedStyle(document.getElementById('view')).touchAction === 'none'));
await page.tap('#hud [data-panel="finance"]');
await page.waitForTimeout(300);
await page.screenshot({ path: outPath });
await page.tap('#panel-finance [data-close]');
// 縦向き
await page.setViewportSize({ width: 820, height: 1180 });
await page.waitForTimeout(500);
check('縦向きでも横スクロールしない', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: outPath.replace('.png', '_portrait.png') });
check('タッチ側にエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));
await ipad.close();

// --- PC（マウス）: 従来どおり即時に適用、右ドラッグ回転、ホイール、Esc
const pc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await pc.newPage();
const perr = [];
pg.on('pageerror', (e) => perr.push(e.message));
await startGame(pg);
check('PC はタッチ扱いでない', await pg.evaluate(() => !document.body.classList.contains('touch') && getComputedStyle(document.getElementById('touchbar')).display === 'none'));
check('PC は操作の確認が OFF', await pg.evaluate(() => window.__game.settings.confirmActions === false));
await pg.click('#toolbar button[data-tool="road"]');
const r0 = await pg.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0));
await pg.mouse.move(500, 420); await pg.mouse.down(); await pg.mouse.move(600, 425, { steps: 5 }); await pg.mouse.move(700, 430, { steps: 5 }); await pg.mouse.up();
const r1 = await pg.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0));
check('マウスの左ドラッグで即時に道路が引かれる', r1 > r0, `${r0} → ${r1}`);
await pg.keyboard.press('Control+z');
check('Ctrl+Z で元に戻る', await pg.evaluate(() => window.__game.world.roads.reduce((a, b) => a + b, 0)) === r0);
const py0 = await pg.evaluate(() => window.__game.orbit.state.yaw);
await pg.mouse.move(640, 400); await pg.mouse.down({ button: 'right' }); await pg.mouse.move(740, 400, { steps: 5 }); await pg.mouse.up({ button: 'right' });
check('右ドラッグで回転', Math.abs(await pg.evaluate(() => window.__game.orbit.state.yaw) - py0) > 0.2);
const pd0 = await pg.evaluate(() => window.__game.orbit.state.distance);
await pg.mouse.wheel(0, -400);
check('ホイールでズーム', await pg.evaluate(() => window.__game.orbit.state.distance) < pd0);
await pg.keyboard.press('Escape');
check('Esc で選択に戻る', await pg.evaluate(() => document.querySelector('#toolbar button.active')?.dataset.tool === 'select'));
await pg.keyboard.press('Tab');
check('Tab で表示モード', await pg.evaluate(() => window.__game.viewMode.mode === 'zones'));
await pg.keyboard.press('Escape');
await pg.keyboard.press('KeyQ');
check('PC 側にエラーなし', perr.length === 0, perr.slice(0, 3).join(' | '));
await pc.close();
await browser.close(); server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} / ${results.length} 項目 OK`);
process.exit(failed.length ? 1 : 0);
