// World: ゲーム状態のすべて（描画状態は含まない）。tick() で1日進む。
import { createRng } from '../core/rng.js';
import { lPath } from '../core/grid.js';
import { createCalendar, advanceDay } from './calendar.js';
import { generateTerrain } from './terrain/generate.js';
import { buildRoadPath, ensureRoadDist } from './roads.js';
import { tickZones, housingCapacity } from './zones.js';

/**
 * @param {{seed:number, cityId:string, reg:object, size?:number, money?:number}} opts
 */
export function createWorld({ seed, cityId, reg, size, money }) {
  const city = reg.cityById.get(cityId);
  if (!city) throw new Error(`都市 ${cityId} がありません`);
  const w = size || reg.balance.map.defaultSize, h = w;
  const map = generateTerrain({ w, h, seed, profile: city.terrainProfile, reg });
  const world = {
    version: 1,
    seed, cityId, nationId: city.nation,
    rng: createRng(seed),
    day: 0,
    calendar: createCalendar(reg.balance.time.startYear),
    map,
    roads: new Uint8Array(w * h), roadDist: null, roadDirty: true,
    zones: new Uint8Array(w * h),
    buildingAt: new Int32Array(w * h).fill(-1),
    buildings: new Map(), nextBuildingId: 1,
    money: money ?? reg.balance.start.money,
    // フェーズ2で本実装。今は暫定値
    demand: { ...reg.balance.placeholders.demand },
    security: reg.balance.placeholders.security,
    foodSufficient: reg.balance.placeholders.foodSufficient,
    services: { water: null, marketDist: null },
    stats: { housingCapacity: 0 },
    log: [],
    dirty: { tiles: new Set(), buildings: false, trees: true },
  };
  // 初期道路: 中央に十字路
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const saved = world.money;
  buildRoadPath(world, reg, lPath(cx - 6, cy, cx + 6, cy));
  buildRoadPath(world, reg, lPath(cx, cy - 6, cx, cy + 6));
  world.money = saved;
  ensureRoadDist(world, reg);
  world.log.push({ day: 0, text: `${reg.nationById.get(city.nation).name}の${city.name}に県令として着任しました` });
  return world;
}

/** 1日進める */
export function tick(world, reg) {
  world.day++;
  const flags = advanceDay(world.calendar);
  tickZones(world, reg, world.rng);
  world.stats.housingCapacity = housingCapacity(world, reg);
  if (world.log.length > 200) world.log.splice(0, world.log.length - 200);
  return flags;
}
