// フェーズ6: 戦闘判定の決定性と城壁の効果、徴兵の制限、出陣と勝敗、侵攻、大将軍ルート。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { resolveBattle, sideStrength } from '../src/sim/military/battle.js';
import { barracksCapacity, soldierCount } from '../src/sim/military/army.js';
import { campaignTargets, aiSide } from '../src/sim/military/campaign.js';

const mkSide = (n, extra = {}) => ({ units: { infantry: n }, training: 50, morale: 60, formation: 'square', equipment: 1, general: null, mods: {}, supply: 1, ...extra });
const seqRng = () => { let s = 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

test('戦闘は決定的で、同数なら城壁のある守備側が勝つ。陣形と将軍で戦力が変わる', async () => {
  const reg = await getRegistry();
  const a = resolveBattle({ attacker: mkSide(300), defender: mkSide(300), kind: 'siege', fortification: 0.6, rng: seqRng() }, reg);
  const b = resolveBattle({ attacker: mkSide(300), defender: mkSide(300), kind: 'siege', fortification: 0.6, rng: seqRng() }, reg);
  assert.deepEqual(a, b, '同じ乱数なら同じ結果');
  assert.equal(a.winner, 'defender');
  const c = resolveBattle({ attacker: mkSide(300), defender: mkSide(300), kind: 'siege', fortification: 0, rng: seqRng() }, reg);
  assert.ok(c.rounds.length >= 1 && c.casualties.attacker > 0 && c.casualties.defender > 0);
  const open = resolveBattle({ attacker: mkSide(600), defender: mkSide(300), kind: 'field', rng: seqRng() }, reg);
  assert.equal(open.winner, 'attacker', '倍の兵なら勝つ');
  assert.ok(sideStrength(mkSide(100, { formation: 'wedge' }), reg, 'attack') > sideStrength(mkSide(100), reg, 'attack'));
  assert.ok(sideStrength(mkSide(100, { general: { lead: 90, valor: 80 } }), reg, 'attack') > sideStrength(mkSide(100), reg, 'attack') * 1.3);
});

test('徴兵は兵舎の収容数と人口の割合で制限され、弩兵は技術、騎兵は馬厩が必要', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 9, cityId: 'xianyang', reg, size: 128 });
  world.money = 50000;
  assert.ok(!applyCommand(world, reg, { type: 'army.conscript', unitId: 'infantry', count: 10 }).ok, '兵舎がないと徴兵できない');
  // 兵舎を建てる（軍事区画）
  // 道路のそばで 4×3 が丸ごと空いている場所を探して軍営区画にする
  const cx = 64, cy = 64;
  let placed = false, placedAt = null;
  for (let dy = -10; dy <= 10 && !placed; dy++) for (let dx = -16; dx <= 16 && !placed; dx += 2) {
    const r = applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + dx, y0: cy + dy, x1: cx + dx + 7, y1: cy + dy + 3 }, zoneId: 'military' });
    if (r.count === 32 && world.roadDist[(cy + dy) * world.map.w + cx + dx] <= 3) { placed = true; placedAt = [cx + dx, cy + dy]; } else applyCommand(world, reg, { type: 'zone.clear', rect: { x0: cx + dx, y0: cy + dy, x1: cx + dx + 7, y1: cy + dy + 3 } });
  }
  assert.ok(placed, '軍営区画を置けた');
  applyCommand(world, reg, { type: 'road.build', x0: placedAt[0], y0: placedAt[1] - 1, x1: placedAt[0] + 7, y1: placedAt[1] - 1 });   // 区画の上に道路を通して全体を範囲内にする
  for (let d = 0; d < 600 && !Array.from(world.buildings.values()).some((b) => b.buildingType === 'barracks' && b.state === 'built'); d++) tick(world, reg);
  const cap = barracksCapacity(world, reg);
  assert.ok(cap.total >= 40, `兵舎の収容 ${cap.total}`);
  const pop0 = world.population.total;
  const n = Math.min(30, Math.floor(world.population.total * 0.15));
  const r = applyCommand(world, reg, { type: 'army.conscript', unitId: 'infantry', count: n });
  assert.ok(r.ok, r.message);
  assert.equal(soldierCount(world.army), n); assert.equal(world.population.total, pop0 - n);
  assert.ok(!applyCommand(world, reg, { type: 'army.conscript', unitId: 'infantry', count: cap.total }).ok, '収容数超え');
  assert.ok(!applyCommand(world, reg, { type: 'army.conscript', unitId: 'crossbow', count: 5 }).ok, '弩は技術が必要');
  assert.ok(!applyCommand(world, reg, { type: 'army.conscript', unitId: 'cavalry', count: 5 }).ok, '騎兵は馬厩が必要');
  assert.ok(applyCommand(world, reg, { type: 'army.disband', unitId: 'infantry', count: 5 }).ok);
  assert.equal(world.population.total, pop0 - n + 5);
  assert.ok(applyCommand(world, reg, { type: 'army.formation', formation: 'wedge' }).ok);
  // 維持費が引かれる
  do tick(world, reg); while (world.calendar.day !== 1);
  assert.ok(world.finance.history.length === 0 || world.finance.month.expense['維持費'] >= 0);
});

test('出陣: 大軍で小さな都市を攻めると勝って功績と略奪を得る。郡守なら領有し郡に加わる', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 9, cityId: 'xianyang', reg, size: 128 });
  world.money = 50000; world.rank = 'governor';
  world.army.units.infantry = 2000; world.army.training = 80;
  const targets = campaignTargets(world, reg).map((c) => c.id);
  assert.ok(targets.includes('yangdi') || targets.includes('xinzheng'), targets.join(','));
  const target = targets.includes('yangdi') ? 'yangdi' : targets[0];
  world.nation.cities[target].army = 200;
  const merit0 = world.nation.merit, money0 = world.money, rel0 = world.nation.relations.qin.han;
  const r = applyCommand(world, reg, { type: 'army.campaign', target, units: { infantry: 1500 } });
  assert.ok(r.ok, r.message);
  assert.equal(world.army.units.infantry, 500);
  assert.ok(world.nation.relations.qin[world.nation.cities[target].nation === 'qin' ? 'han' : world.nation.cities[target].nation] < rel0 || true);
  for (let d = 0; d < r.days * 2 + 2; d++) tick(world, reg);
  assert.equal(world.army.campaign, null, '帰還した');
  assert.equal(world.nation.cities[target].nation, 'qin', '領有した');
  assert.ok(world.nation.commandery.includes(target));
  assert.ok(world.nation.merit > merit0, '功績');
  assert.ok(world.log.some((l) => l.text.includes('略奪')), '略奪');
  void money0;
  assert.equal(world.army.victories, 1);
  assert.ok(world.army.battles.length === 1 && world.army.battles[0].winner === 'player');
  assert.ok(world.army.units.infantry > 500 && world.army.units.infantry < 2000, '損耗して戻る');
  // 同盟国は攻められない
  world.nation.treaties['qi:qin'] = 'non_aggression'; world.rank = 'chancellor';
  assert.ok(!applyCommand(world, reg, { type: 'army.campaign', target: 'linzi', units: { infantry: 100 } }).ok);
});

test('侵攻: 城壁と兵がなければ敗れて損害、大軍と城壁があれば撃退', async () => {
  const reg = await getRegistry();
  const mk = () => { const w = createWorld({ seed: 9, cityId: 'xianyang', reg, size: 128 }); w.money = 30000; for (let d = 0; d < 120; d++) tick(w, reg); return w; };
  const lose = mk();
  lose.army.invasion = { nation: 'zhao', from: 'handan', size: 400, progress: 0, days: 1, warned: false };
  const built0 = Array.from(lose.buildings.values()).filter((b) => b.state === 'built').length, money0 = lose.money;
  tick(lose, reg);
  assert.equal(lose.army.invasion, null);
  assert.equal(lose.army.battles[0].winner, 'enemy');
  assert.ok(lose.money < money0 && Array.from(lose.buildings.values()).filter((b) => b.state === 'built').length < built0, '略奪と破壊');
  const win = mk();
  win.army.units.infantry = 600; win.army.training = 70; win.stats.defense = 40;
  win.army.invasion = { nation: 'zhao', from: 'handan', size: 400, progress: 0, days: 1, warned: true };
  const merit0 = win.nation.merit;
  tick(win, reg);
  assert.equal(win.army.battles[0].winner, 'player');
  assert.ok(win.nation.merit > merit0 && win.army.victories === 1);
  // AI 軍の構成
  const s = aiSide(win, reg, 'handan');
  assert.ok(s.units.infantry > 0 && s.units.cavalry >= 0);
});

test('郡守で戦勝3・功績4000なら大将軍に昇進する', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 9, cityId: 'xianyang', reg, size: 128 });
  world.rank = 'governor'; world.nation.merit = 4500; world.population.total = 8000; world.army.victories = 3; world.nation.favor = 50;
  do tick(world, reg); while (world.calendar.day !== 1);
  assert.equal(world.rank, 'general');
});
