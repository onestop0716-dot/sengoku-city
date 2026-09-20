// 住居のコード生成モデル。level 1〜3 × variant 0〜2。
// 形の根拠: 版築の壁 + 木造 + 茅葺き（庶民）/ 瓦葺き（士以上）、院落（中庭を囲む塀と門）、台榭（高台の上の堂）。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const tint = (variant) => [1.0, 0.93, 1.06][variant % 3];

function courtyardWall(B, size, h, color, gateSide = 'front') {
  const t = 0.06, half = size / 2;
  B.box(0, 0, -half, size, h, t, color);           // 奥
  B.box(-half, 0, 0, t, h, size, color);           // 左
  B.box(half, 0, 0, t, h, size, color);            // 右
  // 手前は門の分だけ空ける
  const gw = Math.min(0.35, size * 0.25);
  B.box(-(half + gw / 2) / 2 - gw / 4, 0, half, half - gw / 2, h, t, color);
  B.box((half + gw / 2) / 2 + gw / 4, 0, half, half - gw / 2, h, t, color);
  // 門（小さな屋根つき）
  B.box(0, 0, half, gw + 0.16, h + 0.12, 0.12, C.wood);
  B.gableRoof(0, h + 0.12, half, gw + 0.16, 0.16, 0.1, C.tileDark, 'x', 0.04);
}

export function houseCommoner({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.earth, tint(variant));
  if (level === 1) {
    const axis = variant === 1 ? 'z' : 'x';
    const sx = axis === 'x' ? 0.72 : 0.58, sz = axis === 'x' ? 0.58 : 0.72;
    B.box(0, 0, 0, sx, 0.42, sz, wall);
    B.gableRoof(0, 0.42, 0, sx, sz, 0.28, C.thatch, axis);
    if (variant === 2) { B.box(0.38, 0, 0.2, 0.18, 0.25, 0.3, C.wood); B.gableRoof(0.38, 0.25, 0.2, 0.18, 0.3, 0.1, C.thatchDark, 'z', 0.03); }
    if (variant === 0) for (let i = -2; i <= 2; i++) B.box(i * 0.12, 0, 0.44, 0.03, 0.18, 0.03, C.woodDark);
  } else if (level === 2) {
    B.box(0, 0, -0.12, 0.8, 0.5, 0.5, wall);
    B.gableRoof(0, 0.5, -0.12, 0.8, 0.5, 0.3, variant === 2 ? C.thatchDark : C.thatch, 'x');
    courtyardWall(B, 0.94, 0.16, C.earthDark);
    if (variant !== 1) { B.box(-0.3, 0, 0.26, 0.28, 0.32, 0.3, wall); B.gableRoof(-0.3, 0.32, 0.26, 0.28, 0.3, 0.16, C.thatchDark, 'z', 0.04); }
    if (variant === 1) { B.box(0.32, 0, 0.26, 0.24, 0.28, 0.28, wall); B.gableRoof(0.32, 0.28, 0.26, 0.24, 0.28, 0.14, C.thatchDark, 'x', 0.04); }
    if (variant === 2) B.cone(0.34, 0, 0.3, 0.12, 0.24, C.straw, 6); // 藁積み
  } else {
    B.box(0, 0.06, -0.14, 0.82, 0.52, 0.5, wall);
    B.box(0, 0, -0.14, 0.9, 0.06, 0.58, C.earthDark);
    B.gableRoof(0, 0.58, -0.14, 0.82, 0.5, 0.32, variant === 1 ? C.tileDark : C.tile, 'x');
    courtyardWall(B, 0.96, 0.2, C.earthDark);
    B.box(-0.33, 0, 0.24, 0.26, 0.34, 0.34, wall); B.gableRoof(-0.33, 0.34, 0.24, 0.26, 0.34, 0.16, C.tile, 'z', 0.04);
    if (variant !== 2) { B.box(0.33, 0, 0.24, 0.26, 0.34, 0.34, wall); B.gableRoof(0.33, 0.34, 0.24, 0.26, 0.34, 0.16, C.tile, 'z', 0.04); }
    if (variant === 2) B.cylinder(0.36, 0, 0.3, 0.1, 0.24, C.plaster, 6);                 // 井戸
    if (variant === 1) B.cone(0.36, 0, 0.36, 0.1, 0.2, C.straw, 6);                        // 藁積み
  }
  return B.build();
}

export function houseShi({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.plaster, tint(variant));
  const size = 1.86;
  courtyardWall(B, size, 0.3, C.earth);
  // 主堂（北側）
  const hallW = 1.2, hallD = 0.7, hallH = 0.55 + level * 0.08;
  const plat = level >= 3 ? 0.18 : level === 2 ? 0.08 : 0.04;
  B.box(0, 0, -0.45, hallW + 0.2, plat, hallD + 0.2, C.earthDark);
  B.box(0, plat, -0.45, hallW, hallH, hallD, wall);
  for (let i = -2; i <= 2; i++) B.box(i * 0.28, plat, -0.45 + hallD / 2, 0.06, hallH, 0.06, C.lacquer);
  B.gableRoof(0, plat + hallH, -0.45, hallW, hallD, 0.36, variant === 2 ? C.tileDark : C.tile, 'x', 0.12);
  // 東西の廂（level 2 以上）
  if (level >= 2) {
    for (const sx of [-1, 1]) {
      if (level === 2 && variant === 1 && sx === 1) continue;
      B.box(sx * 0.62, 0, 0.25, 0.42, 0.42, 0.9, wall);
      B.gableRoof(sx * 0.62, 0.42, 0.25, 0.42, 0.9, 0.24, C.tile, 'z', 0.08);
    }
  }
  // 第二の堂（level 3）
  if (level >= 3) {
    B.box(0, 0, 0.2, 0.7, 0.4, 0.4, wall);
    B.gableRoof(0, 0.4, 0.2, 0.7, 0.4, 0.22, C.tile, 'x', 0.08);
  }
  if (variant === 0) B.cone(0.7, 0, 0.7, 0.14, 0.4, C.leafDark, 5);
  if (variant === 1) B.cylinder(-0.62, 0, 0.55, 0.08, 0.16, C.plaster, 6);           // 井戸
  if (variant === 2) { B.box(-0.62, 0, 0.62, 0.3, 0.3, 0.3, C.earthDark); B.gableRoof(-0.62, 0.3, 0.62, 0.3, 0.3, 0.14, C.thatchDark, 'x', 0.04); } // 倉
  return B.build();
}

export function houseNoble({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.plaster, tint(variant));
  const size = 2.86;
  courtyardWall(B, size, 0.36, C.earth);
  // 台榭: 版築の高台
  const platH = 0.3 + level * 0.15;
  B.box(0, 0, -0.5, 2.2, platH, 1.5, C.earth);
  if (level >= 3) B.box(0, platH, -0.5, 1.9, 0.18, 1.25, C.earthDark);
  const top = level >= 3 ? platH + 0.18 : platH;
  // 主堂（二層の屋根）
  B.box(0, top, -0.5, 1.6, 0.7, 1.0, wall);
  for (let i = -3; i <= 3; i++) B.box(i * 0.24, top, 0.0, 0.07, 0.7, 0.07, C.lacquer);
  B.hipRoof(0, top + 0.7, -0.5, 1.6, 1.0, 0.3, C.tile, 0.14);
  B.box(0, top + 0.98, -0.5, 1.0, 0.3, 0.6, wall);
  B.hipRoof(0, top + 1.28, -0.5, 1.0, 0.6, 0.26, variant === 1 ? C.tileDark : C.tile, 0.1);
  // 階段
  for (let s = 0; s < 4; s++) B.box(0, s * (platH / 4), 0.3 + s * 0.08, 0.5, platH / 4, 0.1, C.earthDark);
  // 廊（level 2 以上）
  if (level >= 2) for (const sx of [-1, 1]) { B.box(sx * 1.15, 0, 0.1, 0.36, 0.4, 2.2, wall); B.gableRoof(sx * 1.15, 0.4, 0.1, 0.36, 2.2, 0.2, C.tile, 'z', 0.06); }
  // 隅の楼（level 3）
  if (level >= 3) for (const [sx, sz] of [[-1, 1], [1, 1]]) { B.box(sx * 1.2, 0, sz * 1.2, 0.36, 0.8, 0.36, wall); B.hipRoof(sx * 1.2, 0.8, sz * 1.2, 0.36, 0.36, 0.2, C.tileDark, 0.06); }
  if (variant === 2) { B.cone(-1.0, 0, 1.0, 0.2, 0.55, C.leafDark, 6); B.cone(1.0, 0, 0.9, 0.16, 0.45, C.leaf, 6); }
  if (variant === 0) B.box(0, 0, 0.9, 0.5, 0.05, 0.5, C.water);                       // 池
  if (variant === 1) { B.box(0.9, 0, 0.9, 0.4, 0.5, 0.4, wall); B.hipRoof(0.9, 0.5, 0.9, 0.4, 0.4, 0.18, C.tileDark, 0.06); } // 亭
  return B.build();
}
