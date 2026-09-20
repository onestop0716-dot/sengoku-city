// 軍: 徴兵・解散・練度・士気・装備・維持費。状態は world.army。
import { effectiveStats } from '../persons.js';
import { hasTech } from '../research.js';

export function ensureArmy(world, reg) {
  if (!world.army) world.army = { units: Object.fromEntries(reg.military.units.map((u) => [u.id, 0])), training: 20, morale: 60, formation: 'square', campaign: null, victories: 0, defeats: 0, battles: [], invasion: null };
  for (const u of reg.military.units) if (!(u.id in world.army.units)) world.army.units[u.id] = 0;
  return world.army;
}
export const soldierCount = (army) => Object.values(army.units).reduce((a, b) => a + b, 0);

/** 兵舎の収容数（建物のレベル合計 × 係数） */
export function barracksCapacity(world, reg) {
  const B = reg.military.balance;
  let cap = 0, stable = 0, vehicle = false;
  for (const b of world.buildings.values()) {
    if (b.state !== 'built') continue;
    if (b.buildingType === 'barracks') cap += b.level * B.barracksCapacityPerLevel;
    if (b.buildingType === 'stable') stable += b.level * B.stableCavalryPerLevel;
    if (b.buildingType === 'ws_vehicle') vehicle = true;
  }
  return { total: cap, cavalry: stable, chariot: vehicle };
}

/** 兵種が徴兵できるか（技術・建物） */
export function unitAvailable(world, reg, unitId) {
  const u = reg.unitById.get(unitId);
  if (!u) return { ok: false, message: '不明な兵種' };
  const r = u.requires || {};
  if (r.tech && !hasTech(world, r.tech)) return { ok: false, message: `技術「${reg.techById.get(r.tech)?.name}」が必要` };
  const cap = barracksCapacity(world, reg);
  if (unitId === 'cavalry' && cap.cavalry <= 0) return { ok: false, message: '馬厩（軍事区画）が必要' };
  if (unitId === 'chariot' && !cap.chariot) return { ok: false, message: '車両工房が必要' };
  return { ok: true };
}

export function conscript(world, reg, unitId, n) {
  const army = ensureArmy(world, reg), B = reg.military.balance;
  n = Math.floor(Number(n) || 0);
  if (n <= 0) return { ok: false, message: '人数を入れてください' };
  const av = unitAvailable(world, reg, unitId);
  if (!av.ok) return av;
  const u = reg.unitById.get(unitId), cap = barracksCapacity(world, reg);
  if (soldierCount(army) + n > cap.total) return { ok: false, message: `兵舎の収容数（${cap.total}）を超えます` };
  if (unitId === 'cavalry' && army.units.cavalry + n > cap.cavalry) return { ok: false, message: `馬厩の馬（${cap.cavalry}頭）が足りません` };
  if (soldierCount(army) + n > world.population.total * B.maxConscriptRatio) return { ok: false, message: `人口の ${Math.round(B.maxConscriptRatio * 100)}% までしか徴兵できません` };
  if (world.population.commoner < n) return { ok: false, message: '庶民の人口が足りません' };
  const cost = u.cost * n;
  if (world.money < cost) return { ok: false, message: `装備の費用 ${cost} 銭が足りません` };
  world.money -= cost; world.finance.month.expense['維持費'] += cost;
  world.population.commoner -= n; world.population.total -= n;
  army.units[unitId] += n;
  army.training = Math.round((army.training * (soldierCount(army) - n) + 10 * n) / soldierCount(army));   // 新兵で練度が薄まる
  world.log.push({ day: world.day, text: `${u.name}を ${n} 人徴兵しました（${cost} 銭）` });
  return { ok: true };
}
export function disband(world, reg, unitId, n) {
  const army = ensureArmy(world, reg);
  n = Math.min(army.units[unitId] || 0, Math.floor(Number(n) || 0));
  if (n <= 0) return { ok: false, message: '解散する兵がいません' };
  if (army.campaign) return { ok: false, message: '出陣中は解散できません' };
  army.units[unitId] -= n; world.population.commoner += n; world.population.total += n;
  world.log.push({ day: world.day, text: `${reg.unitById.get(unitId).name} ${n} 人を帰農させました` });
  return { ok: true };
}
export function setFormation(world, reg, id) {
  const army = ensureArmy(world, reg);
  if (!reg.formationById.get(id)) return { ok: false, message: '不明な陣形です' };
  army.formation = id;
  return { ok: true };
}

/** 将軍（官職）の能力 */
export function generalOf(world, reg) {
  const pid = world.offices?.general;
  const p = pid ? reg.personById.get(pid) : null;
  return p ? { id: p.id, name: p.name, ...effectiveStats(world, reg, p) } : null;
}
/** 装備係数: 技術 + 武庫 + 武器の在庫 */
export function equipmentFactor(world, reg) {
  const army = ensureArmy(world, reg);
  let f = 1 + (world.mods?.military?.equipment || 0);
  const hasArmory = Array.from(world.structures.values()).some((s) => s.state === 'built' && s.type === 'armory');
  if (hasArmory) f += 0.1;
  const n = Math.max(1, soldierCount(army));
  f += Math.min(0.2, ((world.goods?.weapon || 0) / n) * 0.5);
  return Math.round(f * 100) / 100;
}
/** 自軍を戦闘用の side にまとめる */
export function playerSide(world, reg, units = null) {
  const army = ensureArmy(world, reg);
  return { units: units || { ...army.units }, training: army.training, morale: army.morale, formation: army.formation, equipment: equipmentFactor(world, reg), general: generalOf(world, reg), mods: world.mods?.military || {}, supply: 1 };
}

/** 月次: 維持費・兵糧・練度・士気 */
export function tickArmyMonthly(world, reg) {
  const army = ensureArmy(world, reg), B = reg.military.balance;
  const n = soldierCount(army);
  if (n === 0) { army.training = Math.max(20, army.training - B.trainingDecayPerMonth); return 0; }
  let upkeep = 0;
  for (const [id, k] of Object.entries(army.units)) upkeep += k * (reg.unitById.get(id)?.upkeep || 0);
  const grain = n * B.grainPerSoldierPerMonth;
  const g = Math.min(world.grain.granary, grain); world.grain.granary -= g; world.grain.civil = Math.max(0, world.grain.civil - (grain - g));
  const hasDrill = Array.from(world.structures.values()).some((s) => s.state === 'built' && s.type === 'drill_ground');
  const gen = generalOf(world, reg);
  if (hasDrill && !army.campaign) { const gain = B.trainingPerMonth * (1 + (gen?.lead || 0) / 200); army.training = Math.min(B.trainingMax, army.training + gain); const cost = Math.round(n * B.trainingCostPerSoldier); world.money -= cost; upkeep += cost; }
  else army.training = Math.max(20, army.training - B.trainingDecayPerMonth);
  const target = B.moraleBase + (world.loyalty - 50) * B.moraleLoyaltyScale + (world.money < 0 ? B.moraleDeficit : 0) + (world.mods?.military?.morale || 0) * 50;
  army.morale = Math.max(0, Math.min(100, army.morale + (Math.max(0, Math.min(100, target)) - army.morale) * B.moraleSmoothing));
  army.training = Math.round(army.training * 10) / 10; army.morale = Math.round(army.morale * 10) / 10;
  return upkeep;
}
