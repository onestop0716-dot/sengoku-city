import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry, fill } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { serializeWorld, deserializeWorld, migrate, saveCompatibility, SAVE_VERSION } from '../src/sim/save/serialize.js';

test('保存→読込で同じ状態になり、その後の進行も一致する（マップの大きさを含む）', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'handan', reg, size: 64, money: 1e5 , village: false });
  world.services.water = new Uint8Array(64 * 64).fill(1);
  fill(applyCommand, world, reg, 'house_commoner', 33, 33, 40, 35);
  fill(applyCommand, world, reg, 'field_millet', 24, 33, 31, 36);
  for (let d = 0; d < 80; d++) tick(world, reg);
  const json = JSON.parse(JSON.stringify(serializeWorld(world)));
  assert.equal(json.version, SAVE_VERSION); assert.equal(json.map.w, 64); assert.equal(json.map.h, 64);
  const loaded = deserializeWorld(json, reg);
  loaded.services.water = new Uint8Array(64 * 64).fill(1);
  assert.equal(loaded.buildings.size, world.buildings.size);
  assert.equal(loaded.money, world.money);
  assert.deepEqual(loaded.materials, world.materials);
  for (let d = 0; d < 60; d++) { tick(world, reg); tick(loaded, reg); }
  const snap = (wd) => JSON.stringify([wd.money, wd.day, Array.from(wd.buildings.values()).map((b) => [b.x, b.y, b.level, b.state])]);
  assert.equal(snap(loaded), snap(world));
});

test('大きさの情報がないデータも読み替えられる', () => {
  const d = migrate({ version: SAVE_VERSION, map: { tile: new Array(96 * 96).fill(0) } });
  assert.equal(d.map.w, 96); assert.equal(d.map.h, 96);
});

test('区画方式の古い保存データ（版1）は理由つきで読めない', async () => {
  const reg = await getRegistry();
  const old = { version: 1, map: { w: 64, h: 64, tile: [] }, zones: [] };
  const c = saveCompatibility(old);
  assert.equal(c.ok, false);
  assert.ok(c.message.includes('古い形式'));
  assert.throws(() => deserializeWorld(old, reg), /古い形式/);
  assert.equal(saveCompatibility({ version: SAVE_VERSION }).ok, true);
});
