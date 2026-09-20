// generator 名 → 関数。assets.json の "generator" と対応する。
import { houseCommoner, houseShi, houseNoble } from './houses.js';
import { farmhouse, field } from './farm.js';
import { tree, scaffold } from './nature.js';
import { structure } from './structures.js';
import { marketStall, workshop, militaryBuilding } from './commerce.js';
import { agent } from './agents.js';
import { personStatic } from './people.js';
import { VEHICLE_PARTS } from './vehicles.js';

export const GENERATORS = { houseCommoner, houseShi, houseNoble, farmhouse, field, tree, scaffold, structure, marketStall, workshop, militaryBuilding, agent, personStatic, vehiclePart: ({ part, ...params }) => VEHICLE_PARTS[part](params) };

/** アセット定義からローポリ形状（配列）を作る */
export function generateModel(asset) {
  const fn = GENERATORS[asset.generator];
  if (!fn) throw new Error(`未知の generator: ${asset.generator}`);
  return fn(asset.params || {});
}
