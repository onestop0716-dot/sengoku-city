// 建物と木を InstancedMesh で描く。モデルIDごとに1つの InstancedMesh。
import * as THREE from 'three';
import { hash2 } from '../core/rng.js';
import { modelIdFor } from '../sim/zones.js';

export function createBuildingsView(world, reg, scene, assets, terrain) {
  const meshes = new Map(); // modelId → { mesh, capacity }
  const group = new THREE.Group();
  scene.add(group);
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const ensure = (modelId, count) => {
    let e = meshes.get(modelId);
    if (e && e.capacity >= count) return e;
    const capacity = Math.max(64, Math.ceil(count * 1.5));
    const { geometry, material } = assets.procedural(modelId);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    if (e) group.remove(e.mesh);
    e = { mesh, capacity };
    meshes.set(modelId, e);
    group.add(mesh);
    return e;
  };

  const setInstance = (e, index, x, y, z, rotY, scale) => {
    pos.set(x, y, z); quat.setFromAxisAngle(up, rotY); scl.set(scale, scale, scale);
    m4.compose(pos, quat, scl);
    e.mesh.setMatrixAt(index, m4);
  };

  const rebuildBuildings = () => {
    const groups = new Map();
    for (const b of world.buildings.values()) {
      const modelId = b.state === 'built' ? modelIdFor(world, reg, b) : 'scaffold';
      if (!groups.has(modelId)) groups.set(modelId, []);
      groups.get(modelId).push(b);
    }
    for (const [modelId, e] of meshes) if (!modelId.startsWith('tree_') && !groups.has(modelId)) e.mesh.count = 0;
    for (const [modelId, list] of groups) {
      const e = ensure(modelId, list.length);
      list.forEach((b, k) => {
        const cx = b.x + b.w / 2, cz = b.y + b.h / 2;
        const y = terrain.heightAt(b.x, b.y);
        const scale = modelId === 'scaffold' ? Math.max(b.w, b.h) : 1;
        setInstance(e, k, cx, y, cz, (b.rotation || 0) * Math.PI / 2, scale);
      });
      e.mesh.count = list.length;
      e.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const rebuildTrees = () => {
    const { w, h, tile } = world.map;
    const forest = reg.tileIndex.get('forest');
    const lists = [[], [], []];
    for (let i = 0; i < w * h; i++) if (tile[i] === forest) lists[Math.floor(hash2(i % w, (i / w) | 0, 11) * 3)].push(i);
    lists.forEach((list, v) => {
      const e = ensure(`tree_${'abc'[v]}`, list.length);
      list.forEach((i, k) => {
        const x = i % w, y = (i / w) | 0;
        const jx = (hash2(x, y, 12) - 0.5) * 0.5, jz = (hash2(x, y, 13) - 0.5) * 0.5;
        setInstance(e, k, x + 0.5 + jx, terrain.heightAt(x, y), y + 0.5 + jz, hash2(x, y, 14) * Math.PI * 2, 0.8 + hash2(x, y, 15) * 0.5);
      });
      e.mesh.count = list.length;
      e.mesh.instanceMatrix.needsUpdate = true;
    });
  };

  rebuildBuildings();
  return {
    group,
    update() {
      if (world.dirty.buildings) { rebuildBuildings(); world.dirty.buildings = false; }
      if (world.dirty.trees) { rebuildTrees(); world.dirty.trees = false; }
    },
    /** glTF 差し替え後などに全て作り直す */
    refreshModels() {
      for (const [, e] of meshes) group.remove(e.mesh);
      meshes.clear();
      rebuildBuildings(); rebuildTrees();
    },
  };
}
