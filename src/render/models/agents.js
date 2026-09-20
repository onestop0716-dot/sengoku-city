// 住民（身分ごとの服色）と乗り物（牛車・荷車・馬車・舟）。表示専用。
import { createBuilder } from './builder.js';
import { C } from './palette.js';

const ROBE = { person_farmer: 0x8b6b3f, person_artisan: 0x6b6b70, person_merchant: 0x3a6fa8, person_shi: 0xe8dcc0, person_noble: 0x6a1b9a, person_soldier: 0x8b1a1a };
const SKIN = 0xd8b088, HAIR = 0x2a1e12;

function person(B, robe, x = 0, z = 0) {
  B.lathe(x, 0, z, [[0.09, 0], [0.11, 0.25], [0.09, 0.42]], robe, 7);          // 深衣
  B.lathe(x, 0.42, z, [[0.06, 0], [0.065, 0.06]], SKIN, 6);                     // 首
  B.blob(x, 0.55, z, 0.075, 0.08, SKIN, 7, 4);                                  // 頭
  B.lathe(x, 0.58, z, [[0.07, 0], [0.06, 0.06], [0.03, 0.08]], HAIR, 7);         // 髷・冠
  for (const s of [-1, 1]) B.lathe(x + s * 0.12, 0.2, z, [[0.03, 0], [0.035, 0.2]], robe, 5);   // 袖
}

function ox(B, x, z) {
  B.chamferBox(x, 0.22, z, 0.5, 0.26, 0.24, 0x6b4a2a, { chamfer: 0.06 });
  B.chamferBox(x + 0.3, 0.3, z, 0.2, 0.18, 0.16, 0x5a3d22, { chamfer: 0.04 });
  for (const s of [-1, 1]) B.box(x + 0.34, 0.44, z + s * 0.08, 0.06, 0.04, 0.12, 0xd8d0b8);   // 角
  for (const lx of [-0.16, 0.16]) for (const lz of [-0.08, 0.08]) B.box(x + lx, 0, z + lz, 0.05, 0.22, 0.05, 0x5a3d22);
}
function horse(B, x, z) {
  B.chamferBox(x, 0.3, z, 0.5, 0.22, 0.18, 0x7a4a2a, { chamfer: 0.05 });
  B.box(x + 0.28, 0.42, z, 0.16, 0.22, 0.1, 0x7a4a2a); B.box(x + 0.36, 0.58, z, 0.14, 0.09, 0.08, 0x6a3d22);
  for (const lx of [-0.18, 0.18]) for (const lz of [-0.06, 0.06]) B.box(x + lx, 0, z + lz, 0.04, 0.3, 0.04, 0x5a3d22);
  B.box(x - 0.28, 0.35, z, 0.06, 0.2, 0.03, HAIR);   // 尾
}
function wheel(B, x, y, z, r) {
  const seg = 10;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const p = (a, rr, dz) => [x + rr * Math.cos(a), y + rr * Math.sin(a), z + dz];
    B.quadN(p(a0, r, -0.015), p(a1, r, -0.015), p(a1, r, 0.015), p(a0, r, 0.015), [Math.cos(a0), Math.sin(a0), 0], [Math.cos(a1), Math.sin(a1), 0], [Math.cos(a1), Math.sin(a1), 0], [Math.cos(a0), Math.sin(a0), 0], C.woodDark);
    B.quadN(p(a0, r * 0.85, 0.015), p(a1, r * 0.85, 0.015), p(a1, r, 0.015), p(a0, r, 0.015), [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], C.woodDark);
    B.quadN(p(a1, r * 0.85, -0.015), p(a0, r * 0.85, -0.015), p(a0, r, -0.015), p(a1, r, -0.015), [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1], C.woodDark);
  }
  B.box(x, y, z, 0.03, r * 1.7, 0.02, C.wood); B.box(x, y, z, r * 1.7, 0.03, 0.02, C.wood);
}

export function agent({ kind = 'person_farmer' }) {
  const B = createBuilder();
  if (kind.startsWith('person_')) { person(B, ROBE[kind] || 0x8b6b3f); if (kind === 'person_soldier') { B.box(0.14, 0.3, 0, 0.02, 0.9, 0.02, C.woodDark); B.box(0.14, 1.1, 0, 0.02, 0.14, 0.06, 0x8a8a8a); } if (kind === 'person_farmer') B.box(-0.14, 0.4, 0, 0.02, 0.5, 0.02, C.wood); return B.build(); }
  switch (kind) {
    case 'oxcart':
      B.chamferBox(-0.1, 0.3, 0, 0.7, 0.06, 0.4, C.wood, { chamfer: 0.01 });
      for (const sz of [-0.2, 0.2]) B.box(-0.1, 0.36, sz, 0.7, 0.18, 0.03, C.wood);
      B.box(-0.45, 0.36, 0, 0.03, 0.18, 0.4, C.wood);
      B.lathe(-0.1, 0.36, 0, [[0.16, 0], [0.18, 0.12], [0.1, 0.24]], C.straw, 7);
      for (const sz of [-0.24, 0.24]) wheel(B, -0.1, 0.22, sz, 0.22);
      B.box(0.3, 0.32, 0, 0.5, 0.03, 0.03, C.woodDark);
      ox(B, 0.65, 0);
      break;
    case 'handcart':
      B.chamferBox(0, 0.26, 0, 0.55, 0.05, 0.36, C.wood, { chamfer: 0.01 });
      for (const sz of [-0.18, 0.18]) B.box(0, 0.31, sz, 0.55, 0.14, 0.03, C.wood);
      B.lathe(0, 0.31, 0, [[0.1, 0], [0.12, 0.1], [0.06, 0.2]], 0xa0522d, 6);
      for (const sz of [-0.22, 0.22]) wheel(B, 0, 0.2, sz, 0.2);
      B.box(0.4, 0.3, 0, 0.3, 0.03, 0.03, C.woodDark);
      person(B, ROBE.person_artisan, 0.62, 0);
      break;
    case 'carriage':
      B.chamferBox(-0.15, 0.32, 0, 0.6, 0.06, 0.44, C.woodDark, { chamfer: 0.01 });
      B.chamferBox(-0.15, 0.38, 0, 0.5, 0.35, 0.4, 0x8b1a1a, { chamfer: 0.03 });
      B.curvedHipRoof(-0.15, 0.73, 0, 0.5, 0.4, 0.12, 0x2a1e12, { overhang: 0.06, strips: 3 });
      for (const sz of [-0.26, 0.26]) wheel(B, -0.15, 0.24, sz, 0.24);
      B.box(0.35, 0.34, 0, 0.5, 0.03, 0.03, C.woodDark);
      horse(B, 0.72, 0);
      break;
    case 'boat':
      B.lathe(0, 0, 0, [[0.0, 0.0], [0.22, 0.05], [0.26, 0.18], [0.24, 0.22]], C.woodDark, 8);
      B.chamferBox(0, 0.05, 0, 1.3, 0.14, 0.42, C.wood, { chamfer: 0.06 });
      B.chamferBox(0, 0.16, 0, 1.2, 0.04, 0.34, C.woodDark, { chamfer: 0.01 });
      B.chamferBox(0.55, 0.05, 0, 0.3, 0.26, 0.3, C.wood, { chamfer: 0.08 }); B.chamferBox(-0.55, 0.05, 0, 0.3, 0.26, 0.3, C.wood, { chamfer: 0.08 });
      B.lathe(-0.1, 0.18, 0, [[0.14, 0], [0.16, 0.12], [0.08, 0.22]], C.straw, 6);
      B.box(0.35, 0.2, 0.1, 0.02, 0.5, 0.02, C.wood); B.box(0.3, 0.6, 0.1, 0.6, 0.02, 0.02, C.wood);
      person(B, ROBE.person_merchant, 0.15, -0.08);
      break;
  }
  return B.build();
}
