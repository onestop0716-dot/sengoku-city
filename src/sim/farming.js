// 農業: 作物ごとの収穫月に、畑の収量を計算して穀物と銭（田租）にする。
import { idx } from '../core/grid.js';

/** 畑1マスの年間収量（石）。桑・麻は 0 で、代わりに産物の価値を返す */
export function fieldYield(world, reg, b) {
  const crop = reg.cropById.get(reg.buildingById.get(b.buildingType).crop);
  if (!crop) return { grain: 0, value: 0, crop: null };
  const E = reg.balance.economy;
  const i = idx(world.map.w, b.x, b.y);
  const tileId = reg.tiles[world.map.tile[i]].id;
  const city = reg.cityById.get(world.cityId);
  const terrain = crop.terrain?.[tileId] ?? 0.8;
  const climate = crop.climate?.[city.terrainProfile.climate] ?? 1;
  const affinity = city.cropAffinity?.[crop.id] ?? 1;
  const fert = 0.4 + world.map.fertility[i] * 1.2;
  const level = E.yieldLevelFactor[Math.min(b.level, E.yieldLevelFactor.length) - 1];
  const worker = world.stats.farmWorkerRatio ?? 1;          // 働き手が足りないと減る
  const factor = terrain * climate * affinity * fert * level * worker;
  if (crop.baseYield > 0) return { grain: crop.baseYield * factor, value: 0, crop };
  return { grain: 0, value: (E.productValuePerTile[crop.id] || 0) * factor, crop };
}

/** 月初に呼ぶ。今月が収穫月の作物を収穫する。戻り値: {grain, value, tiles} */
export function harvest(world, reg, month) {
  const E = reg.balance.economy;
  let grain = 0, value = 0, tiles = 0;
  for (const b of world.buildings.values()) {
    if (b.category !== 'field' || b.state !== 'built') continue;
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
  const tax = totalValue * world.policy.taxLand;
  world.money += tax;
  world.finance.month.income['田租'] += tax;
  world.finance.lastHarvest = { month, grain: Math.round(grain), value: Math.round(totalValue), tax: Math.round(tax), tiles };
  world.log.push({ day: world.day, text: `収穫: ${tiles} 区画から穀物 ${Math.round(grain)} 石。田租 ${Math.round(tax)} 銭` });
  return { grain, value, tiles, tax };
}
