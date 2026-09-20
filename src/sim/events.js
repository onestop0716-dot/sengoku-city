// イベント: 災害・社会・来訪・政治・史実。月初に発火判定し、選択肢のあるものは world.events.pending に入れて UI が resolveEvent で選ぶ。
// 発火中はゲームを一時停止する（UI 側）。状態: world.events = { pending, history, fired(史実の発火済み), lastDisasterDay, farmPenalty, taxCut }
import { evalCondition, computeMetrics } from './advisor.js';
import { seasonOf } from './calendar.js';
import { ensureNationState } from './nation/state.js';
import { isAlive, isHired } from './persons.js';

export function ensureEventsState(world) {
  if (!world.events) world.events = { pending: null, history: [], fired: [], lastDisasterDay: 0, farmPenalty: 0, farmPenaltyUntil: 0, taxCut: 0, count: 0 };
  return world.events;
}

function hasStructure(world, type) { return Array.from(world.structures.values()).some((s) => s.state === 'built' && s.type === type); }
function hasRiver(world, reg) { for (let i = 0; i < world.map.tile.length; i += 7) if (reg.tiles[world.map.tile[i]].id === 'river') return true; return false; }

/** 軽減係数（備え） */
export function mitigationOf(world, reg, ev) {
  let f = 1; const notes = [];
  for (const m of ev.mitigation || []) if (hasStructure(world, m.structure)) { f *= m.factor; notes.push(m.text); }
  return { factor: f, notes };
}

export function applyEffect(world, reg, e, factor = 1) {
  const N = ensureNationState(world, reg), st = ensureEventsState(world);
  const scale = (v) => (v < 0 ? v * factor : v);
  switch (e.type) {
    case 'money': world.money += e.value; if (e.value < 0) world.finance.month.expense['維持費'] += -e.value; break;
    case 'money_ratio': { const d = Math.round(Math.max(0, world.money) * scale(e.value)); world.money += d; break; }
    case 'grain': { let v = e.value; if (v < 0) { const g = Math.min(world.grain.granary, -v); world.grain.granary -= g; world.grain.civil = Math.max(0, world.grain.civil + v + g); } else world.grain.civil += v; break; }
    case 'grain_ratio': world.grain.civil = Math.max(0, Math.round(world.grain.civil * (1 + scale(e.value)))); break;
    case 'loyalty': world.loyalty = Math.max(0, Math.min(100, world.loyalty + scale(e.value))); break;
    case 'security': world.security = Math.max(0, Math.min(100, world.security + scale(e.value))); break;
    case 'hygiene': world.hygiene = Math.max(0, Math.min(100, (world.hygiene ?? 70) + scale(e.value))); break;
    case 'population_ratio': { const d = Math.round(world.population.total * scale(e.value)); world.population.total = Math.max(0, world.population.total + d); world.population.commoner = Math.max(0, world.population.commoner + d); break; }
    case 'destroy_buildings': {
      const built = Array.from(world.buildings.values()).filter((b) => b.state === 'built');
      const pool = e.near === 'river' ? built.filter((b) => world.map.waterDist[b.y * world.map.w + b.x] <= 3) : built;
      const n = Math.round(pool.length * e.ratio * factor);
      for (let i = 0; i < n && pool.length; i++) { const b = pool.splice(Math.floor(world.rng.next() * pool.length), 1)[0]; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) world.buildingAt[yy * world.map.w + xx] = -1; world.buildings.delete(b.id); }
      world.dirty.buildings = true; world.servicesDirty = true;
      return n;
    }
    case 'farm_penalty': { st.farmPenalty = Math.max(0, st.farmPenalty + e.value * (e.value > 0 ? factor : 1)); st.farmPenaltyUntil = world.day + (e.months || 3) * 30; break; }
    case 'soldiers': { const a = world.army; if (a) { let left = -e.value; for (const id of ['infantry', 'crossbow', 'cavalry', 'chariot']) { const k = Math.min(a.units[id] || 0, left); a.units[id] -= k; left -= k; } } break; }
    case 'merit': N.merit += e.value; break;
    case 'favor': N.favor = Math.max(0, Math.min(100, N.favor + e.value)); break;
    case 'favor_by_loyalty': N.favor = Math.max(0, Math.min(100, N.favor + Math.round((world.loyalty - 50) / 5))); break;
    case 'prestige': N.prestige += e.value; break;
    case 'tax_cut': for (const k of ['taxLand', 'taxHead']) world.policy[k] = Math.max(0, Math.round((world.policy[k] - e.value) * 100) / 100); break;
    case 'research_progress': if (world.research?.current) world.research.progress += e.value; break;
    case 'visitor': {
      const pool = reg.persons.filter((p) => p.nation !== world.nationId && p.recruitable !== false && ['scholar', 'strategist', 'engineer', 'envoy'].includes(p.role) && isAlive(p, world.calendar.year) && !isHired(world, p.id) && !world.persons.visitors.some((v) => v.id === p.id));
      if (pool.length) { const p = pool[Math.floor(world.rng.next() * pool.length)]; world.persons.visitors.push({ id: p.id, until: world.day + 360 }); world.log.push({ day: world.day, text: `${p.name}が客館に滞在しています（登用できます）` }); }
      break;
    }
    case 'relation': for (const b of e.b) { N.relations[e.a][b] = Math.max(-100, N.relations[e.a][b] + e.value); N.relations[b][e.a] = Math.max(-100, N.relations[b][e.a] + e.value); } break;
    case 'move_capital': N.capitals = N.capitals || {}; N.capitals[e.nation] = e.city; break;
    default: break;
  }
  return 0;
}

/** 発生させる（自動効果を適用し、選択肢があれば保留にする） */
export function fireEvent(world, reg, ev) {
  const st = ensureEventsState(world);
  const mit = mitigationOf(world, reg, ev);
  const results = [];
  for (const e of ev.effects || []) { const n = applyEffect(world, reg, e, mit.factor); if (e.type === 'destroy_buildings' && n) results.push(`建物 ${n} 棟が失われた`); }
  if (ev.kind === 'disaster') st.lastDisasterDay = world.day;
  if (ev.kind === 'historical') st.fired.push(ev.id);
  st.count++;
  const rec = { id: ev.id, name: ev.name, kind: ev.kind, day: world.day, text: ev.text, notes: [...mit.notes, ...results], choice: null };
  st.history.push(rec); if (st.history.length > 30) st.history.shift();
  world.log.push({ day: world.day, text: `${ev.kind === 'historical' ? '【史実】' : '【出来事】'}${ev.name}: ${ev.text}${rec.notes.length ? `（${rec.notes.join('、')}）` : ''}` });
  if (ev.choices?.length) st.pending = { id: ev.id, rec };
  return rec;
}

/** 選択肢が選べるか */
export function choiceAvailable(world, ch) {
  const r = ch.requires || {};
  if (r.money && world.money < r.money) return false;
  if (r.grain && world.grain.civil + world.grain.granary < r.grain) return false;
  if (r.soldiers && Object.values(world.army?.units || {}).reduce((a, b) => a + b, 0) < r.soldiers) return false;
  return true;
}

export function resolveEvent(world, reg, choiceIndex) {
  const st = ensureEventsState(world);
  if (!st.pending) return { ok: false, message: '保留中の出来事はありません' };
  const ev = reg.eventById.get(st.pending.id);
  const ch = ev?.choices?.[choiceIndex];
  if (!ch) return { ok: false, message: '不明な選択肢です' };
  if (!choiceAvailable(world, ch)) return { ok: false, message: 'その選択には条件が足りません' };
  for (const e of ch.effects || []) applyEffect(world, reg, e, 1);
  st.pending.rec.choice = ch.text;
  world.log.push({ day: world.day, text: `${ev.name}: 「${ch.text}」を選びました` });
  st.pending = null;
  return { ok: true };
}

/** 月初: 発火判定（史実は年で、その他は確率で。同時に1つまで） */
export function tickEventsMonthly(world, reg) {
  const st = ensureEventsState(world);
  if (world.day > st.farmPenaltyUntil) st.farmPenalty = 0;
  if (st.pending) return null;
  const year = world.calendar.year, month = world.calendar.month, season = seasonOf(month);
  // 史実（該当する年の最初の月、または国が一致）
  for (const ev of reg.events) {
    if (ev.kind !== 'historical' || st.fired.includes(ev.id)) continue;
    if (ev.year !== year || (ev.nation && ev.nation !== world.nationId)) continue;
    if (month < 3) continue;   // 年初の上納などと重ならないよう 3 月以降
    return fireEvent(world, reg, ev);
  }
  const months = Math.floor(world.day / 30);
  const m = computeMetrics(world, reg);
  const scale = (reg.balance.events?.chanceScale ?? 1);
  const disasterRate = reg.balance.disasterRate ?? 1;
  const river = hasRiver(world, reg);
  const candidates = reg.events.filter((ev) => {
    if (ev.kind === 'historical') return false;
    const t = ev.trigger || {};
    if (t.minMonths && months < t.minMonths) return false;
    if (t.seasons && !t.seasons.includes(season)) return false;
    if (t.months && !t.months.includes(month)) return false;
    if (t.requiresRiver && !river) return false;
    if (t.conditions && !evalCondition(t.conditions, m)) return false;
    return true;
  });
  for (const ev of candidates) {
    const p = (ev.trigger.baseChance || 0) * scale * (ev.kind === 'disaster' ? disasterRate : 1);
    if (world.rng.next() < p) return fireEvent(world, reg, ev);
  }
  return null;
}
