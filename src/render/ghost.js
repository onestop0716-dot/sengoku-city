// 置く前の見本（半透明の建物）。置ける=そのままの色、置けない=赤みを帯びる。足跡の枠は overlay.js が描く。
import * as THREE from 'three';

export function createGhost(scene, assets, env) {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.visible = false;
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  scene.add(mesh);
  let currentModel = null;
  return {
    /** modelId の見本を足跡（x,y,w,h）の中央に、向き rotation（0〜3）で出す */
    show(modelId, x, y, w, h, rotation, ok) {
      if (modelId !== currentModel) {
        try { mesh.geometry = assets.procedural(modelId, 'high').geometry; currentModel = modelId; } catch { mesh.visible = false; return; }
      }
      const cx = x + w / 2, cz = y + h / 2;
      let ground = env.terrain.heightAt(cx, cz);
      for (const [ox, oz] of [[0.15, 0.15], [w - 0.15, 0.15], [0.15, h - 0.15], [w - 0.15, h - 0.15]]) ground = Math.min(ground, env.terrain.heightAt(x + ox, y + oz));
      mesh.position.set(cx, ground, cz);
      mesh.rotation.set(0, (rotation || 0) * Math.PI / 2, 0);
      material.color.setHex(ok ? 0xffffff : 0xff6655);
      mesh.visible = true;
    },
    hide() { mesh.visible = false; },
  };
}
