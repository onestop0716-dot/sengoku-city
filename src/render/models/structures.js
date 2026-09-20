// 特殊建築のコード生成モデル。kind ごとに形を作る。足元 y=0、中心 (0,0)、足跡は size×size。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const DOOR = 0x3a2a1c;

function hallOn(B, cx, cz, sx, sz, h, wall, roofColor, { plinth = 0.08, hip = false, posts = true, curve = 1.6, double_ = false } = {}) {
  B.chamferBox(cx, 0, cz, sx + 0.16, plinth, sz + 0.16, C.earthDark, { chamfer: 0.03 });
  B.chamferBox(cx, plinth, cz, sx, h, sz, wall, { chamfer: 0.03 });
  if (posts) { const n = Math.max(2, Math.round(sx / 0.3)); for (let i = 0; i <= n; i++) B.box(cx - sx / 2 + (sx * i) / n, plinth, cz + sz / 2, 0.05, h, 0.05, C.lacquer); }
  B.panel(cx, plinth, cz + sz / 2, Math.min(0.3, sx * 0.25), h * 0.7, 'z+', DOOR);
  if (hip) {
    B.curvedHipRoof(cx, plinth + h, cz, sx, sz, 0.3 + h * 0.15, roofColor, { overhang: 0.14, curve });
    if (double_) { B.chamferBox(cx, plinth + h + 0.28 + h * 0.15, cz, sx * 0.6, 0.28, sz * 0.6, wall, { chamfer: 0.02 }); B.curvedHipRoof(cx, plinth + h + 0.56 + h * 0.15, cz, sx * 0.6, sz * 0.6, 0.24, roofColor, { overhang: 0.1, curve }); }
  } else B.curvedRoof(cx, plinth + h, cz, sx, sz, 0.3 + h * 0.2, roofColor, { overhang: 0.14, curve, gableColor: wall });
  return plinth + h;
}

function compoundWall(B, size, h, color, gateSide = 1) {
  const t = 0.08, half = size / 2;
  B.chamferBox(0, 0, -half, size, h, t, color, { chamfer: 0.02 });
  B.chamferBox(-half, 0, 0, t, h, size, color, { chamfer: 0.02 });
  B.chamferBox(half, 0, 0, t, h, size, color, { chamfer: 0.02 });
  const gw = 0.5, seg = half - gw / 2;
  B.chamferBox(-(gw / 2 + seg / 2), 0, half * gateSide, seg, h, t, color, { chamfer: 0.02 });
  B.chamferBox(gw / 2 + seg / 2, 0, half * gateSide, seg, h, t, color, { chamfer: 0.02 });
  for (const sx of [-1, 1]) B.box(sx * (gw / 2 + 0.04), 0, half * gateSide, 0.08, h + 0.25, 0.08, C.wood);
  B.curvedRoof(0, h + 0.25, half * gateSide, gw + 0.3, 0.24, 0.16, C.tileDark, { overhang: 0.06, strips: 4 });
}

export function structure({ kind = 'well' }) {
  const B = createBuilder();
  switch (kind) {
    case 'yamen': {                       // 県廷: 塀に囲まれた院落。正面に門、奥に堂
      compoundWall(B, 2.9, 0.4, C.earth);
      hallOn(B, 0, -0.55, 1.9, 1.0, 0.7, C.plaster, C.tile, { plinth: 0.14, hip: true });
      for (const sx of [-1, 1]) { B.chamferBox(sx * 1.05, 0, 0.35, 0.5, 0.45, 1.3, C.plaster, { chamfer: 0.02 }); B.curvedRoof(sx * 1.05, 0.45, 0.35, 0.5, 1.3, 0.22, C.tile, { ridgeAxis: 'z', overhang: 0.08, strips: 5, gableColor: C.plaster }); }
      B.box(0, 0, 0.55, 0.05, 1.4, 0.05, C.wood); B.box(0.12, 1.15, 0.55, 0.22, 0.16, 0.02, C.lacquer);   // 旗
      break;
    }
    case 'well': {
      B.lathe(0, 0, 0, [[0.28, 0], [0.3, 0.12], [0.26, 0.3], [0.2, 0.32], [0.2, 0.05]], C.plaster, 10);
      for (const sx of [-1, 1]) B.box(sx * 0.22, 0, 0, 0.05, 0.7, 0.05, C.wood);
      B.box(0, 0.68, 0, 0.55, 0.05, 0.05, C.woodDark);
      B.cylinder(0, 0.6, 0, 0.05, 0.08, C.woodDark, 6);
      B.slab(0, 0.005, 0, 0.9, 0.9, C.earthDark);
      break;
    }
    case 'canal': {
      B.chamferBox(0, 0, 0, 1.02, 0.06, 0.34, C.soilWet, { chamfer: 0.01 });
      B.slab(0, 0.045, 0, 1.02, 0.22, C.water);
      B.chamferBox(0, 0, -0.3, 1.02, 0.1, 0.16, C.earthDark, { chamfer: 0.02 }); B.chamferBox(0, 0, 0.3, 1.02, 0.1, 0.16, C.earthDark, { chamfer: 0.02 });
      break;
    }
    case 'levee': {
      B.lathe(0, 0, 0, [[0.52, 0], [0.42, 0.18], [0.22, 0.3], [0.0, 0.34]], C.earthDark, 8);
      B.chamferBox(0, 0, 0, 1.02, 0.28, 0.55, C.earthDark, { chamfer: 0.08 });
      break;
    }
    case 'bridge': {
      B.chamferBox(0, 0.3, 0, 1.02, 0.06, 0.8, C.wood, { chamfer: 0.01 });
      for (const sx of [-0.3, 0.3]) for (const sz of [-0.32, 0.32]) B.cylinder(sx, -0.3, sz, 0.04, 0.62, C.woodDark, 6);
      for (const sz of [-0.38, 0.38]) { B.box(0, 0.36, sz, 1.02, 0.14, 0.03, C.woodDark); }
      break;
    }
    case 'granary': {                     // 高床の倉。寄棟
      for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5], [0, -0.5], [0, 0.5]]) B.cylinder(x, 0, z, 0.06, 0.35, C.woodDark, 6);
      B.chamferBox(0, 0.35, 0, 1.6, 0.8, 1.3, C.earth, { chamfer: 0.04 });
      B.panel(0, 0.4, 0.65, 0.4, 0.5, 'z+', DOOR);
      B.curvedHipRoof(0, 1.15, 0, 1.6, 1.3, 0.45, C.thatch, { overhang: 0.18, strips: 5 });
      B.box(0, 0.1, 0.9, 0.5, 0.25, 0.3, C.wood);   // 階段
      break;
    }
    case 'market_hall': {                 // 市亭: 二層の楼
      B.chamferBox(0, 0, 0, 1.7, 0.15, 1.7, C.earthDark, { chamfer: 0.03 });
      B.chamferBox(0, 0.15, 0, 1.4, 0.7, 1.4, C.plaster, { chamfer: 0.03 });
      for (let i = -2; i <= 2; i++) { B.box(i * 0.32, 0.15, 0.7, 0.06, 0.7, 0.06, C.lacquer); B.box(0.7, 0.15, i * 0.32, 0.06, 0.7, 0.06, C.lacquer); }
      B.panel(0, 0.15, 0.7, 0.36, 0.5, 'z+', DOOR);
      B.curvedHipRoof(0, 0.85, 0, 1.4, 1.4, 0.24, C.tile, { overhang: 0.14 });
      B.chamferBox(0, 1.05, 0, 0.9, 0.55, 0.9, C.plaster, { chamfer: 0.02 });
      B.curvedHipRoof(0, 1.6, 0, 0.9, 0.9, 0.3, C.tile, { overhang: 0.14 });
      B.box(0, 1.6, 0, 0.04, 0.9, 0.04, C.wood); B.box(0.1, 2.3, 0, 0.2, 0.14, 0.02, C.lacquer);
      break;
    }
    case 'wall': {                        // 版築の城壁 1 マス分（隣とつながる）
      B.chamferBox(0, 0, 0, 1.02, 1.6, 0.8, C.earth, { chamfer: 0.04, topColor: shadeHex(C.earth, 0.9) });
      for (const sz of [-0.3, 0.3]) for (let k = -1; k <= 1; k++) B.box(k * 0.34, 1.6, sz, 0.2, 0.24, 0.12, C.earthDark);
      break;
    }
    case 'gate': {                        // 城門: 門洞と上の楼
      B.chamferBox(0, 0, 0, 1.02, 1.7, 0.9, C.earth, { chamfer: 0.04 });
      B.box(0, 0.02, 0, 0.55, 1.1, 0.94, DOOR);   // 門洞（暗い開口）
      B.box(0, 0, 0, 0.5, 0.02, 0.96, C.earthDark);
      B.chamferBox(0, 1.7, 0, 0.9, 0.5, 0.7, C.plaster, { chamfer: 0.02 });
      for (let i = -1; i <= 1; i++) B.box(i * 0.3, 1.7, 0.35, 0.05, 0.5, 0.05, C.lacquer);
      B.curvedRoof(0, 2.2, 0, 0.9, 0.7, 0.3, C.tile, { overhang: 0.12, gableColor: C.plaster });
      break;
    }
    case 'watchtower': {
      B.chamferBox(0, 0, 0, 0.8, 0.5, 0.8, C.earth, { chamfer: 0.04 });
      B.lathe(0, 0.5, 0, [[0.36, 0], [0.3, 1.2]], C.earthDark, 4);
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) B.box(x, 0.5, z, 0.06, 1.4, 0.06, C.wood);
      B.chamferBox(0, 1.75, 0, 0.8, 0.35, 0.8, C.plaster, { chamfer: 0.02 });
      B.curvedHipRoof(0, 2.1, 0, 0.8, 0.8, 0.28, C.tileDark, { overhang: 0.14 });
      break;
    }
    case 'armory': {
      B.chamferBox(0, 0, 0, 1.8, 0.12, 1.7, C.earthDark, { chamfer: 0.03 });
      B.chamferBox(0, 0.12, 0, 1.6, 0.75, 1.3, C.earth, { chamfer: 0.03 });
      B.panel(0, 0.12, 0.65, 0.5, 0.55, 'z+', DOOR);
      B.curvedRoof(0, 0.87, 0, 1.6, 1.3, 0.42, C.tileDark, { overhang: 0.14, gableColor: C.earth });
      for (const sx of [-0.6, 0.6]) B.box(sx, 0, 0.8, 0.05, 1.3, 0.05, C.wood);
      break;
    }
    case 'drill_ground': {
      B.slab(0, 0.01, 0, 3.8, 3.8, C.earthDark);
      for (let i = -1; i <= 1; i++) { B.box(i * 1.1, 0, -1.5, 0.08, 0.9, 0.08, C.wood); B.box(i * 1.1, 0.5, -1.5, 0.5, 0.5, 0.05, C.straw); }   // 的
      for (const sx of [-1.6, 1.6]) { B.box(sx, 0, 1.4, 0.05, 1.6, 0.05, C.wood); B.box(sx + 0.15, 1.25, 1.4, 0.3, 0.22, 0.02, C.lacquer); }
      B.chamferBox(0, 0, 1.5, 1.2, 0.35, 0.6, C.earth, { chamfer: 0.03 }); B.curvedRoof(0, 0.35, 1.5, 1.2, 0.6, 0.2, C.thatch, { overhang: 0.08, tileStripes: false, gableColor: C.earth });
      break;
    }
    case 'ancestral_temple': {
      compoundWall(B, 2.9, 0.4, C.earth);
      B.chamferBox(0, 0, -0.3, 2.4, 0.4, 1.8, C.earth, { chamfer: 0.05 });
      hallOn(B, 0, -0.4, 1.8, 1.0, 0.8, C.plaster, C.tileDark, { plinth: 0.4, hip: true, double_: true });
      for (let s = 0; s < 4; s++) B.chamferBox(0, s * 0.1, 0.65 + s * 0.1, 0.6, 0.1, 0.1, C.earthDark, { chamfer: 0.01 });
      break;
    }
    case 'altar': {                       // 方形の段
      B.chamferBox(0, 0, 0, 1.8, 0.2, 1.8, C.earth, { chamfer: 0.03 });
      B.chamferBox(0, 0.2, 0, 1.3, 0.2, 1.3, C.earthDark, { chamfer: 0.03 });
      B.chamferBox(0, 0.4, 0, 0.8, 0.2, 0.8, C.earth, { chamfer: 0.03 });
      B.lathe(0, 0.6, 0, [[0.12, 0], [0.1, 0.18], [0.16, 0.3]], C.wood, 8);
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { B.cylinder(x, 0, z, 0.035, 0.4, C.trunk, 6); B.blob(x, 0.45, z, 0.22, 0.2, 0x5f9a3c, 7, 4); }
      break;
    }
    case 'academy': {
      compoundWall(B, 2.9, 0.36, C.earth);
      hallOn(B, 0, -0.55, 1.9, 0.9, 0.65, C.plaster, C.tile, { plinth: 0.12 });
      for (const sx of [-1, 1]) { B.chamferBox(sx * 1.05, 0, 0.3, 0.5, 0.42, 1.4, C.plaster, { chamfer: 0.02 }); B.curvedRoof(sx * 1.05, 0.42, 0.3, 0.5, 1.4, 0.2, C.tile, { ridgeAxis: 'z', overhang: 0.08, strips: 5, gableColor: C.plaster }); }
      B.cylinder(0, 0, 0.6, 0.04, 0.45, C.trunk, 6); B.blob(0, 0.5, 0.6, 0.3, 0.26, 0x6a9d45, 8, 5);
      break;
    }
    case 'palace': {                      // 台榭: 二段の高台に重層の堂
      compoundWall(B, 4.9, 0.5, C.earth);
      B.chamferBox(0, 0, -0.4, 4.0, 0.6, 3.0, C.earth, { chamfer: 0.06 });
      B.chamferBox(0, 0.6, -0.4, 3.2, 0.5, 2.3, C.earthDark, { chamfer: 0.05 });
      hallOn(B, 0, -0.5, 2.4, 1.3, 0.9, C.plaster, C.tileDark, { plinth: 1.1, hip: true, double_: true });
      for (const sx of [-1, 1]) { B.chamferBox(sx * 1.7, 0.6, -0.4, 0.5, 0.6, 1.6, C.plaster, { chamfer: 0.02 }); B.curvedHipRoof(sx * 1.7, 1.2, -0.4, 0.5, 1.6, 0.22, C.tile, { overhang: 0.08 }); }
      for (let s = 0; s < 6; s++) B.chamferBox(0, s * 0.18, 1.15 + s * 0.12, 0.9, 0.18, 0.14, C.earthDark, { chamfer: 0.01 });
      for (const [x, z] of [[-2.0, 2.0], [2.0, 2.0]]) { B.chamferBox(x, 0, z, 0.5, 0.9, 0.5, C.plaster, { chamfer: 0.02 }); B.curvedHipRoof(x, 0.9, z, 0.5, 0.5, 0.22, C.tileDark, { overhang: 0.07, strips: 4 }); }
      break;
    }
    case 'customs': {                     // 関所: 道をまたぐ門と柵
      for (const sx of [-1, 1]) B.box(sx * 0.4, 0, 0, 0.1, 1.1, 0.1, C.wood);
      B.box(0, 1.0, 0, 1.0, 0.08, 0.1, C.woodDark);
      B.curvedRoof(0, 1.08, 0, 1.0, 0.3, 0.16, C.tileDark, { overhang: 0.05, strips: 4 });
      B.box(0, 0, 0, 0.9, 0.5, 0.04, C.wood);     // 閂
      for (const sz of [-0.42, 0.42]) B.chamferBox(0, 0, sz, 0.35, 0.5, 0.12, C.earth, { chamfer: 0.02 });
      break;
    }
    case 'beacon': {
      B.lathe(0, 0, 0, [[0.42, 0], [0.34, 0.9], [0.3, 1.5]], C.earthDark, 6);
      B.lathe(0, 1.5, 0, [[0.34, 0], [0.34, 0.15], [0.2, 0.15]], C.earth, 6);
      B.lathe(0, 1.62, 0, [[0.12, 0], [0.16, 0.12], [0.06, 0.32]], 0xd85a1a, 6);   // 火
      break;
    }
    case 'post_station': {
      B.chamferBox(0, 0, -0.35, 1.6, 0.1, 0.9, C.earthDark, { chamfer: 0.03 });
      B.chamferBox(0, 0.1, -0.35, 1.4, 0.55, 0.7, C.earth, { chamfer: 0.03 });
      B.panel(0, 0.1, 0.0, 0.3, 0.4, 'z+', DOOR);
      B.curvedRoof(0, 0.65, -0.35, 1.4, 0.7, 0.3, C.tile, { overhang: 0.12, gableColor: C.earth });
      B.chamferBox(0, 0, 0.55, 1.4, 0.35, 0.5, C.wood, { chamfer: 0.02 }); B.curvedRoof(0, 0.35, 0.55, 1.4, 0.5, 0.16, C.thatchDark, { overhang: 0.06, tileStripes: false, gableColor: C.wood });   // 厩
      B.box(0.75, 0, 0.75, 0.05, 1.1, 0.05, C.wood); B.box(0.88, 0.9, 0.75, 0.24, 0.16, 0.02, C.lacquer);
      break;
    }
    case 'prison': {
      compoundWall(B, 1.9, 0.6, C.earthDark);
      B.chamferBox(0, 0, -0.2, 1.2, 0.5, 0.8, C.earth, { chamfer: 0.02 });
      B.curvedRoof(0, 0.5, -0.2, 1.2, 0.8, 0.22, C.tileDark, { overhang: 0.08, gableColor: C.earth });
      for (let i = -2; i <= 2; i++) B.box(i * 0.2, 0.5, 0.2, 0.03, 0.3, 0.03, C.woodDark);
      break;
    }
    case 'dock': {                        // 桟橋と小屋
      B.chamferBox(0, 0, 0, 1.8, 0.14, 1.8, C.earthDark, { chamfer: 0.03 });
      B.chamferBox(-0.5, 0.14, -0.4, 0.8, 0.45, 0.7, C.wood, { chamfer: 0.02 });
      B.curvedRoof(-0.5, 0.59, -0.4, 0.8, 0.7, 0.2, C.thatch, { overhang: 0.08, tileStripes: false, gableColor: C.wood });
      B.chamferBox(0.4, 0.14, 0.5, 1.0, 0.06, 0.5, C.woodDark, { chamfer: 0.01 });
      for (const x of [0.0, 0.4, 0.8]) B.cylinder(x, -0.2, 0.75, 0.04, 0.5, C.woodDark, 6);
      B.lathe(0.5, 0.2, -0.2, [[0.2, 0], [0.22, 0.25], [0.18, 0.5]], C.straw, 6);   // 荷
      break;
    }
    default:
      B.chamferBox(0, 0, 0, 0.8, 0.6, 0.8, C.earth, { chamfer: 0.03 });
  }
  return B.build();
}
