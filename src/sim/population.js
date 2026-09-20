// 人口・身分・民忠・治安・衛生・食糧充足。月次で更新し、食糧の消費は毎日。
import { housingCapacity } from './zones.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 住居の収容人数を身分別に集計 */
export function capacityByClass(world, reg) {
  const cap = { commoner: 0, shi: 0, noble: 0 };
  let farmTiles = 0, farmhouses = 0;
  for (const b of world.buildings.values()) {
    if (b.state !== 'built') continue;
    const def = reg.buildingById.get(b.buildingType);
    const c = def.levels[b.level - 1].capacity || 0;
    if (b.buildingType === 'house_shi') cap.shi += c;
    else if (b.buildingType === 'house_noble') cap.noble += c;
    else if (b.category === 'residential' || b.category === 'farm_house') cap.commoner += c;
    if (b.category === 'field') farmTiles++;
    if (b.category === 'farm_house') farmhouses++;
  }
  return { cap, farmTiles, farmhouses };
}

/** 毎日: 食糧の消費と充足率 */
export function tickFoodDaily(world, reg) {
  const E = reg.balance.economy;
  const need = world.population.total * E.consumptionPerPersonPerYear / 360;
  let got = Math.min(need, world.grain.civil);
  world.grain.civil -= got;
  if (got < need - 1e-9 && world.policy.relief) {      // 救荒: 官倉から放出
    const r = Math.min(need - got, world.grain.granary);
    world.grain.granary -= r; got += r;
  }
  const ratio = need > 0 ? got / need : 1;
  world.foodSufficiency = world.foodSufficiency * 0.9 + ratio * 0.1;   // なだらかに追従
  world.foodSufficient = world.foodSufficiency >= 0.9;
}

/** 月次: 人口の増減、身分、民忠、治安、衛生 */
export function tickPopulationMonthly(world, reg) {
  const P = reg.balance.population, E = reg.balance.economy;
  const { cap, farmTiles, farmhouses } = capacityByClass(world, reg);
  const pop = world.population;
  // 仕事: 農地 → 工房 → 市 の順に就く
  const farmJobs = farmTiles * E.farmJobsPerTile;
  let workshopJobs = 0, marketJobs = 0;
  for (const b of world.buildings.values()) {
    if (b.state !== 'built') continue;
    const def = reg.buildingById.get(b.buildingType);
    if (def.jobs) { const j = Math.round(def.jobs * (1 + 0.5 * (b.level - 1))); if (b.category === 'workshop') workshopJobs += j; else if (b.category === 'market') marketJobs += j; }
  }
  const jobs = farmJobs + workshopJobs + marketJobs;
  const workers = Math.round(pop.commoner * 0.8);
  pop.farmers = Math.min(workers, farmJobs);
  pop.artisans = Math.min(workers - pop.farmers, workshopJobs);
  pop.merchants = Math.min(workers - pop.farmers - pop.artisans, marketJobs);
  pop.unemployed = Math.max(0, workers - pop.farmers - pop.artisans - pop.merchants);
  world.stats.workshopJobs = workshopJobs; world.stats.marketJobs = marketJobs;
  const unemployedRatio = workers > 0 ? pop.unemployed / workers : 0;
  world.stats.farmWorkerRatio = farmJobs > 0 ? clamp(pop.farmers / farmJobs, 0.4, 1) * (1 + E.farmhouseBonus * Math.min(1, farmhouses / Math.max(1, farmTiles / 8))) : 1;
  world.stats.jobs = jobs; world.stats.farmJobs = farmJobs; world.stats.farmTiles = farmTiles;

  // 民忠（目標値へなだらかに）
  const L = P.loyalty;
  const foodTerm = world.foodSufficiency >= E.famineThreshold ? (world.foodSufficient ? L.foodOk : 0) : -L.foodShort;
  const target = L.base - world.policy.taxHead * L.headTax - world.policy.taxLand * L.landTax + foodTerm - unemployedRatio * L.unemployed + (world.security - 50) * L.securityScale + (world.services.loyaltyBonus || 0);
  world.loyalty = clamp(world.loyalty + (clamp(target, 0, 100) - world.loyalty) * L.smoothing, 0, 100);
  // 治安
  const S = P.security;
  const sTarget = S.base - unemployedRatio * S.unemployed - (pop.total / 1000) * S.crowdingPer1000 + pop.shi * 0.02 + (world.services.securityBonus || 0);
  world.security = clamp(world.security + (clamp(sTarget, 0, 100) - world.security) * S.smoothing, 0, 100);
  // 衛生（井戸・水路はフェーズ3）
  world.hygiene = clamp(P.hygiene.base - (pop.total / 500) * P.hygiene.per500 + (world.services.hygieneBonus || 0), 0, 100);

  // 人口の増減（身分ごとに住居の収容数へ向かう）
  const A = P.attract || { loyaltyFloor: 30, loyaltySpan: 50, foodShortFactor: 0.3 };
  const attract = clamp((world.loyalty - A.loyaltyFloor) / A.loyaltySpan, 0, 1) * (world.foodSufficient ? 1 : A.foodShortFactor);
  const move = (cur, capacity) => {
    let n = cur;
    n += n * P.naturalGrowthPerMonth;
    if (capacity > n) n += (capacity - n) * P.immigrationRate * attract + (n === 0 && capacity > 0 && attract > 0 ? (P.seedImmigrants ?? 2) : 0);
    if (world.loyalty < L.emigrateBelow || world.foodSufficiency < E.famineThreshold) n -= n * P.emigrationRate;
    if (n > capacity) n -= (n - capacity) * 0.5;          // 住居不足なら流出
    return Math.max(0, n);
  };
  pop.commoner = move(pop.commoner, cap.commoner);
  pop.shi = move(pop.shi, cap.shi);
  pop.noble = move(pop.noble, cap.noble);
  pop.total = Math.round(pop.commoner + pop.shi + pop.noble);
  world.stats.housingCapacity = housingCapacity(world, reg);
  world.stats.capacity = cap;
  if (world.foodSufficiency < E.famineThreshold && pop.total > 0 && world.calendar.month % 3 === 1) world.log.push({ day: world.day, text: '飢饉: 食糧が足りず、民が流出しています' });
}
