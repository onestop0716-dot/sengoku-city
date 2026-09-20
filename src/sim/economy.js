// 税・支出・財政記録・需要メーター。
import { structureUpkeep } from './structures.js';
import { modsOf } from './modifiers.js';
import { tickPersonsMonthly } from './persons.js';
import { researchCostMonthly } from './research.js';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function emptyMonth() {
  return { income: { '田租': 0, '口賦': 0, '市租': 0, '関税': 0 }, expense: { '俸禄': 0, '維持費': 0, '上納': 0, '建設費': 0, '研究費': 0 } };
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
  for (const b of world.buildings.values()) {
    if (b.category !== 'workshop' || b.state !== 'built') continue;
    const def = reg.buildingById.get(b.buildingType);
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
  const tribute = Math.round(world.finance.yearIncome * E.tributeRate);
  world.money -= tribute; world.finance.month.expense['上納'] += tribute;
  world.finance.lastTribute = tribute; world.finance.yearIncome = 0;
  world.log.push({ day: world.day, text: `上納: 前年の税収から ${tribute} 銭を国に納めました` });
}

/** 需要メーター（−100〜100） */
export function updateDemand(world, reg) {
  const D = reg.balance.demand;
  const pop = world.population, st = world.stats;
  const cap = st.housingCapacity || 0;
  const vacancy = cap > 0 ? clamp((cap - pop.total) / cap, 0, 1) : 0;
  const jobGap = (st.jobs || 0) - Math.round(pop.commoner * 0.8);
  const food = world.foodSufficient ? D.residential.foodOk : world.foodSufficiency < reg.balance.economy.famineThreshold ? D.residential.foodShort : 0;
  world.demand.residential = clamp(D.residential.base + jobGap * D.residential.jobs + (world.loyalty - 50) * D.residential.loyalty + food - vacancy * D.residential.vacancy, -100, 100);
  // 農: 食糧が足りないほど高い。余っていれば下がる
  const yearNeed = pop.total * reg.balance.economy.consumptionPerPersonPerYear;
  const stock = world.grain.civil + world.grain.granary;
  const months = yearNeed > 0 ? (stock / yearNeed) * 12 : 12;
  world.demand.farm = clamp(D.farm.base + (1 - clamp(world.foodSufficiency, 0, 1.5)) * D.farm.shortage + (months > 18 ? D.farm.surplus : 0) + (pop.total < 20 ? 30 : 0) + (world.services.farmDemand || 0), -100, 100);
  // 商: 人口に対して市の店が足りないほど高い
  const marketNeed = pop.total * D.market.perPerson;
  world.demand.market = clamp(D.market.base + marketNeed - (st.marketJobs || 0) * 0.5, -100, 100);
  // 工: 失業者と資源があれば高い。工房の仕事が余っていれば下がる
  world.demand.workshop = clamp(D.workshop.base + pop.unemployed * 0.5 + (pop.total > 200 ? 20 : 0) - Math.max(0, (st.workshopJobs || 0) - pop.artisans) * 0.5, -100, 100);
}
