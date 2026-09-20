// World: ゲーム状態のすべて（描画状態は含まない）。tick() で1日進む。
import { createRng } from '../core/rng.js';
import { lPath } from '../core/grid.js';
import { createCalendar, advanceDay } from './calendar.js';
import { generateTerrain } from './terrain/generate.js';
import { buildRoadPath, ensureRoadDist } from './roads.js';
import { tickZones, housingCapacity } from './zones.js';
import { harvest } from './farming.js';
import { tickFoodDaily, tickPopulationMonthly } from './population.js';
import { tickEconomyMonthly, tickEconomyYearly, updateDemand, emptyMonth } from './economy.js';

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
    // 経済・人口（フェーズ2）
    policy: { taxLand: 0.1, taxHead: 0.1, taxMarket: 0.1, taxCustoms: 0.1, granaryShare: 0.1, relief: true },
    population: { total: 0, commoner: 0, shi: 0, noble: 0, farmers: 0, artisans: 0, merchants: 0, unemployed: 0 },
    grain: { civil: reg.balance.start.grain ?? 300, granary: 0, granaryCap: reg.balance.economy.granaryBaseCapacity },
    loyalty: 60, security: reg.balance.placeholders.security, hygiene: 70,
    foodSufficiency: 1, foodSufficient: true,
    finance: { month: emptyMonth(), history: [], yearIncome: 0, recordYear: reg.balance.time.startYear, recordMonth: 1, lastHarvest: null, lastTribute: 0 },
    demand: { residential: 40, farm: 50, market: 0, workshop: 0 },
    services: { water: null, marketDist: null },
    stats: { housingCapacity: 0, jobs: 0, farmJobs: 0, farmTiles: 0, farmWorkerRatio: 1, capacity: { commoner: 0, shi: 0, noble: 0 } },
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
  const moneyBefore = world.money;
  tickZones(world, reg, world.rng);
  world.finance.month.expense['建設費'] += Math.max(0, moneyBefore - world.money);   // 区画の自動建設にかかった銭
  world.stats.housingCapacity = housingCapacity(world, reg);
  tickFoodDaily(world, reg);
  if (flags.newMonth) {
    if (flags.newYear) tickEconomyYearly(world, reg);
    tickEconomyMonthly(world, reg);
    harvest(world, reg, world.calendar.month);
    tickPopulationMonthly(world, reg);
    updateDemand(world, reg);
  }
  if (world.log.length > 200) world.log.splice(0, world.log.length - 200);
  return flags;
}
