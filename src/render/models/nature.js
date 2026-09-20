// 樹木（華北の樹種）と建設中の足場。lod:'low' は遠景用の簡略版。
// 松（層になった傘形）・柏（細長い円錐）・槐（丸い広葉）・楡（盃形）・柳（枝垂れ、水辺）
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const vary = (variant) => [1.0, 0.9, 1.1][variant % 3];

function trunk(B, h, r, color, seg, lean = 0) {
  const prof = [[r, 0], [r * 0.85, h * 0.35], [r * 0.65, h * 0.7], [r * 0.45, h]];
  B.lathe(lean * 0.0, 0, 0, prof, color, seg);
}

export function tree({ species = 'pine', variant = 0, lod = 'high' }) {
  const B = createBuilder();
  const hi = lod === 'high';
  const seg = hi ? 9 : 5, rings = hi ? 6 : 3;
  const v = vary(variant);
  const leaf = (hex) => shadeHex(hex, [1.0, 0.92, 1.08][variant % 3]);
  switch (species) {
    case 'pine': {                                   // 松: 幹は少し曲がり、傘形の層を2〜3段
      B.lathe(0, 0, 0, [[0.07, 0], [0.06, 0.5], [0.045, 0.95], [0.03, 1.25]], C.trunk, seg, { twist: 0.15 });
      const layers = hi ? 3 : 2;
      for (let i = 0; i < layers; i++) {
        const y = 0.55 + i * 0.32, r = (0.42 - i * 0.1) * v, ox = (i % 2 ? -0.08 : 0.08) * (variant === 1 ? -1 : 1);
        B.lathe(ox, y, ox * 0.5, [[0.05, 0], [r, 0.06], [r * 0.7, 0.16], [0.06, 0.24]], leaf(0x3f6b3a), seg);
      }
      break;
    }
    case 'cypress': {                                // 柏: 細く高い円錐形、少し凹凸
      B.cylinder(0, 0, 0, 0.05, 0.3, C.trunk, seg);
      const h = 1.5 * v;
      const prof = [[0.05, 0.2], [0.24, 0.35], [0.28, 0.6], [0.22, 0.95], [0.14, 1.25], [0.03, h]];
      B.lathe(0, 0, 0, prof, leaf(0x2f5a30), seg);
      break;
    }
    case 'sophora': {                                // 槐: 丸く広い樹冠
      B.lathe(0, 0, 0, [[0.08, 0], [0.06, 0.4], [0.05, 0.6]], C.trunk, seg);
      B.blob(0, 0.55, 0, 0.5 * v, 0.42 * v, leaf(0x5f9a3c), seg, rings);
      if (hi) { B.blob(0.28, 0.6, 0.12, 0.3, 0.26, leaf(0x6aa646), seg, rings); B.blob(-0.25, 0.7, -0.15, 0.28, 0.24, leaf(0x54903a), seg, rings); }
      break;
    }
    case 'elm': {                                    // 楡: 上に広がる盃形
      B.lathe(0, 0, 0, [[0.07, 0], [0.06, 0.45], [0.05, 0.7]], C.trunk, seg);
      const prof = [[0.12, 0.5], [0.3, 0.7], [0.48 * v, 1.0], [0.42 * v, 1.25], [0.2, 1.45], [0.0, 1.55]];
      B.lathe(0, 0, 0, prof, leaf(0x6a9d45), seg);
      break;
    }
    case 'willow': {                                 // 柳: 枝垂れ。上が広く、下へ垂れる
      B.lathe(0, 0, 0, [[0.08, 0], [0.07, 0.4], [0.05, 0.75]], C.trunk, seg);
      const prof = [[0.36 * v, 0.35], [0.46 * v, 0.6], [0.44 * v, 0.9], [0.3, 1.15], [0.0, 1.3]];
      B.lathe(0, 0, 0, prof, leaf(0x8fb35a), seg);
      break;
    }
    default:
      B.cylinder(0, 0, 0, 0.06, 0.4, C.trunk, seg); B.blob(0, 0.5, 0, 0.35, 0.35, leaf(0x4f8f3e), seg, rings);
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
