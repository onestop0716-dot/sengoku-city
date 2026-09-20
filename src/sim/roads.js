// 道路の敷設・撤去と「道路までの距離」マップ。
import { distanceMap, idx, inBounds } from '../core/grid.js';

export function canBuildRoad(world, reg, x, y) {
  if (!inBounds(world.map.w, world.map.h, x, y)) return false;
  const i = idx(world.map.w, x, y);
  const t = reg.tiles[world.map.tile[i]];
  if (!t.buildable) return false;
  if (world.buildingAt[i] !== -1) return false;
  if (world.structAt && world.structAt[i] !== -1) return false;
  return true;
}

/** 経路に沿って道路を敷く。銭が尽きたら途中で止まる。戻り値: 敷いたマス数 */
export function buildRoadPath(world, reg, path) {
  const cost = reg.balance.road.costPerTile;
  const w = world.map.w;
  let built = 0, cleared = 0;
  for (const [x, y] of path) {
    const i = idx(w, x, y);
    if (world.roads[i]) continue;
    if (!canBuildRoad(world, reg, x, y)) continue;
    if (world.money < cost) break;
    world.money -= cost;
    world.roads[i] = 1;
    // 森は切り開かれて平地になる
    if (reg.tiles[world.map.tile[i]].clearable) { world.map.tile[i] = reg.tileIndex.get('plain'); world.dirty.trees = true; cleared++; }
    world.zones[i] = 0;
    world.dirty.tiles.add(i);
    built++;
  }
  if (built) world.roadDirty = true;
  if (cleared) world.log.push({ day: world.day, text: `森 ${cleared} マスを伐採して道路にしました` });
  return built;
}

export function removeRoadAt(world, x, y) {
  const i = idx(world.map.w, x, y);
  if (!world.roads[i]) return false;
  world.roads[i] = 0;
  world.roadDirty = true;
  world.dirty.tiles.add(i);
  return true;
}

/** 道路距離マップを必要なら再計算する */
export function ensureRoadDist(world, reg) {
  if (!world.roadDirty && world.roadDist) return world.roadDist;
  const { w, h } = world.map;
  world.roadDist = distanceMap(w, h, (i) => world.roads[i] === 1, reg.balance.road.maxRoadDistance + 1);
  world.roadDirty = false;
  return world.roadDist;
}
