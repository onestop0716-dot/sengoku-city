import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { serializeWorld, deserializeWorld, migrate } from '../src/sim/save/serialize.js';

test('保存→読込で同じ状態になり、その後の進行も一致する（マップの大きさを含む）', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'handan', reg, size: 64, money: 1e5 });
  world.services.water = new Uint8Array(64 * 64).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 40, y1: 36 }, zoneId: 'res_commoner' });
  for (let d = 0; d < 80; d++) tick(world, reg);
  const json = JSON.parse(JSON.stringify(serializeWorld(world)));
  assert.equal(json.version, 1); assert.equal(json.map.w, 64); assert.equal(json.map.h, 64);
  const loaded = deserializeWorld(json, reg);
  loaded.services.water = new Uint8Array(64 * 64).fill(1);
  assert.equal(loaded.buildings.size, world.buildings.size);
  assert.equal(loaded.money, world.money);
  assert.deepEqual(Array.from(loaded.zones), Array.from(world.zones));
  for (let d = 0; d < 60; d++) { tick(world, reg); tick(loaded, reg); }
  const snap = (wd) => JSON.stringify([wd.money, wd.day, Array.from(wd.buildings.values()).map((b) => [b.x, b.y, b.level, b.state])]);
  assert.equal(snap(loaded), snap(world));
});

test('大きさの情報がない古いデータも読み替えられる', () => {
  const d = migrate({ map: { tile: new Array(96 * 96).fill(0) } });
  assert.equal(d.version, 1); assert.equal(d.map.w, 96); assert.equal(d.map.h, 96);
});
