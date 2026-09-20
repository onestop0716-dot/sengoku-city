// 全国の状態: 七雄と28都市の簡略な国力モデル、功績・威信・王の信任、王命、昇進、郡の運営。
// プレイヤーの都市だけ詳細シミュレーション。他都市は人口・富・兵の数値だけで動く。
import { refreshModifiers } from '../modifiers.js';

const RANK_ORDER = ['magistrate', 'governor', 'chancellor', 'general'];
export const POLICY_NAMES = { balanced: '均衡', farm: '農業重視', commerce: '商業重視', military: '軍備重視' };

export const dist = (a, b) => Math.hypot(a.mapPos[0] - b.mapPos[0], a.mapPos[1] - b.mapPos[1]);

/** 初期の友好度: 秦と他国は低く、合従に加わった国同士はやや良い（前247年の信陵君の合従） */
function initialRelations(reg) {
  const rel = {};
  const base = (a, b) => {
    if (a === b) return 100;
    if (a === 'qin' || b === 'qin') return { han: -20, wei: -40, zhao: -40, chu: -30, qi: 0, yan: -10 }[a === 'qin' ? b : a] ?? -20;
    if ((a === 'zhao' && b === 'yan') || (a === 'yan' && b === 'zhao')) return -30;   // 前242年に燕が趙を攻める
    if ((a === 'qi' && b !== 'qi')) return 5;
    return 20;
  };
  for (const a of reg.nations) { rel[a.id] = {}; for (const b of reg.nations) rel[a.id][b.id] = base(a.id, b.id); }
  return rel;
}

export function ensureNationState(world, reg) {
  if (world.nation) return world.nation;
  const cities = {};
  for (const c of reg.cities) cities[c.id] = { population: c.basePopulation, wealth: Math.round(c.basePopulation * 0.5), army: Math.round(c.basePopulation * 0.05), policy: 'balanced', nation: c.nation };
  const markets = {};
  for (const c of reg.cities) { markets[c.id] = {}; for (const g of reg.goods) markets[c.id][g.id] = 1; }
  world.nation = { merit: 0, prestige: 10, favor: 50, relations: initialRelations(reg), cities, markets, caravans: [], nextCaravanId: 1, orders: [], nextOrderId: 1, lastOrderMonth: 0, monthsElapsed: 0, treaties: {}, commandery: [], stats: { tradeProfit: 0, ordersDone: 0, ordersFailed: 0 }, lastPopulation: world.population.total };
  return world.nation;
}

/** 都市の交易品の価格（銭/単位）: 基準価格 × 特産なら安い × 首都は需要が高い × 月ごとの変動 */
export function cityPrice(world, reg, cityId, goodsId) {
  const B = reg.balance.nation.market;
  const c = reg.cityById.get(cityId), g = reg.goodsById.get(goodsId);
  if (!c || !g) return 0;
  let f = 1;
  if (g.specialty && c.specialties.includes(g.specialty)) f *= B.specialtyFactor;
  else if (c.isCapital) f *= B.capitalDemand;
  f *= world.nation?.markets?.[cityId]?.[goodsId] ?? 1;
  return g.basePrice * f;
}

/** 国力 = 都市の人口・富・兵の合計（表示用） */
export function nationPower(world, reg, nationId) {
  let p = 0;
  for (const c of reg.cities) { const s = world.nation.cities[c.id]; if (s.nation !== nationId) continue; p += s.population / 1000 + s.wealth / 1000 + s.army / 500; }
  return Math.round(p);
}
export function powerRanking(world, reg) {
  return reg.nations.map((n) => ({ id: n.id, name: n.name, power: nationPower(world, reg, n.id) })).sort((a, b) => b.power - a.power);
}

/** 商隊を送れる都市（官位で広がる） */
export function reachableCities(world, reg) {
  const B = reg.balance.nation.caravan;
  const home = reg.cityById.get(world.cityId);
  const reach = B.reach[world.rank || 'magistrate'] ?? 220;
  const nat = (c) => world.nation?.cities?.[c.id]?.nation || c.nation;   // 征服で所属が変わることがある
  return reg.cities.filter((c) => c.id !== world.cityId && (nat(c) === world.nationId ? (world.rank === 'magistrate' ? dist(home, c) <= reach : true) : dist(home, c) <= reach) && (nat(c) === world.nationId || (world.nation.relations[world.nationId][nat(c)] >= B.minRelation)));
}

function spawnOrder(world, reg) {
  const N = world.nation, O = reg.balance.nation.orders;
  const pop = Math.max(50, world.population.total);
  const kind = world.rng.next() < 0.5 ? 'money' : 'grain';
  const amount = kind === 'money' ? Math.max(O.minMoney, Math.round(pop * O.moneyPerCapita / 10) * 10) : Math.max(O.minGrain, Math.round(pop * O.grainPerCapita / 10) * 10);
  const order = { id: N.nextOrderId++, kind, amount, issuedDay: world.day, deadlineDay: world.day + O.deadlineMonths * 30, state: 'open' };
  N.orders.push(order);
  world.log.push({ day: world.day, text: `王命: ${kind === 'money' ? `銭 ${amount} を` : `穀物 ${amount} 石を`}${O.deadlineMonths}か月以内に納めよ` });
  return order;
}

/** 王命を果たす（コマンド） */
export function fulfillOrder(world, reg, orderId) {
  const N = ensureNationState(world, reg), M = reg.balance.nation.merit;
  const o = N.orders.find((x) => x.id === orderId && x.state === 'open');
  if (!o) return { ok: false, message: 'その王命はありません' };
  if (o.kind === 'money') { if (world.money < o.amount) return { ok: false, message: `銭 ${o.amount} が足りません` }; world.money -= o.amount; world.finance.month.expense['上納'] += o.amount; }
  else { const stock = world.grain.civil + world.grain.granary; if (stock < o.amount) return { ok: false, message: `穀物 ${o.amount} 石が足りません` }; const fromG = Math.min(world.grain.granary, o.amount); world.grain.granary -= fromG; world.grain.civil -= o.amount - fromG; }
  o.state = 'done'; o.doneDay = world.day;
  N.merit += M.perOrder; N.favor = Math.min(100, N.favor + M.favorOrder); N.prestige += 2; N.stats.ordersDone++;
  world.log.push({ day: world.day, text: `王命を果たしました。功績 +${M.perOrder}、王の信任 +${M.favorOrder}` });
  checkPromotion(world, reg);
  return { ok: true };
}

/** 月次: 他都市の成長、市場の変動、王命、功績、昇進判定、郡税 */
export function tickNationMonthly(world, reg) {
  const N = ensureNationState(world, reg);
  const B = reg.balance.nation, C = B.cities, M = B.merit;
  N.monthsElapsed++;
  // 他都市の国力（政策で伸び方が変わる）
  for (const c of reg.cities) {
    if (c.id === world.cityId) { const s = N.cities[c.id]; s.population = world.population.total; s.wealth = Math.max(0, Math.round(world.money)); continue; }
    const s = N.cities[c.id];
    if (s.nation === world.nationId && N.commandery.includes(c.id) && c.nation !== world.nationId) { /* 征服した都市も同じ式で成長 */ }
    const g = C.growthBase + (s.policy === 'farm' ? C.growthFarm : 0) + (s.policy === 'commerce' ? C.growthCommerce : 0);
    s.population = Math.round(s.population * (1 + g + (world.rng.next() - 0.5) * 0.002));
    s.wealth = Math.round(s.wealth * (1 + C.wealthBase + (s.policy === 'commerce' ? C.wealthCommerce : 0)) + s.population * 0.002);
    s.army = Math.round(s.army * (1 + (s.policy === 'military' ? C.armyMilitary : 0)) + (s.policy === 'military' ? s.population * 0.001 : 0));
  }
  // 市場の変動（都市ごと・品ごとにゆっくり）
  const K = B.market;
  for (const c of reg.cities) for (const g of reg.goods) { const m = N.markets[c.id]; m[g.id] = Math.max(1 - K.driftRange, Math.min(1 + K.driftRange, m[g.id] + (world.rng.next() - 0.5) * K.driftStep)); }
  // 友好度: 基準へゆっくり戻る。攻撃的な国は隣国との関係が下がりやすい
  const R = B.relations;
  const base = initialRelations(reg);
  for (const a of reg.nations) for (const b of reg.nations) {
    if (a.id === b.id) continue;
    const cur = N.relations[a.id][b.id];
    let target = base[a.id][b.id] - (a.aiTraits?.aggression || 0) * 10 + (a.aiTraits?.diplomacy || 0) * 10;
    if (N.treaties[[a.id, b.id].sort().join(':')]) target += 20;
    N.relations[a.id][b.id] = Math.round((cur + (target - cur) * R.driftToBase) * 10) / 10;
  }
  // 王命
  const O = B.orders;
  for (const o of N.orders) if (o.state === 'open' && world.day > o.deadlineDay) { o.state = 'failed'; N.merit = Math.max(0, N.merit + M.orderFailed); N.favor = Math.max(0, N.favor + M.favorFailed); N.stats.ordersFailed++; world.log.push({ day: world.day, text: `王命の期限が過ぎました。王の信任 ${M.favorFailed}、功績 ${M.orderFailed}` }); }
  if (N.monthsElapsed >= O.firstAfterMonths && N.monthsElapsed - N.lastOrderMonth >= O.intervalMonths && !N.orders.some((o) => o.state === 'open')) { N.lastOrderMonth = N.monthsElapsed; spawnOrder(world, reg); }
  if (N.orders.length > 20) N.orders.splice(0, N.orders.length - 20);
  // 功績: 人口の増加
  const dp = world.population.total - N.lastPopulation;
  if (dp > 0) N.merit += dp * M.perPopulationGrowth;
  N.lastPopulation = world.population.total;
  // 郡税（郡守以上）
  if (N.commandery.length) {
    let income = 0;
    for (const id of N.commandery) income += N.cities[id].wealth * C.commanderyIncomeRate / 12;
    income = Math.round(income);
    world.money += income; world.finance.month.income['郡税'] = (world.finance.month.income['郡税'] || 0) + income;
  }
  N.merit = Math.round(N.merit * 10) / 10;
  checkPromotion(world, reg);
}

/** 昇進: 条件を満たしたら官位が上がり、郡守なら郡の都市が付く */
export function checkPromotion(world, reg) {
  const N = ensureNationState(world, reg);
  const cur = world.rank || 'magistrate';
  let next = { magistrate: 'governor', governor: 'chancellor' }[cur];
  if (!next) return false;
  // 郡守からは 相邦（文官）と 大将軍（武官）のどちらか、先に条件を満たした方へ
  if (cur === 'governor') { const g = reg.rankById.get('general').promotion || {}; if (N.merit >= (g.merit || 0) && (world.army?.victories || 0) >= (g.victories || 0)) next = 'general'; }
  const r = reg.rankById.get(next);
  const p = r?.promotion || {};
  if (p.merit && N.merit < p.merit) return false;
  if (p.population && world.population.total < p.population) return false;
  if (p.favor && N.favor < p.favor) return false;
  if (p.victories && (world.army?.victories || 0) < p.victories) return false;
  if (N.orders.some((o) => o.state === 'open' && world.day > o.deadlineDay)) return false;
  world.rank = next;
  if (next === 'governor') {
    const home = reg.cityById.get(world.cityId);
    N.commandery = reg.cities.filter((c) => c.nation === world.nationId && c.id !== world.cityId).sort((a, b) => dist(home, a) - dist(home, b)).slice(0, reg.balance.nation.cities.commanderyCount).map((c) => c.id);
  }
  N.prestige += 20;
  world.log.push({ day: world.day, text: `${r.name}に昇進しました！${next === 'governor' ? ` 郡内の ${N.commandery.map((id) => reg.cityById.get(id).name).join('・')} に方針を指示できます` : ' 国全体の外交を決められます'}` });
  refreshModifiers(world, reg);
  return true;
}

/** 昇進の条件と現状（UI 用） */
export function promotionStatus(world, reg) {
  const N = ensureNationState(world, reg);
  const cur = world.rank || 'magistrate';
  const next = { magistrate: 'governor', governor: 'chancellor' }[cur];
  if (!next) return { next: null, items: [] };
  const p = reg.rankById.get(next).promotion || {};
  const items = [];
  if (p.merit) items.push({ label: '功績', now: Math.round(N.merit), need: p.merit, ok: N.merit >= p.merit });
  if (p.population) items.push({ label: '人口', now: world.population.total, need: p.population, ok: world.population.total >= p.population });
  if (p.favor) items.push({ label: '王の信任', now: Math.round(N.favor), need: p.favor, ok: N.favor >= p.favor });
  const alt = cur === 'governor' ? reg.rankById.get('general') : null;
  const altItems = alt ? [{ label: '功績', now: Math.round(N.merit), need: alt.promotion.merit, ok: N.merit >= alt.promotion.merit }, { label: '戦勝', now: world.army?.victories || 0, need: alt.promotion.victories, ok: (world.army?.victories || 0) >= alt.promotion.victories }] : [];
  return { next, nextName: reg.rankById.get(next).name, items, alt: alt ? { name: alt.name, items: altItems } : null };
}

/** 郡内の都市に方針を指示（郡守以上） */
export function setCityPolicy(world, reg, cityId, policy) {
  const N = ensureNationState(world, reg);
  if (!N.commandery.includes(cityId)) return { ok: false, message: 'その都市は郡に含まれていません' };
  if (!POLICY_NAMES[policy]) return { ok: false, message: '不明な方針です' };
  N.cities[cityId].policy = policy;
  world.log.push({ day: world.day, text: `${reg.cityById.get(cityId).name}に「${POLICY_NAMES[policy]}」を指示しました` });
  return { ok: true };
}
export { RANK_ORDER };
