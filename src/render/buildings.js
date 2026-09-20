// 建物と木を InstancedMesh で描く。モデルごとに 近景（詳細）/ 遠景（簡略）の2段 LOD。
// 近景と遠景の振り分けはカメラが動いたときだけ再計算する。
import * as THREE from 'three';
import { hash2 } from '../core/rng.js';
import { modelIdFor } from '../sim/zones.js';
import { cropStage } from './crop-stage.js';

const SPECIES = ['pine', 'cypress', 'sophora', 'elm', 'willow'];
const SPECIES_WEIGHT = { north: [32, 18, 28, 22, 0], central: [22, 12, 34, 24, 8], south: [14, 10, 36, 22, 18] };

export function createBuildingsView(world, reg, scene, assets, env) {
  const group = new THREE.Group();
  scene.add(group);
  const sets = new Map(); // modelId → { near, far, items:[{x,y,z,rot,scale}] }
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let quality = { buildingLod: 110, treeLod: [70, 140], shadows: true, nearCap: 900, treeNearCap: 1500 };
  let lastCam = new THREE.Vector3(Infinity, 0, 0);
  let treeItems = [];
  let buildingItems = new Map();
  let lastMonth = world.calendar.month;

  const makeMesh = (geometry, capacity, cast) => {
    const mesh = new THREE.InstancedMesh(geometry, assets.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = cast; mesh.receiveShadow = true;
    mesh.count = 0;
    group.add(mesh);
    return mesh;
  };
  const ensureSet = (modelId, count) => {
    let s = sets.get(modelId);
    if (s && s.capacity >= count) return s;
    const capacity = Math.max(64, Math.ceil(count * 1.5));
    if (s) { group.remove(s.near); group.remove(s.far); s.near.dispose(); s.far.dispose(); }
    s = { capacity, near: makeMesh(assets.procedural(modelId, 'high').geometry, capacity, quality.shadows), far: makeMesh(assets.procedural(modelId, 'low').geometry, capacity, false), items: [], isTree: modelId.startsWith('tree_') };
    sets.set(modelId, s);
    return s;
  };
  const write = (mesh, index, it) => {
    pos.set(it.x, it.y, it.z); quat.setFromAxisAngle(up, it.rot); scl.set(it.scale, it.scale, it.scale);
    m4.compose(pos, quat, scl);
    mesh.setMatrixAt(index, m4);
  };

  /** 全セットについて、カメラ距離で近景/遠景に振り分けて行列を書く */
  /** 近景に入れる距離のしきい値。数が多すぎるときは近い順に上限まで */
  const nearThreshold = (isTree, camPos) => {
    const lodDist = isTree ? quality.treeLod[0] : quality.buildingLod;
    const cap = isTree ? quality.treeNearCap : quality.nearCap;
    const ds = [];
    for (const s of sets.values()) {
      if (s.isTree !== isTree) continue;
      for (const it of s.items) { const d = Math.hypot(it.x - camPos.x, it.y - camPos.y, it.z - camPos.z); if (d < lodDist) ds.push(d); }
    }
    if (ds.length <= cap) return lodDist;
    ds.sort((a, b) => a - b);
    return ds[cap];
  };
  const distribute = (camPos) => {
    const thr = { tree: nearThreshold(true, camPos), building: nearThreshold(false, camPos) };
    for (const s of sets.values()) {
      const lodDist = s.isTree ? thr.tree : thr.building;
      const cull = s.isTree ? quality.treeLod[1] * 2.2 : Infinity;
      let n = 0, f = 0;
      for (const it of s.items) {
        const d = Math.hypot(it.x - camPos.x, it.y - camPos.y, it.z - camPos.z);
        if (d > cull) continue;
        if (d < lodDist) write(s.near, n++, it); else write(s.far, f++, it);
      }
      s.near.count = n; s.far.count = f;
      s.near.instanceMatrix.needsUpdate = true; s.far.instanceMatrix.needsUpdate = true;
    }
  };

  const collectBuildings = () => {
    buildingItems = new Map();
    for (const b of world.buildings.values()) {
      let modelId = b.state === 'built' ? modelIdFor(world, reg, b) : 'scaffold';
      if (b.category === 'field' && b.state === 'built') modelId += '@' + cropStage(reg.cropById.get(reg.buildingById.get(b.buildingType).crop), world.calendar.month);
      if (!buildingItems.has(modelId)) buildingItems.set(modelId, []);
      const cx = b.x + b.w / 2, cz = b.y + b.h / 2;
      // 足元の高さは足跡の中心と四隅の最小値（斜面で浮かないように）
      let y = env.terrain.heightAt(cx, cz);
      for (const [ox, oz] of [[0.15, 0.15], [b.w - 0.15, 0.15], [0.15, b.h - 0.15], [b.w - 0.15, b.h - 0.15]]) y = Math.min(y, env.terrain.heightAt(b.x + ox, b.y + oz));
      buildingItems.get(modelId).push({ x: cx, y, z: cz, rot: (b.rotation || 0) * Math.PI / 2, scale: modelId === 'scaffold' ? Math.max(b.w, b.h) : 1 });
    }
    for (const s of world.structures.values()) {
      const modelId = s.state === 'built' ? `${s.type}_a` : 'scaffold';
      if (!buildingItems.has(modelId)) buildingItems.set(modelId, []);
      const cx = s.x + s.w / 2, cz = s.y + s.h / 2;
      let y = env.terrain.heightAt(cx, cz);
      if (s.type === 'bridge') y = env.terrain.field.waterLevel + 0.05;
      else if (s.type !== 'canal') for (const [ox, oz] of [[0.15, 0.15], [s.w - 0.15, 0.15], [0.15, s.h - 0.15], [s.w - 0.15, s.h - 0.15]]) y = Math.min(y, env.terrain.heightAt(s.x + ox, s.y + oz));
      // 線状の建築は隣とつながる向きにする
      let rot = (s.rotation || 0) * Math.PI / 2;
      if (s.linear) {
        const W = world.map.w, same = (dx, dz) => { const i = (s.y + dz) * W + (s.x + dx); return world.structAt[i] !== -1 && world.structures.get(world.structAt[i])?.type === s.type; };
        const ns = same(0, -1) || same(0, 1), ew = same(-1, 0) || same(1, 0);
        rot = ns && !ew ? Math.PI / 2 : 0;
        if (s.type === 'bridge') rot = ns ? Math.PI / 2 : 0;
      }
      buildingItems.get(modelId).push({ x: cx, y, z: cz, rot, scale: modelId === 'scaffold' ? Math.max(s.w, s.h) : 1 });
    }
  };
  const collectTrees = () => {
    const { w, h, tile, waterDist } = world.map;
    const forest = reg.tileIndex.get('forest');
    const city = reg.cityById.get(world.cityId);
    const weights = SPECIES_WEIGHT[city.terrainProfile.climate] || SPECIES_WEIGHT.central;
    const total = weights.reduce((a, b) => a + b, 0);
    treeItems = [];
    const byModel = new Map();
    for (let i = 0; i < w * h; i++) {
      if (tile[i] !== forest) continue;
      const x = i % w, z = (i / w) | 0;
      let species;
      if (waterDist[i] <= 2 && hash2(x, z, 21) < 0.6) species = 'willow';
      else { let r = hash2(x, z, 22) * total; species = SPECIES[0]; for (let k = 0; k < SPECIES.length; k++) { r -= weights[k]; if (r <= 0) { species = SPECIES[k]; break; } } }
      const modelId = `tree_${species}_${hash2(x, z, 23) < 0.5 ? 0 : 1}`;
      const jx = (hash2(x, z, 12) - 0.5) * 0.6, jz = (hash2(x, z, 13) - 0.5) * 0.6;
      const px = x + 0.5 + jx, pz = z + 0.5 + jz;
      const it = { x: px, y: env.terrain.heightAt(px, pz) - 0.03, z: pz, rot: hash2(x, z, 14) * Math.PI * 2, scale: 0.8 + hash2(x, z, 15) * 0.55 };
      if (!byModel.has(modelId)) byModel.set(modelId, []);
      byModel.get(modelId).push(it);
    }
    treeItems = byModel;
  };
  const rebuildSets = () => {
    const all = new Map();
    for (const [id, items] of buildingItems) all.set(id, items);
    for (const [id, items] of treeItems) all.set(id, items);
    for (const [id, s] of sets) if (!all.has(id)) { s.items = []; s.near.count = 0; s.far.count = 0; }
    for (const [id, items] of all) { const s = ensureSet(id, items.length); s.items = items; }
    lastCam.set(Infinity, 0, 0);
  };

  collectBuildings(); collectTrees(); rebuildSets();
  return {
    group,
    setQuality(q) {
      quality = q;
      for (const s of sets.values()) s.near.castShadow = q.shadows;
      lastCam.set(Infinity, 0, 0);
    },
    update(camPos) {
      let changed = false;
      if (world.dirty.buildings || world.calendar.month !== lastMonth) { collectBuildings(); world.dirty.buildings = false; lastMonth = world.calendar.month; changed = true; }
      if (world.dirty.trees) { collectTrees(); world.dirty.trees = false; changed = true; }
      if (changed) rebuildSets();
      if (changed || camPos.distanceToSquared(lastCam) > 4) { distribute(camPos); lastCam.copy(camPos); }
    },
    /** 地形の作り直しや glTF 差し替え後に全て作り直す */
    refreshModels() {
      for (const s of sets.values()) { group.remove(s.near); group.remove(s.far); s.near.dispose(); s.far.dispose(); }
      sets.clear();
      collectBuildings(); collectTrees(); rebuildSets();
    },
  };
}
