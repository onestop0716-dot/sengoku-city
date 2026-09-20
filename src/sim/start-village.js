// 開始時の小さな村: 中央の十字路の周りに庶民の家・畑・農家・井戸を置き、住民を入れる。
// 何もない状態から始める負担を減らす（数は balance.start.village で調整）。
import { idx, inBounds } from '../core/grid.js';
import { canZoneTile } from './zones.js';
import { chooseFacing } from './placement.js';
import { hash2 } from '../core/rng.js';
import { placeStructure } from './structures.js';

function put(world, reg, def, zoneDef, x, y) {
  const W = world.map.w;
  const zi = reg.zoneIndex.get(zoneDef.id) + 1;
  for (let yy = y; yy < y + def.size[1]; yy++) for (let xx = x; xx < x + def.size[0]; xx++) {
    if (!inBounds(W, world.map.h, xx, yy) || !canZoneTile(world, reg, xx, yy, zoneDef)) return null;
  }
  const id = world.nextBuildingId++;
  const b = { id, buildingType: def.id, category: def.category, zone: zoneDef.id, x, y, w: def.size[0], h: def.size[1], level: 1,
    variant: Math.floor(hash2(x, y, world.seed) * 3), rotation: 0, state: 'built', progress: 0, buildDays: 0, prosperity: 60, upTimer: 0, downTimer: 0, builtDay: 0 };
  for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) { const i = idx(W, xx, yy); world.buildingAt[i] = id; world.zones[i] = zi; world.dirty.tiles.add(i); }
  b.rotation = chooseFacing(world, x, y, b.w, b.h);
  world.buildings.set(id, b);
  world.dirty.buildings = true;
  return b;
}

export function placeStartingVillage(world, reg) {
  const V = reg.balance.start?.village;
  if (!V) return;
  const cx = Math.floor(world.map.w / 2), cy = Math.floor(world.map.h / 2);
  const house = reg.buildingById.get('house_commoner'), resZone = reg.zoneById.get('res_commoner');
  const field = reg.buildingById.get('field_millet'), farmZone = reg.zoneById.get('farm_millet'), farmhouse = reg.buildingById.get('farmhouse');
  // 家: 横道（y=cy）の南側と北側に並べる
  const houseSpots = [];
  for (let k = 1; k <= 6 && houseSpots.length < V.houses; k++) { houseSpots.push([cx + k, cy + 1]); houseSpots.push([cx - k, cy + 1]); }
  let n = 0;
  for (const [x, y] of houseSpots) { if (n >= V.houses) break; if (put(world, reg, house, resZone, x, y)) n++; }
  // 畑: 縦道（x=cx）の西側の南、まとまった一画
  let f = 0, fh = 0;
  for (let y = cy + 3; y <= cy + 6 && f < V.fields; y++) for (let x = cx - 6; x <= cx - 1 && f < V.fields; x++) {
    if (fh < V.farmhouses && x === cx - 1 && world.roadDist && world.roadDist[idx(world.map.w, x, y)] <= 1) { if (put(world, reg, farmhouse, farmZone, x, y)) fh++; continue; }
    if (put(world, reg, field, farmZone, x, y)) f++;
  }
  if (fh < V.farmhouses) for (let y = cy + 3; y <= cy + 6 && fh < V.farmhouses; y++) if (put(world, reg, farmhouse, farmZone, cx + 1, y)) fh++;
  // 井戸など
  for (const s of V.structures || []) {
    const saved = world.money;
    const r = placeStructure(world, reg, s.type, cx + s.dx, cy + s.dy);
    world.money = saved;
    if (r.ok) { const st = world.structures.get(r.id); st.state = 'built'; st.progress = st.buildDays; }
  }
  // 住民
  const pop = Math.min(V.population, n * (house.levels[0].capacity || 5) + fh * 4);
  world.population.commoner = pop; world.population.total = pop; world.population.farmers = Math.min(pop, f * 2);
  world.dirty.buildings = true; world.servicesDirty = true;
}
