// 起動: データ読込 → 開始画面 → World 生成 → 描画・UI を接続 → ループ開始。
import * as THREE from 'three';
import { loadDataBrowser, createRegistry } from './data/registry.js';
import { createWorld } from './sim/world.js';
import { createScene } from './render/scene.js';
import { createOrbitCamera } from './render/camera.js';
import { createTerrainMesh } from './render/terrain-mesh.js';
import { createAssetResolver } from './render/assets/resolve.js';
import { createBuildingsView } from './render/buildings.js';
import { createAgentsView } from './render/agents-view.js';
import { createOverlay } from './render/overlay.js';
import { createPicker } from './render/picking.js';
import { createTooltip } from './ui/tooltip.js';
import { createHud } from './ui/hud.js';
import { createToolbar } from './ui/toolbar.js';
import { createInfoPanel } from './ui/info-panel.js';
import { createLog } from './ui/log.js';
import { showStartScreen } from './ui/start-screen.js';
import { createSettingsPanel } from './ui/settings-panel.js';
import { createAdvisorUi } from './ui/advisor.js';
import { createViewMode } from './render/view-mode.js';
import { createViewModePanel } from './ui/view-mode-panel.js';
import { createFinancePanel } from './ui/panels/finance.js';
import { createPopulationPanel } from './ui/panels/population.js';
import { createPersonsPanel } from './ui/panels/persons.js';
import { createResearchPanel } from './ui/panels/research.js';
import { createNationPanel } from './ui/panels/nation.js';
import { createMilitaryPanel } from './ui/panels/military.js';
import { createSystemPanel } from './ui/panels/system.js';
import { createEventModal } from './ui/event-modal.js';
import { createEndingScreen } from './ui/ending.js';
import { takePendingLoad, saveToSlot } from './app/saves.js';
import { deserializeWorld } from './sim/save/serialize.js';
import { restartTutorial } from './sim/advisor.js';
import { detectDevice } from './app/device.js';
import { createAutoQuality } from './app/auto-quality.js';
import { createTouchBar } from './ui/touchbar.js';
import { setupLayout } from './ui/layout.js';
import { registerServiceWorker } from './app/sw-register.js';
import { createDemandMeter } from './ui/demand-meter.js';
import { createGameLoop } from './app/game-loop.js';
import { createInput } from './app/input.js';
import { loadSettings, qualityFor } from './app/settings.js';

const showError = (msg) => { const el = document.getElementById('error'); el.textContent = msg; el.style.display = 'block'; };
window.addEventListener('error', (e) => showError(`エラー: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showError(`エラー: ${e.reason?.message || e.reason}`));

async function main() {
  const raw = await loadDataBrowser('./data/');
  let reg = createRegistry(raw);
  for (const w of reg.warnings) console.warn('データ警告:', w);
  const settings = loadSettings();
  const device = detectDevice();
  if (settings.confirmActions === null || settings.confirmActions === undefined) settings.confirmActions = device.touch;   // タッチ端末では既定で確認方式
  setupLayout({ touch: device.touch });
  registerServiceWorker();
  const pending = takePendingLoad();
  const start = pending ? { load: pending } : await showStartScreen(reg);
  reg = createRegistry(raw, { difficulty: start.load ? (start.load.difficulty || 'normal') : start.difficulty });   // 難易度でバランス値を上書き
  const world = start.load ? deserializeWorld(start.load, reg) : createWorld({ seed: start.seed, cityId: start.cityId, reg, size: start.size });

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
  let quality = null;
  const qctx = {};
  const autoQ = createAutoQuality({ settings, device, ctx: qctx, apply: () => applyQualityChange() });
  quality = qualityFor(settings, world.map.w, autoQ.quality());
  buildTerrain(quality);
  sc.applyQuality(quality);
  const assets = createAssetResolver(reg);
  const buildings = createBuildingsView(world, reg, scene, assets, env);
  buildings.setQuality(quality);
  const overlay = createOverlay(scene, env);
  const radiusOverlay = createOverlay(scene, env, 8192);
  const agentsView = createAgentsView(world, reg, scene, assets, env);
  agentsView.setQuality(quality);
  const picker = createPicker(canvas, orbit.camera, env, world.map.w, world.map.h);
  const viewMode = createViewMode(world, reg, scene, env, assets);

  const tooltip = createTooltip(reg);
  const log = createLog(world);
  const infoPanel = createInfoPanel(world, reg, tooltip);
  const loop = createGameLoop(world, reg, {
    onTick(flags) { if (flags.newYear) saveToSlot(world, reg, 'auto'); },
    onFrame(dt) {
      orbit.update(dt);
      autoQ.update(dt);
      sc.followCamera(orbit.camera.position);
      env.terrain.update(dt);
      viewMode.update(dt);
      buildings.update(orbit.camera.position);
      agentsView.update(dt, loop.speed, orbit.camera.position);
      toolbar.update();
      sc.followShadow(orbit.state.target, quality.shadowRadius);
      hud.update(); log.update(); infoPanel.update(); demand.update(); finance.update(); population.update(); persons.update(); research.update(); nation.update(); military.update(); eventModal.update(); ending.update(); settingsPanel.update(loop.stats); advisor.update(); viewPanel.update(); touchBar.update();
      renderer.render(scene, orbit.camera);
    },
  });
  const applyQualityChange = () => {
    const q = qualityFor(settings, world.map.w, autoQ.quality());
    const rebuild = q.segments !== quality.segments;
    quality = q;
    sc.applyQuality(q);
    if (rebuild) { buildTerrain(q); buildings.refreshModels(); viewMode.reapply(); } else env.terrain.setRipple(q.ripple);
    buildings.setQuality(q); agentsView.setQuality(q);
  };
  const settingsPanel = createSettingsPanel(settings, applyQualityChange, { advisorFrequencies: reg.advice.frequency, advisorCharacters: reg.advice.characters, onAdvisor: () => advisor.refreshCharacter() });
  qctx.loop = loop; qctx.log = log;
  const finance = createFinancePanel(world, reg, tooltip);
  const population = createPopulationPanel(world, reg, tooltip);
  const demand = createDemandMeter(world, tooltip);
  const advisor = createAdvisorUi(world, reg, settings, { onOpenSettings: () => settingsPanel.toggle(), onOpen: () => { for (const p of [finance, population, persons, research, nation, military, system]) p.el.style.display = 'none'; }, onView: (id) => { const t = viewMode.focusProblem(id); if (t) { orbit.state.target.set(t[0] + 0.5, env.terrain.heightAt(t[0] + 0.5, t[1] + 0.5), t[1] + 0.5); orbit.state.distance = Math.min(orbit.state.distance, 40); } } });
  const persons = createPersonsPanel(world, reg, tooltip, log);
  const research = createResearchPanel(world, reg, tooltip, log);
  const nation = createNationPanel(world, reg, tooltip, log);
  const military = createMilitaryPanel(world, reg, tooltip, log);
  const system = createSystemPanel(world, reg, log, { onSettings: () => settingsPanel.toggle(), onRestartTutorial: () => { restartTutorial(world); advisor.restart(); } });
  const panels = { finance, population, persons, research, nation, military, system, advisor };
  const hud = createHud(world, reg, loop, tooltip, { onSettings: () => { for (const [k, p] of Object.entries(panels)) if (k !== 'system') p.el.style.display = 'none'; system.toggle(); }, onPanel: (name) => { for (const [k, p] of Object.entries(panels)) if (k !== name) p.el.style.display = 'none'; panels[name].toggle(); } });
  const viewPanel = createViewModePanel(world, reg, viewMode, { button: hud.viewButton });
  viewMode.onChange((m) => hud.setViewMode(viewPanel.nameOf(m)));
  const toolbar = createToolbar(reg, world, () => { radiusOverlay.clear(); });
  const input = createInput({ canvas, picker, overlay, radiusOverlay, world, reg, toolbar, infoPanel, log, orbit, viewMode, viewPanel, settings, onPending: (a, n) => touchBar.setPending(a, n) });
  const touchBar = createTouchBar({ loop, orbit, toolbar, viewMode, input, show: device.touch });
  touchBar.setPending(null, 0);

  window.addEventListener('resize', () => { const s = sc.resize(); orbit.setAspect(s.w / s.h); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); loop.togglePause(); } });

  const eventModal = createEventModal(world, reg, loop, log);
  const ending = createEndingScreen(world, reg, loop);
  // 画面を閉じたり別アプリへ切り替えたら一時停止してオートセーブ
  let pausedByHide = false;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (loop.speedIndex !== 0) { pausedByHide = true; loop.setSpeedIndex(0); } saveToSlot(world, reg, 'auto'); } else if (pausedByHide) { pausedByHide = false; loop.setSpeedIndex(1); } });
  window.addEventListener('pagehide', () => saveToSlot(world, reg, 'auto'));
  loop.start();
  assets.loadExternal(() => buildings.refreshModels());
  window.__game = { world, reg, loop, THREE, settings, orbit, env, agentsView, advisor, viewMode, input, device, autoQ, rendererInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }) }; // デバッグ用
}

main().catch((err) => { console.error(err); showError(`起動に失敗しました: ${err.message}`); });
