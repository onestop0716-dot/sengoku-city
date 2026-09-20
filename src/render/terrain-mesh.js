// 地形メッシュ（チャンク分割・滑らかな高さ場 + 頂点色）、区画オーバーレイ（チャンクごと）、水面、マップ外の大地。
import * as THREE from 'three';
import { createTerrainField, PAL, CHUNK } from './terrain-field.js';
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
  uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
  void main() {
    if (vDepth < 0.015) discard;
    float a = sin(vUv2.x * 3.1 + vUv2.y * 1.3 + time * 1.6) + sin(vUv2.x * 1.1 - vUv2.y * 2.7 + time * 1.1) * 0.7;
    float b = cos(vUv2.x * 1.4 - vUv2.y * 2.2 + time * 1.3) + cos(vUv2.x * 2.9 + vUv2.y * 0.8 - time * 0.9) * 0.7;
    vec3 n = normalize(vec3(-a * 0.05 * ripple, 1.0, -b * 0.05 * ripple));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = mix(shallowColor, deepColor, smoothstep(0.0, 0.55, vDepth));
    col = mix(col, skyColor, fres * 0.55);
    vec3 hv = normalize(sunDir + v);
    col += pow(max(dot(n, hv), 0.0), 90.0) * 0.5;
    float alpha = mix(0.35, 0.86, smoothstep(0.0, 0.45, vDepth)) + fres * 0.1;
    float dist = length(cameraPosition - vWorld);
    float fogF = smoothstep(fogNear, fogFar, dist);
    col = mix(col, fogColor, fogF);
    gl_FragColor = vec4(col, min(alpha, 0.95) * (1.0 - fogF * 0.6));
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

export function createTerrainMesh(world, reg, { segments = 4, sunDir, fog } = {}) {
  const { w, h } = world.map;
  const field = createTerrainField(world, reg, { segments });
  const S = field.S;
  const group = new THREE.Group();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const zoneMat = new THREE.ShaderMaterial({ vertexShader: ZONE_VERT, fragmentShader: ZONE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const zoneColors = reg.zones.map((z) => hexToLinear(z.color));

  // --- 地形チャンク
  const chunks = [];
  for (let cz = 0; cz < field.chunksZ; cz++) for (let cx = 0; cx < field.chunksX; cx++) {
    const c = field.buildChunk(cx, cz);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(c.normals, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(c.colors, 3));
    geom.setIndex(new THREE.BufferAttribute(c.indices, 1));
    geom.computeBoundingSphere();
    const mesh = new THREE.Mesh(geom, terrainMat);
    mesh.receiveShadow = true;
    group.add(mesh);
    chunks.push({ cx, cz, mesh, geom, colors: c.colors, zoneMesh: null });
  }

  // --- 区画オーバーレイ（チャンクごと。マスごとの面 + 外周の縁取り、ぼかしなし）
  const LIFT = 0.05, EDGE_W = 0.09;
  const buildZoneOverlay = (chunk) => {
    const pos = [], col = [], alp = [];
    const H = field.H, VW = field.VW;
    const vtx = (i, j, lift) => [i / S, H[j * VW + i] + lift, j / S];
    const push = (p, c, a) => { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); alp.push(a); };
    const quad = (a, b, c, d, color, alpha) => { push(a, color, alpha); push(c, color, alpha); push(b, color, alpha); push(a, color, alpha); push(d, color, alpha); push(c, color, alpha); };
    const same = (x, y, z) => x >= 0 && y >= 0 && x < w && y < h && world.zones[y * w + x] === z;
    for (let ty = chunk.cz * CHUNK; ty < Math.min(h, (chunk.cz + 1) * CHUNK); ty++) for (let tx = chunk.cx * CHUNK; tx < Math.min(w, (chunk.cx + 1) * CHUNK); tx++) {
      const z = world.zones[ty * w + tx];
      if (!z) continue;
      const color = zoneColors[z - 1];
      const dark = color.clone().multiplyScalar(0.45);
      for (let sj = 0; sj < S; sj++) for (let si = 0; si < S; si++) {
        const i = tx * S + si, j = ty * S + sj;
        quad(vtx(i, j, LIFT), vtx(i + 1, j, LIFT), vtx(i + 1, j + 1, LIFT), vtx(i, j + 1, LIFT), color, 0.34);
      }
      const edges = [
        [!same(tx, ty - 1, z), (t) => [tx + t, ty], [0, 1]], [!same(tx, ty + 1, z), (t) => [tx + t, ty + 1], [0, -1]],
        [!same(tx - 1, ty, z), (t) => [tx, ty + t], [1, 0]], [!same(tx + 1, ty, z), (t) => [tx + 1, ty + t], [-1, 0]],
      ];
      for (const [on, at, inward] of edges) {
        if (!on) continue;
        for (let k = 0; k < S; k++) {
          const [x0, z0] = at(k / S), [x1, z1] = at((k + 1) / S);
          const hh = (x, zz) => field.heightAt(x, zz) + LIFT + 0.01;
          quad([x0, hh(x0, z0), z0], [x1, hh(x1, z1), z1],
            [x1 + inward[0] * EDGE_W, hh(x1 + inward[0] * EDGE_W, z1 + inward[1] * EDGE_W), z1 + inward[1] * EDGE_W],
            [x0 + inward[0] * EDGE_W, hh(x0 + inward[0] * EDGE_W, z0 + inward[1] * EDGE_W), z0 + inward[1] * EDGE_W], dark, 0.95);
        }
      }
    }
    if (chunk.zoneMesh) { group.remove(chunk.zoneMesh); chunk.zoneMesh.geometry.dispose(); chunk.zoneMesh = null; }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(alp), 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, zoneMat);
    m.renderOrder = 1;
    chunk.zoneMesh = m;
    group.add(m);
  };
  for (const c of chunks) buildZoneOverlay(c);

  // --- 水面（マップ内はチャンクごと、マップ外は1枚）
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
    uniforms: {
      time: { value: 0 }, ripple: { value: 1 },
      sunDir: { value: (sunDir || new THREE.Vector3(0.5, 1, 0.4)).clone().normalize() },
      shallowColor: { value: hexToLinear('#7fb8c8') }, deepColor: { value: hexToLinear('#2f6f96') }, skyColor: { value: hexToLinear('#dfe9f0') },
      fogColor: { value: fog ? fog.color.clone() : hexToLinear('#e6ede9') }, fogNear: { value: fog ? fog.near : 1e6 }, fogFar: { value: fog ? fog.far : 2e6 },
    },
  });
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
    if (p === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    g.setAttribute('depth', new THREE.BufferAttribute(wdepth, 1));
    g.setIndex(new THREE.BufferAttribute(widx.subarray(0, p), 1));
    g.computeBoundingSphere();
    return g;
  };
  const WS = Math.max(1, Math.round(S / 2));
  const waterMeshes = [];
  for (const c of chunks) {
    const g = waterGrid(c.cx * CHUNK, c.cz * CHUNK, Math.min(w, (c.cx + 1) * CHUNK), Math.min(h, (c.cz + 1) * CHUNK), 1 / WS, (x, z) => field.heightAt(x, z));
    if (!g) continue;
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 2; group.add(m); waterMeshes.push(m);
  }

  // --- マップ外の大地: 端の高さをそのまま引き継ぎ、遠くはゆるやかな丘にして霞に溶かす
  const E = Math.max(w, h) * 2.5, CELL = Math.max(2, Math.round(Math.max(w, h) / 48));
  const smoothMax = (a, b, k) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
  const outerHeight = (x, z) => {
    const cx = Math.min(w, Math.max(0, x)), cz = Math.min(h, Math.max(0, z));
    const d = Math.hypot(x - cx, z - cz);
    let edge = field.heightExact(cx, cz) - 0.03;
    // 川の出口は短く（十数マス）で陸に戻す。まっすぐな水の筋が遠くまで伸びないように
    if (edge < field.waterLevel + 0.2) { const tw = Math.min(1, d / 14); edge = edge + (field.waterLevel + 0.35 - edge) * tw * tw * (3 - 2 * tw); }
    let far = field.waterLevel + 0.7 + Math.max(0, fbm(x / 55, z / 55, world.seed + 901) - 0.4) * 9 + (fbm(x / 14, z / 14, world.seed + 902) - 0.5) * 0.9;
    far = smoothMax(far, field.waterLevel + 0.45, 0.3);
    const blend = Math.max(30, Math.max(w, h) * 0.35);          // 端の地形（山など）をこの距離でなだらかに遠景へつなぐ
    const t = Math.min(1, d / blend); const tt = t * t * (3 - 2 * t);
    return edge + (far - edge) * tt;
  };
  const bal = reg.balance.map;
  const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const outerColor = (x, z, y) => {
    const n1 = fbm(x / 9, z / 9, world.seed + 501) - 0.5;
    const f = Math.min(1, Math.max(0, 0.55 * 1.15 + n1 * 0.6));
    let c = PAL.grassDry.map((v, q) => v + (PAL.grassRich[q] - v) * f);
    // 高い所は土・岩（マップ内と同じしきい値）。端の山がそのまま続いて見える
    const dirt = sstep(bal.hillHeight - 0.3, bal.hillHeight + 0.6, y) * 0.35, rock = sstep(bal.mountainHeight - 0.4, bal.mountainHeight + 0.8, y) * 0.8;
    c = c.map((v, q) => v + (PAL.dirt[q] - v) * dirt);
    return c.map((v, q) => v + (PAL.rockDark[q] - v) * rock);
  };
  const outerGeom = (() => {
    const x0 = -E, z0 = -E, nx = Math.ceil((w + 2 * E) / CELL), nz = Math.ceil((h + 2 * E) / CELL);
    const vw = nx + 1;
    const pos = new Float32Array(vw * (nz + 1) * 3), col = new Float32Array(vw * (nz + 1) * 3);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * CELL, z = z0 + j * CELL, k = (j * vw + i) * 3;
      const y = outerHeight(x, z);
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const g = outerColor(x, z, y); col[k] = g[0]; col[k + 1] = g[1]; col[k + 2] = g[2];
    }
    const idx = new Uint32Array(nx * nz * 6);
    let p = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * CELL, z = z0 + j * CELL;
      if (x >= 1 && z >= 1 && x + CELL <= w - 1 && z + CELL <= h - 1) continue;
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
  outer.receiveShadow = true; outer.renderOrder = -1; outer.frustumCulled = false;
  group.add(outer);
  const outerWaterGeom = waterGrid(-E, -E, w + E, h + E, CELL, outerHeight, (x, z, st) => x >= 0 && z >= 0 && x + st <= w && z + st <= h);
  if (outerWaterGeom) { const m = new THREE.Mesh(outerWaterGeom, waterMat); m.renderOrder = 2; m.frustumCulled = false; group.add(m); waterMeshes.push(m); }

  return {
    group, field,
    heightAt: (x, z) => field.heightAt(x, z),
    heightAtTile: (x, y) => field.heightAt(x + 0.5, y + 0.5),
    setRipple(v) { waterMat.uniforms.ripple.value = v; },
    setFog(f) { waterMat.uniforms.fogColor.value.copy(f.color); waterMat.uniforms.fogNear.value = f.near; waterMat.uniforms.fogFar.value = f.far; },
    update(dt) {
      waterMat.uniforms.time.value += dt;
      if (world.dirty.tiles.size === 0) return;
      const r = field.recolor(world.dirty.tiles);
      world.dirty.tiles.clear();
      if (!r) return;
      for (const ci of r.chunks) {
        const c = chunks[ci];
        field.copyChunkColors(c.cx, c.cz, c.colors);
        c.geom.attributes.color.needsUpdate = true;
        buildZoneOverlay(c);
      }
    },
    dispose() {
      for (const c of chunks) { c.geom.dispose(); c.zoneMesh?.geometry.dispose(); }
      for (const m of waterMeshes) m.geometry.dispose();
      outerGeom.dispose(); terrainMat.dispose(); zoneMat.dispose(); waterMat.dispose(); outer.material.dispose();
    },
  };
}
