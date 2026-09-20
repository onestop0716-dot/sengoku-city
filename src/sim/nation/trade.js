// 貿易: 商隊を都市へ送り、積荷を売って特産を買って帰る。関所があれば関税が入る。
import { ensureNationState, reachableCities, cityPrice, dist, checkPromotion } from './state.js';

export function caravanFee(world, reg, value) {
  const B = reg.balance.nation.caravan;
  return Math.round(B.feeBase + value * B.feePerValue);
}
export function hasMarketHall(world) { return Array.from(world.structures.values()).some((s) => s.state === 'built' && s.type === 'market_hall'); }
export function homeStock(world, goodsId) { return goodsId === 'grain' ? Math.floor(world.grain.civil) : Math.floor(world.goods[goodsId] || 0); }

/** 商隊を送る。goods: { id: 数量 }、buy: 現地で買う品（null で買わない） */
export function sendCaravan(world, reg, { to, goods, buy = null }) {
  const N = ensureNationState(world, reg), B = reg.balance.nation.caravan;
  if (!hasMarketHall(world)) return { ok: false, message: '商隊を送るには市亭が必要です' };
  if (N.caravans.length >= B.maxActive) return { ok: false, message: `同時に送れる商隊は ${B.maxActive} 隊までです` };
  const dest = reg.cityById.get(to);
  if (!dest || !reachableCities(world, reg).some((c) => c.id === to)) return { ok: false, message: 'その都市へは送れません（官位や友好度）' };
  const cargo = {};
  let value = 0;
  for (const [id, qty] of Object.entries(goods || {})) {
    const q = Math.floor(Number(qty) || 0);
    if (q <= 0) continue;
    if (!reg.goodsById.get(id)) return { ok: false, message: `不明な交易品: ${id}` };
    if (homeStock(world, id) < q) return { ok: false, message: `${reg.goodsById.get(id).name}が足りません（${homeStock(world, id)}）` };
    cargo[id] = q; value += q * reg.goodsById.get(id).basePrice;
  }
  if (!Object.keys(cargo).length) return { ok: false, message: '積荷がありません' };
  if (buy && !reg.goodsById.get(buy)) return { ok: false, message: '不明な交易品です' };
  const fee = caravanFee(world, reg, value);
  if (world.money < fee) return { ok: false, message: `派遣の費用 ${fee} 銭が足りません` };
  world.money -= fee; world.finance.month.expense['維持費'] += fee;
  for (const [id, q] of Object.entries(cargo)) { if (id === 'grain') world.grain.civil -= q; else world.goods[id] -= q; }
  const days = Math.max(2, Math.round(dist(reg.cityById.get(world.cityId), dest) / B.speedPerDay));
  const c = { id: N.nextCaravanId++, to, cargo, buy, phase: 'out', progress: 0, days, revenue: 0, bought: {}, fee, sentDay: world.day, log: [] };
  N.caravans.push(c); N.stats.caravansSent = (N.stats.caravansSent || 0) + 1;
  world.log.push({ day: world.day, text: `商隊が${dest.name}へ出発しました（片道 ${days} 日、費用 ${fee} 銭）` });
  return { ok: true, id: c.id, days };
}

function warningLevel(world, reg) {
  let w = 0;
  for (const s of world.structures.values()) if (s.state === 'built') for (const e of reg.structureById.get(s.type).effects) if (e.type === 'warning') w += e.value;
  return w;
}

/** 毎日: 商隊の移動・到着・帰還 */
export function tickCaravansDaily(world, reg) {
  const N = world.nation;
  if (!N || !N.caravans.length) return;
  const B = reg.balance.nation.caravan, M = reg.balance.nation.merit;
  for (const c of N.caravans.slice()) {
    c.progress++;
    if (c.progress < c.days) continue;
    const dest = reg.cityById.get(c.to);
    if (c.phase === 'out') {
      // 盗賊
      const bandit = Math.max(0, B.banditBase - warningLevel(world, reg) * B.banditPerWarning - (world.mods?.trade || 0) * 0.1);
      if (world.rng.next() < bandit) { for (const id of Object.keys(c.cargo)) c.cargo[id] = Math.floor(c.cargo[id] * 0.7); c.log.push('盗賊に襲われ積荷の3割を失った'); world.log.push({ day: world.day, text: `${dest.name}へ向かう商隊が盗賊に襲われ、積荷の3割を失いました` }); }
      // 売る
      let revenue = 0;
      for (const [id, q] of Object.entries(c.cargo)) revenue += q * cityPrice(world, reg, c.to, id);
      revenue *= 1 + (world.mods?.trade || 0);
      c.revenue = Math.round(revenue);
      // 買う
      if (c.buy) { const price = cityPrice(world, reg, c.to, c.buy); const spend = c.revenue * B.buyShare; const q = Math.floor(spend / price); if (q > 0) { c.bought[c.buy] = q; c.revenue -= Math.round(q * price); } }
      c.phase = 'back'; c.progress = 0;
      world.log.push({ day: world.day, text: `商隊が${dest.name}に着き、積荷を ${c.revenue + Math.round(Object.entries(c.bought).reduce((a, [id, q]) => a + q * cityPrice(world, reg, c.to, id), 0))} 銭で売りました${c.buy && c.bought[c.buy] ? `。${reg.goodsById.get(c.buy).name} ${c.bought[c.buy]} を買って戻ります` : ''}` });
      // 友好度
      if (dest.nation !== world.nationId) N.relations[world.nationId][dest.nation] = Math.min(100, N.relations[world.nationId][dest.nation] + reg.balance.nation.relations.tradeBonus);
    } else {
      world.money += c.revenue; world.finance.month.income['市租'] += 0;
      for (const [id, q] of Object.entries(c.bought)) { if (id === 'grain') world.grain.civil += q; else world.goods[id] = (world.goods[id] || 0) + q; }
      // 関税: 関所があれば取引額 × 関税率
      const hasCustoms = Array.from(world.structures.values()).some((s) => s.state === 'built' && s.type === 'customs');
      const boughtValue = Object.entries(c.bought).reduce((a, [id, q]) => a + q * reg.goodsById.get(id).basePrice, 0);
      if (hasCustoms) { const tax = Math.round((c.revenue + boughtValue) * world.policy.taxCustoms); world.money += tax; world.finance.month.income['関税'] += tax; }
      const profit = c.revenue + boughtValue - c.fee - Object.entries(c.cargo).reduce((a, [id, q]) => a + q * reg.goodsById.get(id).basePrice, 0);
      N.stats.tradeProfit += profit;
      if (profit > 0) N.merit += profit * M.perTradeProfitQian;
      N.caravans = N.caravans.filter((x) => x !== c);
      world.log.push({ day: world.day, text: `商隊が${dest.name}から戻り、銭 ${c.revenue} と${Object.entries(c.bought).map(([id, q]) => `${reg.goodsById.get(id).name} ${q}`).join('・') || '手ぶら'}を持ち帰りました（利益 ${Math.round(profit)} 銭）` });
      checkPromotion(world, reg);
    }
  }
}
