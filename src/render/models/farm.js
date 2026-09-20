// 農家・畑・桑園。畑は畝に沿って株が並び、季節（stage）で 芽 → 成長 → 実り → 刈り取り後 と変わる。
import { createBuilder } from './builder.js';
import { C, shadeHex } from './palette.js';

const CROP = {
  millet:    { leaf: 0x7fa848, ripe: 0xd8b64a, head: 0xd8b64a, height: 0.34, headStyle: 'drop' },
  broomcorn: { leaf: 0x86a84a, ripe: 0xe3c35e, head: 0xe3c35e, height: 0.38, headStyle: 'spray' },
  wheat:     { leaf: 0x8db85a, ripe: 0xe8d27a, head: 0xe8d27a, height: 0.3, headStyle: 'spike' },
  bean:      { leaf: 0x6fa84a, ripe: 0x8fbf5a, head: 0xb0c070, height: 0.2, headStyle: 'bush' },
  rice:      { leaf: 0x6fbf7f, ripe: 0xd8c860, head: 0xd8c860, height: 0.3, headStyle: 'drop', paddy: true },
  mulberry:  { leaf: 0x4f9f4f, ripe: 0x4f9f4f, head: 0x4f9f4f, height: 0.7, tree: true },
  hemp:      { leaf: 0x7fa87f, ripe: 0x9fb87f, head: 0x9fb87f, height: 0.6, headStyle: 'spray' },
};
export const STAGES = ['bare', 'sprout', 'growing', 'ripe', 'stubble'];

export function farmhouse({ variant = 0 }) {
  const B = createBuilder();
  const axis = variant === 1 ? 'z' : 'x';
  const sx = axis === 'x' ? 0.56 : 0.44, sz = axis === 'x' ? 0.44 : 0.56;
  B.chamferBox(-0.12, 0, -0.1, sx + 0.08, 0.04, sz + 0.08, C.earthDark, { chamfer: 0.015 });
  B.chamferBox(-0.12, 0.04, -0.1, sx, 0.46, sz, C.earth, { chamfer: 0.02 });
  for (const s of [-1, 1]) B.box(-0.12 + s * (sx / 2 - 0.02), 0.04, -0.1 + sz / 2, 0.035, 0.46, 0.035, C.wood);
  B.panel(-0.12, 0.04, -0.1 + sz / 2, 0.16, 0.42, 'z+', 0x3a2a1c);
  B.curvedRoof(-0.12, 0.5, -0.1, sx, sz, 0.24, C.thatch, { ridgeAxis: axis, overhang: 0.07, tileStripes: false, curve: 1.3, gableColor: C.earth, ridgeColor: C.thatchDark });
  sheafStack(B, 0.3, 0.28, 0.16, 2);                                                       // 束ねた穀物の山
  if (variant === 2) sheafStack(B, 0.32, -0.25, 0.12, 1);
  if (variant === 0) for (let i = 0; i < 4; i++) B.cylinder(-0.4 + i * 0.1, 0, 0.42, 0.014, 0.14, C.woodDark, 5);
  return B.build();
}

/** 束ねた穀物（稲藁・粟の束）を積んだ山 */
export function sheafStack(B, cx, cz, r, tiers) {
  for (let t = 0; t < tiers; t++) {
    const n = 6 - t * 2, rr = r * (1 - t * 0.35);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * rr * 0.6, z = cz + Math.sin(a) * rr * 0.6, y = t * 0.11;
      B.lathe(x, y, z, [[0.04, 0], [0.05, 0.05], [0.03, 0.09], [0.045, 0.12]], C.straw, 6);   // 束（帯で締めた形）
      B.lathe(x, y + 0.06, z, [[0.052, 0], [0.052, 0.012]], C.woodDark, 6);
    }
  }
  B.lathe(cx, tiers * 0.11, cz, [[0.045, 0], [0.05, 0.06], [0.02, 0.12]], C.straw, 6);
}

/** 1株。stage に応じた大きさと色。headStyle で穂の形が変わる */
function plant(B, x, z, def, stage, scale, variant) {
  const t = stage === 'sprout' ? 0.25 : stage === 'growing' ? 0.7 : 1;
  const h = def.height * t * scale;
  const leaf = shadeHex(def.leaf, [1, 0.93, 1.07][variant % 3]);
  if (stage === 'stubble') { B.lathe(x, 0.02, z, [[0.03, 0], [0.025, 0.05]], 0xb8a870, 5); return; }
  if (def.headStyle === 'bush') { B.blob(x, h * 0.5 + 0.02, z, 0.06 * scale, h * 0.5, stage === 'ripe' ? shadeHex(def.ripe, 1) : leaf, 6, 3); return; }
  // 葉の束（下広がり）
  B.lathe(x, 0.02, z, [[0.012, 0], [0.045 * scale, h * 0.45], [0.03 * scale, h * 0.8], [0.008, h]], leaf, 6);
  if (stage === 'ripe') {
    const head = shadeHex(def.ripe, [1, 0.95, 1.05][variant % 3]);
    if (def.headStyle === 'drop') B.lathe(x + 0.02, h * 0.82, z, [[0.006, 0], [0.018, 0.04], [0.012, 0.09], [0.0, 0.11]], head, 5);         // 垂れる穂（粟・稲）
    else if (def.headStyle === 'spike') B.lathe(x, h * 0.9, z, [[0.006, 0], [0.012, 0.05], [0.0, 0.1]], head, 5);                            // 麦の穂
    else for (let k = 0; k < 3; k++) { const a = k * 2.1 + variant; B.tube([x, h * 0.85, z], [x + Math.cos(a) * 0.03, h + 0.05, z + Math.sin(a) * 0.03], 0.008, 0.002, head, 4); }   // 散る穂（黍・麻）
  }
}

export function field({ crop = 'millet', level = 1, variant = 0, stage = 'ripe' }) {
  const B = createBuilder();
  const def = CROP[crop] || CROP.millet;
  const paddy = !!def.paddy;
  B.slab(0, 0.02, 0, 0.96, 0.96, paddy && stage !== 'stubble' && stage !== 'bare' ? C.water : C.soil);
  if (paddy) {
    B.chamferBox(0, 0, -0.47, 0.96, 0.05, 0.05, C.soilWet, { chamfer: 0.01 }); B.chamferBox(0, 0, 0.47, 0.96, 0.05, 0.05, C.soilWet, { chamfer: 0.01 });
    B.chamferBox(-0.47, 0, 0, 0.05, 0.05, 0.96, C.soilWet, { chamfer: 0.01 }); B.chamferBox(0.47, 0, 0, 0.05, 0.05, 0.96, C.soilWet, { chamfer: 0.01 });
  }
  const alongX = variant !== 1;
  const rows = 2 + level;                                          // 畝の数
  if (def.tree) {                                                   // 桑: 小さな木を格子に
    const n = 1 + level;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -0.35 + (0.7 * i) / Math.max(1, n - 1), z = -0.35 + (0.7 * j) / Math.max(1, n - 1);
      B.tube([x, 0, z], [x + 0.02, 0.32, z], 0.025, 0.015, C.trunk, 5);
      for (const [dx, dz] of [[0.08, 0], [-0.06, 0.06], [0, -0.07]]) B.tube([x, 0.2, z], [x + dx * 1.5, 0.42, z + dz * 1.5], 0.012, 0.005, C.trunk, 4);
      const full = stage === 'bare' || stage === 'stubble' ? 0.35 : stage === 'sprout' ? 0.6 : 1;
      B.blob(x, 0.42, z, 0.16 * full, 0.14 * full, shadeHex(def.leaf, [1, 0.93, 1.07][variant % 3]), 6, 3);
    }
    return B.build();
  }
  // 畝（盛り土）
  for (let r = 0; r < rows; r++) {
    const p = -0.4 + (0.8 * r) / (rows - 1);
    if (!paddy) { if (alongX) B.chamferBox(0, 0.02, p, 0.9, 0.035, 0.12, C.soilWet, { chamfer: 0.015 }); else B.chamferBox(p, 0.02, 0, 0.12, 0.035, 0.9, C.soilWet, { chamfer: 0.015 }); }
    if (stage === 'bare') continue;
    const per = stage === 'sprout' ? 5 : 4 + level;                // 株の数
    for (let k = 0; k < per; k++) {
      const q = -0.4 + (0.8 * (k + 0.5)) / per + ((k * 7 + r * 3 + variant) % 3 - 1) * 0.02;
      const jitter = ((k * 5 + r * 11) % 5 - 2) * 0.012;
      const scale = 0.9 + ((k + r + variant) % 3) * 0.07;
      if (alongX) plant(B, q, p + jitter, def, stage, scale, variant + k); else plant(B, p + jitter, q, def, stage, scale, variant + k);
    }
  }
  if (stage === 'stubble' && level >= 2) sheafStack(B, 0.36 * (variant === 1 ? -1 : 1), 0.36, 0.1, 1);   // 刈り取った束
  return B.build();
}
