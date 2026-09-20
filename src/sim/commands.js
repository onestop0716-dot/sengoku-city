// UI からの操作は必ずこの関数を通す。World を直接書き換えない。
import { clampRect, lPath, rectTiles, idx } from '../core/grid.js';
import { buildRoadPath, removeRoadAt } from './roads.js';
import { setZoneRect, removeBuilding } from './zones.js';

/**
 * @param {object} world @param {object} reg
 * @param {{type:string}} cmd
 * @returns {{ok:boolean, message?:string, count?:number}}
 */
export function applyCommand(world, reg, cmd) {
  const { w, h } = world.map;
  switch (cmd.type) {
    case 'road.build': {
      const path = lPath(cmd.x0, cmd.y0, cmd.x1, cmd.y1).filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h);
      const need = path.length * reg.balance.road.costPerTile;
      const count = buildRoadPath(world, reg, path);
      if (count === 0 && world.money < need) return { ok: false, message: '銭が足りません' };
      return { ok: true, count };
    }
    case 'road.remove': {
      let count = 0;
      for (const [x, y] of rectTiles(clampRect(cmd.rect, w, h))) if (removeRoadAt(world, x, y)) count++;
      return { ok: true, count };
    }
    case 'zone.set': {
      if (!reg.zoneById.has(cmd.zoneId)) return { ok: false, message: `区画 ${cmd.zoneId} がありません` };
      const count = setZoneRect(world, reg, clampRect(cmd.rect, w, h), cmd.zoneId);
      return { ok: true, count };
    }
    case 'zone.clear': {
      const count = setZoneRect(world, reg, clampRect(cmd.rect, w, h), null);
      return { ok: true, count };
    }
    case 'demolish': {
      const rect = clampRect(cmd.rect, w, h);
      let count = 0;
      for (const [x, y] of rectTiles(rect)) {
        const i = idx(w, x, y);
        if (world.buildingAt[i] !== -1) { removeBuilding(world, world.buildingAt[i]); count++; }
        if (world.roads[i]) { removeRoadAt(world, x, y); count++; }
        if (world.zones[i]) { world.zones[i] = 0; world.dirty.tiles.add(i); count++; }
      }
      return { ok: true, count };
    }
    default:
      return { ok: false, message: `不明なコマンド: ${cmd.type}` };
  }
}
