// マスのハイライト（ホバー・ドラッグ範囲・道路の経路プレビュー）。
import * as THREE from 'three';

export function createOverlay(scene, terrain, maxTiles = 4096) {
  const geom = new THREE.BoxGeometry(1, 0.08, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geom, mat, maxTiles);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4();
  return {
    /** tiles: [[x,y],...]、color: 16進 */
    setTiles(tiles, color) {
      mat.color.setHex(color);
      const n = Math.min(tiles.length, maxTiles);
      for (let k = 0; k < n; k++) {
        const [x, y] = tiles[k];
        m4.makeTranslation(x + 0.5, terrain.heightAt(x, y) + 0.06, y + 0.5);
        mesh.setMatrixAt(k, m4);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { mesh.count = 0; },
  };
}
