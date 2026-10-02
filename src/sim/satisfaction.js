// 建物ごとの満足度（0〜100）と、満足度による自動格上げ・衰退・廃屋。
// 建物を建てるのはプレイヤーだけ。建てた後に育つ・廃れるのは自動（民が自費で建て替える）。
import { idx, inBounds } from '../core/grid.js';
import { ensureRoadDist } from './roads.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 水が届いているか（川・湖の近く、または井戸・水路の範囲） */
export function hasWater(world, reg, i) {
  if (world.services.water && world.services.water[i]) return true;
  return world.map.waterDist[i] <= reg.balance.satisfaction.water.range;
}

/** 足跡（x,y,w,h）から道路までのいちばん近い距離 */
export function roadReach(world, x, y, w, h) {
  const W = world.map.w;
  let best = 0xffff;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inBounds(W, world.map.h, xx, yy)) best = Math.min(best, world.roadDist[idx(W, xx, yy)]);
  return best;
}

/** 道路網につながっているか（つながっていない建物には住まず、働かない） */
export function isConnected(world, reg, b) {
  const def = reg.buildingById.get(b.buildingType);
  ensureRoadDist(world, reg);
  return roadReach(world, b.x, b.y, b.w, b.h) <= (def.requires?.roadWithin ?? 3);
}

/** 人が住み・働く状態か（完成していて、廃屋でなく、道路につながっている） */
export function isActive(world, reg, b) {
  return b.state === 'built' && isConnected(world, reg, b);
}

/** その建物の収容人数（格上げ工事中は今のレベルのまま） */
export function capacityOf(reg, b) {
  return reg.buildingById.get(b.buildingType).levels[b.level - 1].capacity || 0;
}

/**
 * 満足度を計算する。内訳（parts）は UI の表示にも使う。
 * @param {object} def 建物の定義 @param {number} x @param {number} y 足跡の左上
 */
export function computeSatisfaction(world, reg, def, x, y, w = def.size[0], h = def.size[1]) {
  const P = reg.balance.satisfaction;
  const W = world.map.w;
  ensureRoadDist(world, reg);
  const cx = Math.min(W - 1, x + (w >> 1)), cy = Math.min(world.map.h - 1, y + (h >> 1));
  const i = idx(W, cx, cy);
  const parts = {};
  parts['基本'] = P.base;
  parts['水'] = hasWater(world, reg, i) ? P.water.bonus : P.water.penalty;
  const isFarm = def.category === 'field' || def.category === 'farm_house';
  const md = world.services.marketDist ? world.services.marketDist[i] : 0xffff;
  const mRange = (isFarm ? P.market.rangeFarm : P.market.rangeResidential) + (world.mods?.marketRange || 0);
  parts['市'] = md <= mRange ? (isFarm ? P.market.bonusFarm : P.market.bonusResidential) : 0;
  parts['治安'] = clamp((world.security - P.security.neutral) / P.security.scale, -P.security.clamp, P.security.clamp);
  if (def.category === 'market') parts['市亭'] = world.services.marketAdmin && world.services.marketAdmin[i] ? 0 : -100;   // 市亭の範囲外では市は開けない
  parts['食糧'] = world.foodSufficient ? P.food.bonus : P.food.penalty;
  if (world.services.satisfaction) parts['施設'] = Math.round(world.services.satisfaction[i] || 0);   // 社稷壇など

  // 周辺環境（周りにある建物の種類ごとに一度だけ加算）
  const adj = def.neighbors || {};
  const seen = new Set();
  let env = 0;
  for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) {
    if (!inBounds(W, world.map.h, xx, yy)) continue;
    if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
    const j = idx(W, xx, yy);
    const sid = world.structAt ? world.structAt[j] : -1;
    if (sid !== -1 && !seen.has('temple')) { const st = world.structures.get(sid); const sdef = st && reg.structureById.get(st.type); if (sdef && sdef.category === 'temple') { seen.add('temple'); env += adj.adjTemple || 0; } }
    const id = world.buildingAt[j];
    if (id === -1) continue;
    const b = world.buildings.get(id);
    if (!b || seen.has(b.category)) continue;
    seen.add(b.category);
    if (b.category === 'workshop') env += adj.adjWorkshop || 0;
    else if (b.category === 'field' || b.category === 'farm_house') env += adj.adjFarm || 0;
    else if (b.buildingType === 'house_noble') env += adj.adjNoble || 0;
  }
  parts['周辺'] = env;

  if (def.category === 'field') {
    let f = 0, n = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inBounds(W, world.map.h, xx, yy)) { f += world.map.fertility[idx(W, xx, yy)]; n++; }
    parts['肥沃'] = Math.round(((n ? f / n : 0.5) - 0.5) * 20);
  }
  const rd = roadReach(world, x, y, w, h);
  parts['道路'] = rd > (def.requires?.roadWithin ?? 3) ? P.roadFar : 0;

  let total = 0;
  for (const k in parts) total += parts[k];
  return { total: clamp(Math.round(total), 0, 100), parts };
}

export const NEED_NAMES = { water: '水（井戸・川）', market: '市（市の店）', temple: '宗廟・社稷壇・学宮（近く）' };

/** 格上げ条件の1つを満たしているか */
export function needMet(world, reg, need, b) {
  const W = world.map.w;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const i = idx(W, Math.min(W - 1, Math.floor(cx)), Math.min(world.map.h - 1, Math.floor(cy)));
  if (need === 'water') return hasWater(world, reg, i);
  if (need === 'market') {
    const md = world.services.marketDist ? world.services.marketDist[i] : 0xffff;
    return md <= reg.balance.satisfaction.market.rangeResidential + (world.mods?.marketRange || 0);
  }
  if (need === 'temple') {
    const R = reg.balance.upgrade.templeRadius;
    for (const s of world.structures.values()) {
      if (s.state !== 'built') continue;
      const d = reg.structureById.get(s.type);
      if (d.category !== 'temple' && s.type !== 'palace') continue;
      if (Math.hypot(s.x + s.w / 2 - cx, s.y + s.h / 2 - cy) <= R) return true;
    }
    return false;
  }
  return true;
}

/** 次のレベルへの条件。戻り値 { next, threshold, missing:[条件名] } または null（最大） */
export function upgradeStatus(world, reg, b) {
  const def = reg.buildingById.get(b.buildingType);
  const next = def.levels[b.level];
  if (!next) return null;
  const threshold = next.upgrade?.satisfaction ?? reg.balance.upgrade.levelUp.threshold;
  const missing = (next.upgrade?.needs || []).filter((n) => !needMet(world, reg, n, b)).map((n) => NEED_NAMES[n] || n);
  return { next: next.level, threshold, missing };
}

/** 毎日: 建設の進行、満足度の更新、自動格上げ・衰退・廃屋 */
export function tickBuildings(world, reg) {
  const U = reg.balance.upgrade;
  const speed = world.mods?.buildSpeed || 1;   // 工師・伝舎網で速くなる
  ensureRoadDist(world, reg);
  for (const b of world.buildings.values()) {
    const def = reg.buildingById.get(b.buildingType);
    if (b.state === 'building') {
      b.progress += speed;
      if (b.progress >= b.buildDays) { b.state = 'built'; world.dirty.buildings = true; }
      continue;
    }
    if (b.state !== 'built') continue;   // 廃屋は修繕されるまでそのまま
    if (b.upgrade) {                      // 格上げの工事中（住んだまま）
      b.upgrade.progress += speed;
      if (b.upgrade.progress >= b.upgrade.days) { b.level = b.upgrade.to; delete b.upgrade; world.dirty.buildings = true; world.log.push({ day: world.day, text: `${def.name}がレベル${b.level}に格上げされました` }); }
      continue;
    }
    const { total } = computeSatisfaction(world, reg, def, b.x, b.y, b.w, b.h);
    b.satisfaction = total;
    const up = upgradeStatus(world, reg, b);
    if (up && total >= up.threshold && up.missing.length === 0) {
      b.downTimer = 0;
      if (++b.upTimer >= U.levelUp.days) {
        b.upTimer = 0;
        b.upgrade = { to: b.level + 1, progress: 0, days: def.levels[b.level].buildDays || def.buildDays };
        world.dirty.buildings = true;
      }
    } else if (total < U.levelDown.threshold) {
      b.upTimer = 0;
      if (++b.downTimer >= (b.level > 1 ? U.levelDown.days : U.abandonDays)) {
        b.downTimer = 0;
        if (b.level > 1) { b.level--; world.dirty.buildings = true; world.log.push({ day: world.day, text: `${def.name}が衰退してレベル${b.level}になりました` }); }
        else { b.state = 'abandoned'; world.dirty.buildings = true; world.log.push({ day: world.day, text: `${def.name}が廃屋になりました（修繕か撤去を選べます）` }); }
      }
    } else {
      if (b.upTimer > 0) b.upTimer--;
      if (b.downTimer > 0) b.downTimer--;
    }
  }
}

/** 住居の収容人数の合計 */
export function housingCapacity(world, reg) {
  let cap = 0;
  for (const b of world.buildings.values()) {
    if (b.category !== 'residential' && b.category !== 'farm_house') continue;
    if (!isActive(world, reg, b)) continue;
    cap += capacityOf(reg, b);
  }
  return cap;
}
