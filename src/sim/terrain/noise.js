// 値ノイズ + fBm。hash2 ベースなので同じシードなら同じ地形になる。
import { hash2 } from '../../core/rng.js';

const smooth = (t) => t * t * (3 - 2 * t);

/** 格子点補間の値ノイズ。戻り値 0..1 */
export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** fBm。戻り値はおおむね 0..1（平均 0.5 付近） */
export function fbm(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy, seed + i * 1013) * amp;
    norm += amp;
    amp *= gain; fx *= lacunarity; fy *= lacunarity;
  }
  return sum / norm;
}
