// 住民の部品モデル（頭・胴・腕・手・脚・持ち物）。各部品は関節を原点にして作り、描画側で回転させる。
// 服装の根拠: 庶民は短い上衣（短衣）と袴、士・卿大夫は深衣、髪は髷（頭巾・冠）。鐙・椅子などは登場しない。
// 布の部分は白（1,1,1）で作り、描画時にインスタンス色を掛けて服の色を変える。肌の部品は肌色で作り、インスタンス色で肌の濃さを変える。
import { createBuilder } from './builder.js';
import { C } from './palette.js';

const WHITE = [1, 1, 1];
const SKIN = [1, 1, 1];             // 肌の濃さもインスタンス色で決める
const HAIR = 0x1e1510;
const DARK = 0x2a2018;

/** 頭: 首の付け根が原点。variant: bun=髷, cap=頭巾, crown=冠(士), tall_crown=冠(卿大夫), helmet=兵の冠, female=髻と簪 */
export function head({ variant = 'bun' }) {
  const B = createBuilder();
  B.lathe(0, 0, 0, [[0.028, 0], [0.03, 0.04]], SKIN, 7);                                // 首
  B.lathe(0, 0.03, 0, [[0.03, 0], [0.062, 0.03], [0.07, 0.08], [0.064, 0.13], [0.04, 0.165], [0.0, 0.175]], SKIN, 9);   // 頭
  B.lathe(0, 0.09, -0.03, [[0.0, 0], [0.008, 0.002], [0.0, 0.004]], DARK, 4);                // 目の位置（極小）
  switch (variant) {
    case 'bun':                                                                            // 髷（頭頂で結う）
      B.lathe(0, 0.12, -0.015, [[0.055, 0], [0.06, 0.03], [0.045, 0.055], [0.0, 0.06]], HAIR, 9);
      B.lathe(0, 0.17, -0.02, [[0.018, 0], [0.024, 0.03], [0.012, 0.05], [0.0, 0.055]], HAIR, 6);
      break;
    case 'cap':                                                                            // 頭巾（布で包む）
      B.lathe(0, 0.11, 0, [[0.064, 0], [0.07, 0.035], [0.05, 0.07], [0.02, 0.085], [0.0, 0.088]], WHITE, 9);
      B.box(0, 0.1, 0, 0.15, 0.025, 0.15, WHITE);
      break;
    case 'crown':                                                                          // 冠（士）: 小さな冠と簪
      B.lathe(0, 0.12, -0.015, [[0.055, 0], [0.06, 0.03], [0.045, 0.05], [0.0, 0.055]], HAIR, 9);
      B.chamferBox(0, 0.165, -0.01, 0.07, 0.045, 0.09, DARK, { chamfer: 0.01 });
      B.box(0, 0.185, -0.01, 0.13, 0.008, 0.008, 0xd8c070);
      break;
    case 'tall_crown':                                                                     // 冠（卿大夫）: 高い冠
      B.lathe(0, 0.12, -0.015, [[0.055, 0], [0.06, 0.03], [0.045, 0.05], [0.0, 0.055]], HAIR, 9);
      B.chamferBox(0, 0.165, -0.01, 0.08, 0.08, 0.1, DARK, { chamfer: 0.012 });
      B.box(0, 0.24, -0.01, 0.12, 0.01, 0.06, 0xd8c070);
      B.box(0, 0.2, -0.01, 0.15, 0.008, 0.008, 0xd8c070);
      break;
    case 'helmet':                                                                         // 兵: 革の冠
      B.lathe(0, 0.11, 0, [[0.066, 0], [0.072, 0.03], [0.055, 0.07], [0.02, 0.09], [0.0, 0.092]], 0x6b4a2a, 9);
      B.box(0, 0.1, 0, 0.16, 0.02, 0.16, 0x5a3d22);
      break;
    case 'female':                                                                         // 髻（後ろで結う）と簪
      B.lathe(0, 0.12, -0.015, [[0.06, 0], [0.065, 0.03], [0.05, 0.05], [0.0, 0.058]], HAIR, 9);
      B.blob(0, 0.13, -0.075, 0.035, 0.035, HAIR, 7, 4);
      B.box(0.04, 0.155, -0.06, 0.09, 0.006, 0.006, 0xd8c070);
      break;
  }
  return B.build();
}

/** 胴: 腰が原点。short=短衣+帯, robe=深衣（足元まで）, wide_robe=袖広の深衣（袖は腕側）, armor=短衣+革甲 */
export function torso({ variant = 'short' }) {
  const B = createBuilder();
  const belt = variant === 'armor' ? 0x3a2a1a : DARK;
  if (variant === 'short' || variant === 'armor') {
    B.lathe(0, 0, 0, [[0.11, 0], [0.13, 0.04], [0.125, 0.2], [0.14, 0.3], [0.1, 0.36], [0.04, 0.38]], WHITE, 9);   // 上衣
    B.lathe(0, 0.06, 0, [[0.132, 0], [0.132, 0.035]], belt, 9);                                                  // 帯
    B.lathe(0, -0.06, 0, [[0.12, 0], [0.115, 0.06]], WHITE, 9);                                                  // 上衣の裾
    if (variant === 'armor') {
      B.lathe(0, 0.09, 0, [[0.14, 0], [0.145, 0.06], [0.145, 0.12], [0.14, 0.18], [0.12, 0.26]], 0x5a3d22, 9);   // 革甲（札を重ねた胴）
      for (let r = 0; r < 4; r++) B.lathe(0, 0.09 + r * 0.045, 0, [[0.148, 0], [0.15, 0.012]], 0x3a2a1a, 9);
    }
  } else {
    B.lathe(0, -0.42, 0, [[0.17, 0], [0.15, 0.2], [0.125, 0.42], [0.125, 0.62], [0.14, 0.72], [0.1, 0.78], [0.04, 0.8]], WHITE, 10);   // 深衣（裾まで）
    B.lathe(0, 0.06, 0, [[0.128, 0], [0.128, 0.04]], belt, 10);                                                   // 帯
    B.lathe(0, -0.43, 0, [[0.175, 0], [0.175, 0.02]], DARK, 10);                                                  // 縁
    if (variant === 'wide_robe') B.box(0, 0.2, 0.128, 0.03, 0.3, 0.004, DARK);                                    // 襟の重ね
  }
  return B.build();
}

/** 腕: 肩が原点、下向き。narrow=細い袖, wide=広い袖（深衣） */
export function arm({ variant = 'narrow' }) {
  const B = createBuilder();
  if (variant === 'wide') B.lathe(0, -0.3, 0, [[0.09, 0], [0.075, 0.1], [0.05, 0.22], [0.045, 0.3]], WHITE, 8);
  else B.lathe(0, -0.3, 0, [[0.04, 0], [0.042, 0.15], [0.05, 0.3]], WHITE, 8);
  return B.build();
}

/** 手: 肩が原点（腕と同じ回転で動く） */
export function hand() {
  const B = createBuilder();
  B.lathe(0, -0.36, 0, [[0.02, 0], [0.03, 0.03], [0.028, 0.06]], SKIN, 6);
  return B.build();
}

/** 脚: 腰の付け根が原点、下向き。袴と履 */
export function leg() {
  const B = createBuilder();
  B.lathe(0, -0.42, 0, [[0.05, 0], [0.055, 0.2], [0.06, 0.42]], WHITE, 8);   // 袴
  B.lathe(0, -0.42, 0.02, [[0.04, 0], [0.05, 0.02], [0.045, 0.035]], DARK, 7);   // 履
  B.box(0, -0.415, 0.035, 0.07, 0.03, 0.09, DARK);
  return B.build();
}

/** 持ち物。origin は持つ関節（腕なら肩、背中なら腰） */
export function item({ kind = 'hoe' }) {
  const B = createBuilder();
  switch (kind) {
    case 'hoe':                                                       // 鍬（右手、腕の向きに沿って柄が伸びる）
      B.cylinder(0, -0.36, 0.3, 0.012, 0.0, C.wood, 5);
      B.box(0, -0.36, 0.05, 0.02, 0.02, 0.6, C.wood);
      B.box(0, -0.42, 0.34, 0.1, 0.12, 0.02, 0x5c5c5c);
      break;
    case 'pole':                                                      // 天秤棒（肩に担ぐ。腰が原点）
      B.box(0, 0.36, 0, 1.0, 0.025, 0.025, C.wood);
      for (const sx of [-0.45, 0.45]) { B.box(sx, 0.2, 0, 0.006, 0.32, 0.006, C.woodDark); B.lathe(sx, 0.02, 0, [[0.09, 0], [0.11, 0.08], [0.1, 0.16]], C.straw, 7); }
      break;
    case 'bundle':                                                    // 背負う荷（腰が原点、背中側）
      B.chamferBox(0, 0.12, -0.16, 0.22, 0.26, 0.14, 0xa08858, { chamfer: 0.03 });
      B.box(0, 0.2, -0.1, 0.24, 0.02, 0.02, C.woodDark);
      break;
    case 'ge':                                                        // 戈（右手、立てて持つ）
      B.box(0, 0.05, 0, 0.016, 1.15, 0.016, C.wood);
      B.box(0.06, 0.58, 0, 0.13, 0.026, 0.01, 0x8a8a8a);
      B.box(0, 0.63, 0, 0.018, 0.09, 0.01, 0x8a8a8a);
      break;
    case 'slips':                                                     // 竹簡（両手で持つ）
      for (let i = -3; i <= 3; i++) B.box(i * 0.014, -0.34, 0.1, 0.011, 0.14, 0.006, 0xd8c890);
      B.box(0, -0.3, 0.1, 0.11, 0.004, 0.004, DARK);
      break;
    case 'basket':                                                    // 籠（片手）
      B.lathe(0, -0.46, 0, [[0.06, 0], [0.08, 0.06], [0.075, 0.12]], C.straw, 7);
      B.box(0, -0.38, 0, 0.004, 0.09, 0.004, C.woodDark);
      break;
  }
  return B.build();
}

/** 身分・職業ごとの装い（頭・胴・腕・持ち物・服の色の候補） */
export const WARDROBE = {
  person_farmer:   { head: ['cap', 'bun'], torso: 'short', arm: 'narrow', items: ['hoe', 'pole', null], cloth: [0xc8b89a, 0xa89878, 0x8b7355, 0xb0a080], trousers: [0x6b5a44, 0x5a4a3a, 0x7a6a50], female: 0.3 },
  person_artisan:  { head: ['cap', 'bun'], torso: 'short', arm: 'narrow', items: ['bundle', 'basket', null], cloth: [0x8a8a80, 0x7a6a58, 0x9a8a70], trousers: [0x4a4a44, 0x5a4a3a], female: 0.2 },
  person_merchant: { head: ['cap', 'bun'], torso: 'robe', arm: 'narrow', items: ['basket', 'pole', null], cloth: [0x3a5f8a, 0x4a6b6a, 0x6b4a3a, 0x5a6a4a], trousers: [0x2a2a2a], female: 0.25 },
  person_shi:      { head: ['crown'], torso: 'robe', arm: 'wide', items: ['slips', null], cloth: [0xe8dcc0, 0xd8c8a8, 0xc8d0c0, 0xb8b8c8], trousers: [0x2a2a2a], female: 0.1 },
  person_official: { head: ['crown'], torso: 'robe', arm: 'wide', items: ['slips'], cloth: [0x3a3a4a, 0x2a3a3a], trousers: [0x2a2a2a], female: 0 },
  person_noble:    { head: ['tall_crown'], torso: 'wide_robe', arm: 'wide', items: [null], cloth: [0x7a1f2a, 0x4a2a6a, 0x2a2a2a, 0x8a3a2a], trousers: [0x2a2a2a], female: 0.2 },
  person_soldier:  { head: ['helmet'], torso: 'armor', arm: 'narrow', items: ['ge'], cloth: [0x7a5a3a, 0x8a4a3a, 0x6a5a4a], trousers: [0x4a3a2a], female: 0 },
};
export const SKIN_TONES = [0xf0d0b0, 0xe0be98, 0xd0ac88, 0xc09a78];
/** 人の基本の大きさ（1マス ≈ 4m、身長 ≈ 0.45 マス） */
export const PERSON_SCALE = 0.46;

const srgbLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexLin = (h) => [srgbLin(((h >> 16) & 255) / 255), srgbLin(((h >> 8) & 255) / 255), srgbLin((h & 255) / 255)];

/** 遠景用: 部品を静止ポーズで1つに組み立て、服の色を焼き込む */
export function personStatic({ kind = 'person_farmer', variant = 0 }) {
  const W = WARDROBE[kind] || WARDROBE.person_farmer;
  const cloth = hexLin(W.cloth[variant % W.cloth.length]), trousers = hexLin(W.trousers[variant % W.trousers.length]), skin = hexLin(SKIN_TONES[variant % SKIN_TONES.length]);
  const parts = [
    { m: torso({ variant: W.torso }), y: 0.42, tint: cloth },
    { m: head({ variant: W.head[variant % W.head.length] }), y: 0.8, tint: skin },
    { m: arm({ variant: W.arm }), y: 0.76, x: 0.15, tint: cloth }, { m: arm({ variant: W.arm }), y: 0.76, x: -0.15, tint: cloth },
    { m: hand(), y: 0.76, x: 0.15, tint: skin }, { m: hand(), y: 0.76, x: -0.15, tint: skin },
    { m: leg(), y: 0.42, x: 0.06, tint: trousers }, { m: leg(), y: 0.42, x: -0.06, tint: trousers },
  ];
  const pos = [], nor = [], col = [], tex = [];
  for (const p of parts) {
    for (let i = 0; i < p.m.vertexCount; i++) {
      pos.push((p.m.positions[i * 3] + (p.x || 0)) * PERSON_SCALE, (p.m.positions[i * 3 + 1] + p.y) * PERSON_SCALE, p.m.positions[i * 3 + 2] * PERSON_SCALE);
      nor.push(p.m.normals[i * 3], p.m.normals[i * 3 + 1], p.m.normals[i * 3 + 2]);
      col.push(p.m.colors[i * 3] * p.tint[0], p.m.colors[i * 3 + 1] * p.tint[1], p.m.colors[i * 3 + 2] * p.tint[2]);
      tex.push(p.m.tex ? p.m.tex[i] : 0);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), tex: new Float32Array(tex), vertexCount: pos.length / 3 };
}
export const PART_GENERATORS = { head, torso, arm, hand, leg, item };
