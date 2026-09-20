import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { computeProsperity } from '../src/sim/zones.js';
import { canPlaceStructure, computeEnclosure } from '../src/sim/structures.js';
import { idx } from '../src/core/grid.js';

const run = (world, reg, n) => { for (let d = 0; d < n; d++) tick(world, reg); };
async function fresh(seed = 3, city = 'daliang') {
  const reg = await getRegistry();
  const world = createWorld({ seed, cityId: city, reg, size: 64, money: 1e6 });
  return { reg, world };
}

test('官府は開始時に中央へ1つだけ置かれ、撤去できず、2つ目は置けない', async () => {
  const { reg, world } = await fresh();
  const yamen = Array.from(world.structures.values()).filter((s) => s.type === 'yamen');
  assert.equal(yamen.length, 1);
  assert.equal(applyCommand(world, reg, { type: 'demolish', rect: { x0: 0, y0: 0, x1: 63, y1: 63 } }).ok, true);
  assert.equal(Array.from(world.structures.values()).filter((s) => s.type === 'yamen').length, 1);
  assert.equal(canPlaceStructure(world, reg, reg.structureById.get('yamen'), 10, 10), '1つしか建てられません');
});

test('井戸は水を供給し、近くの家の繁栄度が上がる。山や水の上には置けない', async () => {
  const { reg, world } = await fresh();
  const zone = reg.zoneById.get('res_commoner');
  let tx = -1, ty = -1;
  for (let y = 2; y < 62 && tx < 0; y++) for (let x = 2; x < 62; x++) if (world.map.waterDist[y * 64 + x] > 10 && reg.tiles[world.map.tile[y * 64 + x]].id === 'plain' && world.structAt[y * 64 + x] === -1) { tx = x; ty = y; break; }
  assert.ok(tx > 0);
  const before = computeProsperity(world, reg, tx, ty, zone).parts['水'];
  const r = applyCommand(world, reg, { type: 'structure.place', typeId: 'well', x: tx + 2, y: ty });
  assert.ok(r.ok, r.message);
  run(world, reg, 6);
  assert.ok(world.services.water[idx(64, tx, ty)] === 1);
  assert.ok(computeProsperity(world, reg, tx, ty, zone).parts['水'] > before);
  // 水の上
  let wx = -1, wy = -1;
  for (let i = 0; i < 64 * 64 && wx < 0; i++) if (reg.tiles[world.map.tile[i]].id === 'river') { wx = i % 64; wy = (i / 64) | 0; }
  assert.equal(applyCommand(world, reg, { type: 'structure.place', typeId: 'well', x: wx, y: wy }).ok, false);
});

test('城壁で囲むと内城になり、城門は道路として通れる', async () => {
  const { reg, world } = await fresh();
  const ok = (r) => assert.ok(r.ok, r.message);
  // 中央の十字路の周り 10×10 を囲む（道路をまたぐ所は城門）
  applyCommand(world, reg, { type: 'road.remove', rect: { x0: 0, y0: 0, x1: 63, y1: 63 } });
  const x0 = 20, y0 = 20, x1 = 29, y1 = 29;
  ok(applyCommand(world, reg, { type: 'structure.line', typeId: 'wall', x0, y0, x1, y1: y0 }));
  ok(applyCommand(world, reg, { type: 'structure.line', typeId: 'wall', x0: x1, y0, x1, y1 }));
  ok(applyCommand(world, reg, { type: 'structure.line', typeId: 'wall', x0: x1, y0: y1, x1: x0, y1 }));
  ok(applyCommand(world, reg, { type: 'structure.line', typeId: 'wall', x0, y0: y1, x1: x0, y1: y0 + 1 }));
  run(world, reg, 8);
  const encBefore = computeEnclosure(world, reg);
  assert.ok(encBefore.count >= 60 && encBefore.count <= 64, `内側 ${encBefore.count}`);
  // 城壁を1マス撤去すると内城でなくなる
  applyCommand(world, reg, { type: 'demolish', rect: { x0: 25, y0: 20, x1: 25, y1: 20 } });
  assert.equal(computeEnclosure(world, reg).count, 0);
  // 城門を置くと再び囲われ、道路になる
  ok(applyCommand(world, reg, { type: 'structure.place', typeId: 'gate', x: 25, y: 20 }));
  run(world, reg, 12);
  assert.ok(computeEnclosure(world, reg).count > 0);
  assert.equal(world.roads[idx(64, 25, 20)], 1);
});

test('橋は川をまたぐ線でだけ架けられ、道路として道路距離に数えられる', async () => {
  const { reg, world } = await fresh(7, 'chen');
  const { w } = world.map;
  // 川を横切る縦線を探す
  let bx = -1, by0 = -1, by1 = -1;
  for (let x = 4; x < 60 && bx < 0; x++) for (let y = 4; y < 56; y++) {
    const isW = (yy) => reg.tiles[world.map.tile[yy * w + x]].water;
    const isL = (yy) => reg.tiles[world.map.tile[yy * w + x]].buildable && world.map.waterDist[yy * w + x] > 0;
    if (isL(y) && isW(y + 1)) { let e = y + 1; while (e < 63 && isW(e)) e++; if (isL(e) && e - y <= 8) { bx = x; by0 = y; by1 = e; break; } }
  }
  assert.ok(bx > 0, '川をまたぐ場所がない');
  assert.equal(applyCommand(world, reg, { type: 'structure.line', typeId: 'bridge', x0: 2, y0: 2, x1: 6, y1: 2 }).ok, false);   // 陸だけ
  const r = applyCommand(world, reg, { type: 'structure.line', typeId: 'bridge', x0: bx, y0: by0, x1: bx, y1: by1 });
  assert.ok(r.ok, r.message);
  run(world, reg, 8);
  assert.equal(world.roads[idx(w, bx, by0 + 1)], 1);
});

test('市は市亭の範囲内でだけ建ち、市租が入る', async () => {
  const { reg, world } = await fresh();
  world.services.water = new Uint8Array(64 * 64).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 38, y1: 34 }, zoneId: 'market' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 35, x1: 38, y1: 37 }, zoneId: 'res_commoner' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 26, y0: 33, x1: 31, y1: 38 }, zoneId: 'farm_millet' });
  run(world, reg, 60);
  assert.equal(Array.from(world.buildings.values()).filter((b) => b.category === 'market').length, 0, '市亭なしで店が建った');
  const r = applyCommand(world, reg, { type: 'structure.place', typeId: 'market_hall', x: 34, y: 29 });
  assert.ok(r.ok, r.message);
  world.population.commoner = 600; world.population.total = 600;   // 市が求められる規模にする
  world.services.water = new Uint8Array(64 * 64).fill(1);
  run(world, reg, 25);
  world.services.water = new Uint8Array(64 * 64).fill(1);
  run(world, reg, 200);
  assert.ok(Array.from(world.buildings.values()).some((b) => b.category === 'market' && b.state === 'built'), '店が建たない');
  assert.ok(world.finance.history.some((h) => h.detail.income['市租'] > 0), '市租が入らない');
  assert.ok(world.finance.history.some((h) => h.detail.expense['維持費'] > 0), '維持費が引かれない');
});

test('工房は近くの資源に応じた種類になる', async () => {
  const { reg, world } = await fresh(5, 'xinzheng');   // 鉄
  world.services.water = new Uint8Array(64 * 64).fill(1);
  const ironIdx = reg.resources.findIndex((r) => r.id === 'iron') + 1;
  let rx = -1, ry = -1;
  for (let i = 0; i < 64 * 64 && rx < 0; i++) if (world.map.resource[i] === ironIdx && reg.tiles[world.map.tile[i]].buildable) { rx = i % 64; ry = (i / 64) | 0; }
  assert.ok(rx > 0);
  applyCommand(world, reg, { type: 'road.build', x0: rx - 3, y0: ry - 3, x1: rx + 3, y1: ry - 3 });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: rx - 3, y0: ry - 2, x1: rx + 3, y1: ry + 2 }, zoneId: 'workshop' });
  world.population.commoner = 500; world.population.total = 500;
  run(world, reg, 150);
  const ws = Array.from(world.buildings.values()).filter((b) => b.category === 'workshop');
  assert.ok(ws.length > 0, '工房が建たない');
  assert.ok(ws.every((b) => ['ws_iron', 'ws_pottery', 'ws_bronze', 'ws_salt', 'ws_lacquer', 'ws_weapon', 'ws_vehicle'].includes(b.buildingType)), ws.map((b) => b.buildingType).join(','));
  assert.ok(ws.some((b) => b.buildingType === 'ws_iron'));
});

test('城壁が道路を横切る所は自動で城門になり、道路は通れたまま', async () => {
  const { reg, world } = await fresh();
  // 中央の横道 (y=32, x=26..38) を縦に横切る城壁
  const r = applyCommand(world, reg, { type: 'structure.line', typeId: 'wall', x0: 30, y0: 28, x1: 30, y1: 36 });
  assert.ok(r.ok, r.message);
  const s = world.structures.get(world.structAt[idx(64, 30, 32)]);
  assert.equal(s.type, 'gate');
  run(world, reg, 12);
  assert.equal(world.roads[idx(64, 30, 32)], 1);
  const { removeStructure } = await import('../src/sim/structures.js');
  removeStructure(world, reg, s.id);
  assert.equal(world.roads[idx(64, 30, 32)], 1, '自動の城門を壊しても道路は残る');
});

test('水路は岸辺から引き始められ、川につながらない場所には引けない', async () => {
  const { reg, world } = await fresh(7, 'chen');
  const { w } = world.map;
  let sx = -1, sy = -1, dir = null;
  for (let y = 3; y < 60 && sx < 0; y++) for (let x = 3; x < 60; x++) {
    const i = y * w + x;
    if (world.map.waterDist[i] !== 1 || !reg.tiles[world.map.tile[i]].buildable || world.roads[i] || world.structAt[i] !== -1) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let ok = true;
      for (let k = 0; k <= 5; k++) { const j = (y + dy * k) * w + (x + dx * k); if (!reg.tiles[world.map.tile[j]].buildable || world.roads[j] || world.structAt[j] !== -1 || (k > 0 && world.map.waterDist[j] < 1)) { ok = false; break; } }
      if (ok && world.map.waterDist[(y - dy) * w + (x - dx)] === 0) { sx = x; sy = y; dir = [dx, dy]; break; }
    }
  }
  assert.ok(sx > 0, '岸辺が見つからない');
  const r = applyCommand(world, reg, { type: 'structure.line', typeId: 'canal', x0: sx, y0: sy, x1: sx + dir[0] * 5, y1: sy + dir[1] * 5 });
  assert.ok(r.ok && r.count === 6, `${r.message} count=${r.count}`);
  run(world, reg, 5);
  assert.ok(world.services.irrigation.some((v) => v === 1));
  const far = applyCommand(world, reg, { type: 'structure.line', typeId: 'canal', x0: 32, y0: 40, x1: 36, y1: 40 });
  assert.equal(far.ok, false);
});
