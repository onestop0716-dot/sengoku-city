import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataNode, createRegistry } from '../src/data/registry.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { explainBuildBlockers } from '../src/sim/zones.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 典型的な始め方: 十字路の脇に住居2か所と農地2か所 */
function typicalStart(reg, cityId, seed) {
  const world = createWorld({ seed, cityId, reg, size: 128 });
  const cx = 64, cy = 64;
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 1, y0: cy + 2, x1: cx + 6, y1: cy + 4 }, zoneId: 'res_commoner' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 6, y0: cy - 3, x1: cx - 1, y1: cy - 1 }, zoneId: 'res_commoner' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 1, y0: cy - 6, x1: cx + 8, y1: cy - 1 }, zoneId: 'farm_millet' });
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 8, y0: cy + 3, x1: cx - 1, y1: cy + 8 }, zoneId: 'farm_millet' });
  return world;
}

test('標準難易度: 開始から3年で人口が増え、資金が減らず、民忠が保たれる（4都市）', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  const reg = createRegistry(raw, { difficulty: 'normal' });
  for (const [city, seed] of [['xianyang', 777], ['chen', 4242], ['handan', 11], ['linzi', 5]]) {
    const world = typicalStart(reg, city, seed);
    const startPop = world.population.total, startMoney = world.money;
    const yearly = [];
    for (let d = 1; d <= 360 * 3; d++) { tick(world, reg); if (d % 360 === 0) yearly.push({ pop: world.population.total, money: Math.round(world.money), loyalty: Math.round(world.loyalty) }); }
    assert.ok(startPop >= 30, `${city}: 開始時の住民 ${startPop}`);
    assert.ok(yearly[2].pop >= startPop * 4, `${city}: 3年後の人口 ${yearly[2].pop}（開始 ${startPop}）`);
    assert.ok(yearly[2].money >= startMoney * 0.9, `${city}: 3年後の資金 ${yearly[2].money}（開始 ${startMoney}）`);
    assert.ok(yearly.every((y) => y.loyalty >= 40), `${city}: 民忠 ${JSON.stringify(yearly)}`);
    assert.ok(world.foodSufficiency >= 0.9, `${city}: 食糧充足 ${world.foodSufficiency}`);
  }
});

test('難易度で開始資金と建設基準が変わり、「難しい」は以前の値', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  const easy = createRegistry(raw, { difficulty: 'easy' }), hard = createRegistry(raw, { difficulty: 'hard' }), normal = createRegistry(raw);
  assert.ok(easy.balance.start.money > normal.balance.start.money && normal.balance.start.money > hard.balance.start.money);
  assert.equal(hard.balance.growth.buildThreshold, 50); assert.equal(hard.balance.prosperity.water.penalty, -20);
  assert.equal(normal.balance.growth.buildThreshold, 35);
  assert.equal(normal.balance.demand.residential.vacancy, 30);   // 難易度の上書きが他のキーを消していない
  assert.equal(hard.balance.demand.farm.base, normal.balance.demand.farm.base);
  const w = createWorld({ seed: 1, cityId: 'daliang', reg: hard, size: 64 });
  assert.equal(w.difficulty, 'hard');
});

test('建たない理由と助言が出る', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  const reg = createRegistry(raw);
  const world = createWorld({ seed: 3, cityId: 'daliang', reg, size: 64, village: false });
  world.services.water = new Uint8Array(64 * 64);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 5, y0: 5, x1: 8, y1: 8 }, zoneId: 'res_commoner' });
  const ex = explainBuildBlockers(world, reg, 6, 6);
  assert.equal(ex.canBuild, false);
  assert.ok(ex.reasons.some((r) => r.includes('道路')));
  assert.ok(ex.tips.some((t) => t.includes('井戸')));
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 33, y1: 33 }, zoneId: 'market' });
  assert.ok(explainBuildBlockers(world, reg, 33, 33).tips.some((t) => t.includes('市亭')));
});
