// 農家・畑・桑園。畑は作物の色と高さで種類を表す。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const CROP_COLOR = { millet: 0xd8b64a, broomcorn: 0xe3c35e, wheat: 0xe8d27a, bean: 0x8fbf5a, rice: 0x6fbf7f, mulberry: 0x4f9f4f, hemp: 0x7fa87f };
const CROP_HEIGHT = { millet: 0.35, broomcorn: 0.4, wheat: 0.3, bean: 0.22, rice: 0.3, mulberry: 0.7, hemp: 0.6 };

export function farmhouse({ variant = 0 }) {
  const B = createBuilder();
  const axis = variant === 1 ? 'z' : 'x';
  const sx = axis === 'x' ? 0.6 : 0.46, sz = axis === 'x' ? 0.46 : 0.6;
  B.chamferBox(-0.12, 0, -0.1, sx + 0.08, 0.04, sz + 0.08, C.earthDark, { chamfer: 0.015 });
  B.chamferBox(-0.12, 0.04, -0.1, sx, 0.36, sz, C.earth, { chamfer: 0.02 });
  B.panel(-0.12, 0.04, -0.1 + sz / 2, 0.16, 0.26, 'z+', 0x3a2a1c);
  B.curvedRoof(-0.12, 0.4, -0.1, sx, sz, 0.26, C.thatch, { ridgeAxis: axis, overhang: 0.09, tileStripes: false, curve: 1.3, gableColor: C.earth, ridgeColor: C.thatchDark });
  B.lathe(0.3, 0, 0.28, [[0.14, 0], [0.17, 0.12], [0.13, 0.24], [0.02, 0.32]], C.straw, 8);          // 藁積み
  if (variant === 2) B.lathe(0.32, 0, -0.25, [[0.1, 0], [0.12, 0.1], [0.02, 0.22]], C.straw, 7);
  if (variant === 0) for (let i = 0; i < 4; i++) B.cylinder(-0.4 + i * 0.1, 0, 0.42, 0.014, 0.14, C.woodDark, 5);
  return B.build();
}

export function field({ crop = 'millet', level = 1, variant = 0 }) {
  const B = createBuilder();
  const color = shadeHex(CROP_COLOR[crop] ?? 0xc0b060, [1, 0.92, 1.08][variant % 3]);
  const paddy = crop === 'rice';
  B.slab(0, 0.02, 0, 0.96, 0.96, paddy ? C.water : C.soil);
  if (paddy) {
    B.chamferBox(0, 0, -0.47, 0.96, 0.05, 0.05, C.soilWet, { chamfer: 0.01 }); B.chamferBox(0, 0, 0.47, 0.96, 0.05, 0.05, C.soilWet, { chamfer: 0.01 });
    B.chamferBox(-0.47, 0, 0, 0.05, 0.05, 0.96, C.soilWet, { chamfer: 0.01 }); B.chamferBox(0.47, 0, 0, 0.05, 0.05, 0.96, C.soilWet, { chamfer: 0.01 });
  }
  const h = (CROP_HEIGHT[crop] ?? 0.3) * (0.45 + level * 0.18);
  if (crop === 'mulberry') {
    const n = 1 + level;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -0.35 + (0.7 * i) / Math.max(1, n - 1), z = -0.35 + (0.7 * j) / Math.max(1, n - 1);
      B.cylinder(x, 0, z, 0.025, h * 0.5, C.trunk, 5);
      B.blob(x, h * 0.55, z, 0.14, 0.12 + h * 0.2, color, 6, 3);
    }
    return B.build();
  }
  const rows = 1 + level * 2;
  const alongX = variant !== 1;
  for (let r = 0; r < rows; r++) {
    const p = -0.4 + (0.8 * r) / (rows - 1);
    const rw = paddy ? 0.06 : 0.1;
    if (alongX) B.chamferBox(0, 0.02, p, 0.84, h, rw, color, { chamfer: 0.025 });
    else B.chamferBox(p, 0.02, 0, rw, h, 0.84, color, { chamfer: 0.025 });
  }
  return B.build();
}
