// 建設材料（木材・石材）と建設費。費用は { qian, wood, stone } の形で扱う。
// 建物（buildings.json）は cost がこの形、建築（structures.json）は cost が銭の数で、材料は materials に持つ。

export const MATERIALS = ['wood', 'stone'];
export const MATERIAL_NAMES = { wood: '木材', stone: '石材' };

export function ensureMaterials(world, reg) {
  if (!world.materials) world.materials = { wood: reg.balance.start?.materials?.wood ?? 0, stone: reg.balance.start?.materials?.stone ?? 0 };
  return world.materials;
}

/** 定義から費用を取り出す。n 倍（線状の長さなど）や割合（移動・修繕）も掛けられる */
export function costOf(def, n = 1) {
  const c = typeof def.cost === 'number' ? { qian: def.cost, ...(def.materials || {}) } : { ...(def.cost || {}) };
  return { qian: Math.round((c.qian || 0) * n), wood: Math.ceil((c.wood || 0) * n), stone: Math.ceil((c.stone || 0) * n) };
}

/** 足りないものの理由（なければ空配列） */
export function shortages(world, cost) {
  const out = [];
  if (cost.qian > 0 && world.money < cost.qian) out.push('銭が足りない');
  for (const k of MATERIALS) if (cost[k] > 0 && (world.materials?.[k] ?? 0) < cost[k]) out.push(`${MATERIAL_NAMES[k]}が足りない`);
  return out;
}
export const canAfford = (world, cost) => shortages(world, cost).length === 0;

/** 払う（建設費として記録する） */
export function pay(world, cost) {
  world.money -= cost.qian;
  if (world.finance?.month) world.finance.month.expense['建設費'] += cost.qian;
  for (const k of MATERIALS) if (cost[k]) world.materials[k] -= cost[k];
}

/** 戻す（元に戻す・撤去） */
export function refund(world, cost) {
  world.money += cost.qian || 0;
  if (world.finance?.month && cost.qian) world.finance.month.expense['建設費'] -= cost.qian;
  for (const k of MATERIALS) if (cost[k]) world.materials[k] += cost[k];
}

/** 費用を文字にする（例: 「20銭・木材4」） */
export function costText(cost) {
  const parts = [];
  if (cost.qian) parts.push(`${cost.qian.toLocaleString('ja-JP')}銭`);
  for (const k of MATERIALS) if (cost[k]) parts.push(`${MATERIAL_NAMES[k]}${cost[k]}`);
  return parts.join('・') || '無料';
}

/** 市で材料を買う（市の店が1軒以上あるとき。割高） */
export function buyMaterial(world, reg, kind, amount) {
  const M = reg.balance.materials;
  if (!MATERIALS.includes(kind)) return { ok: false, message: `不明な材料: ${kind}` };
  amount = Math.max(1, Math.floor(Number(amount) || 0));
  if (!(world.stats.marketJobs > 0)) return { ok: false, message: '市の店がないので買えません' };
  const price = Math.ceil(M.price[kind] * M.buyMarkup * amount);
  if (world.money < price) return { ok: false, message: `銭が足りません（${price}銭）` };
  world.money -= price;
  world.finance.month.expense['建設費'] += price;
  world.materials[kind] += amount;
  world.log.push({ day: world.day, text: `市で${MATERIAL_NAMES[kind]} ${amount} を ${price} 銭で買いました` });
  return { ok: true, price };
}
