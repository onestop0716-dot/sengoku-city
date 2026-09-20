// セーブデータ: World を JSON にする / JSON から World を復元する。
// version を持ち、古い版は migrate() で読み替える。マップの大きさ（w,h）を必ず含める。
import { createRng } from '../../core/rng.js';
import { createWorld } from '../world.js';
import { recomputeServices } from '../structures.js';

export const SAVE_VERSION = 1;

const arr = (typed) => Array.from(typed);

export function serializeWorld(world) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: world.seed, cityId: world.cityId, nationId: world.nationId,
    rngState: world.rng.getState(),
    day: world.day, calendar: { ...world.calendar },
    map: { w: world.map.w, h: world.map.h, tile: arr(world.map.tile), height: arr(world.map.height), fertility: arr(world.map.fertility), resource: arr(world.map.resource) },
    roads: arr(world.roads), zones: arr(world.zones),
    buildings: Array.from(world.buildings.values()), nextBuildingId: world.nextBuildingId,
    structures: Array.from(world.structures.values()), nextStructureId: world.nextStructureId, rank: world.rank, techs: world.techs, goods: { ...world.goods },
    money: world.money, demand: { ...world.demand }, security: world.security, foodSufficient: world.foodSufficient,
    policy: { ...world.policy }, population: { ...world.population }, grain: { ...world.grain }, loyalty: world.loyalty, hygiene: world.hygiene,
    foodSufficiency: world.foodSufficiency, finance: JSON.parse(JSON.stringify(world.finance)), stats: JSON.parse(JSON.stringify(world.stats)),
    log: world.log.slice(-100),
  };
}

/** 古い版のデータを最新の形に読み替える */
export function migrate(data) {
  const d = { ...data };
  if (!d.version) d.version = 1;
  if (!d.map) throw new Error('セーブデータに map がありません');
  if (!d.map.w || !d.map.h) { const n = Math.round(Math.sqrt(d.map.tile.length)); d.map.w = n; d.map.h = n; }   // 大きさが無い古いデータは正方形とみなす
  return d;
}

/** JSON から World を作る。地形の派生値（水辺距離など）は seed から再生成して整合させる */
export function deserializeWorld(data, reg) {
  const d = migrate(data);
  const world = createWorld({ seed: d.seed, cityId: d.cityId, reg, size: d.map.w, money: d.money });
  const { w, h } = world.map;
  if (d.map.h !== h) throw new Error(`マップの大きさが一致しません (${d.map.w}×${d.map.h})`);
  world.map.tile.set(d.map.tile); world.map.height.set(d.map.height); world.map.fertility.set(d.map.fertility); world.map.resource.set(d.map.resource);
  world.roads.set(d.roads); world.zones.set(d.zones); world.roadDirty = true;
  world.buildings = new Map();
  world.buildingAt.fill(-1);
  for (const b of d.buildings) {
    world.buildings.set(b.id, { ...b });
    for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) world.buildingAt[yy * w + xx] = b.id;
  }
  world.nextBuildingId = d.nextBuildingId;
  world.structures = new Map(); world.structAt.fill(-1);
  for (const s of d.structures || []) { world.structures.set(s.id, { ...s }); for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) world.structAt[yy * w + xx] = s.id; }
  if (d.nextStructureId) world.nextStructureId = d.nextStructureId;
  if (d.rank) world.rank = d.rank; if (d.techs) world.techs = d.techs; if (d.goods) world.goods = { ...d.goods };
  recomputeServices(world, reg);
  world.day = d.day; world.calendar = { ...d.calendar };
  world.rng = createRng(d.seed); world.rng.setState(d.rngState);
  world.money = d.money; world.demand = { ...d.demand }; world.security = d.security; world.foodSufficient = d.foodSufficient;
  if (d.policy) world.policy = { ...world.policy, ...d.policy };
  if (d.population) world.population = { ...world.population, ...d.population };
  if (d.grain) world.grain = { ...world.grain, ...d.grain };
  if (d.loyalty != null) world.loyalty = d.loyalty; if (d.hygiene != null) world.hygiene = d.hygiene;
  if (d.foodSufficiency != null) world.foodSufficiency = d.foodSufficiency;
  if (d.finance) world.finance = { ...world.finance, ...d.finance };
  if (d.stats) world.stats = { ...world.stats, ...d.stats };
  world.log = d.log || [];
  world.dirty = { tiles: new Set(), buildings: true, trees: true };
  return world;
}
