// 人材: 登用・任命・忠誠・老衰・死去・来客。人物の史実データは data/persons.json。
// 状態は world.persons = { hired: [{id, loyalty, since, salary}], visitors: [{id, until}], gone: [id] }、任命は world.offices = { officeId: personId|null }。
import { refreshModifiers } from './modifiers.js';

export const STAT_KEYS = ['lead', 'valor', 'wit', 'politics', 'charm'];
export const STAT_NAMES = { lead: '統率', valor: '武勇', wit: '知略', politics: '政治', charm: '魅力' };
export const ROLE_NAMES = { patron: '後ろ盾', minister: '文官', general: '武将', scholar: '学者', engineer: '技師', strategist: '軍師', envoy: '弁士', warrior: '剣客', artist: '楽人' };

export function ensurePersonsState(world, reg) {
  if (!world.persons) world.persons = { hired: [], visitors: [], gone: [] };
  if (!world.offices) world.offices = Object.fromEntries(reg.offices.map((o) => [o.id, null]));
  for (const o of reg.offices) if (!(o.id in world.offices)) world.offices[o.id] = null;
  return world.persons;
}

export const isAlive = (p, year) => p.appears <= year && (p.died === null || p.died === undefined || p.died > year);
export const ageOf = (p, year) => (p.born === null || p.born === undefined ? null : year - p.born);

/** 年齢による衰えを反映した能力（60歳を超えると年1%ずつ、最低70%） */
export function effectiveStats(world, reg, p) {
  const age = ageOf(p, world.calendar.year);
  const k = age !== null && age > 60 ? Math.max(0.7, 1 - (age - 60) * 0.01) : 1;
  const out = {};
  for (const s of STAT_KEYS) out[s] = Math.round(p.stats[s] * k);
  return out;
}
export const avgStat = (st) => STAT_KEYS.reduce((a, k) => a + st[k], 0) / STAT_KEYS.length;

/** 要求する俸禄（銭/月）と礼金 */
export function demandOf(world, reg, p, { visitor = false } = {}) {
  const B = reg.balance.persons || {};
  const salary = Math.round((B.salaryBase ?? 5) + avgStat(effectiveStats(world, reg, p)) * (B.salaryPerStat ?? 0.3));
  const gift = Math.round(salary * (B.giftMonths ?? 6) * (visitor ? (B.visitorGiftFactor ?? 1.5) : 1));
  return { salary, gift };
}

export const isHired = (world, id) => !!world.persons?.hired.some((h) => h.id === id);

/** 登用できる人物の一覧（自国の存命者 + 客館の来客） */
export function listCandidates(world, reg) {
  const st = ensurePersonsState(world, reg);
  const year = world.calendar.year;
  const out = [];
  for (const p of reg.persons) {
    if (p.nation !== world.nationId || p.recruitable === false || !isAlive(p, year) || isHired(world, p.id) || st.gone.includes(p.id)) continue;
    out.push({ person: p, visitor: false, ...demandOf(world, reg, p) });
  }
  for (const v of st.visitors) {
    const p = reg.personById.get(v.id);
    if (!p || isHired(world, p.id)) continue;
    out.push({ person: p, visitor: true, until: v.until, ...demandOf(world, reg, p, { visitor: true }) });
  }
  return out;
}

/** 自国の後ろ盾（登用対象外の大物）。存命なら人材画面に示す */
export function listPatrons(world, reg) {
  return reg.persons.filter((p) => p.nation === world.nationId && p.recruitable === false && isAlive(p, world.calendar.year));
}

export function recruit(world, reg, personId) {
  const st = ensurePersonsState(world, reg);
  const cand = listCandidates(world, reg).find((c) => c.person.id === personId);
  if (!cand) return { ok: false, message: 'いまは登用できない人物です' };
  if (world.money < cand.gift) return { ok: false, message: `礼金 ${cand.gift} 銭が足りません` };
  world.money -= cand.gift;
  world.finance.month.expense['俸禄'] += cand.gift;
  const p = cand.person;
  st.hired.push({ id: p.id, loyalty: p.loyaltyBase ?? 60, since: world.day, salary: cand.salary });
  st.visitors = st.visitors.filter((v) => v.id !== p.id);
  world.log.push({ day: world.day, text: `${p.name}を登用しました（俸禄 ${cand.salary} 銭/月）` });
  return { ok: true };
}

export function dismiss(world, reg, personId) {
  const st = ensurePersonsState(world, reg);
  const h = st.hired.find((x) => x.id === personId);
  if (!h) return { ok: false, message: '配下にいません' };
  for (const k of Object.keys(world.offices)) if (world.offices[k] === personId) world.offices[k] = null;
  st.hired = st.hired.filter((x) => x.id !== personId);
  world.log.push({ day: world.day, text: `${reg.personById.get(personId)?.name}を解任しました` });
  refreshModifiers(world, reg);
  return { ok: true };
}

/** 任命枠（官位 + 技術） */
export function officeSlots(world, reg) {
  const r = reg.rankById.get(world.rank || 'magistrate');
  return (r?.officeSlots || 3) + (world.mods?.officeSlots || 0);
}
export function usedSlots(world) { return Object.values(world.offices || {}).filter(Boolean).length; }

export function appoint(world, reg, officeId, personId) {
  ensurePersonsState(world, reg);
  const o = reg.officeById.get(officeId);
  if (!o) return { ok: false, message: '不明な官職です' };
  if (personId === null) { world.offices[officeId] = null; refreshModifiers(world, reg); return { ok: true }; }
  if (!isHired(world, personId)) return { ok: false, message: '配下にいない人物は任命できません' };
  const RANKS = reg.ranks.map((r) => r.id);
  if (o.minRank && RANKS.indexOf(world.rank || 'magistrate') < RANKS.indexOf(o.minRank)) return { ok: false, message: `官位「${reg.rankById.get(o.minRank)?.name}」で任命できます` };
  for (const k of Object.keys(world.offices)) if (world.offices[k] === personId) world.offices[k] = null;   // 兼任はしない
  if (!world.offices[officeId] && usedSlots(world) >= officeSlots(world, reg)) return { ok: false, message: `任命枠（${officeSlots(world, reg)}）がいっぱいです` };
  world.offices[officeId] = personId;
  world.log.push({ day: world.day, text: `${reg.personById.get(personId).name}を${o.name}に任命しました` });
  refreshModifiers(world, reg);
  return { ok: true };
}

/** 月次: 俸禄、忠誠、去る者。戻り値は俸禄の合計 */
export function tickPersonsMonthly(world, reg) {
  const st = ensurePersonsState(world, reg);
  const B = reg.balance.persons || {};
  let salary = 0;
  const hasAcademy = Array.from(world.structures.values()).some((s) => s.state === 'built' && s.type === 'academy');
  for (const h of st.hired.slice()) {
    const p = reg.personById.get(h.id);
    if (!p) continue;
    const office = Object.keys(world.offices).find((k) => world.offices[k] === h.id);
    salary += h.salary + (office ? reg.officeById.get(office)?.salary || 0 : 0);
    const target = (p.loyaltyBase ?? 60) + (office ? (B.loyaltyOffice ?? 20) : -(B.loyaltyIdle ?? 5)) + (hasAcademy ? 5 : 0) + (world.money < 0 ? -(B.loyaltyDeficit ?? 30) : 0) + (world.loyalty - 50) * 0.1;
    h.loyalty = Math.max(0, Math.min(100, h.loyalty + (Math.max(0, Math.min(100, target)) - h.loyalty) * (B.loyaltySmoothing ?? 0.2)));
    if (h.loyalty < (B.leaveBelow ?? 25) && world.day - h.since > 90) {
      dismissQuiet(world, reg, h.id);
      world.log.push({ day: world.day, text: `${p.name}が県を去りました（忠誠が下がっていました）` });
    }
  }
  // 来客の滞在期限
  for (const v of st.visitors.slice()) if (world.day >= v.until) { st.visitors = st.visitors.filter((x) => x !== v); world.log.push({ day: world.day, text: `${reg.personById.get(v.id)?.name}が客館を去りました` }); }
  // 客館への来客: 他国の学者・技師・軍師が滞在する
  const visitorChance = academyVisitorChance(world, reg);
  if (visitorChance > 0 && world.rng.next() < visitorChance) {
    const year = world.calendar.year;
    const pool = reg.persons.filter((p) => p.nation !== world.nationId && p.recruitable !== false && ['scholar', 'engineer', 'strategist', 'envoy'].includes(p.role) && isAlive(p, year) && !isHired(world, p.id) && !st.gone.includes(p.id) && !st.visitors.some((v) => v.id === p.id));
    if (pool.length) {
      const p = pool[Math.floor(world.rng.next() * pool.length)];
      st.visitors.push({ id: p.id, until: world.day + (B.visitorStayDays ?? 360) });
      world.log.push({ day: world.day, text: `${reg.nationById.get(p.nation)?.name}の${p.name}が客館に滞在しています（登用できます）` });
    }
  }
  return salary;
}
function dismissQuiet(world, reg, personId) {
  for (const k of Object.keys(world.offices)) if (world.offices[k] === personId) world.offices[k] = null;
  world.persons.hired = world.persons.hired.filter((x) => x.id !== personId);
  refreshModifiers(world, reg);
}
export function academyVisitorChance(world, reg) {
  let v = 0;
  for (const s of world.structures.values()) if (s.state === 'built') for (const e of reg.structureById.get(s.type).effects) if (e.type === 'visitor') v += e.value;
  if (v === 0) return 0;
  return Math.min(0.9, v + (world.mods?.visitor || 0));
}

/** 年初: 没年に達した人物は死去する（史実） */
export function tickPersonsYearly(world, reg) {
  const st = ensurePersonsState(world, reg);
  const year = world.calendar.year;
  for (const h of st.hired.slice()) {
    const p = reg.personById.get(h.id);
    if (p && p.died !== null && p.died !== undefined && year >= p.died) {
      dismissQuiet(world, reg, h.id);
      st.gone.push(h.id);
      world.log.push({ day: world.day, text: `${p.name}が没しました（${formatYearJp(p.died)}）` });
    }
  }
  for (const v of st.visitors.slice()) { const p = reg.personById.get(v.id); if (p && p.died !== null && year >= p.died) st.visitors = st.visitors.filter((x) => x !== v); }
}
const formatYearJp = (y) => (y < 0 ? `前${-y}年` : `${y}年`);
