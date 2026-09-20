// 地形の「連続した高さ場」と頂点色。Three.js に依存しない（テスト可能）。
// マス単位の高さ・種類から、タイルより細かい格子（1マスを S 分割）の高さ・法線・色を作る。
// 高さは角の高さ格子を双三次補間し、水辺は「ぼかした水マスク」で水面下へなだらかに掘り下げる。
import { fbm } from '../sim/terrain/noise.js';
import { hash2 } from '../core/rng.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = (h) => [srgbToLinear(((h >> 16) & 255) / 255), srgbToLinear(((h >> 8) & 255) / 255), srgbToLinear((h & 255) / 255)];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// 色（sRGB で指定 → リニアに変換して使う）
export const PAL = {
  grassRich: hex(0x6f9a3e), grassDry: hex(0xa8a465), dirt: hex(0xa48d5e), rock: hex(0x8d8579), rockDark: hex(0x6f665b),
  forestFloor: hex(0x4b7434), marsh: hex(0x6c9a74), sand: hex(0xcdbb8c), bed: hex(0x6a6a52), road: hex(0x9c8a6a), roadEdge: hex(0x8f7d5f),
};

/** [1,2,1] の 3×3 ぼかし */
export function blur3(src, w, h, out = new Float32Array(w * h)) {
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const l = src[x > 0 ? i - 1 : i], r = src[x < w - 1 ? i + 1 : i];
    tmp[i] = (l + 2 * src[i] + r) / 4;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const u = tmp[y > 0 ? i - w : i], d = tmp[y < h - 1 ? i + w : i];
    out[i] = (u + 2 * tmp[i] + d) / 4;
  }
  return out;
}

/** マス中心に定義された場を (x,z) で双一次補間する（マス中心は x+0.5） */
export function sampleTile(field, w, h, x, z) {
  const u = Math.min(w - 1, Math.max(0, x - 0.5)), v = Math.min(h - 1, Math.max(0, z - 0.5));
  const x0 = Math.floor(u), z0 = Math.floor(v);
  const x1 = Math.min(w - 1, x0 + 1), z1 = Math.min(h - 1, z0 + 1);
  const fx = u - x0, fz = v - z0;
  const a = field[z0 * w + x0], b = field[z0 * w + x1], c = field[z1 * w + x0], d = field[z1 * w + x1];
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

/**
 * マス単位のマスクを細かい格子（頂点）へ写す。頂点が属するマスの平均を取るので、
 * 境界は 1 セル（1/S マス）幅でしか広がらない。blurCells>0 でごくわずかにぼかす。
 */
export function fineMask(tileMask, w, h, S, blurCells = 0) {
  const VW = w * S + 1, VH = h * S + 1;
  const out = new Float32Array(VW * VH);
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
    const xs = i % S === 0 ? [i / S - 1, i / S] : [Math.floor(i / S)];
    const zs = j % S === 0 ? [j / S - 1, j / S] : [Math.floor(j / S)];
    let sum = 0, n = 0;
    for (const z of zs) for (const x of xs) { if (x < 0 || z < 0 || x >= w || z >= h) continue; sum += tileMask[z * w + x]; n++; }
    out[j * VW + i] = n ? sum / n : 0;
  }
  if (blurCells > 0) {
    const tmp = new Float32Array(out);
    const r = blurCells;
    for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
      let sum = 0, n = 0;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= VW || jj >= VH) continue;
        sum += tmp[jj * VW + ii]; n++;
      }
      out[j * VW + i] = sum / n;
    }
  }
  return out;
}

const cubic = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/** 角（整数座標）に定義された格子を Catmull-Rom で双三次補間 */
export function sampleCorner(grid, gw, gh, x, z) {
  const cx = Math.min(gw - 1, Math.max(0, x)), cz = Math.min(gh - 1, Math.max(0, z));
  const x1 = Math.floor(cx), z1 = Math.floor(cz);
  const fx = cx - x1, fz = cz - z1;
  const g = (xx, zz) => grid[Math.min(gh - 1, Math.max(0, zz)) * gw + Math.min(gw - 1, Math.max(0, xx))];
  const rows = [];
  for (let k = -1; k <= 2; k++) rows.push(cubic(g(x1 - 1, z1 + k), g(x1, z1 + k), g(x1 + 1, z1 + k), g(x1 + 2, z1 + k), fx));
  return cubic(rows[0], rows[1], rows[2], rows[3], fz);
}

/**
 * @param {object} world @param {object} reg
 * @param {{segments:number}} opts 1マスの分割数（高:4 / 中:2 / 低:1）
 */
export function createTerrainField(world, reg, { segments = 4 } = {}) {
  const { w, h, height, tile } = world.map;
  const S = segments;
  const VW = w * S + 1, VH = h * S + 1;
  const bal = reg.balance.map;
  const waterLevel = bal.riverLevel + 0.12;
  const bedDepth = 0.55;
  const T = (id) => reg.tileIndex.get(id);
  const isWater = (i) => reg.tiles[tile[i]].water === true;

  // --- 角の高さ格子（隣接4マスの平均 → 1回ぼかし）
  const gw = w + 1, gh = h + 1;
  const corner = new Float32Array(gw * gh);
  for (let z = 0; z < gh; z++) for (let x = 0; x < gw; x++) {
    let s = 0, c = 0;
    for (let zz = z - 1; zz <= z; zz++) for (let xx = x - 1; xx <= x; xx++) {
      if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue;
      s += height[zz * w + xx]; c++;
    }
    corner[z * gw + x] = s / c;
  }
  blur3(corner, gw, gh, corner);

  // --- マス単位のマスク（ぼかす）
  const waterMask = new Float32Array(w * h), forestMask = new Float32Array(w * h), marshMask = new Float32Array(w * h), fert = new Float32Array(w * h);
  const roadMask = new Float32Array(w * h), shoreMask = new Float32Array(w * h);
  const shoreDist = reg.balance.zoning?.shoreDistance ?? 1;
  const rebuildMasks = () => {
    for (let i = 0; i < w * h; i++) {
      waterMask[i] = isWater(i) ? 1 : 0;
      forestMask[i] = tile[i] === T('forest') ? 1 : 0;
      marshMask[i] = tile[i] === T('marsh') ? 1 : 0;
      fert[i] = world.map.fertility[i];
      roadMask[i] = world.roads[i] ? 1 : 0;
      shoreMask[i] = !isWater(i) && world.map.waterDist[i] <= shoreDist ? 1 : 0;
    }
  };
  rebuildMasks();
  // 水の形（掘り下げ）だけはマス単位で2回ぼかして曲線の岸線にする。色はすべて細かい格子でくっきり扱う
  const waterB = blur3(blur3(waterMask, w, h), w, h);
  const fertB = blur3(fert, w, h);
  let forestF = fineMask(forestMask, w, h, S, 1), marshF = fineMask(marshMask, w, h, S, 1), roadF = fineMask(roadMask, w, h, S, 0), shoreF = fineMask(shoreMask, w, h, S, 1);
  const refreshFine = () => { forestF = fineMask(forestMask, w, h, S, 1); marshF = fineMask(marshMask, w, h, S, 1); roadF = fineMask(roadMask, w, h, S, 0); shoreF = fineMask(shoreMask, w, h, S, 1); };

  /** 連続した地形の高さ（水底を含む） */
  const smoothMax = (a, b, k) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
  const heightAt = (x, z) => {
    // 陸は水面より少し上に保つ（ノイズで低くなった平地が水没しないように）
    const land = smoothMax(sampleCorner(corner, gw, gh, x, z), waterLevel + 0.12, 0.25);
    const m = sampleTile(waterB, w, h, x, z);
    const s = smoothstep(0.18, 0.8, m);
    return lerp(land, waterLevel - bedDepth, s);
  };
  const normalAt = (x, z, out) => {
    const e = 0.35;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    let nx = -dx, ny = 2 * e, nz = -dz;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    if (out) { out[0] = nx; out[1] = ny; out[2] = nz; return out; }
    return [nx, ny, nz];
  };

  const colorAt = (x, z, hgt, ny, k) => {
    const f = sampleTile(fertB, w, h, x, z);
    const n1 = fbm(x / 9, z / 9, world.seed + 501) - 0.5;
    let c = mix3(PAL.grassDry, PAL.grassRich, clamp01(f * 1.15 + n1 * 0.6));
    const slope = 1 - ny;                                  // 0=平ら
    c = mix3(c, PAL.dirt, smoothstep(0.06, 0.16, slope));
    c = mix3(c, PAL.rock, smoothstep(0.16, 0.34, slope));
    c = mix3(c, PAL.dirt, smoothstep(bal.hillHeight - 0.3, bal.hillHeight + 0.6, hgt) * 0.35);
    c = mix3(c, PAL.rockDark, smoothstep(bal.mountainHeight - 0.4, bal.mountainHeight + 0.8, hgt) * 0.8);
    c = mix3(c, PAL.forestFloor, forestF[k] * 0.85);
    c = mix3(c, PAL.marsh, marshF[k]);
    // 砂地: 岸辺のマス（区画を置けない範囲）と、水面近くの低い土地。水面下は川底の色
    const sand = Math.max(shoreF[k], smoothstep(waterLevel + 0.16, waterLevel + 0.03, hgt));
    c = mix3(c, PAL.sand, sand);
    c = mix3(c, PAL.bed, smoothstep(waterLevel + 0.02, waterLevel - 0.14, hgt));
    const rm = roadF[k];
    c = mix3(c, PAL.roadEdge, smoothstep(0.2, 0.45, rm));
    c = mix3(c, PAL.road, smoothstep(0.45, 0.75, rm));
    const grain = 1 + (hash2(Math.round(x * 4), Math.round(z * 4), 77) - 0.5) * 0.05;
    return [c[0] * grain, c[1] * grain, c[2] * grain];
  };

  // --- 細かい格子の頂点
  const positions = new Float32Array(VW * VH * 3), normals = new Float32Array(VW * VH * 3), colors = new Float32Array(VW * VH * 3);
  const nrm = [0, 0, 0];
  const computeVertex = (i, j) => {
    const x = i / S, z = j / S, k = (j * VW + i) * 3;
    const y = heightAt(x, z);
    positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;
    normalAt(x, z, nrm);
    normals[k] = nrm[0]; normals[k + 1] = nrm[1]; normals[k + 2] = nrm[2];
    const c = colorAt(x, z, y, nrm[1], j * VW + i);
    colors[k] = c[0]; colors[k + 1] = c[1]; colors[k + 2] = c[2];
  };
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) computeVertex(i, j);
  const indices = new (VW * VH > 65535 ? Uint32Array : Uint16Array)(w * S * h * S * 6);
  let p = 0;
  for (let j = 0; j < VH - 1; j++) for (let i = 0; i < VW - 1; i++) {
    const a = j * VW + i, b = a + 1, c = a + VW, d = c + 1;
    indices[p++] = a; indices[p++] = c; indices[p++] = b; indices[p++] = b; indices[p++] = c; indices[p++] = d;
  }

  return {
    S, VW, VH, waterLevel, positions, normals, colors, indices,
    heightAt, normalAt, sampleTile, waterB, roadMask,
    /** 頂点番号 (i,j) */
    vindex: (i, j) => j * VW + i,
    /** 変更されたマス集合の周辺だけ色を再計算し、更新した頂点範囲 [jMin,jMax] を返す */
    recolor(dirtyTiles) {
      if (!dirtyTiles.size) return null;
      rebuildMasks(); refreshFine();
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const i of dirtyTiles) { const x = i % w, z = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const pad = 3;
      const i0 = Math.max(0, (x0 - pad) * S), i1 = Math.min(VW - 1, (x1 + 1 + pad) * S);
      const j0 = Math.max(0, (z0 - pad) * S), j1 = Math.min(VH - 1, (z1 + 1 + pad) * S);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = (j * VW + i) * 3;
        const c = colorAt(i / S, j / S, positions[k + 1], normals[k + 1], j * VW + i);
        colors[k] = c[0]; colors[k + 1] = c[1]; colors[k + 2] = c[2];
      }
      return { j0, j1 };
    },
  };
}
