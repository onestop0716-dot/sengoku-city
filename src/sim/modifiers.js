// 技術と官職の効果を1つの「補正」にまとめる。経済・農業・人口・建設・研究はこれを読む。
// 月初とコマンドの後に refreshModifiers で作り直す（world.mods）。
import { effectiveStats } from './persons.js';

export function defaultModifiers() {
  return { farmYield: 1, cropYield: {}, irrigationBonus: 0, workshopOutput: 1, workshopGoods: {}, marketTax: 1, taxIncome: 1, security: 0, loyalty: 0, buildSpeed: 1, researchSpeed: 1, marketRange: 0, officeSlots: 0, visitor: 0, trade: 0, military: {}, diplomacy: 0, conscription: 0, sources: [] };
}

function applyEffect(m, e, value, source) {
  switch (e.type) {
    case 'farm_yield': m.farmYield += value; break;
    case 'crop_yield': m.cropYield[e.crop] = (m.cropYield[e.crop] || 0) + value; break;
    case 'irrigation_bonus': m.irrigationBonus += value; break;
    case 'workshop_output': if (e.goods) m.workshopGoods[e.goods] = (m.workshopGoods[e.goods] || 0) + value; else m.workshopOutput += value; break;
    case 'market_tax': m.marketTax += value; break;
    case 'tax_income': m.taxIncome += value; break;
    case 'security': m.security += value; break;
    case 'loyalty': m.loyalty += value; break;
    case 'build_speed': m.buildSpeed += value; break;
    case 'research_speed': m.researchSpeed += value; break;
    case 'market_range': m.marketRange += value; break;
    case 'office_slots': m.officeSlots += value; break;
    case 'visitor': m.visitor += value; break;
    case 'trade': m.trade += value; break;
    case 'military': { const k = e.branch || 'all'; m.military[k] = (m.military[k] || 0) + value; break; }
    case 'diplomacy': m.diplomacy += value; break;
    case 'conscription': m.conscription += value; break;
    default: return;
  }
  m.sources.push({ type: e.type, value, source });
}

/** 技術（world.techs）と官職（world.offices）から補正を計算する */
export function computeModifiers(world, reg) {
  const m = defaultModifiers();
  for (const id of world.techs || []) {
    const t = reg.techById.get(id);
    if (!t) continue;
    for (const e of t.effects || []) applyEffect(m, e, e.value, t.name);
  }
  for (const [officeId, personId] of Object.entries(world.offices || {})) {
    if (!personId) continue;
    const o = reg.officeById.get(officeId), p = reg.personById.get(personId);
    if (!o || !p) continue;
    const st = effectiveStats(world, reg, p);
    const stat = o.mainStats.reduce((a, k) => a + (st[k] || 0), 0) / o.mainStats.length;
    for (const e of o.effects || []) applyEffect(m, e, (e.perStat || 0) * stat, `${o.name} ${p.name}`);
  }
  return m;
}

export function refreshModifiers(world, reg) {
  world.mods = computeModifiers(world, reg);
  return world.mods;
}

export const modsOf = (world) => world.mods || defaultModifiers();
