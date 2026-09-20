// 地形メッシュ（滑らかな高さ場 + 頂点色）、区画の半透明オーバーレイ、水面。
import * as THREE from 'three';
import { createTerrainField, PAL } from './terrain-field.js';
import { fbm } from '../sim/terrain/noise.js';

const hexToLinear = (hexStr) => new THREE.Color(hexStr).convertSRGBToLinear();

const WATER_VERT = /* glsl */`
  attribute float depth;
  varying float vDepth; varying vec3 vWorld; varying vec2 vUv2;
  uniform float time;
  void main() {
    vDepth = depth; vUv2 = position.xz;
    vec3 p = position;
    p.y += 0.015 * sin(p.x * 1.7 + time * 1.1) * cos(p.z * 1.3 + time * 0.9);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const WATER_FRAG = /* glsl */`
  precision highp float;
  varying float vDepth; varying vec3 vWorld; varying vec2 vUv2;
  uniform float time; uniform vec3 sunDir; uniform vec3 shallowColor; uniform vec3 deepColor; uniform vec3 skyColor; uniform float ripple;
  void main() {
    if (vDepth < 0.015) discard;
    // 揺らぎ: 2方向の正弦波から法線を作る
    float a = sin(vUv2.x * 3.1 + vUv2.y * 1.3 + time * 1.6) + sin(vUv2.x * 1.1 - vUv2.y * 2.7 + time * 1.1) * 0.7;
    float b = cos(vUv2.x * 1.4 - vUv2.y * 2.2 + time * 1.3) + cos(vUv2.x * 2.9 + vUv2.y * 0.8 - time * 0.9) * 0.7;
    vec3 n = normalize(vec3(-a * 0.05 * ripple, 1.0, -b * 0.05 * ripple));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = mix(shallowColor, deepColor, smoothstep(0.0, 0.55, vDepth));
    col = mix(col, skyColor, fres * 0.55);
    vec3 hv = normalize(sunDir + v);
    float spec = pow(max(dot(n, hv), 0.0), 90.0) * 0.5;
    col += spec;
    float alpha = mix(0.35, 0.86, smoothstep(0.0, 0.45, vDepth)) + fres * 0.1;
    gl_FragColor = vec4(col, min(alpha, 0.95));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const ZONE_VERT = /* glsl */`
  attribute float alpha; attribute vec3 color;
  varying float vAlpha; varying vec3 vColor;
  void main() { vAlpha = alpha; vColor = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ZONE_FRAG = /* glsl */`
  precision highp float;
  varying float vAlpha; varying vec3 vColor;
  void main() { if (vAlpha < 0.02) discard; gl_FragColor = vec4(vColor, vAlpha * 0.5);
  #include <tonemapping_fragment>
  #include <colorspace_fragment> }`;

export function createTerrainMesh(world, reg, { segments = 4, sunDir } = {}) {
  const { w, h } = world.map;
  const field = createTerrainField(world, reg, { segments });
  const group = new THREE.Group();

  // --- 地形
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(field.normals, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(field.colors, 3));
  geom.setIndex(new THREE.BufferAttribute(field.indices, 1));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  group.add(mesh);

  // --- 区画オーバーレイ: マスごとの面（地形に沿う）+ 外周の縁取り。ぼかしなし
  const zoneColors = reg.zones.map((z) => hexToLinear(z.color));
  const S = field.S, VW = field.VW;
  const zoneMat = new THREE.ShaderMaterial({ vertexShader: ZONE_VERT, fragmentShader: ZONE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  let zoneMesh = null;
  const LIFT = 0.05, EDGE_W = 0.09;
  const buildZoneOverlay = () => {
    const pos = [], col = [], alp = [];
    const P = field.positions;
    const vtx = (i, j, lift) => { const k = field.vindex(i, j) * 3; return [P[k], P[k + 1] + lift, P[k + 2]]; };
    const push = (p, c, a) => { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); alp.push(a); };
    const quad = (a, b, c, d, color, alpha) => { push(a, color, alpha); push(c, color, alpha); push(b, color, alpha); push(a, color, alpha); push(d, color, alpha); push(c, color, alpha); };
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const z = world.zones[ty * w + tx];
      if (!z) continue;
      const color = zoneColors[z - 1];
      const dark = color.clone().multiplyScalar(0.45);
      // 面
      for (let sj = 0; sj < S; sj++) for (let si = 0; si < S; si++) {
        const i = tx * S + si, j = ty * S + sj;
        quad(vtx(i, j, LIFT), vtx(i + 1, j, LIFT), vtx(i + 1, j + 1, LIFT), vtx(i, j + 1, LIFT), color, 0.34);
      }
      // 縁取り: 隣が同じ区画でない辺
      const same = (x, y) => x >= 0 && y >= 0 && x < w && y < h && world.zones[y * w + x] === z;
      const edges = [
        [!same(tx, ty - 1), (t) => [tx + t, ty], [0, 1]],          // 北辺（内側は +z）
        [!same(tx, ty + 1), (t) => [tx + t, ty + 1], [0, -1]],     // 南辺
        [!same(tx - 1, ty), (t) => [tx, ty + t], [1, 0]],          // 西辺
        [!same(tx + 1, ty), (t) => [tx + 1, ty + t], [-1, 0]],     // 東辺
      ];
      for (const [on, at, inward] of edges) {
        if (!on) continue;
        for (let k = 0; k < S; k++) {
          const [x0, z0] = at(k / S), [x1, z1] = at((k + 1) / S);
          const a = [x0, field.heightAt(x0, z0) + LIFT + 0.01, z0], b = [x1, field.heightAt(x1, z1) + LIFT + 0.01, z1];
          const c = [x1 + inward[0] * EDGE_W, field.heightAt(x1 + inward[0] * EDGE_W, z1 + inward[1] * EDGE_W) + LIFT + 0.01, z1 + inward[1] * EDGE_W];
          const d = [x0 + inward[0] * EDGE_W, field.heightAt(x0 + inward[0] * EDGE_W, z0 + inward[1] * EDGE_W) + LIFT + 0.01, z0 + inward[1] * EDGE_W];
          quad(a, b, c, d, dark, 0.95);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(alp), 1));
    if (zoneMesh) { group.remove(zoneMesh); zoneMesh.geometry.dispose(); }
    zoneMesh = new THREE.Mesh(g, zoneMat);
    zoneMesh.renderOrder = 1; zoneMesh.frustumCulled = false;
    group.add(zoneMesh);
  };
  buildZoneOverlay();

  // --- 水面（マップ内 + マップ外の続き）
  /** 格子 [x0,x1]×[z0,z1] を step 間隔で覆う水面。heightFn で深さを決め、陸だけの三角形は出さない */
  const waterGrid = (x0, z0, x1, z1, step, heightFn, skipFn) => {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
    const wv = nx + 1, wh = nz + 1;
    const wpos = new Float32Array(wv * wh * 3), wdepth = new Float32Array(wv * wh);
    for (let j = 0; j < wh; j++) for (let i = 0; i < wv; i++) {
      const x = x0 + i * step, z = z0 + j * step, k = j * wv + i;
      wpos[k * 3] = x; wpos[k * 3 + 1] = field.waterLevel; wpos[k * 3 + 2] = z;
      wdepth[k] = field.waterLevel - heightFn(x, z);
    }
    const widx = new Uint32Array(nx * nz * 6);
    let p = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (skipFn && skipFn(x0 + i * step, z0 + j * step, step)) continue;
      const a = j * wv + i, b = a + 1, c = a + wv, d = c + 1;
      if (wdepth[a] < 0 && wdepth[b] < 0 && wdepth[c] < 0 && wdepth[d] < 0) continue;
      widx[p++] = a; widx[p++] = c; widx[p++] = b; widx[p++] = b; widx[p++] = c; widx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    g.setAttribute('depth', new THREE.BufferAttribute(wdepth, 1));
    g.setIndex(new THREE.BufferAttribute(widx.subarray(0, p), 1));
    return g;
  };
  const WS = Math.max(1, Math.round(S / 2));
  const waterGeom = waterGrid(0, 0, w, h, 1 / WS, (x, z) => field.heightAt(x, z));
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
    uniforms: {
      time: { value: 0 }, ripple: { value: 1 },
      sunDir: { value: (sunDir || new THREE.Vector3(0.5, 1, 0.4)).clone().normalize() },
      shallowColor: { value: hexToLinear('#7fb8c8') }, deepColor: { value: hexToLinear('#2f6f96') }, skyColor: { value: hexToLinear('#dfe9f0') },
    },
  });
  const water = new THREE.Mesh(waterGeom, waterMat);
  water.renderOrder = 2;
  group.add(water);

  // --- マップ外の大地: 端の高さをそのまま引き継ぎ、遠くはゆるやかな丘にして霞に溶かす
  const E = Math.max(w, h) * 2.5, CELL = 2;
  const smoothMax = (a, b, k) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
  const outerHeight = (x, z) => {
    const cx = Math.min(w, Math.max(0, x)), cz = Math.min(h, Math.max(0, z));
    const d = Math.hypot(x - cx, z - cz);
    const edge = field.heightAt(cx, cz) - 0.03;
    // 遠くはゆるやかな丘。水面より下には下げない（マップ外に湖ができないように）
    let far = field.waterLevel + 0.7 + Math.max(0, fbm(x / 55, z / 55, world.seed + 901) - 0.4) * 9 + (fbm(x / 14, z / 14, world.seed + 902) - 0.5) * 0.9;
    far = smoothMax(far, field.waterLevel + 0.45, 0.3);
    // 端からの距離で 端の高さ → 遠景の高さ へ（川の出口は少しだけ続く）
    const t = Math.min(1, d / 26); const tt = t * t * (3 - 2 * t);
    return edge + (far - edge) * tt;
  };
  // マップ内と同じ見た目の草色（肥沃度は平均的な値とする）
  const outerColor = (x, z) => {
    const n1 = fbm(x / 9, z / 9, world.seed + 501) - 0.5;
    const f = Math.min(1, Math.max(0, 0.55 * 1.15 + n1 * 0.6));
    return PAL.grassDry.map((v, q) => v + (PAL.grassRich[q] - v) * f);
  };
  const outerGeom = (() => {
    const x0 = -E, z0 = -E, nx = Math.ceil((w + 2 * E) / CELL), nz = Math.ceil((h + 2 * E) / CELL);
    const vw = nx + 1;
    const pos = new Float32Array(vw * (nz + 1) * 3), col = new Float32Array(vw * (nz + 1) * 3);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * CELL, z = z0 + j * CELL, k = (j * vw + i) * 3;
      const y = outerHeight(x, z);
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const g = outerColor(x, z);
      col[k] = g[0]; col[k + 1] = g[1]; col[k + 2] = g[2];
    }
    const idx = new Uint32Array(nx * nz * 6);
    let p = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * CELL, z = z0 + j * CELL;
      if (x >= 1 && z >= 1 && x + CELL <= w - 1 && z + CELL <= h - 1) continue;   // マップの内側は出さない
      const a = j * vw + i, b = a + 1, c = a + vw, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx.subarray(0, p), 1));
    g.computeVertexNormals();
    return g;
  })();
  const outer = new THREE.Mesh(outerGeom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  outer.receiveShadow = true;
  outer.renderOrder = -1;
  group.add(outer);
  // マップ外へ流れ出す川の続き
  const outerWater = new THREE.Mesh(waterGrid(-E, -E, w + E, h + E, CELL, outerHeight, (x, z, st) => x >= 0 && z >= 0 && x + st <= w && z + st <= h), waterMat);
  outerWater.renderOrder = 2;
  group.add(outerWater);

  return {
    group, field, mesh, water,
    heightAt: (x, z) => field.heightAt(x, z),
    /** タイル中心の高さ（建物配置用） */
    heightAtTile: (x, y) => field.heightAt(x + 0.5, y + 0.5),
    setRipple(v) { waterMat.uniforms.ripple.value = v; },
    update(dt) {
      waterMat.uniforms.time.value += dt;
      if (world.dirty.tiles.size === 0) return;
      const r = field.recolor(world.dirty.tiles);
      buildZoneOverlay();
      world.dirty.tiles.clear();
      if (r) geom.attributes.color.needsUpdate = true;
    },
    dispose() { geom.dispose(); zoneMesh?.geometry.dispose(); waterGeom.dispose(); outerGeom.dispose(); outerWater.geometry.dispose(); mat.dispose(); zoneMat.dispose(); waterMat.dispose(); outer.material.dispose(); },
  };
}
