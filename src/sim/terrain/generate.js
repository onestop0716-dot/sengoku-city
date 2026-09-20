// 都市マップの地形生成。都市テンプレート（cities.json の terrainProfile）で大まかな立地を決め、
// 細部（川の蛇行・丘・森・資源）はシードから毎回生成する。
import { createRng } from '../../core/rng.js';
import { distanceMap, inBounds, N4, N8 } from '../../core/grid.js';
import { fbm } from './noise.js';

/**
 * @param {{w:number,h:number,seed:number,profile:object,reg:object}} opts
 */
export function generateTerrain({ w, h, seed, profile, reg }) {
  const bal = reg.balance.map;
  const T = (id) => reg.tileIndex.get(id);
  const rng = createRng(seed ^ 0x7e11a);
  const height = new Float32Array(w * h);
  const tile = new Uint8Array(w * h).fill(T('plain'));
  const fertility = new Float32Array(w * h);
  const resource = new Uint8Array(w * h);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const K = Math.max(1, Math.min(w, h) / 96);            // 96 を基準にした大きさの倍率
  const big = Math.min(w, h) >= 160;                     // 大きなマップでは支流・湖・丘の群れを足す

  // 1. 基本起伏（大きな起伏 + 細かい起伏。大きなマップでは丘の群れも）
  const relief = profile.relief || 'plain';
  const amp = { plain: 0.5, plain_north_hills: 0.6, plain_west_mountains: 0.6, hills: 1.5, plateau: 0.9, basin: 0.5, coastal_plain: 0.35 }[relief] ?? 0.6;
  const base = relief === 'plateau' ? 0.8 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = (fbm(x / (22 * Math.pow(K, 0.6)), y / (22 * Math.pow(K, 0.6)), seed) - 0.5) * 2 * amp + (fbm(x / 9, y / 9, seed + 3) - 0.5) * 0.3 + base;
    const nx = x / (w - 1), ny = y / (h - 1);
    if (big) {
      const hm = fbm(x / (38 * K), y / (38 * K), seed + 41);
      if (hm > 0.54) v += ((hm - 0.54) / 0.3) * 3.2 * (0.7 + fbm(x / 7, y / 7, seed + 42) * 0.6);
    }
    if (relief === 'plain_north_hills') v += 3.2 * Math.max(0, 0.22 - ny) / 0.22 * (0.6 + fbm(x / 9, y / 9, seed + 7));
    if (relief === 'plain_west_mountains') v += 3.2 * Math.max(0, 0.2 - nx) / 0.2 * (0.6 + fbm(x / 9, y / 9, seed + 7));
    if (relief === 'basin') { const e = Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2; v += 3.5 * Math.pow(Math.max(0, e - 0.6) / 0.4, 2) * (0.7 + fbm(x / 9, y / 9, seed + 7)); }
    if (relief === 'hills') v += 0.4;
    height[y * w + x] = v;
  }

  // 2. 海岸
  const coast = profile.coast && profile.coast !== 'none' ? profile.coast : null;
  if (coast) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (fbm(x / 10, y / 10, seed + 31) - 0.5) * 8;
      const sea = coast === 'east' ? x > w * 0.86 + n : coast === 'west' ? x < w * 0.14 + n : coast === 'north' ? y < h * 0.14 + n : y > h * 0.86 + n;
      if (sea) { tile[y * w + x] = T('sea'); height[y * w + x] = bal.riverLevel - 0.2; }
    }
  }

  // 3. 川（中心から少しずらして通す。中心は官府用に空けておく）
  const river = profile.river || 'none';
  const mainLine = [];                                    // 本流の中心線（支流の合流先）
  const carve = (x, y, width) => {
    const R = Math.ceil(width + 1.2);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (!inBounds(w, h, xx, yy)) continue;
      const i = yy * w + xx;
      const d = Math.hypot(dx, dy);
      if (d <= width - 0.5 || (d < width + 0.3 && rng.chance(0.55))) {
        if (tile[i] !== T('sea')) tile[i] = T('river');
        height[i] = bal.riverLevel;
      } else if (d < width + 1.2) height[i] = Math.min(height[i], bal.riverLevel + 0.4);
    }
  };
  if (river !== 'none') {
    const width = river.startsWith('large') ? (big ? 2.4 : 1.8) : 1.0;
    const ew = river.endsWith('ew');
    const len = ew ? w : h;
    const offsetBase = (ew ? h : w) * (rng.chance(0.5) ? 0.36 : 0.64);
    for (let t = 0; t < len; t++) {
      const meander = (fbm(t / (18 * K), 0.5, seed + 53) - 0.5) * (ew ? h : w) * 0.3 + (fbm(t / 6, 0.7, seed + 54) - 0.5) * 3;
      const c = Math.round(offsetBase + meander);
      const [x, y] = ew ? [t, c] : [c, t];
      mainLine.push([x, y]);
      carve(x, y, width);
    }
    // 支流（大きなマップ）: マップの縁から本流へ合流する細い川
    if (big) {
      const n = w >= 240 ? 2 : 1;
      for (let s = 0; s < n; s++) {
        const side = rng.chance(0.5) ? -1 : 1;
        const start = ew ? [Math.round(w * rng.range(0.15, 0.85)), side < 0 ? 0 : h - 1] : [side < 0 ? 0 : w - 1, Math.round(h * rng.range(0.15, 0.85))];
        const cand = mainLine.filter((p) => Math.abs((ew ? p[0] : p[1]) - (ew ? start[0] : start[1])) < (ew ? w : h) * 0.3);
        if (!cand.length) continue;
        const end = cand[rng.int(0, cand.length - 1)];
        const L = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const px = -(end[1] - start[1]) / L, py = (end[0] - start[0]) / L;   // 直交方向
        const steps = Math.ceil(L * 1.5);
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const m = (fbm(t * 6, s + 0.3, seed + 61 + s) - 0.5) * L * 0.25 * Math.sin(Math.PI * t);
          const x = Math.round(start[0] + (end[0] - start[0]) * t + px * m), y = Math.round(start[1] + (end[1] - start[1]) * t + py * m);
          if (Math.hypot(x - cx, y - cy) < bal.centerClearRadius + 3) continue;
          carve(x, y, 0.9);
        }
      }
    }
  }

  // 4. 湖（プロファイル指定に加え、大きなマップでは 1〜2 個を自動で置く）
  const lakes = (profile.lake ? 1 : 0) + (big ? (w >= 240 ? 2 : 1) : 0);
  for (let n = 0; n < lakes; n++) {
    let lx = 0, ly = 0, ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      lx = rng.int(Math.round(w * 0.12), Math.round(w * 0.88)); ly = rng.int(Math.round(h * 0.12), Math.round(h * 0.88));
      ok = Math.hypot(lx - cx, ly - cy) > bal.centerClearRadius + 16 && !reg.tiles[tile[ly * w + lx]].water;
    }
    if (!ok) continue;
    const r = rng.int(5, 8) * Math.sqrt(K);
    for (let y = Math.floor(ly - r - 2); y <= ly + r + 2; y++) for (let x = Math.floor(lx - r - 2); x <= lx + r + 2; x++) {
      if (!inBounds(w, h, x, y)) continue;
      const d = Math.hypot(x - lx, y - ly) + (fbm(x / 5, y / 5, seed + 77 + n) - 0.5) * 5;
      if (d < r) { tile[y * w + x] = T('lake'); height[y * w + x] = bal.riverLevel; }
    }
  }

  // 5. 水辺をなだらかにする（岸の高さを下げる）
  const isWater = (i) => reg.tiles[tile[i]].water === true;
  const waterDist = distanceMap(w, h, isWater, 40);
  for (let i = 0; i < w * h; i++) {
    if (isWater(i)) continue;
    const d = waterDist[i];
    if (d <= 3) height[i] = Math.min(height[i], bal.riverLevel + 0.25 + d * 0.25);
  }

  // 6. 中心を平らに空ける（官府と初期の道路のため）
  const R = bal.centerClearRadius;
  let center = 0, cnt = 0;
  for (let y = Math.round(cy - 2); y <= cy + 2; y++) for (let x = Math.round(cx - 2); x <= cx + 2; x++) { center += height[y * w + x]; cnt++; }
  center = Math.max(center / cnt, bal.riverLevel + 0.6);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < R + 4 && !isWater(y * w + x)) {
      const t = Math.min(1, Math.max(0, (d - R) / 4));
      height[y * w + x] = center * (1 - t) + height[y * w + x] * t;
    }
  }

  // 7. 山・丘の分類
  for (let i = 0; i < w * h; i++) {
    if (isWater(i)) continue;
    const v = height[i];
    tile[i] = v >= bal.mountainHeight ? T('mountain') : v >= bal.hillHeight ? T('hill') : T('plain');
  }

  // 8. 森・湿地
  const forestDensity = profile.forest ?? 0.25;
  const forestThreshold = 0.70 - forestDensity * 0.3;
  const climate = profile.climate || 'central';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (isWater(i) || tile[i] === T('mountain')) continue;
    if (Math.hypot(x - cx, y - cy) < R) continue;
    if (waterDist[i] <= 2 && tile[i] === T('plain') && (climate === 'south' || (climate === 'central' && rng.chance(0.4))) && fbm(x / 6, y / 6, seed + 91) > 0.5) {
      tile[i] = T('marsh'); continue;
    }
    const patch = big ? fbm(x / (34 * K), y / (34 * K), seed + 117) : 0.5;          // 大きなむら
    if (fbm(x / 12, y / 12, seed + 113) > forestThreshold - (patch - 0.5) * 0.35) tile[i] = T('forest');
  }

  // 9. 肥沃度
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    let f = 0.35 + 0.35 * Math.max(0, 1 - waterDist[i] / 12) + 0.2 * (fbm(x / 15, y / 15, seed + 131) - 0.5) * 2;
    if (tile[i] === T('hill')) f -= 0.15;
    if (tile[i] === T('marsh')) f = 0.8;
    fertility[i] = Math.min(1, Math.max(0.05, f));
  }

  // 10. 資源（プロファイルに書かれた種類と数だけクラスタを置く）
  const resIndex = new Map(reg.resources.map((r, i) => [r.id, i + 1]));
  const eligible = (resDef, i) => {
    const x = i % w, y = (i / w) | 0;
    if (isWater(i) || Math.hypot(x - cx, y - cy) < R + 2) return false;
    const t = reg.tiles[tile[i]].id;
    const adj = (pred) => N4.some(([dx, dy]) => inBounds(w, h, x + dx, y + dy) && pred(reg.tiles[tile[(y + dy) * w + x + dx]].id));
    return resDef.on.some((cond) =>
      cond === 'hill' ? t === 'hill' :
      cond === 'mountain_edge' ? (t !== 'mountain' && adj((id) => id === 'mountain')) :
      cond === 'coast' ? adj((id) => id === 'sea') :
      cond === 'lake' ? adj((id) => id === 'lake') :
      cond === 'river_bank' ? (t === 'plain' && waterDist[i] >= 1 && waterDist[i] <= 2) :
      cond === 'inland_pool' ? (t === 'plain' && waterDist[i] >= 6 && !coast) :
      cond === 'forest' ? t === 'forest' : false);
  };
  for (const [kind, count] of Object.entries(profile.resources || {})) {
    const def = reg.resourceById.get(kind);
    if (!def || kind === 'wood') continue; // 木材は森そのもの
    const cands = [];
    for (let i = 0; i < w * h; i++) if (resource[i] === 0 && eligible(def, i)) cands.push(i);
    // 適地がない（平原都市の銅など）場合は、水辺から離れた平地に「鉱床」として置く
    if (!cands.length) for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i / w) | 0;
      if (resource[i] === 0 && tile[i] === T('plain') && waterDist[i] >= 3 && Math.hypot(x - cx, y - cy) > R + 6) cands.push(i);
    }
    const scaled = Math.max(count, Math.round(count * K * K));
    for (let c = 0; c < scaled && cands.length; c++) {
      const start = cands[rng.int(0, cands.length - 1)];
      const x0 = start % w, y0 = (start / w) | 0;
      resource[start] = resIndex.get(kind);
      let placed = 1;
      for (const [dx, dy] of N8) {
        if (placed >= 4) break;
        const x = x0 + dx, y = y0 + dy;
        if (!inBounds(w, h, x, y)) continue;
        const j = y * w + x;
        if (resource[j] === 0 && !isWater(j) && rng.chance(0.6)) { resource[j] = resIndex.get(kind); placed++; }
      }
    }
  }

  return { w, h, height, tile, fertility, resource, waterDist };
}
