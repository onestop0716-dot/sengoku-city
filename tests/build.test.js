// 建物の個別配置: 置く・並べる・範囲で埋める・置けない理由・自動格上げ・廃屋と修繕・移動と元に戻す・材料。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry, fill, finishAll, flatten } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { computeSatisfaction } from '../src/sim/satisfaction.js';
import { footprint, areaPositions, rowPositions, undoMove } from '../src/sim/build.js';
import { idx } from '../src/core/grid.js';

async function makeWorld(seed = 5) {
  const reg = await getRegistry();
  const world = createWorld({ seed, cityId: 'xianyang', reg, size: 64, money: 100000, village: false });
  return { reg, world };
}

test('家を置くと費用を払って建設が始まり、完成して人が住む。条件がそろうと自動で格上げされる', async () => {
  const { reg, world } = await makeWorld();
  world.services.water = new Uint8Array(64 * 64).fill(1);
  const money = world.money, wood = world.materials.wood;
  const r = applyCommand(world, reg, { type: 'build.place', typeId: 'house_commoner', x: 34, y: 33 });   // 中央の横道(y=32)の南隣
  assert.ok(r.ok, r.message);
  const b = world.buildings.get(r.id);
  assert.equal(b.state, 'building');
  assert.equal(world.money, money - 20); assert.equal(world.materials.wood, wood - 4);
  for (let d = 0; d < 15; d++) tick(world, reg);
  assert.equal(b.state, 'built');
  assert.ok(world.stats.housingCapacity >= 5);
  for (let d = 0; d < 200 && b.level < 2; d++) { world.services.water.fill(1); tick(world, reg); }
  assert.equal(b.level, 2, `満足度 ${b.satisfaction} でも格上げされない`);
});

test('道路から遠い・重なる・材料が足りないと置けず、理由がすべて返る', async () => {
  const { reg, world } = await makeWorld();
  const far = applyCommand(world, reg, { type: 'build.place', typeId: 'house_commoner', x: 5, y: 5 });
  assert.equal(far.ok, false);
  assert.ok(far.reasons.some((x) => x.startsWith('道路から遠い')), JSON.stringify(far.reasons));
  assert.ok(applyCommand(world, reg, { type: 'build.place', typeId: 'house_shi', x: 34, y: 33 }).ok);
  const over = applyCommand(world, reg, { type: 'build.place', typeId: 'house_commoner', x: 35, y: 34 });
  assert.ok(over.reasons.includes('他の建物と重なる'));
  world.materials.wood = 0;
  const poor = applyCommand(world, reg, { type: 'build.place', typeId: 'house_commoner', x: 37, y: 33 });
  assert.ok(poor.reasons.includes('木材が足りない'), JSON.stringify(poor.reasons));
});

test('向き: 縦横が違う足跡は 90 度で入れ替わり、並べる・範囲の位置は足跡の大きさずつ', async () => {
  const reg = await getRegistry();
  const customs = reg.structureById.get('customs');
  assert.deepEqual(footprint(customs, 0), [1, 3]); assert.deepEqual(footprint(customs, 1), [3, 1]);
  const field = reg.buildingById.get('field_millet');
  assert.deepEqual(areaPositions(field, 0, { x0: 0, y0: 0, x1: 9, y1: 5 }), [[0, 0], [4, 0]]);   // はみ出す分は使わない
  assert.deepEqual(rowPositions(field, 0, 0, 0, 9, 1), [[0, 0], [4, 0], [8, 0]]);
  assert.deepEqual(rowPositions(reg.buildingById.get('house_commoner'), 0, 5, 5, 5, 2), [[5, 5], [5, 4], [5, 3], [5, 2]]);
});

test('畑は 4×4。範囲で埋めると複数枚、湿地には稲だけ、収穫はマス数ぶん', async () => {
  const { reg, world } = await makeWorld();
  flatten(world, reg, 24, 33, 31, 40);
  const r = fill(applyCommand, world, reg, 'field_millet', 24, 33, 31, 40);
  assert.equal(r.count, 4, JSON.stringify(r));
  const f = world.buildings.get(r.ids[0]);
  assert.equal(f.w * f.h, 16);
  // 湿地を 4×4 作って確認
  flatten(world, reg, 40, 9, 44, 14);
  for (let y = 10; y < 14; y++) for (let x = 40; x < 44; x++) world.map.tile[idx(64, x, y)] = reg.tileIndex.get('marsh');
  applyCommand(world, reg, { type: 'road.build', x0: 40, y0: 9, x1: 44, y1: 9 });
  const millet = applyCommand(world, reg, { type: 'build.place', typeId: 'field_millet', x: 40, y: 10 });
  assert.ok(!millet.ok && millet.reasons.some((x) => x.includes('地形が合わない')), JSON.stringify(millet.reasons));
  assert.ok(applyCommand(world, reg, { type: 'build.place', typeId: 'field_rice', x: 40, y: 10 }).ok);
});

test('道路がなくなると住まず働かず、やがて廃屋になる（勝手に消えない）。修繕できる', async () => {
  const { reg, world } = await makeWorld();
  world.services.water = new Uint8Array(64 * 64).fill(1);
  fill(applyCommand, world, reg, 'house_commoner', 33, 33, 35, 33);
  finishAll(world);
  tick(world, reg);
  assert.ok(world.stats.housingCapacity > 0);
  applyCommand(world, reg, { type: 'road.remove', rect: { x0: 0, y0: 0, x1: 63, y1: 63 } });
  for (let d = 0; d < 120; d++) tick(world, reg);
  assert.equal(world.stats.housingCapacity, 0);
  const houses = Array.from(world.buildings.values());
  assert.equal(houses.length, 3);
  assert.ok(houses.every((b) => b.state === 'abandoned'), houses.map((b) => b.state).join(','));
  applyCommand(world, reg, { type: 'road.build', x0: 26, y0: 32, x1: 38, y1: 32 });
  const money = world.money;
  const r = applyCommand(world, reg, { type: 'build.repair', id: houses[0].id });
  assert.ok(r.ok, r.message);
  assert.equal(houses[0].state, 'building');
  assert.equal(world.money, money - 10);   // 費用の半分
});

test('満足度の内訳が返り、水がないと低い', async () => {
  const { reg, world } = await makeWorld();
  const def = reg.buildingById.get('house_commoner');
  world.services.water = new Uint8Array(world.map.w * world.map.h);
  let tx = -1, ty = -1;
  for (let y = 2; y < 62 && tx < 0; y++) for (let x = 2; x < 62; x++) if (world.map.waterDist[y * world.map.w + x] > 12 && reg.tiles[world.map.tile[y * world.map.w + x]].buildable) { tx = x; ty = y; break; }
  assert.ok(tx >= 0);
  const far = computeSatisfaction(world, reg, def, tx, ty);
  assert.ok('水' in far.parts && far.parts['水'] < 0);
  world.services.water.fill(1);
  assert.ok(computeSatisfaction(world, reg, def, tx, ty).parts['水'] > far.parts['水']);
});

test('移動: 建設中は無料で置き直せ、元に戻すと元の場所と費用に戻る', async () => {
  const { reg, world } = await makeWorld();
  const r = applyCommand(world, reg, { type: 'build.place', typeId: 'house_commoner', x: 34, y: 33 });
  const money = world.money;
  const m = applyCommand(world, reg, { type: 'build.move', kind: 'building', id: r.id, x: 36, y: 33 });
  assert.ok(m.ok, m.message);
  assert.equal(world.money, money);
  assert.equal(world.buildingAt[idx(64, 34, 33)], -1); assert.equal(world.buildingAt[idx(64, 36, 33)], r.id);
  finishAll(world);
  const m2 = applyCommand(world, reg, { type: 'build.move', kind: 'building', id: r.id, x: 37, y: 33 });
  assert.ok(m2.ok && m2.cost.qian === 5, JSON.stringify(m2.cost));   // 完成済みは 25%
  undoMove(world, reg, 'building', r.id, m2.old, m2.cost);
  assert.equal(world.buildingAt[idx(64, 36, 33)], r.id);
  assert.equal(world.buildings.get(r.id).state, 'built');
  assert.equal(world.money, money);
});

test('伐木場は森の近くにしか置けず、毎月木材を作る。市の店があれば材料を買える', async () => {
  const { reg, world } = await makeWorld();
  const W = 64;
  flatten(world, reg, 20, 33, 45, 45);
  for (let y = 36; y < 42; y++) for (let x = 36; x < 42; x++) world.map.tile[idx(W, x, y)] = reg.tileIndex.get('forest');
  applyCommand(world, reg, { type: 'road.build', x0: 33, y0: 35, x1: 33, y1: 40 });
  const bad = applyCommand(world, reg, { type: 'build.place', typeId: 'lumber_camp', x: 27, y: 33 });
  assert.ok(!bad.ok && bad.reasons.some((x) => x.includes('森')), JSON.stringify(bad.reasons));
  const r = applyCommand(world, reg, { type: 'build.place', typeId: 'lumber_camp', x: 34, y: 37 });
  assert.ok(r.ok, r.message);
  fill(applyCommand, world, reg, 'house_commoner', 26, 33, 31, 34);
  finishAll(world);
  const wood = world.materials.wood;
  for (let d = 0; d < 120; d++) tick(world, reg);
  assert.ok(world.materials.wood > wood, `木材 ${wood} → ${world.materials.wood}`);
  assert.equal(applyCommand(world, reg, { type: 'materials.buy', kind: 'stone', amount: 10 }).ok, false);   // 市の店がない
  world.stats.marketJobs = 3;
  const money = world.money, stone = world.materials.stone;
  assert.ok(applyCommand(world, reg, { type: 'materials.buy', kind: 'stone', amount: 10 }).ok);
  assert.equal(world.materials.stone, stone + 10); assert.ok(world.money < money);
});

test('同じシードと同じ操作なら同じ結果（決定性）', async () => {
  const run = async () => {
    const { reg, world } = await makeWorld(99);
    fill(applyCommand, world, reg, 'house_commoner', 33, 33, 40, 34);
    fill(applyCommand, world, reg, 'field_millet', 24, 33, 31, 40);
    for (let d = 0; d < 200; d++) tick(world, reg);
    return JSON.stringify([world.money, world.materials, Array.from(world.buildings.values()).map((b) => [b.x, b.y, b.level, b.state])]);
  };
  assert.equal(await run(), await run());
});
