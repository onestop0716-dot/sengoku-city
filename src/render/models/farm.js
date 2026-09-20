// 農家・畑・桑園。畑は作物の色と高さで種類を表す。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const CROP_COLOR = { millet: 0xd8b64a, broomcorn: 0xe3c35e, wheat: 0xe8d27a, bean: 0x8fbf5a, rice: 0x6fbf7f, mulberry: 0x4f9f4f, hemp: 0x7fa87f };
const CROP_HEIGHT = { millet: 0.35, broomcorn: 0.4, wheat: 0.3, bean: 0.22, rice: 0.3, mulberry: 0.7, hemp: 0.6 };

export function farmhouse({ variant = 0 }) {
  const B = createBuilder();
  const axis = variant === 1 ? 'z' : 'x';
  const sx = axis === 'x' ? 0.6 : 0.46, sz = axis === 'x' ? 0.46 : 0.6;
  B.box(-0.12, 0, -0.1, sx, 0.38, sz, C.earth);
  B.gableRoof(-0.12, 0.38, -0.1, sx, sz, 0.26, C.thatch, axis);
  B.cone(0.3, 0, 0.28, 0.16, 0.3, C.straw, 6);                  // 藁積み
  if (variant === 2) B.cone(0.32, 0, -0.25, 0.12, 0.22, C.straw, 6);
  if (variant === 0) for (let i = 0; i < 4; i++) B.box(-0.4 + i * 0.1, 0, 0.42, 0.03, 0.14, 0.03, C.woodDark); // 柵
  return B.build();
}

export function field({ crop = 'millet', level = 1, variant = 0 }) {
  const B = createBuilder();
  const color = shadeHex(CROP_COLOR[crop] ?? 0xc0b060, [1, 0.92, 1.08][variant % 3]);
  const paddy = crop === 'rice';
  B.slab(0, 0.02, 0, 0.96, 0.96, paddy ? C.water : C.soil);
  if (paddy) { // 畦
    B.box(0, 0, -0.48, 0.96, 0.05, 0.04, C.soilWet); B.box(0, 0, 0.48, 0.96, 0.05, 0.04, C.soilWet);
    B.box(-0.48, 0, 0, 0.04, 0.05, 0.96, C.soilWet); B.box(0.48, 0, 0, 0.04, 0.05, 0.96, C.soilWet);
  }
  const h = (CROP_HEIGHT[crop] ?? 0.3) * (0.45 + level * 0.18);
  if (crop === 'mulberry') {
    const n = 1 + level; // 桑の木の数（格子）
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -0.35 + (0.7 * i) / Math.max(1, n - 1), z = -0.35 + (0.7 * j) / Math.max(1, n - 1);
      B.cylinder(x, 0, z, 0.03, h * 0.5, C.trunk, 5);
      B.cone(x, h * 0.4, z, 0.14, h * 0.6, color, 6, 0.04);
    }
    return B.build();
  }
  const rows = 1 + level * 2;
  const alongX = variant !== 1;
  for (let r = 0; r < rows; r++) {
    const p = -0.4 + (0.8 * r) / (rows - 1);
    if (alongX) B.box(0, 0.02, p, 0.84, h, 0.09, color);
    else B.box(p, 0.02, 0, 0.09, h, 0.84, color);
  }
  return B.build();
}
