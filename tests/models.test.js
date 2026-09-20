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
    assert.ok(minY >= -0.1, `${a.id}: 地面より下 ${minY}`);
    const size = a.generator === 'houseNoble' ? 1.5 : a.generator === 'houseShi' ? 1.0 : 0.6;
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
