import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { chooseFacing, FACING } from '../src/sim/placement.js';

async function fresh() {
  const reg = await getRegistry();
  const world = createWorld({ seed: 1, cityId: 'daliang', reg, size: 64, money: 1e6 });
  applyCommand(world, reg, { type: 'road.remove', rect: { x0: 0, y0: 0, x1: 63, y1: 63 } });
  return { reg, world };
}

test('道路がなければ南向き', async () => {
  const { world } = await fresh();
  assert.equal(chooseFacing(world, 10, 10, 1, 1), FACING.south);
});

test('北側に道路があれば北を向く', async () => {
  const { reg, world } = await fresh();
  applyCommand(world, reg, { type: 'road.build', x0: 5, y0: 9, x1: 15, y1: 9 });
  assert.equal(chooseFacing(world, 10, 10, 1, 1), FACING.north);
  assert.equal(chooseFacing(world, 10, 10, 2, 2), FACING.north);
});

test('複数の道路に接する場合は通りが長い側を選ぶ', async () => {
  const { reg, world } = await fresh();
  applyCommand(world, reg, { type: 'road.build', x0: 4, y0: 12, x1: 16, y1: 12 });   // 南: 13マスの通り
  applyCommand(world, reg, { type: 'road.build', x0: 12, y0: 9, x1: 12, y1: 11 });   // 東: 短い道
  assert.equal(chooseFacing(world, 10, 10, 2, 2), FACING.south);
  applyCommand(world, reg, { type: 'road.build', x0: 12, y0: 0, x1: 12, y1: 18 });   // 東を 19 マスにする（川の手前まで）
  assert.equal(chooseFacing(world, 10, 10, 2, 2), FACING.east);
});

test('2マス先の道路でも向く。3マス先は無視して南', async () => {
  const { reg, world } = await fresh();
  applyCommand(world, reg, { type: 'road.build', x0: 5, y0: 13, x1: 15, y1: 13 });
  assert.equal(chooseFacing(world, 10, 10, 1, 1), FACING.south);
  applyCommand(world, reg, { type: 'road.build', x0: 5, y0: 8, x1: 15, y1: 8 });
  assert.equal(chooseFacing(world, 10, 10, 1, 1), FACING.north);
  applyCommand(world, reg, { type: 'road.remove', rect: { x0: 0, y0: 8, x1: 63, y1: 8 } });
  applyCommand(world, reg, { type: 'road.build', x0: 5, y0: 7, x1: 15, y1: 7 });
  assert.equal(chooseFacing(world, 10, 10, 1, 1), FACING.south);
});

test('建った家は道路側を向いている', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 5, cityId: 'xianyang', reg, size: 64, money: 1e6 });
  world.services.water = new Uint8Array(64 * 64).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 38, y1: 33 }, zoneId: 'res_commoner' });  // 中央の横道(y=32, x=26..38)の南隣
  const { tick } = await import('../src/sim/world.js');
  for (let d = 0; d < 120; d++) tick(world, reg);
  const houses = Array.from(world.buildings.values());
  assert.ok(houses.length > 0);
  for (const b of houses) {
    if (b.x === 33) assert.ok(b.rotation === FACING.north || b.rotation === FACING.west, '角の家は北か西');   // 縦道(x=32)にも接する角
    else assert.equal(b.rotation, FACING.north, `(${b.x},${b.y}) が北を向いていない`);
  }
});

test('岸辺には区画を置けない', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 64 });
  const { w, h, waterDist } = world.map;
  let shore = -1;
  for (let i = 0; i < w * h; i++) if (waterDist[i] === 1 && reg.tiles[world.map.tile[i]].buildable) { shore = i; break; }
  assert.ok(shore >= 0);
  const r = applyCommand(world, reg, { type: 'zone.set', rect: { x0: shore % w, y0: (shore / w) | 0, x1: shore % w, y1: (shore / w) | 0 }, zoneId: 'res_commoner' });
  assert.equal(r.count, 0);
});
