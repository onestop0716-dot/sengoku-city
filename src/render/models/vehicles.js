// 牛・馬・車両の部品モデル。前が +z。乗り物の描画側で車輪を回し、脚を振り、進行方向に向ける。
// 根拠: 戦国の車は二輪で、轅（ながえ）に軛（くびき）をかけて牛馬につなぐ。一輪車は漢代以降なので出さない。
import { createBuilder } from './builder.js';
import { C } from './palette.js';

/** 牛の胴（脚・首・頭・角・尾）。脚は別部品。原点は胴の中心の地面投影 */
export function oxBody() {
  const B = createBuilder();
  const hide = 0x6b4a2a, dark = 0x5a3d22;
  B.lathe(0, 0.26, 0, [[0.0, -0.2], [0.11, -0.16], [0.13, 0.0], [0.12, 0.18], [0.0, 0.22]], hide, 8);   // 胴（前後に長い回転体を寝かせる代わりに縦の楕円を使わず、下で押しつぶす）
  B.chamferBox(0, 0.16, 0, 0.22, 0.24, 0.46, hide, { chamfer: 0.08 });                                   // 胴
  B.tube([0, 0.32, 0.2], [0, 0.36, 0.34], 0.07, 0.06, hide, 7);                                           // 首
  B.chamferBox(0, 0.3, 0.4, 0.12, 0.12, 0.16, dark, { chamfer: 0.04 });                                   // 頭
  B.chamferBox(0, 0.28, 0.5, 0.09, 0.07, 0.06, 0x4a3018, { chamfer: 0.02 });                              // 鼻づら
  for (const s of [-1, 1]) B.tube([s * 0.05, 0.38, 0.4], [s * 0.13, 0.44, 0.38], 0.014, 0.004, 0xd8d0b8, 5);   // 角
  for (const s of [-1, 1]) B.tube([s * 0.06, 0.36, 0.38], [s * 0.1, 0.35, 0.36], 0.012, 0.01, dark, 4);    // 耳
  B.tube([0, 0.3, -0.22], [0, 0.12, -0.26], 0.012, 0.008, dark, 4);                                        // 尾
  B.lathe(0, 0.08, -0.27, [[0.02, 0], [0.025, 0.04], [0.0, 0.06]], 0x2a1e12, 5);
  return B.build();
}

/** 牛の脚。付け根（肩/腰）が原点、下向き */
export function oxLeg() {
  const B = createBuilder();
  B.lathe(0, -0.2, 0, [[0.03, 0], [0.032, 0.1], [0.04, 0.2]], 0x5a3d22, 6);
  B.lathe(0, -0.2, 0, [[0.035, 0], [0.033, 0.03]], 0x2a1e12, 6);   // 蹄
  return B.build();
}

/** 馬の胴（首・頭・たてがみ・尾）。脚は別部品 */
export function horseBody() {
  const B = createBuilder();
  const coat = 0x7a4a2a, dark = 0x5a3020;
  B.chamferBox(0, 0.2, 0, 0.18, 0.22, 0.5, coat, { chamfer: 0.07 });                                     // 胴
  B.tube([0, 0.34, 0.2], [0, 0.56, 0.36], 0.065, 0.045, coat, 7);                                         // 首（上へ）
  B.chamferBox(0, 0.54, 0.44, 0.09, 0.1, 0.2, coat, { chamfer: 0.03 });                                   // 頭
  B.chamferBox(0, 0.51, 0.55, 0.07, 0.07, 0.06, dark, { chamfer: 0.02 });                                 // 鼻
  for (const s of [-1, 1]) B.tube([s * 0.03, 0.6, 0.4], [s * 0.05, 0.67, 0.38], 0.01, 0.003, coat, 4);    // 耳
  for (let i = 0; i < 5; i++) B.box(0, 0.5 + i * 0.03, 0.23 + i * 0.035, 0.03, 0.06, 0.03, 0x2a1e12);    // たてがみ
  B.tube([0, 0.3, -0.24], [0, 0.06, -0.3], 0.02, 0.01, 0x2a1e12, 5);                                      // 尾
  B.box(0, 0.31, 0, 0.2, 0.02, 0.2, 0x8b1a1a);                                                            // 鞍代わりの敷物（鐙はない）
  return B.build();
}
export function horseLeg() {
  const B = createBuilder();
  B.lathe(0, -0.24, 0, [[0.024, 0], [0.026, 0.12], [0.034, 0.24]], 0x5a3020, 6);
  B.lathe(0, -0.24, 0, [[0.028, 0], [0.026, 0.025]], 0x2a1e12, 6);
  return B.build();
}

/** 車輪（輻のある木の輪）。中心が原点、車軸は x 軸 */
export function wheel({ r = 0.2 } = {}) {
  const B = createBuilder();
  const seg = 12;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const p = (a, rr, dx) => [dx, rr * Math.sin(a), rr * Math.cos(a)];
    B.quadN(p(a0, r, -0.014), p(a1, r, -0.014), p(a1, r, 0.014), p(a0, r, 0.014), [0, Math.sin(a0), Math.cos(a0)], [0, Math.sin(a1), Math.cos(a1)], [0, Math.sin(a1), Math.cos(a1)], [0, Math.sin(a0), Math.cos(a0)], C.woodDark);
    B.quadN(p(a0, r * 0.86, 0.014), p(a1, r * 0.86, 0.014), p(a1, r, 0.014), p(a0, r, 0.014), [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], C.woodDark);
    B.quadN(p(a1, r * 0.86, -0.014), p(a0, r * 0.86, -0.014), p(a0, r, -0.014), p(a1, r, -0.014), [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], C.woodDark);
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI; B.tube([0, -r * 0.85 * Math.sin(a), -r * 0.85 * Math.cos(a)], [0, r * 0.85 * Math.sin(a), r * 0.85 * Math.cos(a)], 0.01, 0.01, C.wood, 4); }   // 輻
  B.lathe(0, 0, 0, [[0.03, 0], [0.03, 0.06]], C.woodDark, 6);   // 轂（こしき）。回転体は y 軸なので描画側で倒す代わりに小さく
  return B.build();
}

/** 車体。車軸の位置が原点。kind: oxcart（荷を積む二輪の大車）/ handcart（人が引く小車）/ carriage（蓋つきの乗用車） */
export function cartBody({ kind = 'oxcart' }) {
  const B = createBuilder();
  if (kind === 'oxcart') {
    B.box(0, 0.2, 0, 0.5, 0.03, 0.03, C.woodDark);                                                       // 車軸
    B.chamferBox(0, 0.23, 0.02, 0.44, 0.04, 0.64, C.wood, { chamfer: 0.01 });                             // 荷台
    for (const s of [-1, 1]) { for (let i = 0; i < 5; i++) B.box(s * 0.21, 0.27, -0.28 + i * 0.14, 0.02, 0.16, 0.02, C.woodDark); B.box(s * 0.21, 0.41, 0.02, 0.02, 0.02, 0.6, C.wood); }   // 側の欄
    B.box(0, 0.27, -0.3, 0.42, 0.14, 0.02, C.wood);                                                       // 後ろ板
    for (const s of [-1, 1]) B.tube([s * 0.14, 0.24, 0.3], [s * 0.1, 0.3, 1.0], 0.016, 0.012, C.wood, 5);   // 轅（2本）
    B.box(0, 0.3, 0.98, 0.34, 0.03, 0.03, C.woodDark);                                                    // 軛（牛の首にかける）
    B.lathe(0, 0.27, -0.02, [[0.16, 0], [0.19, 0.12], [0.14, 0.24], [0.04, 0.3]], C.straw, 7);            // 荷（束）
    B.lathe(0.08, 0.39, 0.1, [[0.05, 0], [0.06, 0.06], [0.0, 0.1]], C.straw, 6);
  } else if (kind === 'handcart') {
    B.box(0, 0.17, 0, 0.42, 0.025, 0.025, C.woodDark);
    B.chamferBox(0, 0.19, 0.0, 0.36, 0.035, 0.5, C.wood, { chamfer: 0.01 });
    for (const s of [-1, 1]) B.box(s * 0.17, 0.22, 0, 0.02, 0.1, 0.48, C.wood);
    for (const s of [-1, 1]) B.tube([s * 0.14, 0.2, 0.24], [s * 0.12, 0.3, 0.75], 0.014, 0.012, C.wood, 5);   // 引き手
    B.lathe(0, 0.22, -0.05, [[0.1, 0], [0.12, 0.1], [0.06, 0.2]], 0xa0522d, 6);                              // 甕
    B.chamferBox(0.08, 0.22, 0.12, 0.12, 0.1, 0.12, C.straw, { chamfer: 0.02 });
  } else {                                                                                                  // carriage: 蓋（傘状の覆い）つきの二輪車
    B.box(0, 0.24, 0, 0.5, 0.03, 0.03, C.woodDark);
    B.chamferBox(0, 0.27, 0, 0.42, 0.04, 0.5, C.woodDark, { chamfer: 0.01 });
    B.chamferBox(0, 0.31, -0.05, 0.4, 0.28, 0.4, 0x8b1a1a, { chamfer: 0.03 });                                  // 輿（車箱）漆塗り
    for (const s of [-1, 1]) B.box(s * 0.19, 0.31, -0.05, 0.02, 0.3, 0.02, C.woodDark);
    B.tube([0, 0.31, -0.05], [0, 0.78, -0.05], 0.014, 0.01, C.wood, 6);                                        // 蓋の柄
    B.lathe(0, 0.72, -0.05, [[0.0, 0], [0.3, 0.02], [0.28, 0.05], [0.0, 0.1]], 0x2a1e12, 10);                  // 蓋（傘）
    B.tube([0, 0.3, 0.2], [0, 0.42, 0.95], 0.02, 0.014, C.wood, 6);                                             // 轅（1本、中央）
    B.box(0, 0.42, 0.9, 0.36, 0.03, 0.03, C.woodDark);                                                          // 衡（横木）
  }
  return B.build();
}

/** 舟（平底の川舟）。中心が原点、前が +z */
export function boat() {
  const B = createBuilder();
  const hull = [[0.0, 0.0], [0.22, 0.05], [0.26, 0.16], [0.24, 0.2]];
  B.lathe(0, 0, 0, hull, C.woodDark, 8);
  B.chamferBox(0, 0.05, 0, 0.42, 0.14, 1.3, C.wood, { chamfer: 0.06 });
  B.chamferBox(0, 0.16, 0, 0.34, 0.04, 1.2, C.woodDark, { chamfer: 0.01 });
  B.chamferBox(0, 0.05, 0.55, 0.3, 0.26, 0.3, C.wood, { chamfer: 0.08 }); B.chamferBox(0, 0.05, -0.55, 0.3, 0.26, 0.3, C.wood, { chamfer: 0.08 });
  B.lathe(0, 0.18, -0.1, [[0.14, 0], [0.16, 0.12], [0.08, 0.22]], C.straw, 6);
  B.tube([0.1, 0.2, 0.35], [0.1, 0.7, 0.3], 0.012, 0.01, C.wood, 5); B.box(0.1, 0.62, 0.3, 0.02, 0.02, 0.6, C.wood);   // 棹
  return B.build();
}

export const VEHICLE_PARTS = { oxBody, oxLeg, horseBody, horseLeg, wheel, cartBody, boat };
