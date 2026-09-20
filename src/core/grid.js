// 2D グリッドのユーティリティ。マスの番号は idx = y * w + x。

export function idx(w, x, y) { return y * w + x; }
export function inBounds(w, h, x, y) { return x >= 0 && y >= 0 && x < w && y < h; }

/** 2点から正規化した矩形 {x0,y0,x1,y1}（両端含む）を返す */
export function normRect(ax, ay, bx, by) {
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

/** 矩形をマップ内に切り詰める */
export function clampRect(r, w, h) {
  return { x0: Math.max(0, r.x0), y0: Math.max(0, r.y0), x1: Math.min(w - 1, r.x1), y1: Math.min(h - 1, r.y1) };
}

export function* rectTiles(r) {
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) yield [x, y];
}

export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * 複数の出発マスからの格子距離（4近傍）を幅優先で求める。
 * @param {number} w @param {number} h
 * @param {(i:number)=>boolean} isSource そのマスが出発点か
 * @param {number} maxDist これ以上は 0xffff のまま
 * @param {(i:number)=>boolean} [passable] 通れるマスか（省略時は全て）
 * @returns {Uint16Array} 各マスの距離（到達不能は 0xffff）
 */
export function distanceMap(w, h, isSource, maxDist, passable) {
  const dist = new Uint16Array(w * h).fill(0xffff);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (let i = 0; i < w * h; i++) if (isSource(i)) { dist[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    const d = dist[i];
    if (d >= maxDist) continue;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(w, h, nx, ny)) continue;
      const j = ny * w + nx;
      if (dist[j] !== 0xffff) continue;
      if (passable && !passable(j)) continue;
      dist[j] = d + 1;
      queue[tail++] = j;
    }
  }
  return dist;
}

/** 2点間のL字経路（まず横、次に縦）のマス列 */
export function lPath(ax, ay, bx, by) {
  const out = [];
  const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
  let x = ax, y = ay;
  out.push([x, y]);
  while (x !== bx) { x += sx; out.push([x, y]); }
  while (y !== by) { y += sy; out.push([x, y]); }
  return out;
}
