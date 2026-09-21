// 案内役の助言ロジック: 条件の評価、優先度、間隔、チュートリアルの進行、文の穴埋め。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { evaluate, evalCondition, fillText, computeMetrics, restartTutorial } from '../src/sim/advisor.js';

test('条件の評価: 比較・all/any/not・truthy', () => {
  const m = { a: 5, b: -1, s: 'x', arr: [1, 2] };
  assert.equal(evalCondition({ metric: 'a', gte: 5 }, m), true);
  assert.equal(evalCondition({ metric: 'a', lt: 5 }, m), false);
  assert.equal(evalCondition({ all: [{ metric: 'a', gt: 0 }, { metric: 'b', lt: 0 }] }, m), true);
  assert.equal(evalCondition({ any: [{ metric: 'a', lt: 0 }, { metric: 'b', lt: 0 }] }, m), true);
  assert.equal(evalCondition({ not: { metric: 's', truthy: true } }, m), false);
  assert.equal(evalCondition({ metric: 'arr', includes: 2 }, m), true);
  assert.equal(evalCondition({ metric: 'missing', truthy: false }, m), true);
  assert.equal(fillText('銭 {money}、理由: {reason}、なし: {none}', { money: 12345, reason: '道路', none: null }), '銭 12,345、理由: 道路、なし: ');
});

test('赤字で銭が少ないと「至急」の助言が最優先で出て、間隔内は繰り返さない', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 128 });
  for (let d = 0; d < 65; d++) tick(world, reg);
  world.money = 500;
  world.finance.history.push({ year: -247, month: 3, income: 100, expense: 900, balance: 500, detail: {} });
  const r = evaluate(world, reg, { frequency: 'normal', tutorial: false });
  assert.equal(r.show?.id, 'deficit_low_money');
  assert.equal(r.show.expression, 'warning');
  assert.ok(r.show.text.includes('-800') && r.show.text.includes('500'), r.show.text);
  assert.ok(r.todo.some((t) => t.id === 'deficit_low_money' && t.priority === 5));
  tick(world, reg);
  const r2 = evaluate(world, reg, { frequency: 'normal', tutorial: false });
  assert.equal(r2.show, null, '翌日は同じ助言を繰り返さない');
  assert.ok(r2.todo.some((t) => t.id === 'deficit_low_money'), 'やるべきことの一覧には残る');
  assert.equal(world.advisor.history.length, 1);
});

test('頻度オフでは吹き出しは出ないが一覧は出る。「多い」は間隔が短い', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 128 });
  for (let d = 0; d < 65; d++) tick(world, reg);
  world.foodSufficiency = 0.5;
  const off = evaluate(world, reg, { frequency: 'off', tutorial: false });
  assert.equal(off.show, null);
  assert.ok(off.todo.some((t) => t.id === 'famine'));
  const many = evaluate(world, reg, { frequency: 'many', tutorial: false });
  assert.equal(many.show?.id, 'famine');
  world.foodSufficiency = 1; world.loyalty = 20;
  for (let d = 0; d < 4; d++) tick(world, reg);
  const next = evaluate(world, reg, { frequency: 'many', tutorial: false });
  assert.equal(next.show?.id, 'loyalty_low', '「多い」なら数日後に次の助言が出る');
});

test('チュートリアルは順に進み、道路や区画を置くと次へ進む。やり直せる', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 128 });
  tick(world, reg);
  const r1 = evaluate(world, reg, { frequency: 'normal', tutorial: true });
  assert.equal(r1.tutorial?.id, 't_hello');
  assert.equal(r1.show, null, '案内中は通常の助言を出さない');
  for (let d = 0; d < 4; d++) tick(world, reg);
  const r2 = evaluate(world, reg, { frequency: 'normal', tutorial: true });
  assert.equal(r2.tutorial?.id, 't_road');
  const cx = world.map.w >> 1, cy = world.map.h >> 1;
  applyCommand(world, reg, { type: 'road.build', x0: cx - 12, y0: cy + 6, x1: cx + 12, y1: cy + 6 });
  tick(world, reg);
  const r3 = evaluate(world, reg, { frequency: 'normal', tutorial: true });
  assert.equal(r3.tutorial?.id, 't_zone');
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 10, y0: cy + 7, x1: cx + 10, y1: cy + 8 }, zoneId: 'res_commoner' });
  tick(world, reg);
  assert.equal(evaluate(world, reg, { frequency: 'normal', tutorial: true }).tutorial?.id, 't_farm');
  restartTutorial(world);
  tick(world, reg);
  assert.equal(evaluate(world, reg, { frequency: 'normal', tutorial: true }).tutorial?.id, 't_hello');
});

test('指標: 建たない区画の理由と対策が出る', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 7, cityId: 'chen', reg, size: 128, village: false });
  // 道路から遠い区画を置く
  const cx = world.map.w >> 1, cy = world.map.h >> 1;
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 20, y0: cy + 20, x1: cx + 26, y1: cy + 24 }, zoneId: 'res_commoner' });
  tick(world, reg);
  const m = computeMetrics(world, reg, { forceBlockers: true });
  assert.ok(m.zonedUnbuilt >= 20, String(m.zonedUnbuilt));
  assert.ok(m.blockerReason && m.blockerReason.startsWith('道路'), m.blockerReason);
  assert.ok(m.blockerTip);
});

test('案内役: characters の先頭がホウ。tone.endings は文末だけ言い換える', async () => {
  const reg = await getRegistry();
  const { characterOf, applyTone } = await import('../src/sim/advisor.js');
  assert.equal(characterOf(reg).id, 'owl');
  assert.equal(characterOf(reg, 'nope').id, 'owl');
  assert.equal(reg.advice.characters.length, 1);
  const tone = { endings: [{ from: 'だね', to: 'だな' }, { from: 'ね', to: 'な' }, { from: 'よう', to: 'ようぞ' }] };
  assert.equal(applyTone('順調だね。井戸を建てよう。', tone), '順調だな。井戸を建てようぞ。');
  assert.equal(applyTone('「道路」を選んでね', tone), '「道路」を選んでな');   // 「」の中は文末扱いしない
  assert.equal(applyTone('落ち着いて。', tone), '落ち着いて。');
  assert.equal(applyTone('xだよ', null), 'xだよ');
  const world = createWorld({ seed: 3, cityId: 'chen', reg, size: 128 });
  const r = evaluate(world, reg, { frequency: 'normal', tutorial: true });
  assert.equal(r.tutorial?.id, 't_hello');
  assert.ok(r.tutorial.text.includes('ホウ') && r.tutorial.text.includes('フクロウ'), r.tutorial.text);
});
