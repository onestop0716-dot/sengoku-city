import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld } from '../src/sim/world.js';
import { createTerrainField, blur3, sampleTile } from '../src/render/terrain-field.js';

test('高さ場は連続している（隣接頂点の段差が小さい）', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 48 });
  const f = createTerrainField(world, reg, { segments: 4 });
  let maxStep = 0;
  for (let j = 0; j < f.VH; j++) for (let i = 1; i < f.VW; i++) {
    const a = f.positions[(j * f.VW + i) * 3 + 1], b = f.positions[(j * f.VW + i - 1) * 3 + 1];
    maxStep = Math.max(maxStep, Math.abs(a - b));
  }
  assert.ok(maxStep < 0.45, `段差が大きい: ${maxStep}`);
  assert.equal(f.indices.length, 48 * 4 * 48 * 4 * 6);
});

test('水のマスの中心は水面より下、陸のマスは水面より上', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 48 });
  const f = createTerrainField(world, reg, { segments: 2 });
  const { w, h, tile } = world.map;
  let waterOk = 0, waterN = 0, landOk = 0, landN = 0;
  for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
    const i = z * w + x;
    const y = f.heightAt(x + 0.5, z + 0.5);
    if (reg.tiles[tile[i]].water) { waterN++; if (y < f.waterLevel) waterOk++; }
    else if (world.map.waterDist[i] >= 3) { landN++; if (y > f.waterLevel) landOk++; }
  }
  assert.ok(waterN > 0 && waterOk / waterN > 0.85, `水底が水面より上: ${waterOk}/${waterN}`);
  assert.ok(landOk / landN > 0.995, `陸が水没: ${landOk}/${landN}`);
});

test('法線は単位ベクトルで、平地ではほぼ上向き', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 3, cityId: 'daliang', reg, size: 48 });
  const f = createTerrainField(world, reg, { segments: 1 });
  const n = f.normalAt(24, 24);
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6);
  assert.ok(n[1] > 0.95);
});

test('blur3 と sampleTile', () => {
  const src = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  const b = blur3(src, 3, 3);
  assert.ok(b[4] > b[1] && b[1] > b[0] && b[0] > 0);
  assert.equal(sampleTile(src, 3, 3, 1.5, 1.5), 1);
  assert.ok(sampleTile(src, 3, 3, 1.0, 1.5) > 0 && sampleTile(src, 3, 3, 1.0, 1.5) < 1);
});

test('色の再計算は変更マス周辺だけを対象にする', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 32 });
  const f = createTerrainField(world, reg, { segments: 2 });
  const before = Array.from(f.colors);
  world.roads[10 * 32 + 10] = 1;
  const r = f.recolor(new Set([10 * 32 + 10]));
  assert.ok(r.j0 <= 20 && r.j1 >= 22);
  let changed = 0;
  for (let k = 0; k < before.length; k++) if (before[k] !== f.colors[k]) changed++;
  assert.ok(changed > 0 && changed < before.length / 4);
});
