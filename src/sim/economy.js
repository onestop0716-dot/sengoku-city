// 税・支出・財政記録・暮らしの指標（空き家・入居待ち・働き口・失業）。工房の生産と、伐木場・石切場の材料。
import { structureUpkeep } from './structures.js';
import { modsOf } from './modifiers.js';
import { tickPersonsMonthly } from './persons.js';
import { researchCostMonthly } from './research.js';
import { tickArmyMonthly } from './military/army.js';
import { isActive } from './satisfaction.js';
import { ensureMaterials } from './materials.js';
import { idx } from '../core/grid.js';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function emptyMonth() {
  return { income: { '田租': 0, '口賦': 0, '市租': 0, '関税': 0, '郡税': 0 }, expense: { '俸禄': 0, '維持費': 0, '上納': 0, '建設費': 0, '研究費': 0 } };
}

/** 月初: 口賦・俸禄・維持費を処理し、先月の記録を履歴へ */
export function tickEconomyMonthly(world, reg) {
  const E = reg.balance.economy;
  const m = world.finance.month;
  // 先月分を履歴に
  const income = Object.values(m.income).reduce((a, b) => a + b, 0), expense = Object.values(m.expense).reduce((a, b) => a + b, 0);
  world.finance.history.push({ year: world.finance.recordYear, month: world.finance.recordMonth, income: Math.round(income), expense: Math.round(expense), balance: Math.round(world.money), detail: m });
  if (world.finance.history.length > E.historyMonths) world.finance.history.splice(0, world.finance.history.length - E.historyMonths);
  world.finance.yearIncome += income;
  world.finance.month = emptyMonth();
  world.finance.recordYear = world.calendar.year; world.finance.recordMonth = world.calendar.month;
  const cur = world.finance.month;
  const M = modsOf(world);
  // 口賦（人頭税）。県丞や度量衡などの補正がかかる
  const head = world.population.total * E.headTaxPerPersonPerMonthAt10 * (world.policy.taxHead / 0.1) * M.taxIncome;
  world.money += head; cur.income['口賦'] += head;
  // 俸禄（県廷の官吏）
  world.money -= E.officialsSalaryPerMonth; cur.expense['俸禄'] += E.officialsSalaryPerMonth;
  // 配下の人材の俸禄と官職の手当
  const personSalary = tickPersonsMonthly(world, reg);
  world.money -= personSalary; cur.expense['俸禄'] += personSalary;
  // 軍の維持費と練兵
  const armyCost = tickArmyMonthly(world, reg);
  world.money -= armyCost; cur.expense['維持費'] += armyCost;
  // 研究費
  const research = researchCostMonthly(world, reg);
  world.money -= research; cur.expense['研究費'] = (cur.expense['研究費'] || 0) + research;
  // 特殊建築の維持費
  const upkeep = structureUpkeep(world, reg);
  world.money -= upkeep; cur.expense['維持費'] += upkeep;
  // 工房の生産と市の取引・市租
  const G = reg.balance.goods || {};
  let produced = 0;
  const artisanRatio = world.stats.workshopJobs > 0 ? clamp(world.population.artisans / world.stats.workshopJobs, 0, 1) : 0;
  const MT = reg.balance.materials;
  ensureMaterials(world, reg);
  world.finance.lastMaterials = { wood: 0, stone: 0 };
  for (const b of world.buildings.values()) {
    if (b.category !== 'workshop' || !isActive(world, reg, b)) continue;
    const def = reg.buildingById.get(b.buildingType);
    if (def.material) {   // 伐木場・石切場: 材料を作る
      const lvF = 1 + 0.5 * (b.level - 1);
      const amount = def.material === 'wood' ? MT.woodPerMonth * lvF * artisanRatio * Math.min(1, nearTiles(world, reg, b, def) / MT.forestFull) : MT.stonePerMonth * lvF * artisanRatio;
      world.materials[def.material] += amount;
      world.finance.lastMaterials[def.material] += amount;
      continue;
    }
    const units = (G.unitsPerWorkshop || 4) * (1 + 0.5 * (b.level - 1)) * artisanRatio * M.workshopOutput * (1 + (M.workshopGoods[def.produces] || 0));
    world.goods[def.produces] = (world.goods[def.produces] || 0) + units;
    produced += units * (G.prices?.[def.produces] || 10);
  }
  const hasMarket = (world.stats.marketJobs || 0) > 0;
  if (hasMarket) {
    const merchantRatio = clamp(world.population.merchants / world.stats.marketJobs, 0, 1);
    let sold = 0;
    for (const [g, n] of Object.entries(world.goods)) { const s = n * (G.soldShare || 0.6) * merchantRatio; world.goods[g] = n - s; sold += s * (G.prices?.[g] || 10); }
    const transactions = world.population.total * (G.tradePerPersonPerMonth || 0.3) * merchantRatio + sold;
    const tax = transactions * world.policy.taxMarket * M.marketTax * M.taxIncome;
    world.money += tax; cur.income['市租'] += tax;
    world.finance.lastMarket = { transactions: Math.round(transactions), sold: Math.round(sold), tax: Math.round(tax) };
  }
  world.finance.lastProduced = Math.round(produced);
  // 穀物の目減り
  world.grain.civil *= 1 - E.grainSpoilagePerMonth; world.grain.granary *= 1 - E.grainSpoilagePerMonth;
  if (world.money < 0 && world.calendar.month % 2 === 0) world.log.push({ day: world.day, text: '財政が赤字です。税率や建設を見直してください' });
}

/** 年初: 上納（前年の税収の一定割合を国へ納める） */
export function tickEconomyYearly(world, reg) {
  const E = reg.balance.economy;
  const rate = reg.rankById?.get(world.rank || 'magistrate')?.tribute ?? E.tributeRate;
  const tribute = Math.round(world.finance.yearIncome * rate);
  if (world.nation) { world.nation.merit += tribute * (reg.balance.nation?.merit.perTributeQian || 0); world.nation.favor = Math.min(100, world.nation.favor + 2); }
  world.money -= tribute; world.finance.month.expense['上納'] += tribute;
  world.finance.lastTribute = tribute; world.finance.yearIncome = 0;
  world.log.push({ day: world.day, text: `上納: 前年の税収から ${tribute} 銭を国に納めました` });
}

/** 周りの指定地形のマス数（伐木場の森など） */
function nearTiles(world, reg, b, def) {
  const req = def.requires || {}, r = req.radius || 4, W = world.map.w, H = world.map.h;
  const set = new Set((req.tileNear || []).map((t) => reg.tileIndex.get(t)));
  let n = 0;
  for (let y = Math.max(0, b.y - r); y <= Math.min(H - 1, b.y + b.h - 1 + r); y++) for (let x = Math.max(0, b.x - r); x <= Math.min(W - 1, b.x + b.w - 1 + r); x++) if (set.has(world.map.tile[idx(W, x, y)])) n++;
  return n;
}

/** 暮らしの指標: 空き家（収容 − 人口）、入居待ち（住みたいが家がない人。魅力 ×（base + 人口 × perPop）− 空き家）、空いている働き口、失業者 */
export function updateIndicators(world, reg) {
  const pop = world.population, st = world.stats;
  const cap = st.housingCapacity || 0;
  const employed = (pop.farmers || 0) + (pop.artisans || 0) + (pop.merchants || 0);
  const A = reg.balance.population.attract, Wt = reg.balance.population.waiting;
  const attract = clamp((world.loyalty - A.loyaltyFloor) / A.loyaltySpan, 0, 1) * (world.foodSufficient ? 1 : A.foodShortFactor);
  const vacant = Math.max(0, Math.round(cap - pop.total));
  world.indicators = {
    vacant,
    waiting: Math.max(0, Math.round(attract * (Wt.base + pop.total * Wt.perPop)) - vacant),   // 来たい人のうち空き家に入りきれない人
    jobsOpen: Math.max(0, Math.round((st.jobs || 0) - employed)),
    unemployed: Math.round(pop.unemployed || 0),
  };
  return world.indicators;
}
