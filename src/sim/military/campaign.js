// 出陣（他都市を攻める）と守城（敵の侵攻）。全国の状態（world.nation）と結びつく。
import { resolveBattle } from './battle.js';
import { ensureArmy, soldierCount, playerSide } from './army.js';
import { ensureNationState, dist, checkPromotion } from '../nation/state.js';

const RANKS = ['magistrate', 'governor', 'chancellor', 'general'];
const rankIdx = (r) => RANKS.indexOf(r || 'magistrate');

/** AI 都市の軍を side にする */
export function aiSide(world, reg, cityId, size = null) {
  const N = ensureNationState(world, reg), A = reg.military.balance.aiArmy;
  const s = N.cities[cityId];
  const nation = reg.nationById.get(s.nation);
  const n = size ?? s.army;
  const units = {};
  for (const [id, r] of Object.entries(A.composition)) units[id] = Math.round(n * r);
  return { units, training: A.training + (nation?.aiTraits?.aggression || 0) * A.aggressionTraining, morale: 60, formation: 'square', equipment: 1 + (nation?.techBonus?.iron ? 0.1 : 0), general: null, mods: {}, supply: 1 };
}

/** 攻められる都市（範囲内で、自国以外） */
export function campaignTargets(world, reg) {
  const N = ensureNationState(world, reg), C = reg.military.balance.campaign;
  const home = reg.cityById.get(world.cityId);
  const max = C.maxDistance[world.rank || 'magistrate'] ?? 220;
  return reg.cities.filter((c) => c.id !== world.cityId && N.cities[c.id].nation !== world.nationId && dist(home, c) <= max);
}

export function startCampaign(world, reg, { target, units }) {
  const army = ensureArmy(world, reg), N = ensureNationState(world, reg), C = reg.military.balance.campaign;
  if (army.campaign) return { ok: false, message: 'すでに出陣中です' };
  const city = reg.cityById.get(target);
  if (!city || !campaignTargets(world, reg).some((c) => c.id === target)) return { ok: false, message: 'その都市へは出陣できません（距離・自国）' };
  const take = {};
  let n = 0;
  for (const [id, q] of Object.entries(units || {})) { const k = Math.min(army.units[id] || 0, Math.floor(Number(q) || 0)); if (k > 0) { take[id] = k; n += k; } }
  if (n < 20) return { ok: false, message: '20 人以上で出陣してください' };
  const key = [world.nationId, N.cities[target].nation].sort().join(':');
  if (N.treaties[key]) return { ok: false, message: `${reg.nationById.get(N.cities[target].nation).name}とは${N.treaties[key] === 'alliance' ? '同盟' : '不可侵'}を結んでいます` };
  for (const [id, k] of Object.entries(take)) army.units[id] -= k;
  const days = Math.max(2, Math.round(dist(reg.cityById.get(world.cityId), city) / C.speedPerDay));
  army.campaign = { target, units: take, phase: 'out', progress: 0, days, result: null };
  const enemyNation = N.cities[target].nation;
  N.relations[world.nationId][enemyNation] = Math.max(-100, N.relations[world.nationId][enemyNation] + C.relationOnAttack);
  N.relations[enemyNation][world.nationId] = Math.max(-100, N.relations[enemyNation][world.nationId] + C.relationOnAttack);
  world.log.push({ day: world.day, text: `${city.name}へ出陣しました（${n} 人、片道 ${days} 日）。${reg.nationById.get(enemyNation).name}との友好度が大きく下がりました` });
  return { ok: true, days };
}

function recordBattle(world, rec) {
  const army = world.army;
  army.battles.push(rec);
  if (army.battles.length > 12) army.battles.shift();
}

/** 毎日: 出陣中の軍の移動・戦闘・帰還、侵攻の到着 */
export function tickCampaignDaily(world, reg) {
  const army = ensureArmy(world, reg), N = ensureNationState(world, reg), C = reg.military.balance.campaign, I = reg.military.balance.invasion;
  const c = army.campaign;
  if (c) {
    c.progress++;
    if (c.progress >= c.days) {
      const city = reg.cityById.get(c.target);
      if (c.phase === 'out') {
        const side = playerSide(world, reg, c.units);
        side.supply = 0.9;   // 遠征の兵糧
        const enemy = aiSide(world, reg, c.target);
        const fort = (city.isCapital ? reg.military.balance.capitalDefense : 0.1) + 0.1;
        const res = resolveBattle({ attacker: side, defender: enemy, kind: 'siege', fortification: fort, siegeBonus: world.mods?.military?.siege || 0, rng: () => world.rng.next() }, reg);
        c.units = res.attackerLeft; c.result = res.winner === 'attacker' ? 'win' : 'lose';
        const s = N.cities[c.target];
        let text;
        if (res.winner === 'attacker') {
          const loot = Math.round(s.wealth * C.lootRate);
          s.wealth -= loot; s.army = Object.values(res.defenderLeft).reduce((a, b) => a + b, 0);
          world.money += loot; world.finance.month.income['関税'] += 0;
          N.merit += city.isCapital ? C.meritCapital : C.meritWin; N.prestige += 10; army.victories++;
          // 領有: 郡守以上（首都は相邦・大将軍）
          const need = city.isCapital ? C.capitalConquerMinRank : C.conquerMinRank;
          let conquered = false;
          if (rankIdx(world.rank) >= rankIdx(need)) { s.nation = world.nationId; if (!N.commandery.includes(c.target)) N.commandery.push(c.target); conquered = true; }
          text = `${city.name}を攻め落としました。略奪 ${loot} 銭、功績 +${city.isCapital ? C.meritCapital : C.meritWin}${conquered ? `。${city.name}は${reg.nationById.get(world.nationId).name}の領土になり、郡に加わりました` : `（都市を領有するには${reg.rankById.get(need)?.name}以上が必要）`}`;
          c.loot = loot; c.conquered = conquered;
        } else {
          N.merit = Math.max(0, N.merit + C.meritLose); army.defeats++;
          s.army = Object.values(res.defenderLeft).reduce((a, b) => a + b, 0);
          text = `${city.name}の攻略に失敗しました。兵 ${res.casualties.attacker} 人を失い撤退します`;
        }
        recordBattle(world, { day: world.day, kind: 'siege', place: city.name, winner: res.winner === 'attacker' ? 'player' : 'enemy', rounds: res.rounds, casualties: res.casualties });
        world.log.push({ day: world.day, text });
        army.training = Math.min(100, army.training + reg.military.balance.experiencePerBattle);
        c.phase = 'back'; c.progress = 0;
        checkPromotion(world, reg);
      } else {
        for (const [id, k] of Object.entries(c.units)) army.units[id] += k;
        army.campaign = null;
        world.log.push({ day: world.day, text: `軍が${city.name}から帰還しました` });
      }
    }
  }
  // 侵攻の到着
  const inv = army.invasion;
  if (inv) {
    inv.progress++;
    if (inv.progress >= inv.days) { resolveInvasion(world, reg, inv); army.invasion = null; }
  }
}

/** 月次: 敵の侵攻が起きるか */
export function tickInvasionMonthly(world, reg) {
  const army = ensureArmy(world, reg), N = ensureNationState(world, reg), I = reg.military.balance.invasion;
  if (army.invasion || N.monthsElapsed < 12) return;
  for (const n of reg.nations) {
    if (n.id === world.nationId) continue;
    const rel = N.relations[n.id][world.nationId];
    if (rel >= I.relationBelow) continue;
    if (N.treaties[[n.id, world.nationId].sort().join(':')]) continue;
    const chance = I.baseChance * (reg.balance.aiAggression ?? 1) * (0.5 + (n.aiTraits?.aggression || 0)) * (1 + (-rel - 30) / 70);
    if (world.rng.next() >= chance) continue;
    const from = reg.cities.filter((c) => N.cities[c.id].nation === n.id).sort((a, b) => dist(a, reg.cityById.get(world.cityId)) - dist(b, reg.cityById.get(world.cityId)))[0];
    if (!from) continue;
    const size = Math.max(I.minSize, Math.round(N.cities[from.id].army * I.sizeRatio));
    const warned = Array.from(world.structures.values()).some((s) => s.state === 'built' && reg.structureById.get(s.type).effects.some((e) => e.type === 'warning'));
    army.invasion = { nation: n.id, from: from.id, size, progress: 0, days: warned ? I.warningDays : I.noWarningDays, warned };
    world.log.push({ day: world.day, text: warned ? `烽火: ${n.name}軍（約 ${size} 人）が${from.name}から迫っています。到着まで約 ${I.warningDays} 日` : `${n.name}軍（約 ${size} 人）が突然現れました！ 数日で到着します` });
    break;
  }
}

function resolveInvasion(world, reg, inv) {
  const army = ensureArmy(world, reg), N = ensureNationState(world, reg), I = reg.military.balance.invasion, B = reg.military.balance;
  const nation = reg.nationById.get(inv.nation);
  const enemy = aiSide(world, reg, inv.from, inv.size);
  const units = { ...army.units };
  if (army.campaign) for (const id of Object.keys(units)) units[id] = army.units[id];   // 出陣中の兵は不在
  units.infantry = (units.infantry || 0) + Math.round(world.population.total * B.militiaRatio);   // 民兵
  const side = playerSide(world, reg, units);
  side.formation = army.formation === 'wedge' ? 'square' : army.formation;
  const fort = (world.stats.defense || 0) * B.wallDefensePerPoint + (world.grain.granary > 500 ? B.granaryDefense : 0);
  const res = resolveBattle({ attacker: enemy, defender: side, kind: 'defense', fortification: fort, siegeBonus: 0, rng: () => world.rng.next() }, reg);
  // 損耗を自軍に反映（民兵分は除く）
  const militia = Math.round(world.population.total * B.militiaRatio);
  for (const id of Object.keys(army.units)) { const left = res.defenderLeft[id] || 0; army.units[id] = Math.max(0, Math.min(army.units[id], id === 'infantry' ? Math.max(0, left - militia) : left)); }
  let text;
  if (res.winner === 'defender') {
    N.merit += I.meritDefend; N.prestige += 5; army.victories++;
    text = `${nation.name}軍の侵攻を撃退しました！ 功績 +${I.meritDefend}（城壁の防御 +${Math.round(fort * 100)}%）`;
  } else {
    const loot = Math.round(Math.max(0, world.money) * I.lootRate);
    world.money -= loot; world.loyalty = Math.max(0, world.loyalty - I.loyaltyLoss); army.defeats++;
    const lost = Math.round(world.population.total * I.populationLoss); world.population.total -= lost; world.population.commoner = Math.max(0, world.population.commoner - lost);
    // 城壁の外の建物から壊される
    const built = Array.from(world.buildings.values()).filter((b) => b.state === 'built');
    const outside = built.filter((b) => !(world.services.insideWall && world.services.insideWall[b.y * world.map.w + b.x]));
    const pool = outside.length ? outside : built;
    const nDestroy = Math.round(built.length * I.destroyRatio);
    let destroyed = 0;
    for (let i = 0; i < nDestroy && pool.length; i++) { const b = pool.splice(Math.floor(world.rng.next() * pool.length), 1)[0]; removeBuildingQuiet(world, b); destroyed++; }
    text = `${nation.name}軍に敗れました。銭 ${loot} を奪われ、建物 ${destroyed} 棟が壊され、民 ${lost} 人が失われました`;
  }
  recordBattle(world, { day: world.day, kind: 'defense', place: reg.cityById.get(world.cityId).name, winner: res.winner === 'defender' ? 'player' : 'enemy', rounds: res.rounds, casualties: { attacker: res.casualties.attacker, defender: res.casualties.defender } });
  world.log.push({ day: world.day, text });
  army.training = Math.min(100, army.training + B.experiencePerBattle);
  world.dirty.buildings = true; world.servicesDirty = true;
  checkPromotion(world, reg);
}
function removeBuildingQuiet(world, b) {
  for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) world.buildingAt[yy * world.map.w + xx] = -1;
  world.buildings.delete(b.id);
}
