// 樹木（華北の樹種）と建設中の足場。近景は幹・枝・複数の葉の塊、遠景（lod:'low'）は1本の幹と1つの樹冠。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const vary = (variant) => [1.0, 0.9, 1.1][variant % 3];

/** 幹と枝: 幹の途中から枝を数本、上へ向けて伸ばす */
function trunkWithBranches(B, h, r, color, seg, branches, variant) {
  B.lathe(0, 0, 0, [[r, 0], [r * 0.85, h * 0.4], [r * 0.6, h * 0.75], [r * 0.4, h]], color, seg, { twist: 0.05 });
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + variant * 0.7;
    const y0 = h * (0.45 + 0.15 * (i % 2));
    const dx = Math.cos(a), dz = Math.sin(a);
    const end = [dx * (0.25 + 0.08 * (i % 3)), y0 + 0.28, dz * (0.25 + 0.08 * (i % 3))];
    B.tube([dx * r * 0.4, y0, dz * r * 0.4], end, r * 0.45, r * 0.18, color, 5);
    B.tube(end, [end[0] + dx * 0.12, end[1] + 0.16, end[2] + dz * 0.12], r * 0.18, r * 0.06, color, 4);
  }
}

/** 葉の塊を複数重ねる */
function canopy(B, cx, cy, cz, rx, ry, color, seg, rings, n, spread, variant) {
  B.blob(cx, cy, cz, rx, ry, color, seg, rings);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + variant * 1.1;
    const s = 0.55 + 0.25 * ((i + variant) % 2);
    B.blob(cx + Math.cos(a) * spread, cy + (i % 2 ? 0.12 : -0.06) * ry, cz + Math.sin(a) * spread, rx * s, ry * s, shadeHex(typeof color === 'number' ? color : 0x4f8f3e, i % 2 ? 1.08 : 0.94), seg, rings);
  }
}

export function tree({ species = 'pine', variant = 0, lod = 'high' }) {
  const B = createBuilder();
  const hi = lod === 'high';
  const seg = hi ? 8 : 5, rings = hi ? 5 : 3;
  const v = vary(variant);
  const leaf = (hex) => shadeHex(hex, [1.0, 0.92, 1.08][variant % 3]);
  if (!hi) {
    const col = { pine: 0x3f6b3a, cypress: 0x2f5a30, sophora: 0x5f9a3c, elm: 0x6a9d45, willow: 0x8fb35a }[species] || 0x4f8f3e;
    const tall = species === 'cypress' ? 1.5 : species === 'elm' ? 1.4 : 1.1;
    B.cylinder(0, 0, 0, 0.06, 0.45, C.trunk, 4);
    if (species === 'pine' || species === 'cypress') B.cone(0, 0.35, 0, 0.32 * v, tall * v, leaf(col), 5);
    else B.blob(0, 0.35 + 0.4 * v, 0, 0.42 * v, 0.4 * v, leaf(col), 5, 3);
    return B.build();
  }
  switch (species) {
    case 'pine': {                                   // 松: 曲がった幹、横に張った枝、平たい葉の層
      B.lathe(0, 0, 0, [[0.07, 0], [0.06, 0.5], [0.045, 0.95], [0.03, 1.3]], C.trunk, seg, { twist: 0.15 });
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + variant, y = 0.6 + i * 0.28, len = 0.42 - i * 0.08;
        const end = [Math.cos(a) * len, y + 0.12, Math.sin(a) * len];
        B.tube([0, y, 0], end, 0.035, 0.015, C.trunk, 5);
        B.lathe(end[0], end[1], end[2], [[0.04, 0], [0.22 * v, 0.05], [0.15, 0.12], [0.04, 0.16]], leaf(0x3f6b3a), seg);
      }
      B.lathe(0, 1.2, 0, [[0.04, 0], [0.26 * v, 0.06], [0.16, 0.16], [0.03, 0.24]], leaf(0x3f6b3a), seg);
      break;
    }
    case 'cypress': {                                // 柏: 細く高い樹冠、葉の塊を縦に重ねる
      B.cylinder(0, 0, 0, 0.05, 0.3, C.trunk, seg);
      const h = 1.5 * v;
      B.lathe(0, 0.2, 0, [[0.06, 0], [0.24, 0.2], [0.26, 0.5], [0.2, 0.85], [0.12, 1.1], [0.03, h - 0.2]], leaf(0x2f5a30), seg);
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + variant; B.blob(Math.cos(a) * 0.14, 0.45 + i * 0.25, Math.sin(a) * 0.14, 0.14, 0.18, leaf(i % 2 ? 0x2f5a30 : 0x3a6a3a), 6, 4); }
      break;
    }
    case 'sophora': {                                // 槐: 太めの幹、広がる枝、丸い樹冠を複数
      trunkWithBranches(B, 0.62, 0.075, C.trunk, seg, 4, variant);
      canopy(B, 0, 0.72, 0, 0.42 * v, 0.34 * v, leaf(0x5f9a3c), seg, rings, 4, 0.26, variant);
      break;
    }
    case 'elm': {                                    // 楡: 上へ広がる枝、盃形
      trunkWithBranches(B, 0.75, 0.065, C.trunk, seg, 3, variant);
      B.lathe(0, 0.55, 0, [[0.12, 0], [0.3, 0.2], [0.44 * v, 0.5], [0.36 * v, 0.78], [0.14, 0.95], [0.0, 1.0]], leaf(0x6a9d45), seg);
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + variant * 0.5; B.blob(Math.cos(a) * 0.28, 1.15, Math.sin(a) * 0.28, 0.2, 0.16, leaf(0x78a84a), 6, 4); }
      break;
    }
    case 'willow': {                                 // 柳: 枝垂れる細い枝の束
      trunkWithBranches(B, 0.7, 0.07, C.trunk, seg, 3, variant);
      B.lathe(0, 0.35, 0, [[0.34 * v, 0], [0.44 * v, 0.28], [0.42 * v, 0.6], [0.28, 0.85], [0.0, 0.98]], leaf(0x8fb35a), seg);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + variant; const r = 0.4 * v; B.tube([Math.cos(a) * r * 0.7, 1.0, Math.sin(a) * r * 0.7], [Math.cos(a) * r * 1.05, 0.3, Math.sin(a) * r * 1.05], 0.03, 0.015, leaf(0x8fb35a), 4); }
      break;
    }
    default:
      trunkWithBranches(B, 0.5, 0.06, C.trunk, seg, 3, variant); canopy(B, 0, 0.6, 0, 0.35, 0.3, leaf(0x4f8f3e), seg, rings, 3, 0.2, variant);
  }
  return B.build();
}

export function scaffold() {
  const B = createBuilder();
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) B.cylinder(x, 0, z, 0.025, 0.6, C.wood, 6);
  B.box(0, 0.55, -0.35, 0.75, 0.035, 0.035, C.woodDark); B.box(0, 0.55, 0.35, 0.75, 0.035, 0.035, C.woodDark);
  B.box(-0.35, 0.55, 0, 0.035, 0.035, 0.75, C.woodDark); B.box(0.35, 0.55, 0, 0.035, 0.035, 0.75, C.woodDark);
  B.chamferBox(0, 0, 0, 0.5, 0.12, 0.5, C.earthDark, { chamfer: 0.03 });
  return B.build();
}
