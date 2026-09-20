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

  // 1. 基本起伏
  const relief = profile.relief || 'plain';
  const amp = { plain: 0.5, plain_north_hills: 0.6, plain_west_mountains: 0.6, hills: 1.5, plateau: 0.9, basin: 0.5, coastal_plain: 0.35 }[relief] ?? 0.6;
  const base = relief === 'plateau' ? 0.8 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = (fbm(x / 22, y / 22, seed) - 0.5) * 2 * amp + base;
    const nx = x / (w - 1), ny = y / (h - 1);
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
  if (river !== 'none') {
    const width = river.startsWith('large') ? 3 : rng.int(1, 2);
    const ew = river.endsWith('ew');
    const len = ew ? w : h;
    const offsetBase = (ew ? h : w) * (rng.chance(0.5) ? 0.36 : 0.64);
    for (let t = 0; t < len; t++) {
      const meander = (fbm(t / 18, 0.5, seed + 53) - 0.5) * (ew ? h : w) * 0.3;
      const c = Math.round(offsetBase + meander);
      for (let k = -width; k <= width; k++) {
        const p = c + k;
        const [x, y] = ew ? [t, p] : [p, t];
        if (!inBounds(w, h, x, y)) continue;
        const i = y * w + x;
        const inner = Math.abs(k) <= (width - 1) / 2 + 0.01 || width === 1 && k === 0;
        if (inner || (Math.abs(k) < width && rng.chance(0.7))) {
          if (tile[i] !== T('sea')) tile[i] = T('river');
          height[i] = bal.riverLevel;
        } else {
          height[i] = Math.min(height[i], bal.riverLevel + 0.4);
        }
      }
    }
  }

  // 4. 湖
  if (profile.lake) {
    const lx = Math.round(w * (rng.chance(0.5) ? 0.25 : 0.75)), ly = Math.round(h * (rng.chance(0.5) ? 0.25 : 0.75));
    const r = rng.int(5, 8);
    for (let y = ly - r - 2; y <= ly + r + 2; y++) for (let x = lx - r - 2; x <= lx + r + 2; x++) {
      if (!inBounds(w, h, x, y)) continue;
      const d = Math.hypot(x - lx, y - ly) + (fbm(x / 5, y / 5, seed + 77) - 0.5) * 4;
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
    if (fbm(x / 12, y / 12, seed + 113) > forestThreshold) tile[i] = T('forest');
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
    for (let c = 0; c < count && cands.length; c++) {
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
