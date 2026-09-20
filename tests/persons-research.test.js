// フェーズ4: 人材の登用・任命の効果、忠誠と死去、研究の進行と解禁、国別の初期技術。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { listCandidates, listPatrons, officeSlots, effectiveStats } from '../src/sim/persons.js';
import { canResearch, researchSpeed } from '../src/sim/research.js';
import { computeModifiers } from '../src/sim/modifiers.js';
import { fieldYield } from '../src/sim/farming.js';
import { lockReason } from '../src/sim/structures.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save/serialize.js';

const toMonth = (world, reg) => { do tick(world, reg); while (world.calendar.day !== 1); };

test('秦で始めると呂不韋が後ろ盾、李斯が登用候補。他国の人物や没した人物は出ない', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 3, cityId: 'xianyang', reg, size: 128 });
  assert.deepEqual(listPatrons(world, reg).map((p) => p.id), ['lu_buwei']);
  const ids = listCandidates(world, reg).map((c) => c.person.id);
  assert.ok(ids.includes('li_si') && ids.includes('meng_ao'), ids.join(','));
  assert.ok(!ids.includes('lu_buwei') && !ids.includes('li_mu') && !ids.includes('wang_jian'), '後ろ盾・他国・未登場は候補にならない');
  assert.deepEqual(world.techs, ['merit_rank', 'shiwu_system', 'commandery_system'], '秦の初期技術');
  assert.equal(officeSlots(world, reg), 4, '県令3 + 郡県制1');
});

test('李斯を県丞に任命すると税収（口賦・田租）が増え、俸禄が引かれる', async () => {
  const reg = await getRegistry();
  const mk = () => { const w = createWorld({ seed: 3, cityId: 'xianyang', reg, size: 128 }); w.money = 100000; return w; };
  const a = mk(), b = mk();
  const r = applyCommand(b, reg, { type: 'person.recruit', personId: 'li_si' });
  assert.ok(r.ok, r.message);
  assert.ok(b.money < 100000, '礼金が引かれる');
  const ap = applyCommand(b, reg, { type: 'office.appoint', officeId: 'assistant_magistrate', personId: 'li_si' });
  assert.ok(ap.ok, ap.message);
  assert.ok(b.mods.taxIncome > 1.2, `県丞の効果 ${b.mods.taxIncome}`);
  const m = computeModifiers(b, reg);
  assert.ok(m.sources.some((s) => s.source.includes('李斯')));
  for (let i = 0; i < 2; i++) { toMonth(a, reg); toMonth(b, reg); }
  const last = (w) => w.finance.history[w.finance.history.length - 1];
  assert.ok(last(b).detail.income['口賦'] > last(a).detail.income['口賦'] * 1.15, `口賦 ${last(a).detail.income['口賦']} → ${last(b).detail.income['口賦']}`);
  assert.ok(last(b).detail.expense['俸禄'] > last(a).detail.expense['俸禄'], '俸禄が増える');
  // 兼任はできず、枠を超えられない
  assert.ok(applyCommand(b, reg, { type: 'office.appoint', officeId: 'lieutenant', personId: 'li_si' }).ok);
  assert.equal(b.offices.assistant_magistrate, null, '別の官職に移すと前の官職は空く');
  assert.ok(!applyCommand(b, reg, { type: 'office.appoint', officeId: 'general', personId: 'meng_ao' }).ok, '配下でない人物は任命できない');
});

test('研究: 前提を満たさないと始められず、進めば完成して収量が上がり、客館が解禁される', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 3, cityId: 'chen', reg, size: 128 });
  world.money = 100000;
  assert.ok(!canResearch(world, reg, 'ox_plow').ok, '牛耕は鉄製農具が先');
  const field = Array.from(world.buildings.values()).find((b) => b.category === 'field' && b.state === 'built');
  assert.ok(field, '開始時の村に畑がある');
  const before = fieldYield(world, reg, field).grain;
  assert.ok(applyCommand(world, reg, { type: 'research.start', techId: 'iron_plow' }).ok);
  const speed = researchSpeed(world, reg, 'iron_plow');
  assert.ok(speed >= 1.3, `楚は農の得意分野で速い: ${speed}`);
  const days = reg.techById.get('iron_plow').days;
  for (let d = 0; d < Math.ceil(days / speed) + 2; d++) tick(world, reg);
  assert.ok(world.techs.includes('iron_plow'), '完成する');
  assert.equal(world.research.current, null);
  const withTech = fieldYield(world, reg, field).grain;
  const saved = world.mods; world.mods = null;                       // 補正なしと比べる（人口の変化の影響を除く）
  const without = fieldYield(world, reg, field).grain; world.mods = saved;
  assert.ok(withTech > without * 1.1, `収量 ${without} → ${withTech}`);
  void before;
  assert.ok(world.finance.history.some((h) => h.detail.expense['研究費'] > 0) || world.finance.month.expense['研究費'] > 0, '研究費が引かれる');
  // 客館は技術で解禁
  const academy = reg.structureById.get('academy');
  assert.ok(lockReason(world, reg, academy)?.includes('賓客の招致'));
  applyCommand(world, reg, { type: 'research.start', techId: 'hospitality' });
  for (let d = 0; d < 400; d++) tick(world, reg);
  assert.equal(lockReason(world, reg, academy), null, '解禁された');
});

test('史実の没年に死去して官職が空き、高齢者は能力が衰える。忠誠が下がると去る', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 3, cityId: 'xianyang', reg, size: 128 });
  world.money = 100000;
  assert.ok(applyCommand(world, reg, { type: 'person.recruit', personId: 'meng_ao' }).ok);
  assert.ok(applyCommand(world, reg, { type: 'office.appoint', officeId: 'general', personId: 'meng_ao' }).ok);
  while (world.calendar.year < -240) tick(world, reg);
  assert.equal(world.offices.general, null, '蒙驁は前240年に没する');
  assert.ok(!world.persons.hired.some((h) => h.id === 'meng_ao') && world.persons.gone.includes('meng_ao'));
  assert.ok(world.log.some((l) => l.text.includes('蒙驁が没しました')));
  const lianPo = reg.personById.get('lian_po');
  const w2 = createWorld({ seed: 3, cityId: 'daliang', reg, size: 128 });
  assert.ok(effectiveStats(w2, reg, lianPo).lead < lianPo.stats.lead, '高齢の廉頗は衰える');
  // 赤字が続くと忠誠が下がって去る
  const w3 = createWorld({ seed: 3, cityId: 'xianyang', reg, size: 128 });
  w3.money = 5000;
  assert.ok(applyCommand(w3, reg, { type: 'person.recruit', personId: 'li_si' }).ok);
  w3.money = -50000;
  for (let m = 0; m < 14; m++) { toMonth(w3, reg); w3.money = -50000; }
  assert.ok(!w3.persons.hired.some((h) => h.id === 'li_si'), '去る');
});

test('人材・研究の状態はセーブに含まれ、読み込み後も同じ', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 3, cityId: 'xianyang', reg, size: 128 });
  world.money = 100000;
  applyCommand(world, reg, { type: 'person.recruit', personId: 'li_si' });
  applyCommand(world, reg, { type: 'office.appoint', officeId: 'assistant_magistrate', personId: 'li_si' });
  applyCommand(world, reg, { type: 'research.start', techId: 'iron_plow' });
  for (let d = 0; d < 50; d++) tick(world, reg);
  const w2 = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))), reg);
  assert.deepEqual(w2.offices, world.offices); assert.deepEqual(w2.research, world.research); assert.deepEqual(w2.persons, world.persons);
  assert.equal(w2.mods.taxIncome, world.mods.taxIncome);
});
