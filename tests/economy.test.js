import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';

async function town(seed = 21) {
  const reg = await getRegistry();
  const world = createWorld({ seed, cityId: 'daliang', reg, size: 64, money: 200000 , village: false });
  world.services.water = new Uint8Array(64 * 64).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 38, y1: 34 }, zoneId: 'res_commoner' });   // 横道(y=32)の南
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 26, y0: 33, x1: 31, y1: 37 }, zoneId: 'farm_millet' });
  return { reg, world };
}
const runDays = (world, reg, n) => { for (let d = 0; d < n; d++) tick(world, reg); };

test('人口は住居の収容数に向かって増え、口賦が毎月入る', async () => {
  const { reg, world } = await town();
  runDays(world, reg, 240);
  assert.ok(world.population.total > 0, '人口が増えない');
  assert.ok(world.population.total <= world.stats.housingCapacity + 1);
  assert.ok(world.finance.history.some((h) => h.detail.income['口賦'] > 0), '口賦が入っていない');
  assert.ok(world.finance.history.some((h) => h.detail.expense['俸禄'] > 0));
});

test('粟は8月に収穫され、穀物と田租が入る。積穀率の分は官倉へ', async () => {
  const { reg, world } = await town();
  applyCommand(world, reg, { type: 'policy.set', key: 'granaryShare', value: 0.2 });
  runDays(world, reg, 30 * 6 + 5);     // 7月初め
  assert.equal(world.finance.lastHarvest, null);
  runDays(world, reg, 30);              // 8月1日を過ぎる
  const h = world.finance.lastHarvest;
  assert.ok(h && h.month === 8 && h.grain > 0 && h.tax > 0, `収穫がない: ${JSON.stringify(h)}`);
  assert.ok(world.grain.granary > 0, '官倉に入っていない');
});

test('畑がないと飢饉になり、民忠が下がって人口が流出する', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 21, cityId: 'daliang', reg, size: 64, money: 200000 , village: false });
  world.services.water = new Uint8Array(64 * 64).fill(1);
  world.grain.civil = 0;
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 40, y1: 35 }, zoneId: 'res_commoner' });
  let peak = 0, minFood = 1, minLoyalty = 100, popAtMinFood = 0;
  for (let d = 0; d < 390; d++) {
    tick(world, reg);
    peak = Math.max(peak, world.population.total);
    if (world.foodSufficiency < minFood) { minFood = world.foodSufficiency; popAtMinFood = world.population.total; }
    minLoyalty = Math.min(minLoyalty, world.loyalty);
  }
  assert.ok(peak > 0, '人が来ていない');
  assert.ok(minFood < 0.7, `食糧充足の最低 ${minFood}`);
  assert.ok(minLoyalty < 50, `民忠の最低 ${minLoyalty}`);
  assert.ok(popAtMinFood < peak, '飢饉で人口が減っていない');
});

test('税率を上げると民忠が下がり、下げると回復する', async () => {
  const { reg, world } = await town();
  runDays(world, reg, 360);
  const base = world.loyalty;
  applyCommand(world, reg, { type: 'policy.set', key: 'taxHead', value: 0.3 });
  runDays(world, reg, 180);
  assert.ok(world.loyalty < base - 5, `民忠が下がらない ${base} → ${world.loyalty}`);
  applyCommand(world, reg, { type: 'policy.set', key: 'taxHead', value: 0.05 });
  runDays(world, reg, 240);
  assert.ok(world.loyalty > base - 5);
});

test('年初に上納が引かれ、履歴は24か月まで', async () => {
  const { reg, world } = await town();
  runDays(world, reg, 360 * 3);
  assert.ok(world.finance.lastTribute > 0);
  assert.ok(world.finance.history.length <= 24);
});

test('需要メーターは −100〜100 の範囲で、飢えると農需要が上がる', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 4, cityId: 'chen', reg, size: 64, money: 200000 , village: false });
  world.services.water = new Uint8Array(64 * 64).fill(1);
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: 33, y0: 33, x1: 40, y1: 35 }, zoneId: 'res_commoner' });
  world.grain.civil = 0;
  let maxFarm = -100;
  for (let d = 0; d < 300; d++) { tick(world, reg); for (const v of Object.values(world.demand)) assert.ok(v >= -100 && v <= 100); maxFarm = Math.max(maxFarm, world.demand.farm); }
  assert.ok(maxFarm > 60, `農需要の最大 ${maxFarm}`);
});

test('政策コマンドは範囲外を切り詰める', async () => {
  const { reg, world } = await town();
  applyCommand(world, reg, { type: 'policy.set', key: 'taxLand', value: 0.9 });
  assert.equal(world.policy.taxLand, 0.3);
  assert.equal(applyCommand(world, reg, { type: 'policy.set', key: 'nope', value: 1 }).ok, false);
});
