// 市の店・工房・軍営の建物。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const DOOR = 0x3a2a1c;
const tint = (v) => [1.0, 0.94, 1.05][v % 3];

export function marketStall({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const cloth = [0xc95a3a, 0x3a6fa8, 0xd9b04a][variant % 3];
  B.slab(0, 0.01, 0, 0.94, 0.94, C.earthDark);
  const w = 0.6 + level * 0.1, d = 0.5 + level * 0.06;
  B.chamferBox(0, 0, -0.12, w, 0.28, d, C.wood, { chamfer: 0.02 });                  // 台
  for (const [x, z] of [[-w / 2 + 0.04, d / 2 - 0.16], [w / 2 - 0.04, d / 2 - 0.16], [-w / 2 + 0.04, -d / 2 - 0.08], [w / 2 - 0.04, -d / 2 - 0.08]]) B.box(x, 0, z, 0.04, 0.7 + level * 0.05, 0.04, C.woodDark);
  B.curvedRoof(0, 0.7 + level * 0.05, -0.12, w, d, 0.12, cloth, { overhang: 0.1, strips: 3, tileStripes: false, curve: 1.2, thickness: 0.02 });   // 布の屋根
  for (let i = 0; i < level + 1; i++) B.lathe(-w / 2 + 0.12 + i * 0.22, 0.28, -0.12, [[0.06, 0], [0.08, 0.06], [0.03, 0.14]], [0xb87333, 0xd9c27a, 0x6fbf7f, 0xe8e8e8][i % 4], 6);
  if (level >= 3) { B.chamferBox(0, 0, 0.38, 0.5, 0.2, 0.14, C.wood, { chamfer: 0.02 }); }
  return B.build();
}

export function workshop({ kind = 'ws_iron', level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.earth, tint(variant));
  const sx = 0.62 + level * 0.06, sz = 0.5 + level * 0.05;
  B.chamferBox(0, 0, -0.1, sx + 0.08, 0.05, sz + 0.08, C.earthDark, { chamfer: 0.02 });
  B.chamferBox(0, 0.05, -0.1, sx, 0.42, sz, wall, { chamfer: 0.025 });
  B.panel(0, 0.05, -0.1 + sz / 2, 0.2, 0.3, 'z+', DOOR);
  const roof = level >= 2 ? C.tile : C.thatch;
  B.curvedRoof(0, 0.47, -0.1, sx, sz, 0.26, roof, { overhang: 0.1, tileStripes: level >= 2, curve: 1.3, gableColor: wall });
  const fx = 0.3, fz = 0.3;
  switch (kind) {
    case 'ws_iron': case 'ws_bronze': case 'ws_weapon':                       // 炉と煙突
      B.lathe(fx, 0, fz, [[0.16, 0], [0.14, 0.3], [0.08, 0.55], [0.06, 0.75]], C.earthDark, 8);
      B.lathe(fx, 0.75, fz, [[0.06, 0], [0.1, 0.06], [0.03, 0.18]], kind === 'ws_bronze' ? 0xd8842a : 0xd85a1a, 6);
      B.chamferBox(-0.3, 0, 0.3, 0.2, 0.18, 0.2, C.woodDark, { chamfer: 0.02 });                // 金床台
      break;
    case 'ws_pottery':                                                          // 窯
      B.lathe(fx, 0, fz, [[0.22, 0], [0.22, 0.2], [0.14, 0.34], [0.0, 0.42]], C.earthDark, 8);
      for (let i = 0; i < level + 1; i++) B.lathe(-0.36 + i * 0.16, 0, 0.36, [[0.05, 0], [0.07, 0.08], [0.04, 0.14]], 0xa0522d, 6);
      break;
    case 'ws_salt':                                                             // 塩田・釜
      B.slab(0, 0.02, 0.32, 0.9, 0.24, 0xe8e8e8);
      B.lathe(fx, 0, -0.35, [[0.12, 0], [0.12, 0.14], [0.08, 0.16]], C.earthDark, 8);
      break;
    case 'ws_textile':                                                          // 干した布
      for (let i = 0; i < 2; i++) { B.box(-0.35 + i * 0.7, 0, 0.36, 0.03, 0.5, 0.03, C.wood); }
      B.box(0, 0.48, 0.36, 0.7, 0.02, 0.02, C.woodDark);
      for (let i = 0; i < 3; i++) B.box(-0.22 + i * 0.22, 0.2, 0.36, 0.14, 0.28, 0.01, [0xe8dcc0, 0xc95a3a, 0x3a6fa8][i]);
      break;
    case 'ws_lacquer':                                                          // 漆の器を並べる棚
      B.chamferBox(0.3, 0, 0.32, 0.36, 0.3, 0.16, C.woodDark, { chamfer: 0.01 });
      for (let i = 0; i < 3; i++) B.lathe(0.18 + i * 0.12, 0.3, 0.32, [[0.03, 0], [0.045, 0.04], [0.02, 0.07]], 0x8b1a1a, 6);
      break;
    case 'ws_vehicle':                                                          // 車輪
      for (let i = 0; i < 2; i++) B.lathe(-0.3 + i * 0.6, 0, 0.36, [[0.0, 0], [0.16, 0.01], [0.16, 0.04], [0.0, 0.05]], C.woodDark, 10);
      B.lathe(0.3, 0.05, 0.36, [[0.16, 0], [0.16, 0.04]], C.wood, 10);
      break;
  }
  return B.build();
}

export function militaryBuilding({ kind = 'barracks', level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.earth, tint(variant));
  if (kind === 'barracks') {                 // 長屋の兵舎 + 柵
    B.chamferBox(0, 0, -0.3, 1.7, 0.06, 0.8, C.earthDark, { chamfer: 0.02 });
    B.chamferBox(0, 0.06, -0.3, 1.6, 0.45, 0.7, wall, { chamfer: 0.025 });
    for (let i = -2; i <= 2; i++) B.panel(i * 0.32, 0.06, 0.05, 0.14, 0.3, 'z+', DOOR);
    B.curvedRoof(0, 0.51, -0.3, 1.6, 0.7, 0.3, level >= 2 ? C.tile : C.thatch, { overhang: 0.1, tileStripes: level >= 2, gableColor: wall });
    for (let i = -4; i <= 4; i++) B.box(i * 0.2, 0, 0.85, 0.04, 0.3, 0.04, C.woodDark);
    B.box(0.7, 0, 0.6, 0.05, 1.2, 0.05, C.wood); B.box(0.83, 1.0, 0.6, 0.24, 0.16, 0.02, 0x8b1a1a);
    if (level >= 3) { B.chamferBox(-0.5, 0, 0.5, 0.5, 0.35, 0.4, wall, { chamfer: 0.02 }); B.curvedRoof(-0.5, 0.35, 0.5, 0.5, 0.4, 0.16, C.tile, { overhang: 0.06, strips: 4, gableColor: wall }); }
  } else {                                   // 馬厩: 開いた小屋と馬
    B.chamferBox(0, 0, -0.3, 1.7, 0.05, 0.9, C.earthDark, { chamfer: 0.02 });
    for (const x of [-0.8, -0.27, 0.27, 0.8]) for (const z of [-0.72, 0.12]) B.box(x, 0, z, 0.06, 0.6, 0.06, C.wood);
    B.chamferBox(0, 0.05, -0.65, 1.7, 0.5, 0.06, wall, { chamfer: 0.01 });
    B.curvedRoof(0, 0.6, -0.3, 1.7, 0.9, 0.24, C.thatch, { overhang: 0.1, tileStripes: false, gableColor: C.wood });
    for (let i = 0; i < Math.min(3, level + 1); i++) {
      const x = -0.55 + i * 0.5;
      B.chamferBox(x, 0.25, -0.3, 0.42, 0.22, 0.16, 0x6b4a2a, { chamfer: 0.05 });
      B.box(x + 0.2, 0.35, -0.3, 0.16, 0.2, 0.1, 0x6b4a2a); B.box(x + 0.28, 0.5, -0.3, 0.12, 0.08, 0.08, 0x5a3d22);
      for (const lx of [-0.12, 0.12]) for (const lz of [-0.05, 0.05]) B.box(x + lx, 0.05, -0.3 + lz, 0.04, 0.22, 0.04, 0x5a3d22);
    }
    for (let i = -4; i <= 4; i++) B.box(i * 0.2, 0, 0.7, 0.04, 0.28, 0.04, C.woodDark);
  }
  return B.build();
}
