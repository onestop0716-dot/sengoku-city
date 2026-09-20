import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { computeProsperity } from '../src/sim/zones.js';
import { idx } from '../src/core/grid.js';

async function makeWorld(seed = 5) {
  const reg = await getRegistry();
  const world = createWorld({ seed, cityId: 'xianyang', reg, size: 64, money: 100000 });
  return { reg, world };
}

test('道路と住居区画を置くと家が建ち、レベルが上がる', async () => {
  const { reg, world } = await makeWorld();
  const cx = 32, cy = 32;
  // 中央の十字路の脇に区画。川の近さは都市による → 水は井戸なしでも川から届く場合がある
  const r = applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 1, y0: cy + 1, x1: cx + 5, y1: cy + 3 }, zoneId: 'res_commoner' });
  assert.ok(r.ok && r.count > 0);
  for (let d = 0; d < 120; d++) tick(world, reg);
  const houses = Array.from(world.buildings.values()).filter((b) => b.buildingType === 'house_commoner');
  assert.ok(houses.length >= 3, `家が ${houses.length} 軒しか建っていない`);
  assert.ok(houses.some((b) => b.state === 'built'));
  assert.ok(world.stats.housingCapacity > 0);
  // 水があれば成長する。なければ成長しないので、水を強制して確認
  world.services.water = new Uint8Array(world.map.w * world.map.h).fill(1);
  for (let d = 0; d < 200; d++) tick(world, reg);
  assert.ok(Array.from(world.buildings.values()).some((b) => b.level >= 2), 'レベル2の家がない');
});

test('道路から遠い区画には建たない', async () => {
  const { reg, world } = await makeWorld();
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 5, y0: 5, x1: 9, y1: 9 }, zoneId: 'res_commoner' });
  for (let d = 0; d < 60; d++) tick(world, reg);
  assert.equal(world.buildings.size, 0);
});

test('道路を撤去すると家が衰退して消える', async () => {
  const { reg, world } = await makeWorld();
  world.services.water = new Uint8Array(world.map.w * world.map.h).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 35, y1: 34 }, zoneId: 'res_commoner' });
  for (let d = 0; d < 90; d++) tick(world, reg);
  assert.ok(world.buildings.size > 0);
  applyCommand(world, reg, { type: 'road.remove', rect: { x0: 0, y0: 0, x1: 63, y1: 63 } });
  for (let d = 0; d < 400; d++) tick(world, reg);
  assert.equal(world.buildings.size, 0);
});

test('繁栄度の内訳が返り、水がないと低い', async () => {
  const { reg, world } = await makeWorld();
  const zone = reg.zoneById.get('res_commoner');
  world.services.water = new Uint8Array(world.map.w * world.map.h);
  // 水辺から十分離れた平地のマスを探す
  let tx = -1, ty = -1;
  for (let y = 2; y < 62 && tx < 0; y++) for (let x = 2; x < 62; x++) if (world.map.waterDist[y * world.map.w + x] > 8 && reg.tiles[world.map.tile[y * world.map.w + x]].buildable) { tx = x; ty = y; break; }
  assert.ok(tx >= 0);
  const far = computeProsperity(world, reg, tx, ty, zone);
  assert.ok('水' in far.parts && far.parts['水'] < 0);
  world.services.water.fill(1);
  const near = computeProsperity(world, reg, tx, ty, zone);
  assert.ok(near.parts['水'] > far.parts['水']);
});

test('2×2 の士の邸は矩形が小さいと建たず、十分なら建つ', async () => {
  const { reg, world } = await makeWorld();
  world.services.water = new Uint8Array(world.map.w * world.map.h).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 33, y1: 40 }, zoneId: 'res_shi' });
  for (let d = 0; d < 60; d++) tick(world, reg);
  assert.equal(world.buildings.size, 0);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 36, y1: 36 }, zoneId: 'res_shi' });
  for (let d = 0; d < 120; d++) tick(world, reg);
  assert.ok(Array.from(world.buildings.values()).some((b) => b.buildingType === 'house_shi'));
});

test('農地区画には畑と農家が建つ / 湿地には稲だけ', async () => {
  const { reg, world } = await makeWorld();
  world.services.water = new Uint8Array(world.map.w * world.map.h).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 27, y0: 33, x1: 31, y1: 38 }, zoneId: 'farm_millet' });
  for (let d = 0; d < 150; d++) tick(world, reg);
  const types = new Set(Array.from(world.buildings.values()).map((b) => b.buildingType));
  assert.ok(types.has('field_millet'));
  // 湿地を1マス作って確認
  const i = idx(world.map.w, 20, 20);
  world.map.tile[i] = reg.tileIndex.get('marsh');
  assert.equal(applyCommand(world, reg, { type: 'zone.set', rect: { x0: 20, y0: 20, x1: 20, y1: 20 }, zoneId: 'farm_millet' }).count, 0);
  assert.equal(applyCommand(world, reg, { type: 'zone.set', rect: { x0: 20, y0: 20, x1: 20, y1: 20 }, zoneId: 'farm_rice' }).count, 1);
});

test('同じシードと同じ操作なら同じ結果（決定性）', async () => {
  const run = async () => {
    const { reg, world } = await makeWorld(99);
    applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 40, y1: 40 }, zoneId: 'res_commoner' });
    applyCommand(world, reg, { type: 'road.build', x0: 33, y0: 41, x1: 40, y1: 41 });
    for (let d = 0; d < 200; d++) tick(world, reg);
    return JSON.stringify([world.money, Array.from(world.buildings.values()).map((b) => [b.x, b.y, b.level, b.state])]);
  };
  assert.equal(await run(), await run());
});
