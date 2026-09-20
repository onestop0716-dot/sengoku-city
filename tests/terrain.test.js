import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry } from './_helpers.js';
import { generateTerrain } from '../src/sim/terrain/generate.js';

test('同じシードなら同じ地形', async () => {
  const reg = await getRegistry();
  const profile = reg.cityById.get('xianyang').terrainProfile;
  const a = generateTerrain({ w: 64, h: 64, seed: 123, profile, reg });
  const b = generateTerrain({ w: 64, h: 64, seed: 123, profile, reg });
  assert.deepEqual(Array.from(a.tile), Array.from(b.tile));
  assert.deepEqual(Array.from(a.height), Array.from(b.height));
  const c = generateTerrain({ w: 64, h: 64, seed: 124, profile, reg });
  assert.notDeepEqual(Array.from(a.tile), Array.from(c.tile));
});

test('各都市テンプレートで地形が妥当な比率になる', async () => {
  const reg = await getRegistry();
  const T = (id) => reg.tileIndex.get(id);
  for (const city of reg.cities) {
    const m = generateTerrain({ w: 96, h: 96, seed: 1, profile: city.terrainProfile, reg });
    const n = m.tile.length;
    const count = (id) => Array.from(m.tile).filter((t) => t === T(id)).length / n;
    const plain = count('plain'), forest = count('forest'), mountain = count('mountain'), water = count('river') + count('lake') + count('sea');
    assert.ok(plain > 0.3, `${city.name}: 平地が少なすぎる ${plain}`);
    assert.ok(forest < 0.45, `${city.name}: 森が多すぎる ${forest}`);
    assert.ok(mountain < 0.25, `${city.name}: 山が多すぎる ${mountain}`);
    if (city.terrainProfile.river !== 'none') assert.ok(count('river') > 0.005, `${city.name}: 川がない`);
    if (city.terrainProfile.coast && city.terrainProfile.coast !== 'none') assert.ok(count('sea') > 0.02, `${city.name}: 海がない`);
    assert.ok(water < 0.35, `${city.name}: 水が多すぎる ${water}`);
    // 中央は平地で建てられる
    const c = 48 * 96 + 48;
    assert.equal(m.tile[c], T('plain'), `${city.name}: 中央が平地でない`);
    // 資源がプロファイル通り置かれている
    for (const [kind, cnt] of Object.entries(city.terrainProfile.resources)) {
      if (kind === 'wood') continue;
      const ri = reg.resources.findIndex((r) => r.id === kind) + 1;
      const placed = Array.from(m.resource).filter((r) => r === ri).length;
      assert.ok(placed >= cnt, `${city.name}: 資源 ${kind} が ${placed} マスしか置かれていない`);
    }
  }
});
