// 表示モード（データマップ）の値: 用途の集計と廃屋・道路なしの印、色のグラデーション、水・満足度の値、配置の改善見込み、問題の場所。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry, fill, finishAll } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { computeUseMap, STATE_MODES, FLAG, ZONE_KIND, gradientColor, previewImprovement, worstTile, modeForEffects, relatedStructures } from '../src/sim/view-data.js';

test('色は 悪い=赤 → 普通=黄 → 良い=緑', () => {
  assert.deepEqual(gradientColor(0), [220, 60, 50]);
  assert.deepEqual(gradientColor(0.5), [220, 210, 50]);
  assert.deepEqual(gradientColor(1), [60, 210, 50]);
  assert.deepEqual(gradientColor(2), gradientColor(1));
});

test('用途モード: 種別・タブごとの集計が合い、建物のマスはタブの色', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  const cx = 64, cy = 64;
  const r = fill(applyCommand, world, reg, 'house_commoner', cx - 5, cy + 1, cx + 5, cy + 2);
  assert.ok(r.count > 0);
  for (let d = 0; d < 20; d++) tick(world, reg);
  const zm = computeUseMap(world, reg);
  const st = zm.stats.find((s) => s.id === 'residential');
  assert.ok(st && st.count === r.count && st.built === r.count, JSON.stringify(st));
  const k = reg.tabs.findIndex((t) => t.id === 'residential') + ZONE_KIND.ZONE_BASE;
  let houseTiles = 0, roads = 0, water = 0;
  for (let i = 0; i < zm.kind.length; i++) {
    if (zm.kind[i] === ZONE_KIND.ROAD) { roads++; assert.ok(zm.flags[i] & FLAG.ROAD); } else assert.ok(!(zm.flags[i] & FLAG.ROAD));
    if (zm.kind[i] === ZONE_KIND.WATER) { water++; assert.ok(zm.flags[i] & FLAG.WATER_TILE); }
    if (zm.kind[i] === k) { houseTiles++; assert.notEqual(world.buildingAt[i], -1); }
  }
  assert.equal(houseTiles, r.count);
  assert.ok(roads > 0 && water > 0);
});

test('水モード: 井戸の範囲は 1、川の近くは 0.75、それ以外は 0。配置プレビューは新たに水を得るマスだけ数える', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  tick(world, reg);
  const d = STATE_MODES.water.compute(world, reg);
  const w = world.map.w;
  const wellDef = reg.structureById.get('well');
  const range = reg.balance.satisfaction.water.range;
  let far = null;
  for (let y = 10; y < 118 && !far; y++) for (let x = 10; x < 118; x++) { const i = y * w + x; if (!reg.tiles[world.map.tile[i]].water && world.map.waterDist[i] > range + 12 && !world.services.water[i] && !world.roads[i] && reg.tiles[world.map.tile[i]].buildable) { far = [x, y]; break; } }
  assert.ok(far, '水の遠いマスがある');
  assert.equal(d.values[far[1] * w + far[0]], 0);
  const p = previewImprovement(world, reg, wellDef, far[0], far[1], 'water');
  assert.ok(p.tiles.length > 200 && p.text.includes('新たに水を得る'), p.text);
  const r = applyCommand(world, reg, { type: 'structure.place', typeId: 'well', x: far[0], y: far[1] });
  assert.ok(r.ok, r.message);
  for (let dd = 0; dd < 40; dd++) tick(world, reg);
  const d2 = STATE_MODES.water.compute(world, reg);
  assert.equal(d2.values[(far[1] + 3) * w + far[0]], 1, '井戸の完成後は範囲内が 1');
  assert.ok(relatedStructures(world, reg, 'water').some((s) => s.radius === wellDef.effects.find((e) => e.type === 'water').radius));
  const p2 = previewImprovement(world, reg, wellDef, far[0] + 1, far[1] + 1, 'water');
  assert.ok(p2.tiles.length < p.tiles.length, '既に水がある所は改善に数えない');
});

/** 道路沿いに家を置いて完成させ、道路を外して「道路につながっていない家」を作る */
function strandedHouses(world, reg, cx, cy) {
  applyCommand(world, reg, { type: 'road.build', x0: cx + 20, y0: cy + 20, x1: cx + 26, y1: cy + 20 });
  const r = fill(applyCommand, world, reg, 'house_commoner', cx + 20, cy + 21, cx + 26, cy + 21);
  finishAll(world);
  applyCommand(world, reg, { type: 'road.remove', rect: { x0: cx + 20, y0: cy + 20, x1: cx + 26, y1: cy + 20 } });
  return r;
}

test('満足度モード: 衰退しかけた建物に印が付き、問題の場所はいちばん低い建物', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  const cx = 64, cy = 64;
  const r = strandedHouses(world, reg, cx, cy);
  assert.ok(r.count >= 4, JSON.stringify(r));
  tick(world, reg);
  const d = STATE_MODES.prosperity.compute(world, reg);
  const w = world.map.w, low = reg.balance.upgrade.levelDown.threshold;
  let flagged = 0;
  for (const id of r.ids) { const b = world.buildings.get(id); const i = b.y * w + b.x; assert.ok(d.raw[i] < low); assert.ok(d.flags[i] & FLAG.BELOW_THRESHOLD); flagged++; }
  assert.ok(flagged > 0);
  const worst = worstTile(world, reg, 'prosperity', d);
  assert.ok(worst && world.buildingAt[worst[1] * w + worst[0]] !== -1 && d.raw[worst[1] * w + worst[0]] < low);
  const desc = STATE_MODES.prosperity.describe(world, reg, worst[1] * w + worst[0], d);
  assert.ok(desc.value.includes('衰退') && desc.parts.some(([k]) => k === '道路'), JSON.stringify(desc));
});

test('全モードが値を返し、効果種別からモードが引ける', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128 });
  tick(world, reg);
  for (const [id, m] of Object.entries(STATE_MODES)) {
    const d = m.compute(world, reg);
    assert.equal(d.values.length, world.map.w * world.map.h, id);
    for (let i = 0; i < d.values.length; i += 97) assert.ok(d.values[i] >= 0 && d.values[i] <= 1, `${id}: ${d.values[i]}`);
    const desc = m.describe(world, reg, 64 * 128 + 64, d);
    assert.ok(typeof desc.value === 'string' && Array.isArray(desc.parts), id);
  }
  assert.equal(modeForEffects(reg.structureById.get('well').effects), 'water');
  assert.equal(modeForEffects(reg.structureById.get('market_hall').effects), 'market');
  assert.equal(modeForEffects(reg.structureById.get('prison').effects), 'security');
  assert.equal(modeForEffects(reg.structureById.get('bridge').effects), null);
  assert.ok(worstTile(world, reg, 'use'));
});

test('道路につながっていない建物は用途モードで点線、道路モードで値が低く、集計に「道路なし」が出る', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  const cx = 64, cy = 64;
  const far = strandedHouses(world, reg, cx, cy);
  const near = fill(applyCommand, world, reg, 'house_commoner', cx - 4, cy + 1, cx + 4, cy + 1);   // 中央の道路沿い
  tick(world, reg);
  const zm = computeUseMap(world, reg);
  const w = world.map.w;
  const st = zm.stats.find((s) => s.id === 'residential');
  assert.equal(st.noRoad, far.count, JSON.stringify(st));
  assert.equal(st.count, far.count + near.count);
  const fb = world.buildings.get(far.ids[0]), nb = world.buildings.get(near.ids[0]);
  assert.ok(zm.flags[fb.y * w + fb.x] & FLAG.BELOW_THRESHOLD, '遠い家は点線');
  assert.ok(!(zm.flags[nb.y * w + nb.x] & FLAG.BELOW_THRESHOLD), '道路沿いは点線なし');
  const d = STATE_MODES.road.compute(world, reg);
  assert.ok(d.values[fb.y * w + fb.x] < 0.3 && d.values[nb.y * w + nb.x] > 0.6);
  assert.ok(STATE_MODES.road.describe(world, reg, fb.y * w + fb.x).parts.some(([k, v]) => k === '判定' && v.includes('道路が遠い')));
});
