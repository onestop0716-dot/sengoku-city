// UI からの操作は必ずこの関数を通す。World を直接書き換えない。
import { clampRect, lPath, rectTiles, idx } from '../core/grid.js';
import { buildRoadPath, removeRoadAt } from './roads.js';
import { setZoneRect, removeBuilding } from './zones.js';
import { placeStructure, placeStructureLine, removeStructure } from './structures.js';
import { recruit, dismiss, appoint } from './persons.js';
import { startResearch, cancelResearch } from './research.js';
import { sendCaravan } from './nation/trade.js';
import { sendGift, propose } from './nation/diplomacy.js';
import { fulfillOrder, setCityPolicy } from './nation/state.js';
import { conscript, disband, setFormation } from './military/army.js';
import { startCampaign } from './military/campaign.js';

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
        if (world.structAt[i] !== -1) { if (removeStructure(world, reg, world.structAt[i])) count++; }
        if (world.buildingAt[i] !== -1) { removeBuilding(world, world.buildingAt[i]); count++; }
        if (world.roads[i]) { removeRoadAt(world, x, y); count++; }
        if (world.zones[i]) { world.zones[i] = 0; world.dirty.tiles.add(i); count++; }
      }
      return { ok: true, count };
    }
    case 'structure.place': return placeStructure(world, reg, cmd.typeId, cmd.x, cmd.y);
    case 'structure.line': return placeStructureLine(world, reg, cmd.typeId, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
    case 'policy.set': {
      const allowed = { taxLand: [0, 0.3], taxHead: [0, 0.3], taxMarket: [0, 0.3], taxCustoms: [0, 0.3], granaryShare: [0, 0.3], relief: null };
      if (!(cmd.key in allowed)) return { ok: false, message: `不明な政策: ${cmd.key}` };
      if (allowed[cmd.key] === null) world.policy[cmd.key] = !!cmd.value;
      else { const [lo, hi] = allowed[cmd.key]; world.policy[cmd.key] = Math.min(hi, Math.max(lo, Number(cmd.value) || 0)); }
      return { ok: true };
    }
    case 'person.recruit': return recruit(world, reg, cmd.personId);
    case 'person.dismiss': return dismiss(world, reg, cmd.personId);
    case 'office.appoint': return appoint(world, reg, cmd.officeId, cmd.personId ?? null);
    case 'research.start': return startResearch(world, reg, cmd.techId);
    case 'research.cancel': return cancelResearch(world);
    case 'caravan.send': return sendCaravan(world, reg, cmd);
    case 'diplomacy.gift': return sendGift(world, reg, cmd.nationId, cmd.amount);
    case 'diplomacy.propose': return propose(world, reg, cmd.nationId, cmd.kind);
    case 'order.fulfill': return fulfillOrder(world, reg, cmd.orderId);
    case 'commandery.policy': return setCityPolicy(world, reg, cmd.cityId, cmd.policy);
    case 'army.conscript': return conscript(world, reg, cmd.unitId, cmd.count);
    case 'army.disband': return disband(world, reg, cmd.unitId, cmd.count);
    case 'army.formation': return setFormation(world, reg, cmd.formation);
    case 'army.campaign': return startCampaign(world, reg, cmd);
    default:
      return { ok: false, message: `不明なコマンド: ${cmd.type}` };
  }
}
