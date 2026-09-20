// 地形の「連続した高さ場」と頂点色。Three.js に依存しない（テスト可能）。
// マス単位の高さ・種類から、タイルより細かい格子（1マスを S 分割）の高さ H と色 C を作る。
// 描画側はこの格子をチャンク（CHUNK マス四方）ごとに切り出してメッシュにする。
import { fbm } from '../sim/terrain/noise.js';
import { hash2 } from '../core/rng.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = (h) => [srgbToLinear(((h >> 16) & 255) / 255), srgbToLinear(((h >> 8) & 255) / 255), srgbToLinear((h & 255) / 255)];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const CHUNK = 32;   // チャンクの一辺（マス）

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
 * range を渡すとその頂点範囲だけ out に書く。
 */
export function fineMask(tileMask, w, h, S, blurCells = 0, out = null, range = null) {
  const VW = w * S + 1, VH = h * S + 1;
  out = out || new Float32Array(VW * VH);
  const r = range || { i0: 0, i1: VW - 1, j0: 0, j1: VH - 1 };
  const pad = blurCells;
  const i0 = Math.max(0, r.i0 - pad), i1 = Math.min(VW - 1, r.i1 + pad), j0 = Math.max(0, r.j0 - pad), j1 = Math.min(VH - 1, r.j1 + pad);
  const raw = blurCells > 0 ? new Float32Array((i1 - i0 + 1) * (j1 - j0 + 1)) : null;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const xs = i % S === 0 ? [i / S - 1, i / S] : [Math.floor(i / S)];
    const zs = j % S === 0 ? [j / S - 1, j / S] : [Math.floor(j / S)];
    let sum = 0, n = 0;
    for (const z of zs) for (const x of xs) { if (x < 0 || z < 0 || x >= w || z >= h) continue; sum += tileMask[z * w + x]; n++; }
    const v = n ? sum / n : 0;
    if (raw) raw[(j - j0) * (i1 - i0 + 1) + (i - i0)] = v; else out[j * VW + i] = v;
  }
  if (raw) {
    const rw = i1 - i0 + 1, rh = j1 - j0 + 1;
    for (let j = Math.max(j0, r.j0); j <= Math.min(j1, r.j1); j++) for (let i = Math.max(i0, r.i0); i <= Math.min(i1, r.i1); i++) {
      let sum = 0, n = 0;
      for (let dj = -pad; dj <= pad; dj++) for (let di = -pad; di <= pad; di++) {
        const ii = i - i0 + di, jj = j - j0 + dj;
        if (ii < 0 || jj < 0 || ii >= rw || jj >= rh) continue;
        sum += raw[jj * rw + ii]; n++;
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

  // --- マス単位のマスク
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
  const forestF = fineMask(forestMask, w, h, S, 1), marshF = fineMask(marshMask, w, h, S, 1), roadF = fineMask(roadMask, w, h, S, 0), shoreF = fineMask(shoreMask, w, h, S, 1);
  const refreshFine = (range) => { fineMask(forestMask, w, h, S, 1, forestF, range); fineMask(marshMask, w, h, S, 1, marshF, range); fineMask(roadMask, w, h, S, 0, roadF, range); fineMask(shoreMask, w, h, S, 1, shoreF, range); };

  const smoothMax = (a, b, k) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
  /** 連続した地形の高さ（厳密版。格子外や生成時に使う） */
  const heightAt = (x, z) => {
    const land = smoothMax(sampleCorner(corner, gw, gh, x, z), waterLevel + 0.12, 0.25);
    const m = sampleTile(waterB, w, h, x, z);
    const s = smoothstep(0.18, 0.8, m);
    return lerp(land, waterLevel - bedDepth, s);
  };

  // --- 細かい格子の高さ H（一度だけ計算し、以後はここから双一次補間で読む）
  const H = new Float32Array(VW * VH);
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) H[j * VW + i] = heightAt(i / S, j / S);
  /** 格子からの高さ（描画・配置はこちらを使う。メッシュと一致する） */
  const heightFast = (x, z) => {
    const u = Math.min(VW - 1.0001, Math.max(0, x * S)), v = Math.min(VH - 1.0001, Math.max(0, z * S));
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    const a = H[j * VW + i], b = H[j * VW + i + 1], c = H[(j + 1) * VW + i], d = H[(j + 1) * VW + i + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  };
  /** 格子の差分から法線（滑らか） */
  const normalAtVertex = (i, j, out) => {
    const l = H[j * VW + Math.max(0, i - 1)], r = H[j * VW + Math.min(VW - 1, i + 1)];
    const u = H[Math.max(0, j - 1) * VW + i], d = H[Math.min(VH - 1, j + 1) * VW + i];
    const ex = (Math.min(VW - 1, i + 1) - Math.max(0, i - 1)) / S, ez = (Math.min(VH - 1, j + 1) - Math.max(0, j - 1)) / S;
    let nx = -(r - l) / ex, ny = 1, nz = -(d - u) / ez;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    out[0] = nx; out[1] = ny; out[2] = nz;
    return out;
  };
  const normalAt = (x, z, out = [0, 0, 0]) => normalAtVertex(Math.round(x * S), Math.round(z * S), out);

  const colorAt = (x, z, hgt, ny, k) => {
    const f = sampleTile(fertB, w, h, x, z);
    const n1 = fbm(x / 9, z / 9, world.seed + 501) - 0.5;
    let c = mix3(PAL.grassDry, PAL.grassRich, clamp01(f * 1.15 + n1 * 0.6));
    const slope = 1 - ny;
    c = mix3(c, PAL.dirt, smoothstep(0.06, 0.16, slope));
    c = mix3(c, PAL.rock, smoothstep(0.16, 0.34, slope));
    c = mix3(c, PAL.dirt, smoothstep(bal.hillHeight - 0.3, bal.hillHeight + 0.6, hgt) * 0.35);
    c = mix3(c, PAL.rockDark, smoothstep(bal.mountainHeight - 0.4, bal.mountainHeight + 0.8, hgt) * 0.8);
    c = mix3(c, PAL.forestFloor, forestF[k] * 0.85);
    c = mix3(c, PAL.marsh, marshF[k]);
    const sand = Math.max(shoreF[k], smoothstep(waterLevel + 0.16, waterLevel + 0.03, hgt));
    c = mix3(c, PAL.sand, sand);
    c = mix3(c, PAL.bed, smoothstep(waterLevel + 0.02, waterLevel - 0.14, hgt));
    const rm = roadF[k];
    c = mix3(c, PAL.roadEdge, smoothstep(0.2, 0.45, rm));
    c = mix3(c, PAL.road, smoothstep(0.45, 0.75, rm));
    const grain = 1 + (hash2(Math.round(x * 4), Math.round(z * 4), 77) - 0.5) * 0.05;
    return [c[0] * grain, c[1] * grain, c[2] * grain];
  };

  // --- 色 C（全頂点）
  const C = new Float32Array(VW * VH * 3);
  const nrm = [0, 0, 0];
  const computeColor = (i, j) => {
    const k = j * VW + i;
    normalAtVertex(i, j, nrm);
    const c = colorAt(i / S, j / S, H[k], nrm[1], k);
    C[k * 3] = c[0]; C[k * 3 + 1] = c[1]; C[k * 3 + 2] = c[2];
  };
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) computeColor(i, j);

  const chunksX = Math.ceil(w / CHUNK), chunksZ = Math.ceil(h / CHUNK);

  return {
    S, VW, VH, waterLevel, H, C, chunksX, chunksZ,
    heightAt: heightFast, heightExact: heightAt, normalAt,
    vindex: (i, j) => j * VW + i,
    /** チャンク (cx, cz) の頂点範囲 */
    chunkRange(cx, cz) {
      return { i0: cx * CHUNK * S, i1: Math.min(VW - 1, (cx + 1) * CHUNK * S), j0: cz * CHUNK * S, j1: Math.min(VH - 1, (cz + 1) * CHUNK * S) };
    },
    /** チャンクのメッシュ用配列（位置・法線・色・インデックス）。色は C の参照をコピー */
    buildChunk(cx, cz) {
      const r = this.chunkRange(cx, cz);
      const cw = r.i1 - r.i0 + 1, ch = r.j1 - r.j0 + 1;
      const positions = new Float32Array(cw * ch * 3), normals = new Float32Array(cw * ch * 3), colors = new Float32Array(cw * ch * 3);
      const n = [0, 0, 0];
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        const gi = r.i0 + i, gj = r.j0 + j, k = (j * cw + i) * 3, gk = gj * VW + gi;
        positions[k] = gi / S; positions[k + 1] = H[gk]; positions[k + 2] = gj / S;
        normalAtVertex(gi, gj, n); normals[k] = n[0]; normals[k + 1] = n[1]; normals[k + 2] = n[2];
        colors[k] = C[gk * 3]; colors[k + 1] = C[gk * 3 + 1]; colors[k + 2] = C[gk * 3 + 2];
      }
      const indices = new (cw * ch > 65535 ? Uint32Array : Uint16Array)((cw - 1) * (ch - 1) * 6);
      let p = 0;
      for (let j = 0; j < ch - 1; j++) for (let i = 0; i < cw - 1; i++) {
        const a = j * cw + i, b = a + 1, c = a + cw, d = c + 1;
        indices[p++] = a; indices[p++] = c; indices[p++] = b; indices[p++] = b; indices[p++] = c; indices[p++] = d;
      }
      return { positions, normals, colors, indices, cw, ch, range: r };
    },
    /** チャンクの色配列を C から書き直す */
    copyChunkColors(cx, cz, colors) {
      const r = this.chunkRange(cx, cz);
      const cw = r.i1 - r.i0 + 1, ch = r.j1 - r.j0 + 1;
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        const k = (j * cw + i) * 3, gk = (r.j0 + j) * VW + (r.i0 + i);
        colors[k] = C[gk * 3]; colors[k + 1] = C[gk * 3 + 1]; colors[k + 2] = C[gk * 3 + 2];
      }
    },
    /** 変更されたマス集合の周辺だけ色を再計算し、影響したチャンクの集合を返す */
    recolor(dirtyTiles) {
      if (!dirtyTiles.size) return null;
      rebuildMasks();
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const i of dirtyTiles) { const x = i % w, z = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const pad = 2;
      const range = { i0: Math.max(0, (x0 - pad) * S), i1: Math.min(VW - 1, (x1 + 1 + pad) * S), j0: Math.max(0, (z0 - pad) * S), j1: Math.min(VH - 1, (z1 + 1 + pad) * S) };
      refreshFine(range);
      for (let j = range.j0; j <= range.j1; j++) for (let i = range.i0; i <= range.i1; i++) computeColor(i, j);
      const chunks = new Set();
      for (let cz = Math.floor(range.j0 / S / CHUNK); cz <= Math.floor(range.j1 / S / CHUNK) && cz < chunksZ; cz++)
        for (let cx = Math.floor(range.i0 / S / CHUNK); cx <= Math.floor(range.i1 / S / CHUNK) && cx < chunksX; cx++) chunks.add(cz * chunksX + cx);
      return { range, chunks };
    },
  };
}
