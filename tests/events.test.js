// フェーズ7: イベントの発火と選択、備えによる軽減、史実イベント、実績、エンディング、セーブスロットとファイル形式。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { fireEvent, resolveEvent, mitigationOf, tickEventsMonthly } from '../src/sim/events.js';
import { tickAchievementsMonthly, checkEnding } from '../src/sim/achievements.js';
import { fieldYield } from '../src/sim/farming.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save/serialize.js';

// localStorage の代わり
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { saveToSlot, loadFromSlot, listSlots, makeSaveData } = await import('../src/app/saves.js');

test('洪水: 川辺の建物が壊れ、選択肢を選ぶまで保留。堤防があれば被害が減る', async () => {
  const reg = await getRegistry();
  const mk = () => { const w = createWorld({ seed: 21, cityId: 'chen', reg, size: 128 }); w.money = 50000; for (let d = 0; d < 200; d++) tick(w, reg); return w; };
  const w = mk();
  const flood = reg.eventById.get('flood');
  const built0 = w.buildings.size;
  const rec = fireEvent(w, reg, flood);
  assert.ok(w.events.pending && w.events.pending.id === 'flood');
  assert.ok(w.buildings.size <= built0);
  assert.equal(tickEventsMonthly(w, reg), null, '保留中は次の出来事が起きない');
  const loy0 = w.loyalty, grain0 = w.grain.civil + w.grain.granary;
  const r = applyCommand(w, reg, { type: 'event.choose', choice: 0 });
  assert.ok(r.ok, r.message);
  assert.equal(w.events.pending, null);
  assert.ok(w.loyalty > loy0 && w.grain.civil + w.grain.granary < grain0, '官倉を開くと民忠が上がり穀物が減る');
  assert.equal(w.events.history[0].choice, flood.choices[0].text);
  assert.ok(rec.day === w.day);
  // 堤防の軽減
  const w2 = mk();
  w2.structures.set(999, { id: 999, type: 'levee', state: 'built', x: 1, y: 1, w: 1, h: 1 });
  assert.equal(mitigationOf(w2, reg, flood).factor, 0.4);
  assert.ok(!resolveEvent(w2, reg, 0).ok, '保留がなければ選べない');
});

test('旱魃は収量を一時的に下げ、数か月で戻る。条件を満たさない出来事は起きない', async () => {
  const reg = await getRegistry();
  const w = createWorld({ seed: 21, cityId: 'chen', reg, size: 128 });
  for (let d = 0; d < 60; d++) tick(w, reg);
  const field = Array.from(w.buildings.values()).find((b) => b.category === 'field' && b.state === 'built');
  const y0 = fieldYield(w, reg, field).grain;
  fireEvent(w, reg, reg.eventById.get('drought'));
  applyCommand(w, reg, { type: 'event.choose', choice: 2 });
  assert.ok(fieldYield(w, reg, field).grain < y0 * 0.8, '減収');
  for (let d = 0; d < 130; d++) tick(w, reg);
  assert.ok(fieldYield(w, reg, field).grain > y0 * 0.8, '4か月後には戻る');
  // 反乱は民忠 25 未満でのみ
  w.loyalty = 80; w.security = 80; w.rng.next = () => 0;   // 確率を必ず通す
  const fired = tickEventsMonthly(w, reg);
  assert.ok(!fired || fired.id !== 'rebellion');
});

test('史実イベントは年と国で起き、一度だけ。楚の遷都で首都が寿春になる', async () => {
  const reg = await getRegistry();
  const w = createWorld({ seed: 21, cityId: 'xianyang', reg, size: 128 });
  w.money = 50000;
  while (w.calendar.year < -246 || w.calendar.month < 3) { tick(w, reg); if (w.events.pending) applyCommand(w, reg, { type: 'event.choose', choice: 0 }); }
  assert.ok(w.events.fired.includes('h_zhengguo'), '前246年に鄭国渠');
  assert.ok(w.events.history.some((h) => h.id === 'h_zhengguo' && h.choice));
  const chu = createWorld({ seed: 21, cityId: 'shangcai', reg, size: 128 });
  while (chu.calendar.year < -241 || chu.calendar.month < 4) { tick(chu, reg); if (chu.events.pending) applyCommand(chu, reg, { type: 'event.choose', choice: 0 }); }
  assert.equal(chu.nation.capitals?.chu, 'shouchun');
  assert.ok(chu.events.fired.includes('h_hezong') && chu.events.fired.filter((x) => x === 'h_hezong').length === 1);
  assert.ok(!chu.events.fired.includes('h_zhengguo'), '秦の出来事は楚には起きない');
});

test('実績とエンディング: 人口・官位・統一で達成し、統一で終了。セーブに含まれる', async () => {
  const reg = await getRegistry();
  const w = createWorld({ seed: 21, cityId: 'xianyang', reg, size: 128 });
  w.population.total = 1200; w.rank = 'governor';
  const r = tickAchievementsMonthly(w, reg);
  assert.ok(r.gained.some((a) => a.id === 'pop_1000') && r.gained.some((a) => a.id === 'rank_governor'));
  assert.equal(tickAchievementsMonthly(w, reg).gained.length, 0, '二度は付かない');
  for (const n of reg.nations) w.nation.cities[n.capital].nation = 'qin';
  const e = checkEnding(w, reg);
  assert.equal(e.kind, 'unified');
  assert.ok(tickAchievementsMonthly(w, reg).gained.some((a) => a.id === 'unification'));
  const w2 = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))), reg);
  assert.deepEqual(w2.achievements, w.achievements); assert.deepEqual(w2.ending, w.ending);
  const lost = createWorld({ seed: 21, cityId: 'yong', reg, size: 128 });
  lost.nation.cities.xianyang.nation = 'zhao';
  assert.equal(checkEnding(lost, reg).kind, 'defeat');
});

test('セーブスロット: 保存・一覧・読込ができ、ファイル形式は version と meta を持つ', async () => {
  const reg = await getRegistry();
  const w = createWorld({ seed: 21, cityId: 'xianyang', reg, size: 128 });
  for (let d = 0; d < 40; d++) tick(w, reg);
  assert.ok(saveToSlot(w, reg, '1').ok);
  const slots = listSlots();
  assert.ok(slots.find((s) => s.slot === '1' && !s.empty && s.meta.cityName === '咸陽'));
  const d = loadFromSlot('1');
  assert.equal(d.version, 1); assert.equal(d.meta.day, 40); assert.equal(d.difficulty, 'normal');
  const w2 = deserializeWorld(d, reg);
  assert.equal(w2.day, w.day); assert.equal(w2.money, w.money);
  const file = makeSaveData(w, reg);
  assert.ok(file.meta.savedAt && file.map.w === 128);
});
