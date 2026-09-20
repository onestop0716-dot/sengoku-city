// assets.json の定義 → Three.js の形状。glTF が指定されていれば読み込み、失敗したらコード生成にフォールバック。
import * as THREE from 'three';
import { generateModel } from '../models/index.js';

function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  return g;
}

export function createAssetResolver(reg) {
  const cache = new Map();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
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
    procedural(assetId) {
      if (cache.has(assetId)) return cache.get(assetId);
      const asset = reg.assetById.get(assetId);
      if (!asset) throw new Error(`アセット ${assetId} がありません`);
      const entry = { geometry: toGeometry(generateModel(asset.kind === 'procedural' ? asset : { generator: asset.fallbackGenerator || 'scaffold', params: asset.params })), material };
      cache.set(assetId, entry);
      return entry;
    },
    /** glTF 指定のアセットを非同期で読み込み、成功したら差し替える。戻り値: 差し替えた assetId の配列 */
    async loadExternal(onReplaced) {
      const replaced = [];
      for (const asset of reg.assets) {
        if (asset.kind !== 'gltf') continue;
        try {
          const entry = await loadGltf(asset);
          cache.set(asset.id, entry);
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
