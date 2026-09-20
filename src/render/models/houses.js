// 住居のコード生成モデル。level 1〜3 × variant 0〜2。縮尺: 1マス ≈ 4m、人の身長 ≈ 0.45。
// 形の根拠: 版築の基壇と壁、木の柱、茅葺き（庶民）/ 瓦葺き（士以上）、院落（中庭を囲む塀と門）、台榭（高台の上の堂）。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const tint = (variant) => [1.0, 0.94, 1.05][variant % 3];
const DOOR = 0x3a2a1c, WINDOW = 0x4a3a2a;

/** 柱つきの建物本体（基壇・壁・柱・戸・窓）。戸口は人が通れる高さ（0.42 以上） */
function hall(B, cx, cz, sx, sz, h, wall, { plinth = 0.05, posts = true, door = true, windows = 1, rotY = 0, postColor = C.wood } = {}) {
  B.chamferBox(cx, 0, cz, sx + 0.1, plinth, sz + 0.1, C.earthDark, { chamfer: 0.02, rotY });
  B.chamferBox(cx, plinth, cz, sx, h, sz, wall, { chamfer: 0.02, rotY });
  if (posts) {
    const n = Math.max(2, Math.round(sx / 0.24));
    for (let i = 0; i <= n; i++) {
      const x = -sx / 2 + (sx * i) / n;
      const c = Math.cos(rotY), s = Math.sin(rotY);
      B.box(cx + x * c - (sz / 2) * s, plinth, cz + x * s + (sz / 2) * c, 0.04, h, 0.04, postColor, rotY);
      B.box(cx + x * c + (sz / 2) * s, plinth, cz + x * s - (sz / 2) * c, 0.04, h, 0.04, postColor, rotY);
    }
    B.box(cx, plinth + h - 0.03, cz, sx + 0.02, 0.05, sz + 0.02, postColor, rotY);   // 桁
  }
  if (door) { B.panel(cx, plinth, cz, Math.min(0.2, sx * 0.3), Math.max(0.42, h * 0.75), 'z+', DOOR, rotY); B.panel(cx, plinth + Math.max(0.42, h * 0.75), cz, Math.min(0.24, sx * 0.34), 0.03, 'z+', C.woodDark, rotY); }
  for (let i = 0; i < windows; i++) {
    const off = (i - (windows - 1) / 2) * 0.24 + (windows === 1 ? sx * 0.3 : 0);
    B.panel(cx + off, plinth + h * 0.45, cz, 0.12, 0.12, 'z+', WINDOW, rotY);
    for (let k = -1; k <= 1; k++) B.panel(cx + off + k * 0.04, plinth + h * 0.45, cz, 0.01, 0.12, 'z+', C.wood, rotY);   // 格子
  }
  return plinth + h;
}

/** 低い柵（籬）で囲む。front 側に出入口 */
function wattleFence(B, size, h = 0.14) {
  const half = size / 2, step = 0.11;
  for (const [ax, az, bx, bz] of [[-half, -half, half, -half], [-half, -half, -half, half], [half, -half, half, half]]) {
    const n = Math.round(size / step);
    for (let i = 0; i <= n; i++) B.box(ax + (bx - ax) * (i / n), 0, az + (bz - az) * (i / n), 0.02, h, 0.02, C.woodDark);
    for (const y of [h * 0.45, h * 0.9]) B.tube([ax, y, az], [bx, y, bz], 0.008, 0.008, C.wood, 4);
  }
  for (const sx of [-1, 1]) { const n = 3; for (let i = 0; i <= n; i++) { const x = sx * (half - (half - 0.14) * (i / n)); B.box(x, 0, half, 0.02, h, 0.02, C.woodDark); } for (const y of [h * 0.45, h * 0.9]) B.tube([sx * half, y, half], [sx * 0.14, y, half], 0.008, 0.008, C.wood, 4); }
}

function courtyardWall(B, size, h, color, gateRoof = C.tileDark) {
  const t = 0.06, half = size / 2;
  B.chamferBox(0, 0, -half, size, h, t, color, { chamfer: 0.012 });
  B.chamferBox(-half, 0, 0, t, h, size, color, { chamfer: 0.012 });
  B.chamferBox(half, 0, 0, t, h, size, color, { chamfer: 0.012 });
  const gw = Math.min(0.3, size * 0.22), seg = half - gw / 2;
  B.chamferBox(-(gw / 2 + seg / 2), 0, half, seg, h, t, color, { chamfer: 0.012 });
  B.chamferBox(gw / 2 + seg / 2, 0, half, seg, h, t, color, { chamfer: 0.012 });
  for (const sx of [-1, 1]) B.box(sx * (gw / 2 + 0.03), 0, half, 0.05, h + 0.24, 0.05, C.wood);
  B.curvedRoof(0, h + 0.24, half, gw + 0.16, 0.18, 0.1, gateRoof, { overhang: 0.04, strips: 4, curve: 1.5 });
}

export function houseCommoner({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.earth, tint(variant));
  const thatch = shadeHex(C.thatch, [1, 0.95, 1.06][variant]);
  // 家は敷地（1マス）の一部だけを使い、残りは庭。隣と屋根がつながらないように小さめにする
  const ox = [-0.08, 0.06, 0][variant], oz = -0.1;
  if (level === 1) {
    const axis = variant === 1 ? 'z' : 'x';
    const sx = axis === 'x' ? 0.5 : 0.4, sz = axis === 'x' ? 0.4 : 0.5;
    const top = hall(B, ox, oz, sx, sz, 0.44, wall, { windows: 1 });
    B.curvedRoof(ox, top, oz, sx, sz, 0.22, thatch, { ridgeAxis: axis, overhang: 0.06, tileStripes: false, curve: 1.25, gableColor: wall, ridgeColor: C.thatchDark });
    wattleFence(B, 0.88);
    if (variant === 2) B.lathe(0.3, 0, 0.28, [[0.07, 0], [0.09, 0.07], [0.02, 0.18]], C.straw, 7);        // 藁積み
    if (variant === 0) B.lathe(0.3, 0, 0.26, [[0.05, 0], [0.06, 0.05], [0.04, 0.09]], 0xa0522d, 6);     // 甕
  } else if (level === 2) {
    const top = hall(B, ox, oz, 0.56, 0.42, 0.48, wall, { windows: 2 });
    B.curvedRoof(ox, top, oz, 0.56, 0.42, 0.24, variant === 2 ? C.thatchDark : thatch, { overhang: 0.06, tileStripes: false, curve: 1.3, gableColor: wall, ridgeColor: C.thatchDark });
    wattleFence(B, 0.9, 0.16);
    const sx2 = ox > 0 ? -0.3 : 0.3;
    hall(B, sx2, 0.26, 0.2, 0.24, 0.28, wall, { posts: false, door: false, windows: 0 }); B.curvedRoof(sx2, 0.33, 0.26, 0.2, 0.24, 0.12, C.thatchDark, { ridgeAxis: 'z', overhang: 0.04, strips: 4, tileStripes: false, gableColor: wall });
    if (variant === 2) B.lathe(-sx2, 0, 0.3, [[0.08, 0], [0.1, 0.08], [0.02, 0.2]], C.straw, 7);
    if (variant === 0) B.lathe(-sx2, 0, 0.3, [[0.05, 0], [0.06, 0.05], [0.04, 0.09]], 0xa0522d, 6);
  } else {
    const top = hall(B, ox, oz, 0.6, 0.44, 0.5, wall, { plinth: 0.06, windows: 2, postColor: C.woodDark });
    B.curvedRoof(ox, top, oz, 0.6, 0.44, 0.26, variant === 1 ? C.tileDark : C.tile, { overhang: 0.07, curve: 1.7, gableColor: wall });
    courtyardWall(B, 0.9, 0.18, C.earthDark);
    const sx2 = ox > 0 ? -0.31 : 0.31;
    hall(B, sx2, 0.26, 0.22, 0.26, 0.3, wall, { posts: false, windows: 0, door: false }); B.curvedRoof(sx2, 0.35, 0.26, 0.22, 0.26, 0.13, C.tile, { ridgeAxis: 'z', overhang: 0.04, strips: 4, gableColor: wall });
    if (variant === 2) B.lathe(-sx2, 0, 0.3, [[0.08, 0], [0.08, 0.16], [0.06, 0.2]], C.plaster, 8);      // 井戸
    if (variant === 1) B.lathe(-sx2, 0, 0.32, [[0.08, 0], [0.1, 0.07], [0.02, 0.2]], C.straw, 7);        // 藁積み
    if (variant === 0) B.lathe(-sx2, 0, 0.3, [[0.05, 0], [0.06, 0.05], [0.04, 0.09]], 0xa0522d, 6);
  }
  return B.build();
}

export function houseShi({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.plaster, tint(variant));
  const size = 1.86;
  courtyardWall(B, size, 0.32, C.earth);
  const hallW = 1.1, hallD = 0.66, hallH = 0.56 + level * 0.06;
  const plat = level >= 3 ? 0.2 : level === 2 ? 0.1 : 0.05;
  const top = hall(B, 0, -0.45, hallW, hallD, hallH, wall, { plinth: plat, windows: 2, postColor: C.lacquer });
  B.curvedRoof(0, top, -0.45, hallW, hallD, 0.34, variant === 2 ? C.tileDark : C.tile, { overhang: 0.12, curve: 1.7, gableColor: wall });
  if (level >= 2) for (const sx of [-1, 1]) {
    if (level === 2 && variant === 1 && sx === 1) continue;
    hall(B, sx * 0.62, 0.25, 0.38, 0.9, 0.44, wall, { windows: 0, door: false, rotY: sx * Math.PI / 2 });
    B.curvedRoof(sx * 0.62, 0.49, 0.25, 0.38, 0.9, 0.22, C.tile, { ridgeAxis: 'z', overhang: 0.08, strips: 5, gableColor: wall });
  }
  if (level >= 3) { hall(B, 0, 0.2, 0.66, 0.4, 0.42, wall, { windows: 1 }); B.curvedRoof(0, 0.47, 0.2, 0.66, 0.4, 0.2, C.tile, { overhang: 0.08, strips: 5, gableColor: wall }); }
  if (variant === 0) { B.tube([0.7, 0, 0.7], [0.72, 0.35, 0.68], 0.03, 0.02, C.trunk, 6); B.blob(0.72, 0.42, 0.68, 0.2, 0.18, 0x5f9a3c, 7, 4); }
  if (variant === 1) B.lathe(-0.62, 0, 0.55, [[0.09, 0], [0.09, 0.16], [0.06, 0.2]], C.plaster, 8);
  if (variant === 2) { hall(B, -0.62, 0.62, 0.3, 0.3, 0.3, C.earthDark, { posts: false, door: false, windows: 0 }); B.curvedRoof(-0.62, 0.35, 0.62, 0.3, 0.3, 0.14, C.thatchDark, { overhang: 0.05, strips: 4, tileStripes: false }); }
  return B.build();
}

export function houseNoble({ level = 1, variant = 0 }) {
  const B = createBuilder();
  const wall = shadeHex(C.plaster, tint(variant));
  const size = 2.86;
  courtyardWall(B, size, 0.38, C.earth);
  const platH = 0.3 + level * 0.15;
  B.chamferBox(0, 0, -0.5, 2.2, platH, 1.5, C.earth, { chamfer: 0.05 });
  if (level >= 3) B.chamferBox(0, platH, -0.5, 1.9, 0.18, 1.25, C.earthDark, { chamfer: 0.04 });
  const top = level >= 3 ? platH + 0.18 : platH;
  B.chamferBox(0, top, -0.5, 1.6, 0.7, 1.0, wall, { chamfer: 0.03 });
  for (let i = -3; i <= 3; i++) B.box(i * 0.24, top, 0.0, 0.06, 0.7, 0.06, C.lacquer);
  B.panel(0, top, 0.0, 0.28, 0.55, 'z+', DOOR);
  for (const sx of [-1, 1]) { B.panel(sx * 0.5, top + 0.3, 0.0, 0.16, 0.16, 'z+', WINDOW); for (let k = -1; k <= 1; k++) B.panel(sx * 0.5 + k * 0.05, top + 0.3, 0.0, 0.01, 0.16, 'z+', C.wood); }
  B.curvedHipRoof(0, top + 0.7, -0.5, 1.6, 1.0, 0.3, C.tile, { overhang: 0.14, curve: 1.6 });
  B.chamferBox(0, top + 0.98, -0.5, 1.0, 0.3, 0.6, wall, { chamfer: 0.02 });
  B.curvedHipRoof(0, top + 1.28, -0.5, 1.0, 0.6, 0.26, variant === 1 ? C.tileDark : C.tile, { overhang: 0.12, curve: 1.6 });
  for (let s = 0; s < 4; s++) B.chamferBox(0, s * (platH / 4), 0.3 + s * 0.08, 0.5, platH / 4, 0.1, C.earthDark, { chamfer: 0.01 });
  if (level >= 2) for (const sx of [-1, 1]) {
    B.chamferBox(sx * 1.15, 0, 0.1, 0.36, 0.42, 2.2, wall, { chamfer: 0.02 });
    for (let i = -4; i <= 4; i++) B.box(sx * 1.15 - sx * 0.18, 0, 0.1 + i * 0.26, 0.05, 0.42, 0.05, C.lacquer);
    B.curvedRoof(sx * 1.15, 0.42, 0.1, 0.36, 2.2, 0.2, C.tile, { ridgeAxis: 'z', overhang: 0.08, strips: 5, gableColor: wall });
  }
  if (level >= 3) for (const [sx, sz] of [[-1, 1], [1, 1]]) { B.chamferBox(sx * 1.2, 0, sz * 1.2, 0.36, 0.8, 0.36, wall, { chamfer: 0.02 }); B.curvedHipRoof(sx * 1.2, 0.8, sz * 1.2, 0.36, 0.36, 0.2, C.tileDark, { overhang: 0.06, strips: 4 }); }
  if (variant === 2) { B.tube([-1.0, 0, 1.0], [-1.02, 0.4, 0.98], 0.04, 0.03, C.trunk, 6); B.blob(-1.0, 0.45, 1.0, 0.28, 0.25, 0x3f6b3a, 8, 5); B.tube([1.0, 0, 0.9], [1.02, 0.35, 0.9], 0.035, 0.025, C.trunk, 6); B.blob(1.0, 0.4, 0.9, 0.22, 0.2, 0x5f9a3c, 8, 5); }
  if (variant === 0) B.slab(0, 0.02, 0.9, 0.5, 0.5, C.water);
  if (variant === 1) { B.chamferBox(0.9, 0, 0.9, 0.4, 0.5, 0.4, wall, { chamfer: 0.02 }); B.curvedHipRoof(0.9, 0.5, 0.9, 0.4, 0.4, 0.18, C.tileDark, { overhang: 0.06, strips: 4 }); }
  return B.build();
}
