import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataNode, createRegistry } from '../src/data/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let cached = null;
export async function getRegistry() {
  if (!cached) cached = createRegistry(await loadDataNode(path.join(root, 'data')));
  return cached;
}

/** 長方形を建物で埋める（テスト用。範囲で埋めるコマンドと同じ） */
export function fill(applyCommand, world, reg, typeId, x0, y0, x1, y1, rotation = null) {
  return applyCommand(world, reg, { type: 'build.area', typeId, rect: { x0, y0, x1, y1 }, rotation });
}
/** 建物を完成させる（建設日数を待たずに試すとき） */
export function finishAll(world) {
  for (const b of world.buildings.values()) if (b.state === 'building') { b.state = 'built'; b.progress = b.buildDays; }
  world.dirty.buildings = true;
}
/** 長方形を平地にして水辺から離す（地形に左右されずに試すため） */
export function flatten(world, reg, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * world.map.w + x; world.map.tile[i] = reg.tileIndex.get('plain'); world.map.waterDist[i] = 99; }
}
