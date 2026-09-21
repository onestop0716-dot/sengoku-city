// 表示モード（データマップ）の値: 区画の集計と未建築フラグ、色のグラデーション、水・繁栄度の値、配置の改善見込み、問題の場所。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { createWorld, tick } from '../src/sim/world.js';
import { applyCommand } from '../src/sim/commands.js';
import { computeZoneMap, STATE_MODES, FLAG, ZONE_KIND, gradientColor, previewImprovement, worstTile, modeForEffects, relatedStructures } from '../src/sim/view-data.js';

test('色は 悪い=赤 → 普通=黄 → 良い=緑', () => {
  assert.deepEqual(gradientColor(0), [220, 60, 50]);
  assert.deepEqual(gradientColor(0.5), [220, 210, 50]);
  assert.deepEqual(gradientColor(1), [60, 210, 50]);
  assert.deepEqual(gradientColor(2), gradientColor(1));
});

test('区画モード: 種別・未建築フラグ・区画ごとの集計が合う', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  const cx = 64, cy = 64;
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 5, y0: cy + 1, x1: cx + 5, y1: cy + 2 }, zoneId: 'res_commoner' });
  for (let d = 0; d < 120; d++) tick(world, reg);
  const zm = computeZoneMap(world, reg);
  const st = zm.stats.find((s) => s.id === 'res_commoner');
  assert.ok(st && st.tiles > 0 && st.built > 0 && st.built <= st.tiles, JSON.stringify(st));
  let unbuilt = 0, built = 0, roads = 0, water = 0;
  for (let i = 0; i < zm.kind.length; i++) {
    if (zm.kind[i] === ZONE_KIND.ROAD) { roads++; assert.ok(zm.flags[i] & FLAG.ROAD); } else assert.ok(!(zm.flags[i] & FLAG.ROAD));
    if (zm.kind[i] === ZONE_KIND.WATER) { water++; assert.ok(zm.flags[i] & FLAG.WATER_TILE); }
    if (zm.kind[i] >= ZONE_KIND.ZONE_BASE) { if (zm.flags[i] & FLAG.UNBUILT) { unbuilt++; assert.equal(world.buildingAt[i], -1); } else { built++; assert.notEqual(world.buildingAt[i], -1); } }
  }
  assert.equal(built, st.built); assert.equal(unbuilt, st.tiles - st.built);
  assert.ok(roads > 0 && water > 0);
});

test('水モード: 井戸の範囲は 1、川の近くは 0.75、それ以外は 0。配置プレビューは新たに水を得るマスだけ数える', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  tick(world, reg);
  const d = STATE_MODES.water.compute(world, reg);
  const w = world.map.w;
  const wellDef = reg.structureById.get('well');
  const range = reg.balance.prosperity.water.range;
  let far = null;
  for (let y = 10; y < 118 && !far; y++) for (let x = 10; x < 118; x++) { const i = y * w + x; if (!reg.tiles[world.map.tile[i]].water && world.map.waterDist[i] > range + 12 && !world.services.water[i] && !world.roads[i] && reg.tiles[world.map.tile[i]].buildable) { far = [x, y]; break; } }
  assert.ok(far, '水の遠いマスがある');
  assert.equal(d.values[far[1] * w + far[0]], 0);
  const p = previewImprovement(world, reg, wellDef, far[0], far[1], 'water');
  assert.ok(p.tiles.length > 200 && p.text.includes('新たに水を得る'), p.text);
  const r = applyCommand(world, reg, { type: 'structure.place', typeId: 'well', x: far[0], y: far[1] });
  assert.ok(r.ok, r.message);
  for (let dd = 0; dd < 40; dd++) tick(world, reg);
  const d2 = STATE_MODES.water.compute(world, reg);
  assert.equal(d2.values[(far[1] + 3) * w + far[0]], 1, '井戸の完成後は範囲内が 1');
  assert.ok(relatedStructures(world, reg, 'water').some((s) => s.radius === wellDef.effects.find((e) => e.type === 'water').radius));
  const p2 = previewImprovement(world, reg, wellDef, far[0] + 1, far[1] + 1, 'water');
  assert.ok(p2.tiles.length < p.tiles.length, '既に水がある所は改善に数えない');
});

test('繁栄度モード: 区画があって基準未満のマスにフラグが付き、問題の場所はいちばん低いマス', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  const cx = 64, cy = 64;
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 20, y0: cy + 20, x1: cx + 24, y1: cy + 22 }, zoneId: 'res_commoner' });   // 道路から遠い
  tick(world, reg);
  const d = STATE_MODES.prosperity.compute(world, reg);
  const w = world.map.w, thr = reg.balance.growth.buildThreshold;
  let flagged = 0;
  for (let y = cy + 20; y <= cy + 22; y++) for (let x = cx + 20; x <= cx + 24; x++) { const i = y * w + x; if (!world.zones[i]) continue; if (d.raw[i] < thr) { flagged++; assert.ok(d.flags[i] & FLAG.BELOW_THRESHOLD); } else assert.ok(!(d.flags[i] & FLAG.BELOW_THRESHOLD)); }
  assert.ok(flagged > 0, '道路から遠い区画は基準未満');
  const worst = worstTile(world, reg, 'prosperity', d);
  assert.ok(worst && world.zones[worst[1] * w + worst[0]] && d.raw[worst[1] * w + worst[0]] < thr);
  const desc = STATE_MODES.prosperity.describe(world, reg, worst[1] * w + worst[0], d);
  assert.ok(desc.value.includes('基準') && desc.parts.some(([k]) => k === '道路'), JSON.stringify(desc));
});

test('全モードが値を返し、効果種別からモードが引ける', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128 });
  tick(world, reg);
  for (const [id, m] of Object.entries(STATE_MODES)) {
    const d = m.compute(world, reg);
    assert.equal(d.values.length, world.map.w * world.map.h, id);
    for (let i = 0; i < d.values.length; i += 97) assert.ok(d.values[i] >= 0 && d.values[i] <= 1, `${id}: ${d.values[i]}`);
    const desc = m.describe(world, reg, 64 * 128 + 64, d);
    assert.ok(typeof desc.value === 'string' && Array.isArray(desc.parts), id);
  }
  assert.equal(modeForEffects(reg.structureById.get('well').effects), 'water');
  assert.equal(modeForEffects(reg.structureById.get('market_hall').effects), 'market');
  assert.equal(modeForEffects(reg.structureById.get('prison').effects), 'security');
  assert.equal(modeForEffects(reg.structureById.get('bridge').effects), null);
  assert.ok(worstTile(world, reg, 'zones'));
});

test('道路が届かない区画は区画モードで点線、道路モードで値が低く、集計に「道路なし」が出る', async () => {
  const reg = await getRegistry();
  const world = createWorld({ seed: 11, cityId: 'chen', reg, size: 128, village: false });
  const cx = 64, cy = 64;
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx + 20, y0: cy + 20, x1: cx + 24, y1: cy + 22 }, zoneId: 'res_commoner' });   // 道路なし
  applyCommand(world, reg, { type: 'zone.set', rect: { x0: cx - 4, y0: cy + 1, x1: cx + 4, y1: cy + 1 }, zoneId: 'res_commoner' });         // 中央の道路沿い
  tick(world, reg);
  const zm = computeZoneMap(world, reg);
  const w = world.map.w;
  const st = zm.stats.find((s) => s.id === 'res_commoner');
  assert.ok(st.noRoad >= 10 && st.noRoad < st.tiles, JSON.stringify(st));
  assert.ok(zm.flags[(cy + 21) * w + cx + 22] & FLAG.BELOW_THRESHOLD, '遠い区画は点線');
  assert.ok(!(zm.flags[(cy + 1) * w + cx + 2] & FLAG.BELOW_THRESHOLD), '道路沿いは点線なし');
  const d = STATE_MODES.road.compute(world, reg);
  assert.ok(d.values[(cy + 21) * w + cx + 22] < 0.3 && d.values[(cy + 1) * w + cx + 2] > 0.6);
  assert.ok(STATE_MODES.road.describe(world, reg, (cy + 21) * w + cx + 22).parts.some(([k, v]) => k === '判定' && v.includes('建たない')));
});
