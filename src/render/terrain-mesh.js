// 地形メッシュ（滑らかな高さ場 + 頂点色）、区画の半透明オーバーレイ、水面。
import * as THREE from 'three';
import { createTerrainField, sampleTile } from './terrain-field.js';

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

  // --- 区画オーバーレイ（地形と同じ格子、少し浮かせる）
  const zonePos = new Float32Array(field.positions);
  for (let k = 1; k < zonePos.length; k += 3) zonePos[k] += 0.04;
  const zoneAlpha = new Float32Array(field.VW * field.VH), zoneColor = new Float32Array(field.VW * field.VH * 3);
  const zoneGeom = new THREE.BufferGeometry();
  zoneGeom.setAttribute('position', new THREE.BufferAttribute(zonePos, 3));
  zoneGeom.setAttribute('alpha', new THREE.BufferAttribute(zoneAlpha, 1));
  zoneGeom.setAttribute('color', new THREE.BufferAttribute(zoneColor, 3));
  zoneGeom.setIndex(geom.getIndex());
  const zoneMat = new THREE.ShaderMaterial({ vertexShader: ZONE_VERT, fragmentShader: ZONE_FRAG, transparent: true, depthWrite: false });
  const zoneMesh = new THREE.Mesh(zoneGeom, zoneMat);
  zoneMesh.renderOrder = 1;
  group.add(zoneMesh);
  const zoneColors = reg.zones.map((z) => hexToLinear(z.color));
  const zoneMask = new Float32Array(w * h);
  const zoneR = new Float32Array(w * h), zoneG = new Float32Array(w * h), zoneB = new Float32Array(w * h);
  const S = field.S, VW = field.VW;
  const updateZoneRange = (i0, i1, j0, j1) => {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i / S, z = j / S, k = j * VW + i;
      const a = sampleTile(zoneMask, w, h, x, z);
      zoneAlpha[k] = a < 0.02 ? 0 : Math.min(1, a * 1.15);
      if (a > 0.02) { zoneColor[k * 3] = sampleTile(zoneR, w, h, x, z) / a; zoneColor[k * 3 + 1] = sampleTile(zoneG, w, h, x, z) / a; zoneColor[k * 3 + 2] = sampleTile(zoneB, w, h, x, z) / a; }
    }
  };
  const refreshZoneMasks = () => {
    for (let i = 0; i < w * h; i++) {
      const z = world.zones[i];
      zoneMask[i] = z ? 1 : 0;
      const c = z ? zoneColors[z - 1] : null;
      zoneR[i] = c ? c.r : 0; zoneG[i] = c ? c.g : 0; zoneB[i] = c ? c.b : 0;
    }
  };
  refreshZoneMasks();
  updateZoneRange(0, field.VW - 1, 0, field.VH - 1);

  // --- 水面
  const WS = Math.max(1, Math.round(S / 2));
  const wv = w * WS + 1, wh = h * WS + 1;
  const wpos = new Float32Array(wv * wh * 3), wdepth = new Float32Array(wv * wh);
  for (let j = 0; j < wh; j++) for (let i = 0; i < wv; i++) {
    const x = i / WS, z = j / WS, k = j * wv + i;
    wpos[k * 3] = x; wpos[k * 3 + 1] = field.waterLevel; wpos[k * 3 + 2] = z;
    wdepth[k] = field.waterLevel - field.heightAt(x, z);
  }
  const widx = new (wv * wh > 65535 ? Uint32Array : Uint16Array)(w * WS * h * WS * 6);
  let p = 0;
  for (let j = 0; j < wh - 1; j++) for (let i = 0; i < wv - 1; i++) {
    const a = j * wv + i, b = a + 1, c = a + wv, d = c + 1;
    // 4頂点とも陸なら三角形を出さない
    if (wdepth[a] < 0 && wdepth[b] < 0 && wdepth[c] < 0 && wdepth[d] < 0) continue;
    widx[p++] = a; widx[p++] = c; widx[p++] = b; widx[p++] = b; widx[p++] = c; widx[p++] = d;
  }
  const waterGeom = new THREE.BufferGeometry();
  waterGeom.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  waterGeom.setAttribute('depth', new THREE.BufferAttribute(wdepth, 1));
  waterGeom.setIndex(new THREE.BufferAttribute(widx.subarray(0, p), 1));
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
      refreshZoneMasks();
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const i of world.dirty.tiles) { const x = i % w, z = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      updateZoneRange(Math.max(0, (x0 - 2) * S), Math.min(VW - 1, (x1 + 3) * S), Math.max(0, (z0 - 2) * S), Math.min(field.VH - 1, (z1 + 3) * S));
      world.dirty.tiles.clear();
      if (r) { geom.attributes.color.needsUpdate = true; }
      zoneGeom.attributes.alpha.needsUpdate = true; zoneGeom.attributes.color.needsUpdate = true;
    },
    dispose() { geom.dispose(); zoneGeom.dispose(); waterGeom.dispose(); mat.dispose(); zoneMat.dispose(); waterMat.dispose(); },
  };
}
