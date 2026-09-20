// 建物の配置ルール（向き）。ゲームの成長ロジックには影響しない見た目の規則。
// 向き: 0=南(+z) 1=東(+x) 2=北(-z) 3=西(-x)。入口（門）は南向きが基本（坐北朝南）。
import { idx, inBounds } from '../core/grid.js';

export const FACING = { south: 0, east: 1, north: 2, west: 3 };

/** その側に接する道路の「通りの長さ」（接する道路マスから両方向へ連なる道路の数）を数える */
function roadScoreOnSide(world, x, y, w, h, side, reach) {
  const W = world.map.w, H = world.map.h;
  const isRoad = (xx, yy) => inBounds(W, H, xx, yy) && world.roads[idx(W, xx, yy)] === 1;
  // 側に沿った並び（sx,sy = 側に沿う方向、ox,oy = 側の外向き）
  const along = side === FACING.south || side === FACING.north ? [1, 0] : [0, 1];
  const out = side === FACING.south ? [0, 1] : side === FACING.north ? [0, -1] : side === FACING.east ? [1, 0] : [-1, 0];
  const len = side === FACING.south || side === FACING.north ? w : h;
  let best = 0;
  for (let d = 1; d <= reach; d++) {
    // 足跡の各マスの d マス先が道路か
    let touching = false;
    for (let k = 0; k < len; k++) {
      const bx = side === FACING.east ? x + w - 1 : side === FACING.west ? x : x + k;
      const by = side === FACING.south ? y + h - 1 : side === FACING.north ? y : y + k;
      const tx = bx + out[0] * d, ty = by + out[1] * d;
      if (isRoad(tx, ty)) { touching = true; break; }
    }
    if (!touching) continue;
    // 通りの長さ: その列を側に沿って、途切れるまで両方向へ数える（上限あり）
    const cx = side === FACING.east ? x + w - 1 + d : side === FACING.west ? x - d : x, cy = side === FACING.south ? y + h - 1 + d : side === FACING.north ? y - d : y;
    let count = 0;
    for (let k = 0; k < len; k++) if (isRoad(cx + along[0] * k, cy + along[1] * k)) count++;
    for (let k = 1; k <= 40; k++) { if (!isRoad(cx - along[0] * k, cy - along[1] * k)) break; count++; }
    for (let k = 1; k <= 40; k++) { if (!isRoad(cx + along[0] * (len - 1 + k), cy + along[1] * (len - 1 + k))) break; count++; }
    const score = count * 10 - (d - 1) * 30;               // 遠い道路より近い道路を優先
    best = Math.max(best, score);
  }
  return best;
}

/**
 * 建物の向きを決める。1) 接する道路側 2) 複数なら通りが長い側 3) なければ南。
 * @returns {0|1|2|3}
 */
export function chooseFacing(world, x, y, w, h, { reach = 2 } = {}) {
  const order = [FACING.south, FACING.east, FACING.west, FACING.north]; // 同点なら南→東→西→北
  let bestSide = FACING.south, bestScore = 0;
  for (const side of order) {
    const s = roadScoreOnSide(world, x, y, w, h, side, reach);
    if (s > bestScore) { bestScore = s; bestSide = side; }
  }
  return bestSide;
}
