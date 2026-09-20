// 技術・制度の研究。data/techs.json。状態は world.research = { current: id|null, progress: 日数相当 }、完成は world.techs。
import { refreshModifiers } from './modifiers.js';
import { effectiveStats } from './persons.js';

export function ensureResearchState(world) {
  if (!world.research) world.research = { current: null, progress: 0 };
  if (!world.techs) world.techs = [];
  return world.research;
}

export const hasTech = (world, id) => (world.techs || []).includes(id);

/** 研究できるか（前提と未完成） */
export function canResearch(world, reg, id) {
  const t = reg.techById.get(id);
  if (!t) return { ok: false, message: '不明な技術です' };
  if (hasTech(world, id)) return { ok: false, message: 'すでに完成しています' };
  const missing = (t.requires || []).filter((r) => !hasTech(world, r));
  if (missing.length) return { ok: false, message: `先に「${missing.map((r) => reg.techById.get(r)?.name).join('」「')}」が必要です` };
  return { ok: true };
}

/** 研究速度（1日あたりの進み）。客館・国の得意分野・配下の知略・技術で速くなる */
export function researchSpeed(world, reg, techId) {
  const t = reg.techById.get(techId);
  let speed = 1;
  for (const s of world.structures.values()) if (s.state === 'built') for (const e of reg.structureById.get(s.type).effects) if (e.type === 'research') speed += e.value;
  const nation = reg.nationById.get(world.nationId);
  const bonus = nation?.techBonus || {};
  let nb = 1;
  if (t) { if (bonus[t.field]) nb = Math.max(nb, bonus[t.field]); for (const tag of t.tags || []) if (bonus[tag]) nb = Math.max(nb, bonus[tag]); }
  let wit = 0;
  for (const h of world.persons?.hired || []) { const p = reg.personById.get(h.id); if (p) wit = Math.max(wit, effectiveStats(world, reg, p).wit); }
  speed += wit / 400;
  speed *= nb * (world.mods?.researchSpeed || 1);
  return speed;
}

export function startResearch(world, reg, id) {
  const r = ensureResearchState(world);
  const c = canResearch(world, reg, id);
  if (!c.ok) return c;
  if (r.current === id) return { ok: false, message: '研究中です' };
  r.current = id; r.progress = 0;
  world.log.push({ day: world.day, text: `「${reg.techById.get(id).name}」の研究を始めました` });
  return { ok: true };
}
export function cancelResearch(world) {
  const r = ensureResearchState(world);
  r.current = null; r.progress = 0;
  return { ok: true };
}

/** 毎日 */
export function tickResearchDaily(world, reg) {
  const r = ensureResearchState(world);
  if (!r.current) return;
  const t = reg.techById.get(r.current);
  if (!t) { r.current = null; return; }
  r.progress += researchSpeed(world, reg, r.current);
  if (r.progress >= t.days) completeTech(world, reg, t.id);
}
/** 月次: 研究費 */
export function researchCostMonthly(world, reg) {
  const r = ensureResearchState(world);
  if (!r.current) return 0;
  return reg.techById.get(r.current)?.cost || 0;
}
export function completeTech(world, reg, id) {
  ensureResearchState(world);
  if (!world.techs.includes(id)) world.techs.push(id);
  if (world.research.current === id) { world.research.current = null; world.research.progress = 0; }
  const t = reg.techById.get(id);
  if (world.nation) world.nation.merit += reg.balance.nation?.merit.perTech || 0;
  world.log.push({ day: world.day, text: `「${t?.name}」が完成しました${t?.unlocks?.length ? `。${t.unlocks.map((u) => reg.structureById.get(u)?.name).join('・')}が建てられます` : ''}` });
  refreshModifiers(world, reg);
  world.dirty.buildings = true;
}

/** 効果の説明文（UI 用） */
export function effectSummary(e) {
  const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  switch (e.type) {
    case 'farm_yield': return `農地の収量 ${pct(e.value)}`;
    case 'crop_yield': return `${{ rice: '稲', millet: '粟', wheat: '麦', bean: '菽', broomcorn: '黍', hemp: '麻', mulberry: '桑' }[e.crop] || e.crop}の収量 ${pct(e.value)}`;
    case 'irrigation_bonus': return `灌漑の効果 ${pct(e.value)}`;
    case 'workshop_output': return `${e.goods ? { bronze: '青銅', lacquer: '漆器', salt: '塩', iron: '鉄', pottery: '陶器', silk: '絹', vehicle: '車', weapon: '武器' }[e.goods] || e.goods : '工房'}の生産 ${pct(e.value)}`;
    case 'market_tax': return `市租 ${pct(e.value)}`;
    case 'tax_income': return `税収 ${pct(e.value)}`;
    case 'security': return `治安 ${e.value > 0 ? '+' : ''}${e.value}`;
    case 'loyalty': return `民忠 ${e.value > 0 ? '+' : ''}${e.value}`;
    case 'build_speed': return `建設の速さ ${pct(e.value)}`;
    case 'research_speed': return `研究の速さ ${pct(e.value)}`;
    case 'market_range': return `市の届く範囲 +${e.value} マス`;
    case 'office_slots': return `任命枠 +${e.value}`;
    case 'visitor': return `来客の確率 ${pct(e.value)}`;
    case 'trade': return `交易 ${pct(e.value)}（フェーズ5）`;
    case 'military': return `軍（${{ cavalry: '騎兵', infantry: '歩兵', ranged: '弩', siege: '攻城', morale: '士気', equipment: '装備' }[e.branch] || '全体'}） ${pct(e.value)}（フェーズ6）`;
    case 'diplomacy': return `外交 ${pct(e.value)}（フェーズ5）`;
    case 'conscription': return `徴兵 ${pct(e.value)}（フェーズ6）`;
    default: return e.type;
  }
}
