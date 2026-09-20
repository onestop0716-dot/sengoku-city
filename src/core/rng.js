// シード付き乱数（mulberry32）。ゲーム内では Math.random を使わず必ずこれを使う。
// 同じシードと同じ操作列なら同じ結果になる（テスト・バグ再現のため）。

/** @param {number} seed 32bit 整数 */
export function createRng(seed) {
  let a = seed >>> 0;
  const rng = {
    /** 0以上1未満 */
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** min 以上 max 以下の整数 */
    int(min, max) { return min + Math.floor(rng.next() * (max - min + 1)); },
    /** min 以上 max 未満の実数 */
    range(min, max) { return min + rng.next() * (max - min); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    chance(p) { return rng.next() < p; },
    getState() { return a >>> 0; },
    setState(s) { a = s >>> 0; },
  };
  return rng;
}

/** 文字列からシードを作る（FNV-1a） */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 座標とシードから決定的な 0..1 の値（地形ノイズ・外観バリエーション用） */
export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
