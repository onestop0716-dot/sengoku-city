// 地形メッシュ: マスごとに2三角形（6頂点）。頂点色でマスの種類・区画・道路を表す。
import * as THREE from 'three';
import { hash2 } from '../core/rng.js';
import { srgbToLinear } from './models/builder.js';

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]; };
const ROAD = hexToRgb('#8f7a5c');

export function createTerrainMesh(world, reg) {
  const { w, h, height, tile } = world.map;
  const n = w * h;
  const positions = new Float32Array(n * 18);
  const colors = new Float32Array(n * 18);
  const tileColors = reg.tiles.map((t) => hexToRgb(t.color));
  const zoneColors = reg.zones.map((z) => hexToRgb(z.color));
  const resColors = reg.resources.map((r) => hexToRgb(r.color));

  // 頂点の高さ = 隣接4マスの平均（なだらかに）
  const cornerH = (x, y) => {
    let s = 0, c = 0;
    for (let yy = y - 1; yy <= y; yy++) for (let xx = x - 1; xx <= x; xx++) {
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += height[yy * w + xx]; c++;
    }
    return s / c;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const h00 = cornerH(x, y), h10 = cornerH(x + 1, y), h01 = cornerH(x, y + 1), h11 = cornerH(x + 1, y + 1);
    const t = reg.tiles[tile[i]];
    const wh = t.water ? reg.balance.map.riverLevel : null;
    const q = [
      [x, wh ?? h00, y], [x, wh ?? h01, y + 1], [x + 1, wh ?? h11, y + 1],
      [x, wh ?? h00, y], [x + 1, wh ?? h11, y + 1], [x + 1, wh ?? h10, y],
    ];
    for (let k = 0; k < 6; k++) { positions[i * 18 + k * 3] = q[k][0]; positions[i * 18 + k * 3 + 1] = q[k][1]; positions[i * 18 + k * 3 + 2] = q[k][2]; }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geom, mat);

  // 水面（半透明の板）
  const waterGeom = new THREE.PlaneGeometry(w, h);
  waterGeom.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeom, new THREE.MeshLambertMaterial({ color: 0x4a8fc4, transparent: true, opacity: 0.75 }));
  water.position.set(w / 2, reg.balance.map.riverLevel + 0.12, h / 2);

  const colorOf = (i) => {
    const t = reg.tiles[tile[i]];
    let c = tileColors[tile[i]].slice();
    if (!t.water) {
      const f = world.map.fertility[i];
      const v = 0.86 + 0.22 * f + (hash2(i % w, (i / w) | 0, 3) - 0.5) * 0.08;
      c = c.map((x) => Math.min(1, x * v));
      const r = world.map.resource[i];
      if (r) { const rc = resColors[r - 1]; c = c.map((x, k) => x * 0.5 + rc[k] * 0.5); }
    }
    if (world.roads[i]) return ROAD;
    const z = world.zones[i];
    if (z) { const zc = zoneColors[z - 1]; c = c.map((x, k) => x * 0.55 + zc[k] * 0.45); }
    return c;
  };
  const setTile = (i) => {
    const c = colorOf(i);
    for (let k = 0; k < 6; k++) { colors[i * 18 + k * 3] = c[0]; colors[i * 18 + k * 3 + 1] = c[1]; colors[i * 18 + k * 3 + 2] = c[2]; }
  };
  for (let i = 0; i < n; i++) setTile(i);

  return {
    mesh, water,
    /** World の dirty.tiles を反映する */
    update() {
      if (world.dirty.tiles.size === 0) return;
      for (const i of world.dirty.tiles) setTile(i);
      world.dirty.tiles.clear();
      geom.attributes.color.needsUpdate = true;
    },
    heightAt(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      const t = reg.tiles[tile[y * w + x]];
      return t.water ? reg.balance.map.riverLevel : height[y * w + x];
    },
  };
}
