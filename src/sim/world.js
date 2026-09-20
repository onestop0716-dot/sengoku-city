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
import { tickStructures, placeInitialStructures, recomputeServices } from './structures.js';
import { placeStartingVillage } from './start-village.js';
import { ensurePersonsState, tickPersonsMonthly, tickPersonsYearly } from './persons.js';
import { ensureResearchState, tickResearchDaily } from './research.js';
import { refreshModifiers } from './modifiers.js';

/**
 * @param {{seed:number, cityId:string, reg:object, size?:number, money?:number}} opts
 */
export function createWorld({ seed, cityId, reg, size, money, village = true }) {
  const city = reg.cityById.get(cityId);
  if (!city) throw new Error(`都市 ${cityId} がありません`);
  const w = size || reg.balance.map.defaultSize, h = w;
  const map = generateTerrain({ w, h, seed, profile: city.terrainProfile, reg });
  const world = {
    version: 1,
    seed, cityId, nationId: city.nation, difficulty: reg.difficulty || 'normal',
    rng: createRng(seed),
    day: 0,
    calendar: createCalendar(reg.balance.time.startYear),
    map,
    roads: new Uint8Array(w * h), roadDist: null, roadDirty: true,
    zones: new Uint8Array(w * h),
    buildingAt: new Int32Array(w * h).fill(-1),
    buildings: new Map(), nextBuildingId: 1,
    structures: new Map(), nextStructureId: 1, structAt: new Int32Array(w * h).fill(-1), servicesDirty: true,
    rank: 'magistrate', techs: [...(reg.nationById.get(city.nation)?.startTechs || [])], goods: {},
    persons: { hired: [], visitors: [], gone: [] }, offices: null, research: { current: null, progress: 0 }, mods: null,
    money: money ?? reg.balance.start.money,
    // 経済・人口（フェーズ2）
    policy: { taxLand: 0.1, taxHead: 0.1, taxMarket: 0.1, taxCustoms: 0.1, granaryShare: 0.1, relief: true },
    population: { total: 0, commoner: 0, shi: 0, noble: 0, farmers: 0, artisans: 0, merchants: 0, unemployed: 0 },
    grain: { civil: reg.balance.start.grain ?? 300, granary: 0, granaryCap: reg.balance.economy.granaryBaseCapacity },
    loyalty: 60, security: reg.balance.placeholders.security, hygiene: 70,
    foodSufficiency: 1, foodSufficient: true,
    finance: { month: emptyMonth(), history: [], yearIncome: 0, recordYear: reg.balance.time.startYear, recordMonth: 1, lastHarvest: null, lastTribute: 0 },
    demand: { residential: 40, farm: 50, market: 0, workshop: 0 },
    services: { water: null, marketDist: null, marketAdmin: null, irrigation: null, securityBonus: 0, loyaltyBonus: 0, hygieneBonus: 0, granaryCap: 0, defense: 0, wells: 0, docks: 0, farmDemand: 0, insideWall: null, insideCount: 0 },
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
  placeInitialStructures(world, reg);
  ensureRoadDist(world, reg);
  if (village) placeStartingVillage(world, reg);
  ensureRoadDist(world, reg);
  recomputeServices(world, reg);
  ensurePersonsState(world, reg); ensureResearchState(world); refreshModifiers(world, reg);
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
  tickStructures(world, reg);
  world.stats.housingCapacity = housingCapacity(world, reg);
  tickFoodDaily(world, reg);
  tickResearchDaily(world, reg);
  if (flags.newMonth) {
    if (flags.newYear) { tickEconomyYearly(world, reg); tickPersonsYearly(world, reg); }
    refreshModifiers(world, reg);
    tickEconomyMonthly(world, reg);
    harvest(world, reg, world.calendar.month);
    tickPopulationMonthly(world, reg);
    updateDemand(world, reg);
  }
  if (world.log.length > 200) world.log.splice(0, world.log.length - 200);
  return flags;
}
