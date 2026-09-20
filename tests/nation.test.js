// フェーズ5: 商隊の往復、友好度、王命と功績、昇進と郡、セーブ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { reachableCities, cityPrice, powerRanking, promotionStatus, checkPromotion } from '../src/sim/nation/state.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save/serialize.js';

const withHall = (world, reg) => { const cx = world.map.w >> 1, cy = world.map.h >> 1; let ok = false; for (let r = 4; r < 30 && !ok; r++) for (let y = cy - r; y <= cy + r && !ok; y += 2) for (let x = cx - r; x <= cx + r && !ok; x += 2) { const res = applyCommand(world, reg, { type: 'structure.place', typeId: 'market_hall', x, y }); if (res.ok) ok = true; } for (let d = 0; d < 80; d++) tick(world, reg); return ok; };

test('高唐から臨淄へ漆器を売りに行き、塩を買って帰る。利益が出て功績が増える', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 5, cityId: 'gaotang', reg, size: 128 });
  world.money = 20000;
  assert.ok(withHall(world, reg), '市亭を建てる');
  world.goods.lacquer = 40;
  const reach = reachableCities(world, reg).map((c) => c.id);
  assert.ok(reach.includes('linzi'), reach.join(','));
  assert.ok(cityPrice(world, reg, 'linzi', 'salt') < reg.goodsById.get('salt').basePrice, '臨淄の塩は特産で安い');
  const money0 = world.money, merit0 = world.nation.merit;
  const r = applyCommand(world, reg, { type: 'caravan.send', to: 'linzi', goods: { lacquer: 40 }, buy: 'salt' });
  assert.ok(r.ok, r.message);
  assert.equal(world.goods.lacquer, 0);
  for (let d = 0; d < r.days * 2 + 2; d++) tick(world, reg);
  assert.equal(world.nation.caravans.length, 0, '帰ってきた');
  assert.ok((world.goods.salt || 0) > 0, `塩を持ち帰る: ${world.goods.salt}`);
  assert.ok(world.nation.stats.tradeProfit > 0, `利益 ${world.nation.stats.tradeProfit}`);
  assert.ok(world.nation.merit > merit0, '功績が増える');
  assert.ok(world.log.some((l) => l.text.includes('臨淄から戻り')));
  void money0;
});

test('県令は遠い都市や友好度の低い国へは送れず、相邦なら全国へ送れる', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 5, cityId: 'xianyang', reg, size: 128 });
  const ids = reachableCities(world, reg).map((c) => c.id);
  assert.ok(ids.includes('yong') && ids.includes('yueyang'), '近くの自国都市');
  assert.ok(!ids.includes('linzi') && !ids.includes('handan'), '遠い都市・仲の悪い趙は不可');
  world.rank = 'chancellor';
  assert.ok(reachableCities(world, reg).map((c) => c.id).includes('linzi'), '相邦は全国へ');
  world.rank = 'magistrate';
  const r = applyCommand(world, reg, { type: 'caravan.send', to: 'linzi', goods: { salt: 1 } });
  assert.ok(!r.ok);
});

test('贈物で友好度が上がる。使者がいると効きが良い', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 5, cityId: 'xianyang', reg, size: 128 });
  world.money = 100000;
  const before = world.nation.relations.qin.zhao;
  const r = applyCommand(world, reg, { type: 'diplomacy.gift', nationId: 'zhao', amount: 600 });
  assert.ok(r.ok);
  assert.ok(world.nation.relations.qin.zhao > before + 5);
  assert.ok(!applyCommand(world, reg, { type: 'diplomacy.propose', nationId: 'zhao', kind: 'non_aggression' }).ok, '県令は提案できない');
  const ranking = powerRanking(world, reg);
  assert.equal(ranking.length, 7); assert.ok(ranking[0].power >= ranking[6].power);
});

test('王命が出て、納めると功績と信任が上がる。条件を満たすと郡守に昇進し郡の都市に方針を指示できる', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 5, cityId: 'xianyang', reg, size: 128 });
  world.money = 200000;
  while (!world.nation.orders.length) { tick(world, reg); if (world.day > 30 * 40) break; }
  const o = world.nation.orders[0];
  assert.ok(o && o.state === 'open', '王命が出る');
  const merit0 = world.nation.merit, favor0 = world.nation.favor;
  if (o.kind === 'grain') world.grain.civil = o.amount + 100;
  assert.ok(applyCommand(world, reg, { type: 'order.fulfill', orderId: o.id }).ok);
  assert.equal(o.state, 'done'); assert.ok(world.nation.merit > merit0 && world.nation.favor > favor0);
  // 昇進
  const st = promotionStatus(world, reg);
  assert.equal(st.next, 'governor');
  world.nation.merit = 900; world.population.total = 3000;
  assert.ok(checkPromotion(world, reg));
  assert.equal(world.rank, 'governor');
  assert.equal(world.nation.commandery.length, 3);
  assert.ok(world.nation.commandery.includes('yueyang'), '近い都市が郡に入る');
  const c = world.nation.commandery[0];
  assert.ok(applyCommand(world, reg, { type: 'commandery.policy', cityId: c, policy: 'commerce' }).ok);
  assert.ok(!applyCommand(world, reg, { type: 'commandery.policy', cityId: 'linzi', policy: 'commerce' }).ok);
  const w0 = world.nation.cities[c].wealth;
  for (let m = 0; m < 3; m++) { do tick(world, reg); while (world.calendar.day !== 1); }
  assert.ok(world.nation.cities[c].wealth > w0, '商業重視で富が増える');
  assert.ok((world.finance.month.income['郡税'] || 0) > 0 || world.finance.history.some((h) => (h.detail.income['郡税'] || 0) > 0), '郡税が入る');
  for (let i = 0; i < 3; i++) assert.ok(applyCommand(world, reg, { type: 'diplomacy.gift', nationId: 'qi', amount: 1000 }).ok);
  assert.ok(applyCommand(world, reg, { type: 'diplomacy.propose', nationId: 'qi', kind: 'non_aggression' }).ok, '郡守は不可侵を提案できる');
});

test('全国の状態はセーブに含まれ、同じシードなら同じ結果', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 5, cityId: 'gaotang', reg, size: 128 });
  world.money = 20000; withHall(world, reg); world.goods.silk = 10;
  applyCommand(world, reg, { type: 'caravan.send', to: 'linzi', goods: { silk: 10 }, buy: 'salt' });
  for (let d = 0; d < 3; d++) tick(world, reg);
  const w2 = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))), reg);
  assert.deepEqual(w2.nation.caravans, world.nation.caravans);
  for (let d = 0; d < 40; d++) { tick(world, reg); tick(w2, reg); }
  assert.equal(w2.money, world.money); assert.deepEqual(w2.nation.relations, world.nation.relations);
});
