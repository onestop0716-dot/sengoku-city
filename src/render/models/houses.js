// 住居のコード生成モデル。level 1〜3 × variant 0〜2。
// 形の根拠: 版築の基壇と壁、木の柱、茅葺き（庶民）/ 瓦葺き（士以上）、院落（中庭を囲む塀と門）、台榭（高台の上の堂）。
// 屋根は反りのある曲面、箱は面取り、壁には柱・戸・窓を付ける。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const tint = (variant) => [1.0, 0.94, 1.05][variant % 3];
const DOOR = 0x3a2a1c, WINDOW = 0x4a3a2a;

/** 柱つきの壁の建物本体（基壇・壁・柱・戸・窓） */
function hall(B, cx, cz, sx, sz, h, wall, { plinth = 0.05, posts = true, door = true, windows = 1, rotY = 0, postColor = C.wood } = {}) {
  B.chamferBox(cx, 0, cz, sx + 0.1, plinth, sz + 0.1, C.earthDark, { chamfer: 0.02, rotY });
  B.chamferBox(cx, plinth, cz, sx, h, sz, wall, { chamfer: 0.025, rotY });
  if (posts) {
    const n = Math.max(2, Math.round(sx / 0.28));
    for (let i = 0; i <= n; i++) {
      const x = -sx / 2 + (sx * i) / n;
      const c = Math.cos(rotY), s = Math.sin(rotY);
      const px = cx + x * c - (sz / 2) * s, pz = cz + x * s + (sz / 2) * c;
      B.box(px, plinth, pz, 0.045, h, 0.045, postColor, rotY);
    }
  }
  if (door) B.panel(cx, plinth, cz, Math.min(0.22, sx * 0.3), h * 0.7, 'z+', DOOR, rotY);
  for (let i = 0; i < windows; i++) {
    const off = (i - (windows - 1) / 2) * 0.3 + (windows === 1 ? sx * 0.28 : 0);
    B.panel(cx + off, plinth + h * 0.4, cz, 0.14, 0.14, 'z+', WINDOW, rotY);
  }
  return plinth + h;
}

function courtyardWall(B, size, h, color, gateRoof = C.tileDark) {
  const t = 0.07, half = size / 2;
  B.chamferBox(0, 0, -half, size, h, t, color, { chamfer: 0.015 });
  B.chamferBox(-half, 0, 0, t, h, size, color, { chamfer: 0.015 });
  B.chamferBox(half, 0, 0, t, h, size, color, { chamfer: 0.015 });
  const gw = Math.min(0.36, size * 0.24);
  const segW = half - gw / 2;
  B.chamferBox(-(gw / 2 + segW / 2), 0, half, segW, h, t, color, { chamfer: 0.015 });
  B.chamferBox(gw / 2 + segW / 2, 0, half, segW, h, t, color, { chamfer: 0.015 });
  // 門: 2本の柱と小さな反り屋根
  for (const sx of [-1, 1]) B.box(sx * (gw / 2 + 0.03), 0, half, 0.06, h + 0.16, 0.06, C.wood);
  B.curvedRoof(0, h + 0.16, half, gw + 0.2, 0.2, 0.12, gateRoof, { overhang: 0.05, strips: 4, curve: 1.5 });
}

export function houseCommoner({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.earth, tint(variant));
  const thatch = shadeHex(C.thatch, [1, 0.95, 1.06][variant]);
  if (level === 1) {
    const axis = variant === 1 ? 'z' : 'x';
    const sx = axis === 'x' ? 0.7 : 0.56, sz = axis === 'x' ? 0.56 : 0.7;
    const top = hall(B, 0, 0, sx, sz, 0.4, wall, { windows: 1 });
    B.curvedRoof(0, top, 0, sx, sz, 0.3, thatch, { ridgeAxis: axis, overhang: 0.1, tileStripes: false, curve: 1.3, gableColor: wall, ridgeColor: C.thatchDark });
    if (variant === 2) { B.chamferBox(0.38, 0, 0.2, 0.18, 0.24, 0.3, C.wood, { chamfer: 0.02 }); B.curvedRoof(0.38, 0.24, 0.2, 0.18, 0.3, 0.1, C.thatchDark, { ridgeAxis: 'z', overhang: 0.04, strips: 4, tileStripes: false }); }
    if (variant === 0) for (let i = -2; i <= 2; i++) B.cylinder(i * 0.12, 0, 0.44, 0.015, 0.18, C.woodDark, 5);
  } else if (level === 2) {
    const top = hall(B, 0, -0.12, 0.8, 0.5, 0.46, wall, { windows: 2 });
    B.curvedRoof(0, top, -0.12, 0.8, 0.5, 0.32, variant === 2 ? C.thatchDark : thatch, { overhang: 0.12, tileStripes: false, curve: 1.35, gableColor: wall, ridgeColor: C.thatchDark });
    courtyardWall(B, 0.94, 0.18, C.earthDark, C.thatchDark);
    if (variant !== 1) { hall(B, -0.3, 0.26, 0.28, 0.3, 0.3, wall, { posts: false, door: false, windows: 0 }); B.curvedRoof(-0.3, 0.35, 0.26, 0.28, 0.3, 0.16, C.thatchDark, { ridgeAxis: 'z', overhang: 0.05, strips: 4, tileStripes: false, gableColor: wall }); }
    if (variant === 1) { hall(B, 0.32, 0.26, 0.24, 0.28, 0.26, wall, { posts: false, door: false, windows: 0 }); B.curvedRoof(0.32, 0.31, 0.26, 0.24, 0.28, 0.14, C.thatchDark, { overhang: 0.05, strips: 4, tileStripes: false, gableColor: wall }); }
    if (variant === 2) B.lathe(0.34, 0, 0.3, [[0.1, 0], [0.13, 0.1], [0.11, 0.2], [0.02, 0.28]], C.straw, 7);
  } else {
    const top = hall(B, 0, -0.14, 0.82, 0.5, 0.5, wall, { plinth: 0.08, windows: 2, postColor: C.woodDark });
    B.curvedRoof(0, top, -0.14, 0.82, 0.5, 0.34, variant === 1 ? C.tileDark : C.tile, { overhang: 0.14, curve: 1.7, gableColor: wall });
    courtyardWall(B, 0.96, 0.22, C.earthDark);
    hall(B, -0.33, 0.24, 0.26, 0.34, 0.32, wall, { posts: false, windows: 0, door: false }); B.curvedRoof(-0.33, 0.37, 0.24, 0.26, 0.34, 0.16, C.tile, { ridgeAxis: 'z', overhang: 0.05, strips: 4, gableColor: wall });
    if (variant !== 2) { hall(B, 0.33, 0.24, 0.26, 0.34, 0.32, wall, { posts: false, windows: 0, door: false }); B.curvedRoof(0.33, 0.37, 0.24, 0.26, 0.34, 0.16, C.tile, { ridgeAxis: 'z', overhang: 0.05, strips: 4, gableColor: wall }); }
    if (variant === 2) B.lathe(0.36, 0, 0.3, [[0.1, 0], [0.1, 0.2], [0.07, 0.24]], C.plaster, 8);   // 井戸
    if (variant === 1) B.lathe(0.36, 0, 0.36, [[0.09, 0], [0.11, 0.08], [0.02, 0.22]], C.straw, 7);   // 藁積み
  }
  return B.build();
}

export function houseShi({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.plaster, tint(variant));
  const size = 1.86;
  courtyardWall(B, size, 0.32, C.earth);
  const hallW = 1.2, hallD = 0.7, hallH = 0.52 + level * 0.08;
  const plat = level >= 3 ? 0.2 : level === 2 ? 0.1 : 0.05;
  const top = hall(B, 0, -0.45, hallW, hallD, hallH, wall, { plinth: plat, windows: 2, postColor: C.lacquer });
  B.curvedRoof(0, top, -0.45, hallW, hallD, 0.38, variant === 2 ? C.tileDark : C.tile, { overhang: 0.16, curve: 1.7, gableColor: wall });
  if (level >= 2) for (const sx of [-1, 1]) {
    if (level === 2 && variant === 1 && sx === 1) continue;
    hall(B, sx * 0.62, 0.25, 0.4, 0.9, 0.4, wall, { windows: 0, door: false, rotY: sx * Math.PI / 2 });
    B.curvedRoof(sx * 0.62, 0.45, 0.25, 0.4, 0.9, 0.24, C.tile, { ridgeAxis: 'z', overhang: 0.1, strips: 5, gableColor: wall });
  }
  if (level >= 3) { hall(B, 0, 0.2, 0.7, 0.4, 0.38, wall, { windows: 1 }); B.curvedRoof(0, 0.43, 0.2, 0.7, 0.4, 0.22, C.tile, { overhang: 0.1, strips: 5, gableColor: wall }); }
  if (variant === 0) { B.cylinder(0.7, 0, 0.7, 0.03, 0.35, C.trunk, 6); B.blob(0.7, 0.4, 0.7, 0.2, 0.18, shadeHex(0x5f9a3c, 1), 7, 4); }
  if (variant === 1) B.lathe(-0.62, 0, 0.55, [[0.09, 0], [0.09, 0.16], [0.06, 0.2]], C.plaster, 8);           // 井戸
  if (variant === 2) { hall(B, -0.62, 0.62, 0.3, 0.3, 0.28, C.earthDark, { posts: false, door: false, windows: 0 }); B.curvedRoof(-0.62, 0.33, 0.62, 0.3, 0.3, 0.14, C.thatchDark, { overhang: 0.05, strips: 4, tileStripes: false }); } // 倉
  return B.build();
}

export function houseNoble({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.plaster, tint(variant));
  const size = 2.86;
  courtyardWall(B, size, 0.38, C.earth);
  // 台榭: 版築の高台（面取り）
  const platH = 0.3 + level * 0.15;
  B.chamferBox(0, 0, -0.5, 2.2, platH, 1.5, C.earth, { chamfer: 0.05 });
  if (level >= 3) B.chamferBox(0, platH, -0.5, 1.9, 0.18, 1.25, C.earthDark, { chamfer: 0.04 });
  const top = level >= 3 ? platH + 0.18 : platH;
  // 主堂（二重の反り屋根）
  B.chamferBox(0, top, -0.5, 1.6, 0.7, 1.0, wall, { chamfer: 0.03 });
  for (let i = -3; i <= 3; i++) B.box(i * 0.24, top, 0.0, 0.07, 0.7, 0.07, C.lacquer);
  B.panel(0, top, 0.0, 0.3, 0.55, 'z+', DOOR);
  for (const sx of [-1, 1]) B.panel(sx * 0.5, top + 0.3, 0.0, 0.18, 0.18, 'z+', WINDOW);
  B.curvedHipRoof(0, top + 0.7, -0.5, 1.6, 1.0, 0.3, C.tile, { overhang: 0.16, curve: 1.6 });
  B.chamferBox(0, top + 0.98, -0.5, 1.0, 0.3, 0.6, wall, { chamfer: 0.02 });
  B.curvedHipRoof(0, top + 1.28, -0.5, 1.0, 0.6, 0.26, variant === 1 ? C.tileDark : C.tile, { overhang: 0.12, curve: 1.6 });
  // 階段
  for (let s = 0; s < 4; s++) B.chamferBox(0, s * (platH / 4), 0.3 + s * 0.08, 0.5, platH / 4, 0.1, C.earthDark, { chamfer: 0.01 });
  // 廊（level 2 以上）
  if (level >= 2) for (const sx of [-1, 1]) {
    B.chamferBox(sx * 1.15, 0, 0.1, 0.36, 0.4, 2.2, wall, { chamfer: 0.02 });
    for (let i = -4; i <= 4; i++) B.box(sx * 1.15 - sx * 0.18, 0, 0.1 + i * 0.26, 0.05, 0.4, 0.05, C.lacquer);
    B.curvedRoof(sx * 1.15, 0.4, 0.1, 0.36, 2.2, 0.2, C.tile, { ridgeAxis: 'z', overhang: 0.08, strips: 5, gableColor: wall });
  }
  // 隅の楼（level 3）
  if (level >= 3) for (const [sx, sz] of [[-1, 1], [1, 1]]) { B.chamferBox(sx * 1.2, 0, sz * 1.2, 0.36, 0.8, 0.36, wall, { chamfer: 0.02 }); B.curvedHipRoof(sx * 1.2, 0.8, sz * 1.2, 0.36, 0.36, 0.2, C.tileDark, { overhang: 0.06, strips: 4 }); }
  if (variant === 2) { B.cylinder(-1.0, 0, 1.0, 0.04, 0.4, C.trunk, 6); B.blob(-1.0, 0.45, 1.0, 0.28, 0.25, 0x3f6b3a, 8, 5); B.cylinder(1.0, 0, 0.9, 0.035, 0.35, C.trunk, 6); B.blob(1.0, 0.4, 0.9, 0.22, 0.2, 0x5f9a3c, 8, 5); }
  if (variant === 0) B.slab(0, 0.02, 0.9, 0.5, 0.5, C.water);                                                    // 池
  if (variant === 1) { B.chamferBox(0.9, 0, 0.9, 0.4, 0.5, 0.4, wall, { chamfer: 0.02 }); B.curvedHipRoof(0.9, 0.5, 0.9, 0.4, 0.4, 0.18, C.tileDark, { overhang: 0.06, strips: 4 }); } // 亭
  return B.build();
}
