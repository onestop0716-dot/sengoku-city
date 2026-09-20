import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { generateModel, GENERATORS } from '../src/render/models/index.js';
import { createBuilder } from '../src/render/models/builder.js';

test('全アセットのコード生成モデルが作れる（頂点数>0、足元は y>=-0.1、足跡内）', async () => {
  const reg = await getRegistry();
  for (const a of reg.assets) {
    if (a.kind !== 'procedural') continue;
    const m = generateModel(a);
    assert.ok(m.vertexCount > 0 && m.vertexCount % 3 === 0, `${a.id}: 頂点数 ${m.vertexCount}`);
    assert.equal(m.normals.length, m.positions.length); assert.equal(m.colors.length, m.positions.length);
    let minY = Infinity, maxR = 0;
    for (let i = 0; i < m.positions.length; i += 3) { minY = Math.min(minY, m.positions[i + 1]); maxR = Math.max(maxR, Math.abs(m.positions[i]), Math.abs(m.positions[i + 2])); }
    assert.ok(minY >= (a.generator === 'structure' && ['bridge', 'dock'].includes(a.params.kind) ? -0.4 : -0.1), `${a.id}: 地面より下 ${minY}`);
    const big = { yamen: 1.5, granary: 1.0, market_hall: 1.0, armory: 1.0, drill_ground: 2.0, ancestral_temple: 1.5, altar: 1.0, academy: 1.5, palace: 2.5, customs: 0.6, post_station: 1.0, prison: 1.0, dock: 1.0 };
    const size = a.generator === 'houseNoble' ? 1.5 : a.generator === 'houseShi' ? 1.0 : a.generator === 'structure' ? (big[a.params.kind] ?? 0.6) : a.generator === 'militaryBuilding' ? 1.0 : a.generator === 'agent' ? 1.2 : 0.6;
    assert.ok(maxR <= size + 0.15, `${a.id}: 足跡からはみ出し ${maxR}`); // 軒の出は少し許す
  }
});

test('同じ建物でもバリエーションごとに形が違う', () => {
  for (const gen of ['houseCommoner', 'houseShi', 'houseNoble']) for (let level = 1; level <= 3; level++) {
    const shapes = [0, 1, 2].map((variant) => JSON.stringify(Array.from(GENERATORS[gen]({ level, variant }).positions)));
    assert.equal(new Set(shapes).size, 3, `${gen} L${level} のバリエーションが同じ`);
  }
});

test('ビルダーの法線は単位ベクトル', () => {
  const m = createBuilder().box(0, 0, 0, 1, 1, 1, 0xffffff).cone(0, 0, 0, 0.5, 1, 0xff0000).build();
  for (let i = 0; i < m.normals.length; i += 3) {
    const l = Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-5);
  }
});

test('住民の部品モデルが作れ、関節が原点にある', async () => {
  const { PART_GENERATORS, WARDROBE } = await import('../src/render/models/people.js');
  for (const v of ['bun', 'cap', 'crown', 'tall_crown', 'helmet', 'female']) assert.ok(PART_GENERATORS.head({ variant: v }).vertexCount > 0, v);
  for (const v of ['short', 'robe', 'wide_robe', 'armor']) assert.ok(PART_GENERATORS.torso({ variant: v }).vertexCount > 0, v);
  for (const k of ['hoe', 'pole', 'bundle', 'ge', 'slips', 'basket']) assert.ok(PART_GENERATORS.item({ kind: k }).vertexCount > 0, k);
  const leg = PART_GENERATORS.leg();
  let minY = 0; for (let i = 1; i < leg.positions.length; i += 3) minY = Math.min(minY, leg.positions[i]);
  assert.ok(minY < -0.4 && minY > -0.5, `脚の長さ ${minY}`);
  for (const w of Object.values(WARDROBE)) assert.ok(w.cloth.length >= 2 && w.head.length >= 1);
});
