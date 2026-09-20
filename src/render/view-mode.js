// 表示モード（データマップ）の描画。マスごとの色を W×H のテクスチャにまとめ、地形のシェーダーで重ねる。
// 値の計算は sim/view-data.js。テクスチャは値が変わりうるとき（コマンド実行後・数日ごと・モード切替）だけ更新する。
import * as THREE from 'three';
import { viewUniforms } from './materials.js';
import { computeZoneMap, STATE_MODES, STATE_MODE_IDS, FLAG, ZONE_KIND, ZONE_KIND_COLORS, gradientColor, relatedStructures, previewImprovement, modeForEffects, worstTile } from '../sim/view-data.js';

const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const RING_COLORS = { water: 0x3fb8ff, security: 0xff8a3f, market: 0xffd23f, food: 0x9fe05a, loyalty: 0xd9a0ff, default: 0xffffff };

export function createViewMode(world, reg, scene, env, assets) {
  const { w, h } = world.map;
  const data = new Uint8Array(w * h * 4);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
  viewUniforms.uViewTex.value = tex;
  viewUniforms.uViewSize.value.set(w, h);
  const zoneRgb = reg.zones.map((z) => hexRgb(z.color));
  const kindRgb = Object.fromEntries(Object.entries(ZONE_KIND_COLORS).map(([k, v]) => [k, hexRgb(v)]));

  // 効果範囲の輪と施設の足元（LineSegments を地形に沿わせる）
  const ringGroup = new THREE.Group(); scene.add(ringGroup);
  let ringMesh = null;
  const buildRings = (items, color) => {
    if (ringMesh) { ringGroup.remove(ringMesh); ringMesh.geometry.dispose(); ringMesh.material.dispose(); ringMesh = null; }
    const pos = [];
    const put = (x, z) => pos.push(x, env.terrain.heightAt(x, z) + 0.12, z);
    for (const it of items) {
      const cx = it.x + it.w / 2, cz = it.y + it.h / 2;
      // 足元の四角
      const corners = [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]];
      for (let k = 0; k < 4; k++) { const a = corners[k], b = corners[(k + 1) % 4]; put(a[0], a[1]); put(b[0], b[1]); }
      if (!it.radius) continue;
      const seg = Math.max(24, Math.round(it.radius * 6));
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        put(cx + Math.cos(a0) * it.radius, cz + Math.sin(a0) * it.radius); put(cx + Math.cos(a1) * it.radius, cz + Math.sin(a1) * it.radius);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ringMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
    ringMesh.renderOrder = 5; ringMesh.frustumCulled = false;
    ringGroup.add(ringMesh);
  };

  let mode = 'normal';            // 'normal' | 'zones' | <状態モードid>
  let stateId = 'water';          // 最後に選んだ状態モード
  let autoPrev = null;            // 建築の配置中に自動で切り替えた場合の元のモード
  let cache = null;               // { values, flags, raw } または区画の { kind, flags, stats }
  let dirty = true, lastComputeDay = -1;
  let preview = null;             // { def, x, y, tiles, text }
  const listeners = new Set();
  const notify = () => { for (const f of listeners) f(mode); };

  const recompute = () => {
    dirty = false; lastComputeDay = world.day;
    if (mode === 'normal') return;
    if (mode === 'zones') {
      cache = computeZoneMap(world, reg);
      const { kind, flags } = cache;
      for (let i = 0; i < w * h; i++) {
        const k = kind[i];
        let rgb;
        if (k >= ZONE_KIND.ZONE_BASE) rgb = zoneRgb[k - ZONE_KIND.ZONE_BASE];
        else if (k > 0) rgb = kindRgb[k];
        else rgb = null;
        const o = i * 4;
        if (rgb) { data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = flags[i]; }
        else { data[o] = 128; data[o + 1] = 128; data[o + 2] = 128; data[o + 3] = FLAG.NONE; }
      }
      buildRings([], 0xffffff);
    } else {
      const m = STATE_MODES[mode];
      cache = m.compute(world, reg);
      const { values, flags } = cache;
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        if (flags[i] & FLAG.WATER_TILE) { data[o] = 60; data[o + 1] = 120; data[o + 2] = 190; data[o + 3] = 0; continue; }
        if (flags[i] & FLAG.NONE) { data[o] = 110; data[o + 1] = 110; data[o + 2] = 110; data[o + 3] = FLAG.NONE; continue; }
        const rgb = gradientColor(values[i]);
        data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = flags[i] & ~FLAG.PREVIEW;
      }
      buildRings(relatedStructures(world, reg, mode), RING_COLORS[mode] || RING_COLORS.default);
    }
    applyPreview();
    tex.needsUpdate = true;
  };
  const applyPreview = () => {
    if (!preview || mode === 'normal') return;
    for (const i of preview.tiles) data[i * 4 + 3] |= FLAG.PREVIEW;
  };
  const clearPreviewFlags = () => { if (!preview) return; for (const i of preview.tiles) data[i * 4 + 3] &= ~FLAG.PREVIEW; tex.needsUpdate = true; };

  const setMode = (id) => {
    if (id !== 'normal' && id !== 'zones' && !STATE_MODES[id]) return;
    if (id === mode) return;
    mode = id;
    if (STATE_MODES[id]) stateId = id;
    viewUniforms.uViewOn.value = mode === 'normal' ? 0 : mode === 'zones' ? 1 : 2;
    assets.material.transparent = mode !== 'normal';
    assets.material.depthWrite = true;
    env.terrain.setZoneOverlayVisible(mode === 'normal');
    ringGroup.visible = mode !== 'normal';
    cache = null; dirty = true;                      // 前のモードのデータを使わない
    notify();
  };

  return {
    get mode() { return mode; },
    get stateId() { return stateId; },
    get data() { return cache; },
    onChange(f) { listeners.add(f); },
    set: setMode,
    /** Tab で順送り: 通常 → 区画 → 状態（最後に選んだ項目） → 通常 */
    cycle() { setMode(mode === 'normal' ? 'zones' : mode === 'zones' ? stateId : 'normal'); },
    invalidate() { dirty = true; },
    /** 地形を作り直した後に表示状態を再適用する */
    reapply() { env.terrain.setZoneOverlayVisible(mode === 'normal'); dirty = true; },
    /** 区画モードの集計（凡例用） */
    zoneStats() { if (mode !== 'zones') return []; if (dirty || !cache) recompute(); return cache?.stats || []; },
    /** ホバー中のマスの説明 */
    describe(x, y) {
      if (mode === 'normal') return null;
      if (dirty || !cache) recompute();
      const i = y * w + x;
      if (mode === 'zones') {
        const zm = cache;
        const k = zm.kind[i];
        if (k >= ZONE_KIND.ZONE_BASE) { const z = reg.zones[k - ZONE_KIND.ZONE_BASE]; const b = world.buildingAt[i] !== -1 ? world.buildings.get(world.buildingAt[i]) : null; const noRoad = !!(zm.flags[i] & FLAG.BELOW_THRESHOLD); const rd = world.roadDist ? world.roadDist[i] : 0; return { title: z.name, value: b ? `${reg.buildingById.get(b.buildingType)?.name || ''}${b.state === 'built' ? ` L${b.level}` : '（建設中）'}` : noRoad ? '未建築 — 道路が届いていない' : '未建築', parts: [['道路まで', rd >= 0xffff ? '届いていない' : `${rd} マス（${z.roadDistance} マス以内が必要）`]] }; }
        const names = { [ZONE_KIND.ROAD]: '道路', [ZONE_KIND.STRUCTURE]: '特殊建築', [ZONE_KIND.WATER]: '水面', [ZONE_KIND.UNBUILDABLE]: '建てられない地形', [ZONE_KIND.SHORE]: '岸辺（区画不可）' };
        return { title: names[k] || '区画なし', value: k === 0 ? reg.tiles[world.map.tile[i]].name : '', parts: [] };
      }
      const m = STATE_MODES[mode];
      const d = m.describe(world, reg, i, cache);
      if (preview && preview.tiles.includes(i)) d.preview = preview.text;
      return { title: m.name, ...d };
    },
    /** 建築の配置プレビュー: 関連する状態モードに自動で切り替え、改善するマスを明滅させる */
    setPlacement(def, tile) {
      if (!def) {
        if (preview) { clearPreviewFlags(); preview = null; }
        if (autoPrev !== null) { const back = autoPrev; autoPrev = null; setMode(back); }
        return;
      }
      const auto = modeForEffects(def.effects);
      if (auto && mode !== auto) { if (autoPrev === null) autoPrev = mode; setMode(auto); }
      if (dirty || !cache) recompute();
      if (!tile) { if (preview) { clearPreviewFlags(); preview = null; } return; }
      if (preview && preview.x === tile.x && preview.y === tile.y && preview.def === def) return;
      clearPreviewFlags();
      const p = previewImprovement(world, reg, def, tile.x, tile.y, mode);
      preview = { def, x: tile.x, y: tile.y, tiles: p.tiles, text: p.text };
      applyPreview(); tex.needsUpdate = true;
    },
    /** 問題の場所へ: モードを切り替え、いちばん悪いマスを返す */
    focusProblem(id) {
      setMode(id);
      if (dirty || !cache) recompute();
      return worstTile(world, reg, id, cache);
    },
    update(dt) {
      viewUniforms.uViewTime.value += dt;
      if (mode === 'normal') return;
      if (dirty || world.day - lastComputeDay >= 5) recompute();
    },
    dispose() { tex.dispose(); if (ringMesh) { ringMesh.geometry.dispose(); ringMesh.material.dispose(); } scene.remove(ringGroup); },
  };
}
export { STATE_MODES, STATE_MODE_IDS };
