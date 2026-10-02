import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataNode, createRegistry } from '../src/data/registry.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { buildingReasons } from '../src/sim/build.js';
import { fill } from './_helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 典型的な始め方: 十字路の脇に家を2か所（6×3 軒ずつ）、4×4 の畑を2か所に敷きつめる */
function typicalStart(reg, cityId, seed) {
  const world = createWorld({ seed, cityId, reg, size: 128 });
  const cx = 64, cy = 64;
  fill(applyCommand, world, reg, 'house_commoner', cx + 1, cy + 1, cx + 6, cy + 3);
  fill(applyCommand, world, reg, 'house_commoner', cx - 6, cy - 3, cx - 1, cy - 1);
  fill(applyCommand, world, reg, 'field_millet', cx + 2, cy - 8, cx + 9, cy - 1);
  fill(applyCommand, world, reg, 'field_millet', cx - 9, cy + 7, cx - 2, cy + 14);
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

test('難易度で開始資金と満足度の基準が変わる', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  const easy = createRegistry(raw, { difficulty: 'easy' }), hard = createRegistry(raw, { difficulty: 'hard' }), normal = createRegistry(raw);
  assert.ok(easy.balance.start.money > normal.balance.start.money && normal.balance.start.money > hard.balance.start.money);
  assert.equal(hard.balance.satisfaction.water.penalty, -20);
  assert.equal(normal.balance.satisfaction.water.penalty, -8);
  assert.equal(hard.balance.satisfaction.food.bonus, normal.balance.satisfaction.food.bonus);   // 難易度の上書きが他のキーを消していない
  assert.equal(hard.balance.upgrade.levelUp.days, normal.balance.upgrade.levelUp.days);
  const w = createWorld({ seed: 1, cityId: 'daliang', reg: hard, size: 64 });
  assert.equal(w.difficulty, 'hard');
});

test('置けない理由が出る（道路から遠い・市亭の範囲外）', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  const reg = createRegistry(raw);
  const world = createWorld({ seed: 3, cityId: 'daliang', reg, size: 64, village: false });
  const far = buildingReasons(world, reg, reg.buildingById.get('house_commoner'), 5, 5);
  assert.ok(far.some((r) => r.includes('道路')), JSON.stringify(far));
  const stall = buildingReasons(world, reg, reg.buildingById.get('market_stall'), 33, 33);
  assert.ok(stall.some((r) => r.includes('市亭')), JSON.stringify(stall));
  assert.deepEqual(buildingReasons(world, reg, reg.buildingById.get('house_commoner'), 34, 33), []);
});
