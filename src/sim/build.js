// 建物を置く・並べる・範囲で埋める・動かす・修繕する・撤去する。置けない理由はすべて返す。
// 建物（buildings.json）は1つずつ置き、建てた後は満足度で自動に育つ（sim/satisfaction.js）。
// 建築（structures.json）の配置は sim/structures.js にあり、ここから同じ操作で呼べるようにする。
import { idx, inBounds } from '../core/grid.js';
import { hash2 } from '../core/rng.js';
import { ensureRoadDist } from './roads.js';
import { chooseFacing } from './placement.js';
import { roadReach } from './satisfaction.js';
import { costOf, shortages, pay, refund } from './materials.js';
import { lockReason, canPlaceStructure, placeStructure, removeStructure, structureName } from './structures.js';

/** 向きを考えた足跡の大きさ（90度・270度で縦横が入れ替わる） */
export const footprint = (def, rotation = 0) => (rotation % 2 ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]]);

const shoreDist = (reg) => reg.balance.placement?.shoreDistance ?? 1;

/** 建物の立地条件（市亭の範囲、近くの資源・畑・工房・地形、国） */
export function meetsRequirement(world, reg, def, x, y) {
  return requirementReason(world, reg, def, x, y) === null;
}

/** 立地条件を満たさない理由（満たせば null） */
export function requirementReason(world, reg, def, x, y) {
  const req = def.requires;
  if (!req) return null;
  const W = world.map.w, H = world.map.h, i = idx(W, x, y);
  if (req.marketAdmin && !(world.services.marketAdmin && world.services.marketAdmin[i])) return '市亭の範囲（半径10マス）の外';
  if (req.nationAny && !req.nationAny.includes(world.nationId)) return `この国では建てられない（${req.nationAny.map((n) => reg.nationById.get(n)?.name || n).join('・')}のみ）`;
  const r = req.radius || 6;
  const count = (pred) => {
    let n = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (pred(idx(W, xx, yy))) n++;
    return n;
  };
  if (req.resource) { const ri = reg.resources.findIndex((q) => q.id === req.resource) + 1; if (!count((j) => world.map.resource[j] === ri)) return `近く（半径${r}）に${reg.resourceById.get(req.resource)?.name || req.resource}の資源がない`; }
  if (req.field) { if (!count((j) => { const id = world.buildingAt[j]; if (id === -1) return false; const b = world.buildings.get(id); return b && b.category === 'field' && b.state === 'built' && req.field.includes(reg.buildingById.get(b.buildingType).crop); })) return `近く（半径${r}）に${req.field.map((c) => reg.cropById.get(c)?.name || c).join('・')}の畑がない`; }
  if (req.workshopNear) { if (!count((j) => { const id = world.buildingAt[j]; if (id === -1) return false; const b = world.buildings.get(id); return b && b.state === 'built' && req.workshopNear.includes(b.buildingType); })) return `近く（半径${r}）に${req.workshopNear.map((w) => reg.buildingById.get(w)?.name || w).join('か')}がない`; }
  if (req.tileNear) {
    const tiles = new Set(req.tileNear.map((t) => reg.tileIndex.get(t)));
    if (count((j) => tiles.has(world.map.tile[j])) < (req.tileCount || 1)) return `近く（半径${r}）に${req.tileNear.map((t) => reg.tileById.get(t)?.name || t).join('・')}が ${req.tileCount || 1} マス以上ない`;
  }
  return null;
}

/**
 * 建物をここに置けない理由をすべて返す（置けるなら空配列）。
 * @param {object} opts { ignoreId: 移動中の自分, ignoreCost: 費用を見ない }
 */
export function buildingReasons(world, reg, def, x, y, rotation = 0, opts = {}) {
  const reasons = [];
  const lock = lockReason(world, reg, def);
  if (lock) reasons.push(`未解禁（${lock}）`);
  const [w, h] = footprint(def, rotation);
  const W = world.map.w, H = world.map.h;
  const add = (r) => { if (!reasons.includes(r)) reasons.push(r); };
  const isField = def.category === 'field';
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (!inBounds(W, H, xx, yy)) { add('地図の外にはみ出す'); continue; }
    const i = idx(W, xx, yy);
    const t = reg.tiles[world.map.tile[i]];
    if (isField) {
      if (!t.farmable && !t.clearable) add(`地形が合わない（${t.name}には畑を作れない）`);
      else if (t.cropOnly && !t.cropOnly.includes(def.crop)) add(`地形が合わない（${t.name}は${t.cropOnly.map((c) => reg.cropById.get(c)?.name || c).join('・')}だけ）`);
    } else if (!t.buildable) add(`地形が合わない（${t.name}には建てられない）`);
    if (world.roads[i]) add('道路と重なる');
    const bid = world.buildingAt[i];
    if ((bid !== -1 && bid !== opts.ignoreId) || world.structAt[i] !== -1) add('他の建物と重なる');
    if (!t.water && world.map.waterDist[i] <= shoreDist(reg)) add('岸辺には置けない');
  }
  if (inBounds(W, H, x, y)) {
    ensureRoadDist(world, reg);
    const need = def.requires?.roadWithin ?? 3;
    if (roadReach(world, x, y, w, h) > need) add(`道路から遠い（${need}マス以内に道路が必要）`);
    const rq = requirementReason(world, reg, def, Math.min(W - 1, x), Math.min(H - 1, y));
    if (rq) add(rq);
  }
  if (!opts.ignoreCost) for (const s of shortages(world, opts.cost || costOf(def))) add(s);
  return reasons;
}

/** 森のマスは切り開いて平地にし、木材を得る */
function clearForest(world, reg, x, y, w, h) {
  const W = world.map.w;
  let cleared = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = idx(W, xx, yy);
    if (reg.tiles[world.map.tile[i]].clearable) { world.map.tile[i] = reg.tileIndex.get('plain'); world.dirty.tiles.add(i); cleared++; }
  }
  if (cleared) {
    world.dirty.trees = true;
    const wood = cleared * (reg.balance.materials?.woodPerForestTile ?? 0);
    if (world.materials) world.materials.wood += wood;
    world.log.push({ day: world.day, text: `森 ${cleared} マスを伐採しました${wood ? `（木材 +${wood}）` : ''}` });
  }
}

function occupy(world, b, id) {
  const W = world.map.w;
  for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) world.buildingAt[idx(W, xx, yy)] = id;
}

/**
 * 建物を1つ置く。rotation を省くと入口が道路に面する向きにする。
 * @param {object} opts { free: 費用なし・すぐ完成（開始の村） }
 */
export function placeBuilding(world, reg, typeId, x, y, rotation = null, opts = {}) {
  const def = reg.buildingById.get(typeId);
  if (!def) return { ok: false, message: `不明な建物: ${typeId}` };
  const rot0 = rotation ?? 0;
  const reasons = buildingReasons(world, reg, def, x, y, rot0, { ignoreCost: opts.free });
  if (reasons.length) return { ok: false, message: reasons[0], reasons };
  const [w, h] = footprint(def, rot0);
  const rot = rotation ?? chooseFacing(world, x, y, w, h);
  if (!opts.free) pay(world, costOf(def));
  clearForest(world, reg, x, y, w, h);
  const id = world.nextBuildingId++;
  const b = {
    id, buildingType: def.id, category: def.category, x, y, w, h, level: 1,
    variant: Math.floor(hash2(x, y, world.seed) * 3), rotation: rot,
    state: opts.free ? 'built' : 'building', progress: 0, buildDays: def.buildDays,
    satisfaction: 50, upTimer: 0, downTimer: 0, builtDay: world.day,
  };
  occupy(world, b, id);
  world.buildings.set(id, b);
  world.dirty.buildings = true;
  if (b.category === 'market') world.servicesDirty = true;   // 市までの距離が変わる
  return { ok: true, id };
}

/** 範囲（矩形）を建物で埋める位置。左上から足跡の大きさずつ並べ、はみ出す分は使わない */
export function areaPositions(def, rotation, rect) {
  const [w, h] = footprint(def, rotation);
  const out = [];
  for (let y = rect.y0; y + h - 1 <= rect.y1; y += h) for (let x = rect.x0; x + w - 1 <= rect.x1; x += w) out.push([x, y]);
  return out;
}

/** ドラッグの向きに隙間なく並べる位置（横か縦の長い方へ） */
export function rowPositions(def, rotation, x0, y0, x1, y1) {
  const [w, h] = footprint(def, rotation);
  const horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const step = horiz ? w : h, len = horiz ? x1 - x0 : y1 - y0;
  const n = Math.floor(Math.abs(len) / step) + 1, dir = Math.sign(len) || 1;
  const out = [];
  for (let k = 0; k < n; k++) out.push(horiz ? [x0 + dir * k * step, y0] : [x0, y0 + dir * k * step]);
  return out;
}

/** 位置の一覧に置く（置ける所だけ）。戻り値 { ok, count, ids, skipped, message } */
export function placeMany(world, reg, typeId, positions, rotation = null) {
  const ids = [];
  let skipped = 0, lastReason = null;
  for (const [x, y] of positions) {
    const r = placeOne(world, reg, typeId, x, y, rotation);
    if (r.ok) ids.push(r.id); else { skipped++; lastReason = r.message; if (r.message?.includes('足りない') || r.message?.includes('足りません')) break; }
  }
  if (!ids.length) return { ok: false, count: 0, ids, skipped, message: lastReason || '置けませんでした' };
  return { ok: true, count: ids.length, ids, skipped, message: skipped ? lastReason : undefined };
}

/** 建物でも建築でも1つ置く */
export function placeOne(world, reg, typeId, x, y, rotation = null) {
  if (reg.buildingById.has(typeId)) return placeBuilding(world, reg, typeId, x, y, rotation);
  if (reg.structureById.has(typeId)) return placeStructure(world, reg, typeId, x, y, rotation);
  return { ok: false, message: `不明な建物: ${typeId}` };
}

/** 置き直しの費用（建設中は無料、完成済みは費用の一部） */
export function moveCost(reg, def, state) {
  return state === 'building' ? { qian: 0, wood: 0, stone: 0 } : costOf(def, reg.balance.placement.moveCostRate);
}

/** 建物（または建築）を別の場所へ移す。完成済みは工事のやり直し（建設日数の半分） */
export function moveObject(world, reg, kind, id, x, y, rotation = null) {
  if (kind === 'structure') return moveStructure(world, reg, id, x, y, rotation);
  const b = world.buildings.get(id);
  if (!b) return { ok: false, message: '建物がありません' };
  const def = reg.buildingById.get(b.buildingType);
  const rot0 = rotation ?? b.rotation ?? 0;
  const cost = moveCost(reg, def, b.state);
  const reasons = buildingReasons(world, reg, def, x, y, rot0, { ignoreId: id, cost });
  if (reasons.length) return { ok: false, message: reasons[0], reasons };
  pay(world, cost);
  occupy(world, b, -1);
  const [w, h] = footprint(def, rot0);
  const old = { x: b.x, y: b.y, w: b.w, h: b.h, rotation: b.rotation, state: b.state, progress: b.progress, buildDays: b.buildDays };
  b.x = x; b.y = y; b.w = w; b.h = h;
  b.rotation = rotation ?? chooseFacing(world, x, y, w, h);
  clearForest(world, reg, x, y, w, h);
  if (b.state !== 'building') { b.state = 'building'; b.progress = 0; b.buildDays = Math.ceil((def.levels[b.level - 1].buildDays || def.buildDays) / 2); delete b.upgrade; }
  occupy(world, b, id);
  world.dirty.buildings = true; world.servicesDirty = true;
  return { ok: true, id, old, cost };
}

function moveStructure(world, reg, id, x, y, rotation) {
  const s = world.structures.get(id);
  if (!s) return { ok: false, message: '建築がありません' };
  const def = reg.structureById.get(s.type);
  if (def.linear || def.initial) return { ok: false, message: `${structureName(reg, def, world.nationId)}は移動できません` };
  const W = world.map.w;
  const cost = s.state === 'building' ? { qian: 0, wood: 0, stone: 0 } : costOf(def, reg.balance.placement.moveCostRate);
  const set = (v) => { for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) world.structAt[idx(W, xx, yy)] = v; };
  set(-1);
  const reason = canPlaceStructure(world, reg, def, x, y, rotation ?? s.rotation ?? 0, { cost, ignoreUnique: true });
  if (reason) { set(id); return { ok: false, message: reason }; }
  pay(world, cost);
  const [w, h] = footprint(def, rotation ?? s.rotation ?? 0);
  const old = { x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation, state: s.state, progress: s.progress, buildDays: s.buildDays };
  s.x = x; s.y = y; s.w = w; s.h = h;
  s.rotation = rotation ?? chooseFacing(world, x, y, w, h);
  if (s.state !== 'building') { s.state = 'building'; s.progress = 0; s.buildDays = Math.ceil(def.buildDays / 2); }
  set(id);
  world.dirty.buildings = true; world.servicesDirty = true;
  return { ok: true, id, old, cost };
}

/** 移動を元に戻す（費用も戻す） */
export function undoMove(world, reg, kind, id, old, cost) {
  const obj = kind === 'structure' ? world.structures.get(id) : world.buildings.get(id);
  if (!obj) return false;
  const W = world.map.w;
  const grid = kind === 'structure' ? world.structAt : world.buildingAt;
  for (let yy = obj.y; yy < obj.y + obj.h; yy++) for (let xx = obj.x; xx < obj.x + obj.w; xx++) grid[idx(W, xx, yy)] = -1;
  Object.assign(obj, old);
  for (let yy = obj.y; yy < obj.y + obj.h; yy++) for (let xx = obj.x; xx < obj.x + obj.w; xx++) grid[idx(W, xx, yy)] = id;
  refund(world, cost);
  world.dirty.buildings = true; world.servicesDirty = true;
  return true;
}

/** 廃屋を修繕する（費用の一部。レベル1から建て直し） */
export function repairBuilding(world, reg, id) {
  const b = world.buildings.get(id);
  if (!b) return { ok: false, message: '建物がありません' };
  if (b.state !== 'abandoned') return { ok: false, message: '廃屋ではありません' };
  const def = reg.buildingById.get(b.buildingType);
  const cost = costOf(def, reg.balance.placement.repairCostRate);
  const short = shortages(world, cost);
  if (short.length) return { ok: false, message: short[0] };
  pay(world, cost);
  Object.assign(b, { state: 'building', level: 1, progress: 0, buildDays: Math.ceil(def.buildDays / 2), upTimer: 0, downTimer: 0, satisfaction: 50 });
  world.dirty.buildings = true;
  world.log.push({ day: world.day, text: `${def.name}の修繕を始めました` });
  return { ok: true, id, cost };
}

/** 建物を撤去する。refund=true なら木材の一部が戻る */
export function removeBuilding(world, reg, id, { refundWood = false } = {}) {
  const b = world.buildings.get(id);
  if (!b) return false;
  occupy(world, b, -1);
  world.buildings.delete(id);
  if (refundWood && world.materials) {
    const wood = Math.floor(costOf(reg.buildingById.get(b.buildingType)).wood * (reg.balance.placement.demolishWoodRefund ?? 0));
    world.materials.wood += wood;
  }
  world.dirty.buildings = true;
  if (b.category === 'market') world.servicesDirty = true;
  return true;
}

/** 建物の外観 ID（レベル × バリエーション） */
export function modelIdFor(world, reg, b) {
  const def = reg.buildingById.get(b.buildingType);
  const lv = def.levels[Math.min(b.level, def.levels.length) - 1];
  return lv.models[b.variant % lv.models.length];
}

/** そのマスにある物（建物・建築）。{ kind, id, obj, def } または null */
export function objectAt(world, reg, x, y) {
  if (!inBounds(world.map.w, world.map.h, x, y)) return null;
  const i = idx(world.map.w, x, y);
  if (world.buildingAt[i] !== -1) { const b = world.buildings.get(world.buildingAt[i]); return { kind: 'building', id: b.id, obj: b, def: reg.buildingById.get(b.buildingType) }; }
  if (world.structAt[i] !== -1) { const s = world.structures.get(world.structAt[i]); return { kind: 'structure', id: s.id, obj: s, def: reg.structureById.get(s.type) }; }
  return null;
}

export { removeStructure };
