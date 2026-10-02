// 開始時の小さな村: 中央の十字路の周りに庶民の家・畑（4×4）・農家・井戸を置き、住民を入れる。
// 何もない状態から始める負担を減らす（数は balance.start.village で調整）。置き方はプレイヤーと同じ placeBuilding（費用なし・完成済み）。
import { placeBuilding } from './build.js';
import { placeStructure } from './structures.js';

export function placeStartingVillage(world, reg) {
  const V = reg.balance.start?.village;
  if (!V) return;
  const cx = Math.floor(world.map.w / 2), cy = Math.floor(world.map.h / 2);
  const free = { free: true };
  // 家: 横道（y=cy）の南側に並べる（入口は道路側）
  let n = 0;
  for (let k = 1; k <= 8 && n < V.houses; k++) for (const x of [cx + k, cx - k]) {
    if (n >= V.houses) break;
    if (placeBuilding(world, reg, 'house_commoner', x, cy + 1, null, free).ok) n++;
  }
  // 畑: 縦道（x=cx）の西側の南、4×4 の畑を縦に並べる。置けなければ東側
  let f = 0;
  for (const x0 of [cx - 5, cx + 2]) for (let y = cy + 3; f < V.fields && y <= cy + 3 + 4 * V.fields; y += 4) if (placeBuilding(world, reg, 'field_millet', x0, y, 0, free).ok) f++;
  // 農家: 縦道の脇
  let fh = 0;
  for (let y = cy + 3; y <= cy + 10 && fh < V.farmhouses; y++) for (const x of [cx - 1, cx + 1]) if (fh < V.farmhouses && placeBuilding(world, reg, 'farmhouse', x, y, null, free).ok) fh++;
  // 井戸など
  for (const s of V.structures || []) {
    const saved = world.money, savedMat = { ...world.materials };
    const r = placeStructure(world, reg, s.type, cx + s.dx, cy + s.dy);
    world.money = saved; world.materials = savedMat;
    if (r.ok) { const st = world.structures.get(r.id); st.state = 'built'; st.progress = st.buildDays; }
  }
  // 住民
  const house = reg.buildingById.get('house_commoner'), farmhouse = reg.buildingById.get('farmhouse');
  const pop = Math.min(V.population, n * (house.levels[0].capacity || 5) + fh * (farmhouse.levels[0].capacity || 4));
  world.population.commoner = pop; world.population.total = pop; world.population.farmers = Math.min(pop, f * 16 * reg.balance.economy.farmJobsPerTile);
  world.dirty.buildings = true; world.servicesDirty = true;
}
