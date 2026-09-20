// マウス位置 → マス座標。地面との交点を高さで2回補正する。
import * as THREE from 'three';

export function createPicker(canvas, camera, terrain, w, h) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  return {
    /** @returns {{x:number,y:number}|null} */
    tileAt(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let level = 0;
      let tx = -1, ty = -1;
      for (let iter = 0; iter < 3; iter++) {
        plane.constant = -level;
        if (!ray.ray.intersectPlane(plane, hit)) return null;
        tx = Math.floor(hit.x); ty = Math.floor(hit.z);
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
        level = terrain.heightAt(tx, ty);
      }
      return { x: tx, y: ty };
    },
  };
}
