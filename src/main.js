// 起動: データ読込 → 開始画面 → World 生成 → 描画・UI を接続 → ループ開始。
import * as THREE from 'three';
import { loadDataBrowser, createRegistry } from './data/registry.js';
import { createWorld } from './sim/world.js';
import { createScene } from './render/scene.js';
import { createOrbitCamera } from './render/camera.js';
import { createTerrainMesh } from './render/terrain-mesh.js';
import { createAssetResolver } from './render/assets/resolve.js';
import { createBuildingsView } from './render/buildings.js';
import { createOverlay } from './render/overlay.js';
import { createPicker } from './render/picking.js';
import { createTooltip } from './ui/tooltip.js';
import { createHud } from './ui/hud.js';
import { createToolbar } from './ui/toolbar.js';
import { createInfoPanel } from './ui/info-panel.js';
import { createLog } from './ui/log.js';
import { showStartScreen } from './ui/start-screen.js';
import { createGameLoop } from './app/game-loop.js';
import { createInput } from './app/input.js';

const showError = (msg) => { const el = document.getElementById('error'); el.textContent = msg; el.style.display = 'block'; };
window.addEventListener('error', (e) => showError(`エラー: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showError(`エラー: ${e.reason?.message || e.reason}`));

async function main() {
  const reg = createRegistry(await loadDataBrowser('./data/'));
  for (const w of reg.warnings) console.warn('データ警告:', w);
  const start = await showStartScreen(reg);
  const world = createWorld({ seed: start.seed, cityId: start.cityId, reg, size: start.size });

  const canvas = document.getElementById('view');
  const { renderer, scene, resize } = createScene(canvas);
  const { w, h } = resize();
  const orbit = createOrbitCamera(canvas, { centerX: world.map.w / 2, centerZ: world.map.h / 2, aspect: w / h });
  const terrain = createTerrainMesh(world, reg);
  scene.add(terrain.mesh); scene.add(terrain.water);
  const assets = createAssetResolver(reg);
  const buildings = createBuildingsView(world, reg, scene, assets, terrain);
  const overlay = createOverlay(scene, terrain);
  const picker = createPicker(canvas, orbit.camera, terrain, world.map.w, world.map.h);

  const tooltip = createTooltip(reg);
  const log = createLog(world);
  const infoPanel = createInfoPanel(world, reg, tooltip);
  const loop = createGameLoop(world, reg, {
    onTick() {},
    onFrame(dt) {
      orbit.update(dt);
      terrain.update();
      buildings.update();
      hud.update(); log.update(); infoPanel.update();
      renderer.render(scene, orbit.camera);
    },
  });
  const hud = createHud(world, reg, loop, tooltip);
  const toolbar = createToolbar(reg, () => {});
  createInput({ canvas, picker, overlay, world, reg, toolbar, infoPanel, log, orbit });

  window.addEventListener('resize', () => { const s = resize(); orbit.setAspect(s.w / s.h); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); loop.togglePause(); } });
  loop.start();
  assets.loadExternal(() => buildings.refreshModels());
  window.__game = { world, reg, loop, THREE }; // デバッグ用
}

main().catch((err) => { console.error(err); showError(`起動に失敗しました: ${err.message}`); });
