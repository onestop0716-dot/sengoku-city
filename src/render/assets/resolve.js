// assets.json の定義 → Three.js の形状。glTF が指定されていれば読み込み、失敗したらコード生成にフォールバック。
// lod='low' は遠景用（樹木は簡略生成、建物は外形の箱）。
import * as THREE from 'three';
import { generateModel } from '../models/index.js';
import { createTexturedMaterial } from '../materials.js';

function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  if (m.tex) g.setAttribute('tex', new THREE.BufferAttribute(m.tex, 1));
  return g;
}

/** 詳細モデルの外形（箱）と平均色から遠景用の簡略形状を作る */
function blockFromModel(m) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const c = [0, 0, 0];
  const n = m.vertexCount;
  for (let i = 0; i < n; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    c[0] += m.colors[i * 3]; c[1] += m.colors[i * 3 + 1]; c[2] += m.colors[i * 3 + 2];
  }
  const g = new THREE.BoxGeometry(Math.max(0.2, (maxX - minX) * 0.9), Math.max(0.1, maxY - minY), Math.max(0.2, (maxZ - minZ) * 0.9));
  g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) { cols[i] = c[0] / n; cols[i + 1] = c[1] / n; cols[i + 2] = c[2] / n; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

export function createAssetResolver(reg) {
  const cache = new Map();
  const material = createTexturedMaterial({ roughness: 0.85 });
  let gltfLoader = null;

  async function loadGltf(asset) {
    if (!gltfLoader) {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      gltfLoader = new GLTFLoader();
    }
    const gltf = await gltfLoader.loadAsync(asset.src);
    let found = null;
    gltf.scene.traverse((o) => { if (!found && o.isMesh) found = o; });
    if (!found) throw new Error(`${asset.id}: メッシュがありません`);
    const geom = found.geometry.clone();
    geom.applyMatrix4(found.matrixWorld);
    if (asset.scale && asset.scale !== 1) geom.scale(asset.scale, asset.scale, asset.scale);
    return { geometry: geom, material: found.material || material };
  }

  return {
    material,
    /** 同期: コード生成モデル（glTF 指定でも、読み込み完了までの間はこれを使う） */
    procedural(assetId, lod = 'high') {
      const key = `${assetId}:${lod}`;
      if (cache.has(key)) return cache.get(key);
      const at = assetId.indexOf('@');
      const baseId = at >= 0 ? assetId.slice(0, at) : assetId;
      const asset = reg.assetById.get(baseId);
      if (!asset) throw new Error(`アセット ${baseId} がありません`);
      const params = at >= 0 ? { ...asset.params, stage: assetId.slice(at + 1) } : asset.params;
      const generator = asset.kind === 'procedural' ? asset.generator : (asset.fallbackGenerator || 'scaffold');
      let geometry;
      if (lod === 'low' && generator === 'tree') geometry = toGeometry(generateModel({ generator, params: { ...params, lod: 'low' } }));
      else if (lod === 'low') geometry = blockFromModel(generateModel({ generator, params }));
      else geometry = toGeometry(generateModel({ generator, params }));
      const entry = { geometry, material };
      cache.set(key, entry);
      return entry;
    },
    /** glTF 指定のアセットを非同期で読み込み、成功したら差し替える */
    async loadExternal(onReplaced) {
      const replaced = [];
      for (const asset of reg.assets) {
        if (asset.kind !== 'gltf') continue;
        try {
          const entry = await loadGltf(asset);
          cache.set(`${asset.id}:high`, entry);
          replaced.push(asset.id);
          onReplaced?.(asset.id);
        } catch (err) {
          console.warn(`glTF の読み込みに失敗したためコード生成モデルを使います: ${asset.id}`, err);
        }
      }
      return replaced;
    },
  };
}
