// 区画の設定と自動成長。毎日: 既存建物の繁栄度→レベル上下、空きマスへの新築。
import { idx, inBounds, N8, rectTiles } from '../core/grid.js';
import { hash2 } from '../core/rng.js';
import { ensureRoadDist } from './roads.js';
import { chooseFacing } from './placement.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** そのマスにこの区画を設定できるか */
export function canZoneTile(world, reg, x, y, zoneDef) {
  const i = idx(world.map.w, x, y);
  const t = reg.tiles[world.map.tile[i]];
  if (world.roads[i]) return false;
  if (world.buildingAt[i] !== -1) return false;
  // 岸辺（水際のマス）には区画を置けない
  if (world.map.waterDist[i] <= (reg.balance.zoning?.shoreDistance ?? 1)) return false;
  if (zoneDef.category === 'farm') {
    if (!t.farmable) return false;
    if (t.cropOnly && !t.cropOnly.includes(zoneDef.crop)) return false;
    return true;
  }
  return !!t.buildable;
}

/** 矩形に区画を設定（zoneId=null で解除。解除時はその上の建物も撤去） */
export function setZoneRect(world, reg, rect, zoneId) {
  const w = world.map.w;
  let changed = 0;
  const zoneDef = zoneId ? reg.zoneById.get(zoneId) : null;
  const zi = zoneDef ? reg.zoneIndex.get(zoneId) + 1 : 0;
  for (const [x, y] of rectTiles(rect)) {
    if (!inBounds(w, world.map.h, x, y)) continue;
    const i = idx(w, x, y);
    if (zoneDef) {
      if (world.zones[i] === zi) continue;
      if (!canZoneTile(world, reg, x, y, zoneDef)) continue;
      // 森は開墾されて平地になる
      if (reg.tiles[world.map.tile[i]].clearable) { world.map.tile[i] = reg.tileIndex.get('plain'); world.dirty.trees = true; }
      world.zones[i] = zi;
    } else {
      if (world.buildingAt[i] !== -1) removeBuilding(world, world.buildingAt[i]);
      if (world.zones[i] === 0) continue;
      world.zones[i] = 0;
    }
    world.dirty.tiles.add(i);
    changed++;
  }
  return changed;
}

export function zoneDefAt(world, reg, i) {
  const z = world.zones[i];
  return z ? reg.zones[z - 1] : null;
}

/** 水が届いているか（川・湖の近く。フェーズ3で井戸・水路が加わる） */
export function hasWater(world, reg, i) {
  if (world.services.water && world.services.water[i]) return true;
  return world.map.waterDist[i] <= reg.balance.prosperity.water.range;
}

/**
 * 繁栄度を計算する。内訳（parts）はUIの表示にも使う。
 * @returns {{total:number, parts:Record<string,number>}}
 */
export function computeProsperity(world, reg, x, y, zoneDef, building = null) {
  const P = reg.balance.prosperity;
  const w = world.map.w;
  const i = idx(w, x, y);
  const parts = {};
  parts['基本'] = P.base;
  parts['水'] = hasWater(world, reg, i) ? P.water.bonus : P.water.penalty;

  const isFarm = zoneDef.category === 'farm';
  const md = world.services.marketDist ? world.services.marketDist[i] : 0xffff;
  const mRange = isFarm ? P.market.rangeFarm : P.market.rangeResidential;
  parts['市'] = md <= mRange ? (isFarm ? P.market.bonusFarm : P.market.bonusResidential) : 0;

  parts['治安'] = clamp((world.security - P.security.neutral) / P.security.scale, -P.security.clamp, P.security.clamp);
  parts['食糧'] = world.foodSufficient ? P.food.bonus : P.food.penalty;

  // 周辺環境（8近傍にある建物の種類ごとに一度だけ加算）
  const adj = zoneDef.prosperity || {};
  const seen = new Set();
  let env = 0;
  const bw = building ? building.w : 1, bh = building ? building.h : 1;
  for (let yy = y - 1; yy <= y + bh; yy++) for (let xx = x - 1; xx <= x + bw; xx++) {
    if (!inBounds(w, world.map.h, xx, yy)) continue;
    if (xx >= x && xx < x + bw && yy >= y && yy < y + bh) continue;
    const id = world.buildingAt[idx(w, xx, yy)];
    if (id === -1) continue;
    const b = world.buildings.get(id);
    if (!b || seen.has(b.category)) continue;
    seen.add(b.category);
    if (b.category === 'workshop') env += adj.adjWorkshop || 0;
    else if (b.category === 'field' || b.category === 'farm_house') env += adj.adjFarm || 0;
    else if (b.category === 'temple') env += adj.adjTemple || 0;
    else if (b.buildingType === 'house_noble') env += adj.adjNoble || 0;
  }
  parts['周辺'] = env;

  if (isFarm) parts['肥沃'] = Math.round((world.map.fertility[i] - 0.5) * 20);

  const demand = world.demand[zoneDef.demandKey] ?? 0;
  parts['需要'] = clamp(demand * P.demandScale, -10, 10);

  const rd = world.roadDist[i];
  parts['道路'] = rd > zoneDef.roadDistance ? P.roadFar : 0;

  let total = 0;
  for (const k in parts) total += parts[k];
  return { total: clamp(Math.round(total), 0, 100), parts };
}

/** 建物を撤去する */
export function removeBuilding(world, id) {
  const b = world.buildings.get(id);
  if (!b) return;
  const w = world.map.w;
  for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
    world.buildingAt[idx(w, xx, yy)] = -1;
  }
  world.buildings.delete(id);
  world.dirty.buildings = true;
}

/** 建物の外観 ID（レベル × バリエーション）。同じ場所なら同じ「型」を保つ */
export function modelIdFor(world, reg, b) {
  const def = reg.buildingById.get(b.buildingType);
  const lv = def.levels[Math.min(b.level, def.levels.length) - 1];
  return lv.models[b.variant % lv.models.length];
}

function fits(world, reg, x, y, w, h, zi, zoneDef, def) {
  const W = world.map.w;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (!inBounds(W, world.map.h, xx, yy)) return false;
    const i = idx(W, xx, yy);
    if (world.zones[i] !== zi || world.buildingAt[i] !== -1 || world.roads[i]) return false;
    if (!canZoneTile(world, reg, xx, yy, zoneDef)) return false;
  }
  if (def.needsRoadAdjacent && world.roadDist[idx(W, x, y)] > 1) return false;
  return true;
}

function placeBuilding(world, reg, x, y, def, zoneDef) {
  const W = world.map.w;
  const id = world.nextBuildingId++;
  const variant = Math.floor(hash2(x, y, world.seed) * 3);
  const rotation = chooseFacing(world, x, y, def.size[0], def.size[1]);
  const lv = def.levels[0];
  const b = {
    id, buildingType: def.id, category: def.category, zone: zoneDef.id,
    x, y, w: def.size[0], h: def.size[1], level: 1, variant, rotation,
    state: 'building', progress: 0, buildDays: lv.buildDays,
    prosperity: 50, upTimer: 0, downTimer: 0, builtDay: world.day,
  };
  for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) world.buildingAt[idx(W, xx, yy)] = id;
  world.buildings.set(id, b);
  world.dirty.buildings = true;
  return b;
}

function pickBuilding(reg, zoneDef, rng) {
  const total = zoneDef.buildings.reduce((s, e) => s + (e.weight || 1), 0);
  let r = rng.next() * total;
  for (const e of zoneDef.buildings) { r -= e.weight || 1; if (r <= 0) return reg.buildingById.get(e.id); }
  return reg.buildingById.get(zoneDef.buildings[0].id);
}

/** 1日分の区画処理 */
export function tickZones(world, reg, rng) {
  const G = reg.balance.growth;
  ensureRoadDist(world, reg);
  const W = world.map.w, H = world.map.h;

  // 1. 既存建物
  for (const b of Array.from(world.buildings.values())) {
    const def = reg.buildingById.get(b.buildingType);
    if (b.state === 'building') {
      b.progress++;
      if (b.progress >= b.buildDays) { b.state = 'built'; world.dirty.buildings = true; }
      continue;
    }
    const zoneDef = reg.zoneById.get(b.zone);
    const { total } = computeProsperity(world, reg, b.x, b.y, zoneDef, b);
    b.prosperity = total;
    const maxLevel = def.levels.length;
    if (total >= G.levelUp.threshold) {
      b.downTimer = 0;
      if (b.level < maxLevel && ++b.upTimer >= G.levelUp.days) {
        b.level++; b.upTimer = 0;
        b.state = 'building'; b.progress = 0; b.buildDays = def.levels[b.level - 1].buildDays;
        b.rotation = chooseFacing(world, b.x, b.y, b.w, b.h);   // 建て替え時に向きを見直す
        world.dirty.buildings = true;
        world.log.push({ day: world.day, text: `${def.name}がレベル${b.level}に成長しました` });
      }
    } else if (total < G.levelDown.threshold) {
      b.upTimer = 0;
      if (++b.downTimer >= G.levelDown.days) {
        b.downTimer = 0;
        if (b.level > 1) { b.level--; world.dirty.buildings = true; world.log.push({ day: world.day, text: `${def.name}が衰退してレベル${b.level}になりました` }); }
        else { removeBuilding(world, b.id); world.log.push({ day: world.day, text: `${def.name}が廃屋になり撤去されました` }); }
      }
    } else {
      if (b.upTimer > 0) b.upTimer--;
      if (b.downTimer > 0) b.downTimer--;
    }
  }

  // 2. 新築（毎日、走査開始位置をずらして偏りを避ける）
  let builds = 0, moneyShort = false;
  const n = W * H;
  const start = (world.day * 7919) % n;
  for (let k = 0; k < n && builds < G.maxBuildsPerDay; k++) {
    const i = (start + k) % n;
    const zi = world.zones[i];
    if (!zi || world.buildingAt[i] !== -1) continue;
    const zoneDef = reg.zones[zi - 1];
    if (world.roadDist[i] > zoneDef.roadDistance) continue;
    if ((world.demand[zoneDef.demandKey] ?? 0) <= 0) continue;
    const x = i % W, y = (i / W) | 0;
    if (computeProsperity(world, reg, x, y, zoneDef).total < G.buildThreshold) continue;
    if (!rng.chance(G.buildChancePerDay)) continue;
    const def = pickBuilding(reg, zoneDef, rng);
    if (!fits(world, reg, x, y, def.size[0], def.size[1], zi, zoneDef, def)) continue;
    const cost = def.levels[0].cost;
    if (world.money < cost) { moneyShort = true; continue; }
    world.money -= cost;
    placeBuilding(world, reg, x, y, def, zoneDef);
    builds++;
  }
  if (moneyShort && world.day % 30 === 0) world.log.push({ day: world.day, text: '銭が足りず、新しい建物が建てられません' });
}

/** 住居の収容人数の合計（フェーズ2で人口の上限に使う） */
export function housingCapacity(world, reg) {
  let cap = 0;
  for (const b of world.buildings.values()) {
    if (b.state !== 'built') continue;
    const def = reg.buildingById.get(b.buildingType);
    cap += def.levels[b.level - 1].capacity || 0;
  }
  return cap;
}
