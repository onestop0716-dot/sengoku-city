// 農業: 作物ごとの収穫月に、畑の収量を計算して穀物と銭（田租）にする。
import { idx } from '../core/grid.js';
import { modsOf } from './modifiers.js';
import { isActive } from './satisfaction.js';

/** 畑1枚（w×h マス）の年間収量（石）。桑・麻は 0 で、代わりに産物の価値を返す。地形・肥沃度・灌漑はマスごとに見て足す */
export function fieldYield(world, reg, b) {
  const crop = reg.cropById.get(reg.buildingById.get(b.buildingType).crop);
  if (!crop) return { grain: 0, value: 0, crop: null };
  const E = reg.balance.economy;
  const city = reg.cityById.get(world.cityId);
  const climate = crop.climate?.[city.terrainProfile.climate] ?? 1;
  const affinity = city.cropAffinity?.[crop.id] ?? 1;
  const level = E.yieldLevelFactor[Math.min(b.level, E.yieldLevelFactor.length) - 1];
  const worker = world.stats.farmWorkerRatio ?? 1;          // 働き手が足りないと減る
  const M = modsOf(world);
  const tech = M.farmYield * (1 + (M.cropYield[crop.id] || 0)) * (1 - Math.min(0.8, world.events && world.day <= world.events.farmPenaltyUntil ? world.events.farmPenalty : 0));   // 技術（鉄製農具など）と田嗇夫、災害の減収
  let tiles = 0;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    const i = idx(world.map.w, x, y);
    const terrain = crop.terrain?.[reg.tiles[world.map.tile[i]].id] ?? 0.8;
    const fert = 0.4 + world.map.fertility[i] * 1.2;
    const irrigated = world.services.irrigation && world.services.irrigation[i] ? 1 + (crop.irrigationBonus ?? 0.3) + M.irrigationBonus : 1;
    tiles += terrain * fert * irrigated;
  }
  const factor = tiles * climate * affinity * level * worker * tech;
  if (crop.baseYield > 0) return { grain: crop.baseYield * factor, value: 0, crop };
  return { grain: 0, value: (E.productValuePerTile[crop.id] || 0) * factor, crop };
}

/** 月初に呼ぶ。今月が収穫月の作物を収穫する。戻り値: {grain, value, tiles} */
export function harvest(world, reg, month) {
  const E = reg.balance.economy;
  let grain = 0, value = 0, tiles = 0;
  for (const b of world.buildings.values()) {
    if (b.category !== 'field' || !isActive(world, reg, b)) continue;
    const crop = reg.cropById.get(reg.buildingById.get(b.buildingType).crop);
    if (!crop || crop.harvestMonth !== month) continue;
    const y = fieldYield(world, reg, b);
    grain += y.grain; value += y.value; tiles++;
  }
  if (tiles === 0) return { grain: 0, value: 0, tiles: 0, tax: 0 };
  // 穀物: 積穀率の分は官倉へ（上限あり）、残りは民間へ
  const toGranary = Math.min(grain * world.policy.granaryShare, Math.max(0, world.grain.granaryCap - world.grain.granary));
  world.grain.granary += toGranary;
  world.grain.civil += grain - toGranary;
  // 田租: 収穫の価値 × 税率（史実の現物納を銭に簡略化）
  const totalValue = grain * E.grainPrice + value;
  const tax = totalValue * world.policy.taxLand * modsOf(world).taxIncome;
  world.money += tax;
  world.finance.month.income['田租'] += tax;
  world.finance.lastHarvest = { month, grain: Math.round(grain), value: Math.round(totalValue), tax: Math.round(tax), tiles };
  world.log.push({ day: world.day, text: `収穫: 畑 ${tiles} 枚から穀物 ${Math.round(grain)} 石。田租 ${Math.round(tax)} 銭` });
  return { grain, value, tiles, tax };
}
