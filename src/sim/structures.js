// 特殊建築（手動配置）: 配置の検証、建設、効果（水・市の管理範囲・治安・民忠・衛生・穀倉・防御）、城壁の内外判定、維持費。
import { idx, inBounds, N4, lPath, distanceMap } from '../core/grid.js';
import { chooseFacing } from './placement.js';

const RANK_ORDER = ['magistrate', 'governor', 'chancellor', 'general'];

/** 解禁されているか。戻り値: null（可）または理由 */
export function lockReason(world, reg, def) {
  const u = def.unlock || {};
  if (u.rank && RANK_ORDER.indexOf(world.rank || 'magistrate') < RANK_ORDER.indexOf(u.rank)) return `官位「${{ governor: '郡守', chancellor: '相邦', general: '大将軍' }[u.rank]}」で解禁`;
  if (u.tech && !(world.techs || []).includes(u.tech)) return '技術で解禁（フェーズ4）';
  if (def.unique && Array.from(world.structures.values()).some((s) => s.type === def.id)) return '1つしか建てられません';
  return null;
}

export function structureName(reg, def, nationId) {
  return def.nameByNation?.[nationId] || def.name;
}

const isOccupied = (world, i) => world.buildingAt[i] !== -1 || world.structAt[i] !== -1;

/** 1マスがこの建築を置けるか（線状・矩形の両方で使う） */
function tileOk(world, reg, def, x, y, ctx) {
  const { w, h } = world.map;
  if (!inBounds(w, h, x, y)) return '範囲外';
  const i = idx(w, x, y);
  const t = reg.tiles[world.map.tile[i]];
  const p = def.placement || {};
  if (isOccupied(world, i)) return '建物があります';
  if (p.overWater) {
    if (!t.water && !t.buildable) return '川か平地にしか架けられません';
    if (t.water && t.id === 'sea') return '海には架けられません';
  } else if (p.onRoad) {
    if (!world.roads[i]) return '道路の上に置きます';
  } else if (p.onWallLine) {
    if (!t.buildable) return `${t.name}には建てられません`;
  } else {
    if (!t.buildable) return `${t.name}には建てられません`;
    if (world.roads[i]) return '道路の上には建てられません';
    if (p.shore && world.map.waterDist[i] > (reg.balance.zoning?.shoreDistance ?? 1)) return '岸辺にのみ置けます';
    const shoreOk = p.shore || p.nearWater || p.connectWater || def.category === 'defense' || def.id === 'well';
    if (!shoreOk && world.map.waterDist[i] <= (reg.balance.zoning?.shoreDistance ?? 1)) return '岸辺には建てられません';
  }
  if (p.connectWater) {
    const near = N4.some(([dx, dy]) => inBounds(w, h, x + dx, y + dy) && (reg.tiles[world.map.tile[idx(w, x + dx, y + dy)]].water || world.structAt[idx(w, x + dx, y + dy)] !== -1 && world.structures.get(world.structAt[idx(w, x + dx, y + dy)])?.type === 'canal'));
    if (!near && !(ctx && ctx.prevOk)) return '川・湖・水路につなげてください';
  }
  if (p.onWallLine) {
    const wallNear = N4.some(([dx, dy]) => inBounds(w, h, x + dx, y + dy) && world.structures.get(world.structAt[idx(w, x + dx, y + dy)])?.type === 'wall');
    if (!wallNear) return '城壁に接して置きます';
  }
  return null;
}

/** 矩形の建築を置けるか。戻り値: null または理由 */
export function canPlaceStructure(world, reg, def, x, y) {
  const lock = lockReason(world, reg, def);
  if (lock) return lock;
  if (def.linear) return '線状の建築はドラッグで置きます';
  const [sw, sh] = def.size;
  let nearWater = false;
  for (let yy = y; yy < y + sh; yy++) for (let xx = x; xx < x + sw; xx++) {
    const r = tileOk(world, reg, def, xx, yy);
    if (r) return r;
    if (def.placement?.nearWater) for (const [dx, dy] of N4) { const nx = xx + dx, ny = yy + dy; if (inBounds(world.map.w, world.map.h, nx, ny) && reg.tiles[world.map.tile[idx(world.map.w, nx, ny)]].water) nearWater = true; }
  }
  if (def.placement?.nearWater && !nearWater) return '水辺に接して置きます';
  if (world.money < def.cost) return '銭が足りません';
  return null;
}

function addStructure(world, reg, def, x, y, w, h, extra = {}) {
  const id = world.nextStructureId++;
  const s = { id, type: def.id, x, y, w, h, rotation: 0, state: def.buildDays > 0 ? 'building' : 'built', progress: 0, buildDays: def.buildDays, linear: !!def.linear, ...extra };
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) world.structAt[idx(world.map.w, xx, yy)] = id;
  world.structures.set(id, s);
  world.dirty.buildings = true; world.servicesDirty = true;
  if (s.state === 'built') onBuilt(world, reg, s);
  return s;
}

/** 完成時の処理（橋・城門は道路になる） */
function onBuilt(world, reg, s) {
  const def = reg.structureById.get(s.type);
  if (def.effects.some((e) => e.type === 'road')) {
    for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) { const i = idx(world.map.w, xx, yy); world.roads[i] = 1; world.dirty.tiles.add(i); }
    world.roadDirty = true;
  }
  world.servicesDirty = true;
}

/** 矩形の建築を置く */
export function placeStructure(world, reg, typeId, x, y) {
  const def = reg.structureById.get(typeId);
  if (!def) return { ok: false, message: `不明な建築: ${typeId}` };
  const reason = canPlaceStructure(world, reg, def, x, y);
  if (reason) return { ok: false, message: reason };
  world.money -= def.cost;
  world.finance.month.expense['建設費'] += def.cost;
  const wasRoad = world.roads[idx(world.map.w, x, y)] === 1;
  const s = addStructure(world, reg, def, x, y, def.size[0], def.size[1]);
  s.rotation = chooseFacing(world, x, y, def.size[0], def.size[1]);
  if (wasRoad) s.onRoad = true;
  world.log.push({ day: world.day, text: `${structureName(reg, def, world.nationId)}の建設を始めました` });
  return { ok: true, id: s.id };
}

/** 線状の建築（城壁・水路・堤防・橋）を L 字に置く。置けたマス数を返す */
export function placeStructureLine(world, reg, typeId, x0, y0, x1, y1) {
  const def = reg.structureById.get(typeId);
  if (!def || !def.linear) return { ok: false, message: '線状の建築ではありません' };
  const lock = lockReason(world, reg, def);
  if (lock) return { ok: false, message: lock };
  const path = lPath(x0, y0, x1, y1);
  if (def.placement?.maxLength && path.length > def.placement.maxLength) return { ok: false, message: `長さは ${def.placement.maxLength} マスまでです` };
  if (def.placement?.overWater) {
    // 橋: 両端は陸で、間に水があること
    const land = (p) => inBounds(world.map.w, world.map.h, p[0], p[1]) && reg.tiles[world.map.tile[idx(world.map.w, p[0], p[1])]].buildable;
    if (!land(path[0]) || !land(path[path.length - 1])) return { ok: false, message: '橋の両端は陸に置きます' };
    if (!path.some((p) => reg.tiles[world.map.tile[idx(world.map.w, p[0], p[1])]].water)) return { ok: false, message: '川をまたぐように引いてください' };
  }
  let count = 0, lastReason = null, prevOk = false;
  for (const [x, y] of path) {
    const i = idx(world.map.w, x, y);
    if (world.structAt[i] !== -1 && world.structures.get(world.structAt[i]).type === typeId) { prevOk = true; continue; }
    if (def.placement?.overWater && world.roads[i]) { prevOk = true; continue; }     // 既存の道路は橋の取り付きとして許す
    // 城壁が道路を横切る所は自動で城門にする（道路はそのまま通れる）
    if (typeId === 'wall' && world.roads[i] && world.structAt[i] === -1) {
      const gate = reg.structureById.get('gate');
      if (world.money < gate.cost) { lastReason = '銭が足りません'; break; }
      world.money -= gate.cost; world.finance.month.expense['建設費'] += gate.cost;
      const g = addStructure(world, reg, gate, x, y, 1, 1);
      g.autoGate = true;
      count++; prevOk = true;
      continue;
    }
    const r = tileOk(world, reg, def, x, y, { prevOk });
    if (r) { lastReason = r; prevOk = false; continue; }
    if (world.money < def.cost) { lastReason = '銭が足りません'; break; }
    world.money -= def.cost; world.finance.month.expense['建設費'] += def.cost;
    addStructure(world, reg, def, x, y, 1, 1);
    count++; prevOk = true;
  }
  if (count === 0) return { ok: false, message: lastReason || '置けませんでした', count: 0 };
  return { ok: true, count, message: lastReason };
}

export function removeStructure(world, reg, id) {
  const s = world.structures.get(id);
  if (!s) return false;
  const def = reg.structureById.get(s.type);
  if (def.initial) return false;                                   // 官府は撤去できない
  for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) {
    const i = idx(world.map.w, xx, yy);
    world.structAt[i] = -1;
    if (def.effects.some((e) => e.type === 'road') && !s.autoGate && !s.onRoad) { world.roads[i] = 0; world.roadDirty = true; world.dirty.tiles.add(i); }
  }
  world.structures.delete(id);
  world.dirty.buildings = true; world.servicesDirty = true;
  return true;
}

/** 毎日: 建設の進行 */
export function tickStructures(world, reg) {
  for (const s of world.structures.values()) {
    if (s.state !== 'building') continue;
    s.progress++;
    if (s.progress >= s.buildDays) { s.state = 'built'; world.dirty.buildings = true; onBuilt(world, reg, s); world.log.push({ day: world.day, text: `${structureName(reg, reg.structureById.get(s.type), world.nationId)}が完成しました` }); }
  }
  if (world.servicesDirty) recomputeServices(world, reg);
}

/** 月次の維持費 */
export function structureUpkeep(world, reg) {
  let sum = 0;
  for (const s of world.structures.values()) if (s.state === 'built') sum += reg.structureById.get(s.type).upkeep || 0;
  return sum;
}

/** 城壁で囲まれた内側（内城）を求める。外周から城壁・城門以外を塗りつぶし、届かない陸が内側 */
export function computeEnclosure(world, reg) {
  const { w, h } = world.map;
  const blocked = new Uint8Array(w * h);
  for (const s of world.structures.values()) if ((s.type === 'wall' || s.type === 'gate') && s.state === 'built') for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) blocked[idx(w, xx, yy)] = 1;
  const outside = distanceMap(w, h, (i) => { const x = i % w, y = (i / w) | 0; return (x === 0 || y === 0 || x === w - 1 || y === h - 1) && !blocked[i]; }, 0xfffe, (i) => !blocked[i]);
  const inside = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i++) if (outside[i] === 0xffff && !blocked[i]) { inside[i] = 1; count++; }
  return { inside, count };
}

/** 建築の効果をまとめて再計算する（建築が変わったときだけ） */
export function recomputeServices(world, reg) {
  const { w, h } = world.map;
  const water = new Uint8Array(w * h), marketAdmin = new Uint8Array(w * h), irrigation = new Uint8Array(w * h);
  const securityField = new Float32Array(w * h);
  let granaryCap = 0, loyalty = 0, defense = 0, wells = 0, docks = 0, farmDemand = 0;
  const paint = (arr, s, radius, value = 1) => {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.ceil(cy + radius)); y++) for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(w - 1, Math.ceil(cx + radius)); x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) { const i = idx(w, x, y); if (arr instanceof Float32Array) arr[i] += value; else arr[i] = 1; }
    }
  };
  for (const s of world.structures.values()) {
    if (s.state !== 'built') continue;
    const def = reg.structureById.get(s.type);
    for (const e of def.effects) {
      if (e.type === 'water') paint(water, s, e.radius);
      else if (e.type === 'market_admin') paint(marketAdmin, s, e.radius);
      else if (e.type === 'security') paint(securityField, s, e.radius, e.value);
      else if (e.type === 'granary_capacity') granaryCap += e.value;
      else if (e.type === 'loyalty') loyalty += e.value;
      else if (e.type === 'defense') defense += e.value;
      else if (e.type === 'farm_demand') farmDemand += e.value;
      else if (e.type === 'irrigation') for (const [dx, dy] of N4) { const x = s.x + dx, y = s.y + dy; if (inBounds(w, h, x, y)) irrigation[idx(w, x, y)] = 1; }
      else if (e.type === 'dock') docks++;
    }
    if (s.type === 'well') wells++;
  }
  // 治安・衛生: 住居がどれだけ効果範囲に入っているかで都市全体の補正にする
  let houses = 0, secSum = 0, watered = 0;
  for (const b of world.buildings.values()) {
    if (b.category !== 'residential' || b.state !== 'built') continue;
    houses++;
    const i = idx(w, b.x, b.y);
    secSum += securityField[i];
    if (water[i]) watered++;
  }
  // 市までの距離（完成した市の店から）
  let stalls = 0;
  const marketDist = distanceMap(w, h, (i) => { const id = world.buildingAt[i]; if (id === -1) return false; const b = world.buildings.get(id); const ok = b && b.category === 'market' && b.state === 'built'; if (ok) stalls++; return ok; }, 30);
  const enc = computeEnclosure(world, reg);
  world.services = {
    water, marketAdmin, marketDist: stalls > 0 ? marketDist : null, irrigation,
    securityBonus: houses ? secSum / houses : 0, loyaltyBonus: loyalty, hygieneBonus: houses ? 25 * (watered / houses) : 0,
    granaryCap, defense, wells, docks, farmDemand, insideWall: enc.inside, insideCount: enc.count,
  };
  world.grain.granaryCap = reg.balance.economy.granaryBaseCapacity + granaryCap;
  world.stats.defense = defense; world.stats.insideCount = enc.count;
  world.servicesDirty = false;
}

/** 初期の官府を中央に置く */
export function placeInitialStructures(world, reg) {
  const def = reg.structures.find((d) => d.initial);
  if (!def) return;
  const cx = Math.floor(world.map.w / 2), cy = Math.floor(world.map.h / 2);
  const x = cx - 1, y = cy - 4;                              // 十字路の北側、南向き
  for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) { const i = idx(world.map.w, xx, yy); world.roads[i] = 0; world.zones[i] = 0; if (reg.tiles[world.map.tile[i]].clearable) world.map.tile[i] = reg.tileIndex.get('plain'); world.dirty.tiles.add(i); }
  const s = addStructure(world, reg, def, x, y, 3, 3);
  s.rotation = 0;
  world.roadDirty = true;
}
