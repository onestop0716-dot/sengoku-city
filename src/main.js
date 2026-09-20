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
import { createSettingsPanel } from './ui/settings-panel.js';
import { createFinancePanel } from './ui/panels/finance.js';
import { createPopulationPanel } from './ui/panels/population.js';
import { createDemandMeter } from './ui/demand-meter.js';
import { createGameLoop } from './app/game-loop.js';
import { createInput } from './app/input.js';
import { loadSettings, qualityFor } from './app/settings.js';

const showError = (msg) => { const el = document.getElementById('error'); el.textContent = msg; el.style.display = 'block'; };
window.addEventListener('error', (e) => showError(`エラー: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showError(`エラー: ${e.reason?.message || e.reason}`));

async function main() {
  const reg = createRegistry(await loadDataBrowser('./data/'));
  for (const w of reg.warnings) console.warn('データ警告:', w);
  const settings = loadSettings();
  const start = await showStartScreen(reg);
  const world = createWorld({ seed: start.seed, cityId: start.cityId, reg, size: start.size });

  const canvas = document.getElementById('view');
  const sc = createScene(canvas);
  const { renderer, scene } = sc;
  const { w, h } = sc.resize();
  const maxDistance = Math.max(60, Math.round(world.map.w * 1.35));   // ズームアウトの上限（マップ外が大きく見えすぎない）
  const orbit = createOrbitCamera(canvas, { centerX: world.map.w / 2, centerZ: world.map.h / 2, aspect: w / h, maxDistance, bounds: { minX: 0, maxX: world.map.w, minZ: 0, maxZ: world.map.h, margin: 12 } });
  sc.setFog(maxDistance * 1.4, maxDistance * 3.4);
  const env = { terrain: null };
  const buildTerrain = (q) => {
    if (env.terrain) { scene.remove(env.terrain.group); env.terrain.dispose(); }
    env.terrain = createTerrainMesh(world, reg, { segments: q.segments, sunDir: sc.sunDir, fog: scene.fog });
    env.terrain.setRipple(q.ripple);
    scene.add(env.terrain.group);
  };
  let quality = qualityFor(settings, world.map.w);
  buildTerrain(quality);
  sc.applyQuality(quality);
  const assets = createAssetResolver(reg);
  const buildings = createBuildingsView(world, reg, scene, assets, env);
  buildings.setQuality(quality);
  const overlay = createOverlay(scene, env);
  const picker = createPicker(canvas, orbit.camera, env, world.map.w, world.map.h);

  const tooltip = createTooltip(reg);
  const log = createLog(world);
  const infoPanel = createInfoPanel(world, reg, tooltip);
  const loop = createGameLoop(world, reg, {
    onTick() {},
    onFrame(dt) {
      orbit.update(dt);
      sc.followCamera(orbit.camera.position);
      env.terrain.update(dt);
      buildings.update(orbit.camera.position);
      sc.followShadow(orbit.state.target, quality.shadowRadius);
      hud.update(); log.update(); infoPanel.update(); demand.update(); finance.update(); population.update();
      renderer.render(scene, orbit.camera);
    },
  });
  const settingsPanel = createSettingsPanel(settings, () => {
    const q = qualityFor(settings, world.map.w);
    const rebuild = q.segments !== quality.segments;
    quality = q;
    sc.applyQuality(q);
    if (rebuild) { buildTerrain(q); buildings.refreshModels(); } else env.terrain.setRipple(q.ripple);
    buildings.setQuality(q);
  });
  const finance = createFinancePanel(world, reg, tooltip);
  const population = createPopulationPanel(world, reg, tooltip);
  const demand = createDemandMeter(world, tooltip);
  const panels = { finance, population };
  const hud = createHud(world, reg, loop, tooltip, { onSettings: () => settingsPanel.toggle(), onPanel: (name) => { for (const [k, p] of Object.entries(panels)) if (k !== name) p.el.style.display = 'none'; panels[name].toggle(); } });
  const toolbar = createToolbar(reg, () => {});
  createInput({ canvas, picker, overlay, world, reg, toolbar, infoPanel, log, orbit });

  window.addEventListener('resize', () => { const s = sc.resize(); orbit.setAspect(s.w / s.h); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); loop.togglePause(); } });

  loop.start();
  assets.loadExternal(() => buildings.refreshModels());
  window.__game = { world, reg, loop, THREE, settings, orbit, env, rendererInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }) }; // デバッグ用
}

main().catch((err) => { console.error(err); showError(`起動に失敗しました: ${err.message}`); });
