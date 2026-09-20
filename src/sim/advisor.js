// 案内役（書記官）の助言ロジック。表示は ui/advisor.js。条件と文は data/advice.json にある。
// computeMetrics が世界の状態を指標にまとめ、evaluate が「いま出す助言」「やるべきことの一覧」を決める。
import { idx } from '../core/grid.js';
import { explainBuildBlockers, zoneDefAt } from './zones.js';
import { lockReason, structureName } from './structures.js';
import { formatYear } from './calendar.js';

const SAMPLE_DAYS = 90;   // 民忠などの変化を見る期間

export function ensureAdvisorState(world) {
  if (!world.advisor) world.advisor = { shown: {}, lastAnyDay: -9999, history: [], samples: [], seenUnlocks: null, tutorialStep: 0, tutorialDone: false, stepStartDay: 0, base: null, blockers: null };
  return world.advisor;
}

/** 区画は置いたが建っていないマスを数え、理由の内訳を集計（重いので間隔をあけて呼ぶ） */
export function summarizeBlockers(world, reg, limit = 60) {
  const W = world.map.w, H = world.map.h;
  let unbuilt = 0;
  const reasons = new Map(), tipsFor = new Map();
  let step = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(W, x, y);
    if (!world.zones[i] || world.buildingAt[i] !== -1) continue;
    unbuilt++;
    if (step++ % 7 !== 0 || reasons.size > 200) continue;
    if (unbuilt / 7 > limit) continue;
    const ex = explainBuildBlockers(world, reg, x, y);
    for (const r of ex.reasons) {
      const key = r.replace(/（.*$/, '');
      reasons.set(key, (reasons.get(key) || 0) + 1);
      if (!tipsFor.has(key)) tipsFor.set(key, ex.tips[0] || tipFor(key));
    }
  }
  let top = null, topN = 0;
  for (const [k, n] of reasons) if (n > topN) { top = k; topN = n; }
  return { unbuilt, reason: top, tip: top ? tipsFor.get(top) : null };
}
function tipFor(key) {
  if (key.startsWith('道路')) return '道路を区画の近くまで延ばす';
  if (key.startsWith('需要')) return '需要メーターを見て、足りない方の区画や仕事を増やす';
  if (key.startsWith('繁栄度')) return '井戸を近くに建てる・市亭の範囲に入れる・食糧を確保する';
  if (key.startsWith('銭')) return '収穫を待つか税率を上げる';
  if (key.startsWith('近くに工房')) return '資源や桑・麻の畑の近くに工房区画を置き直す';
  if (key.startsWith('市亭')) return '市亭を建て、その範囲（半径10マス）に市区画を置く';
  return '情報パネルで区画をクリックして理由を確かめる';
}

/** 世界の状態を助言用の指標にまとめる */
export function computeMetrics(world, reg, opts = {}) {
  const st = ensureAdvisorState(world);
  const hist = world.finance.history;
  const last = hist[hist.length - 1];
  const balance = last ? last.income - last.expense : 0;
  const last3 = hist.slice(-3);
  const balance3 = last3.length ? Math.round(last3.reduce((a, m) => a + m.income - m.expense, 0) / last3.length) : 0;
  const pop = world.population;
  const yearNeed = pop.total * reg.balance.economy.consumptionPerPersonPerYear;
  const grainMonths = yearNeed > 0 ? ((world.grain.civil + world.grain.granary) / yearNeed) * 12 : 99;
  const cap = world.stats.housingCapacity || 0;
  const workers = Math.round(pop.commoner * 0.8);
  let roads = 0, zones = 0, farmZones = 0;
  const W = world.map.w;
  for (let i = 0; i < world.roads.length; i++) {
    if (world.roads[i]) roads++;
    if (world.zones[i]) { zones++; const z = zoneDefAt(world, reg, i); if (z && z.category === 'farm') farmZones++; }
  }
  void W;
  let houses = 0, fields = 0, workshops = 0, markets = 0;
  for (const b of world.buildings.values()) {
    if (b.state !== 'built') continue;
    if (b.category === 'residential') houses++; else if (b.category === 'field') fields++; else if (b.category === 'workshop') workshops++; else if (b.category === 'market') markets++;
  }
  const S = { well: 0, granary: 0, market_hall: 0, wall: 0, dock: 0 };
  let structuresBuilding = 0;
  for (const s of world.structures.values()) { if (s.state !== 'built') { structuresBuilding++; continue; } if (S[s.type] !== undefined) S[s.type]++; }
  if (!st.base) st.base = { roads, zones, farmZones, wells: S.well, day: world.day };
  // 3か月前との比較
  const old = st.samples.find((s) => world.day - s.day >= SAMPLE_DAYS) || st.samples[0];
  const loyaltyDrop = old ? Math.round(old.loyalty - world.loyalty) : 0;
  const securityDrop = old ? Math.round(old.security - world.security) : 0;
  // 新しく解禁された建築
  const unlocked = reg.structures.filter((d) => !lockReason(world, reg, d) || lockReason(world, reg, d).includes('1つしか')).map((d) => d.id);
  let newUnlock = null;
  if (st.seenUnlocks === null) st.seenUnlocks = unlocked;
  else { const fresh = unlocked.filter((id) => !st.seenUnlocks.includes(id)); if (fresh.length) { newUnlock = structureName(reg, reg.structureById.get(fresh[0]), world.nationId); st.seenUnlocks = [...st.seenUnlocks, ...fresh]; } }
  // 建たない区画（5日ごとに集計）
  if (!st.blockers || world.day - st.blockers.day >= 5 || opts.forceBlockers) st.blockers = { day: world.day, ...summarizeBlockers(world, reg) };
  const monthsElapsed = Math.floor(world.day / 30);
  const fine = balance >= 0 && world.foodSufficient && world.loyalty >= 45 && world.security >= 45 && grainMonths >= 3;
  return {
    day: world.day, month: world.calendar.month, monthStart: world.calendar.day <= 1, year: formatYear(world.calendar.year), monthsElapsed,
    money: Math.round(world.money), balance: Math.round(balance), balance3, lastTribute: world.finance.lastTribute || 0,
    population: pop.total, capacity: cap, vacancyRatio: cap > 0 ? Math.max(0, (cap - pop.total) / cap) : 1,
    unemployedRatio: workers > 0 ? pop.unemployed / workers : 0, unemployedPct: workers > 0 ? Math.round((pop.unemployed / workers) * 100) : 0,
    grainMonths: Math.round(grainMonths * 10) / 10, foodSufficiency: world.foodSufficiency, foodSufficient: world.foodSufficient,
    loyalty: Math.round(world.loyalty), security: Math.round(world.security), loyaltyDrop, securityDrop,
    demandResidential: world.demand.residential, demandFarm: world.demand.farm, demandMarket: world.demand.market, demandWorkshop: world.demand.workshop,
    zonedUnbuilt: st.blockers.unbuilt, blockerReason: st.blockers.reason, blockerTip: st.blockers.tip,
    roads, zones, farmZones, houses, fields, workshops, markets, wells: S.well, granaries: S.granary, marketHalls: S.market_hall, walls: S.wall, docks: S.dock, structuresBuilding,
    roadsAdded: roads - st.base.roads, zonesAdded: zones - st.base.zones, farmZonesAdded: farmZones - st.base.farmZones, wellsAdded: S.well - st.base.wells,
    daysSinceStep: world.day - st.stepStartDay,
    newUnlock, rank: world.rank, disaster: world.disaster || null, fine,
    cityName: reg.cityById.get(world.cityId)?.name || '',
  };
}

/** 条件を評価する */
export function evalCondition(c, m) {
  if (!c) return true;
  if (c.all) return c.all.every((x) => evalCondition(x, m));
  if (c.any) return c.any.some((x) => evalCondition(x, m));
  if (c.not) return !evalCondition(c.not, m);
  const v = m[c.metric];
  if ('truthy' in c) return !!v === !!c.truthy;
  if ('lt' in c && !(v < c.lt)) return false;
  if ('lte' in c && !(v <= c.lte)) return false;
  if ('gt' in c && !(v > c.gt)) return false;
  if ('gte' in c && !(v >= c.gte)) return false;
  if ('eq' in c && v !== c.eq) return false;
  if ('ne' in c && v === c.ne) return false;
  if ('includes' in c && !(Array.isArray(v) || typeof v === 'string' ? v.includes(c.includes) : false)) return false;
  return true;
}

export function fillText(text, m) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = m[k];
    if (v === null || v === undefined) return '';
    return typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('ja-JP') : String(v)) : String(v);
  });
}

/**
 * 助言を決める。戻り値 { show: 助言 or null, todo: [...], tutorial: 進行中の案内 or null }
 * @param {object} opts { frequency: 'many'|'normal'|'few'|'off', tutorial: boolean }
 */
export function evaluate(world, reg, opts = {}) {
  const A = reg.advice;
  const st = ensureAdvisorState(world);
  const freq = A.frequency[opts.frequency || 'normal'] || A.frequency.normal;
  const m = computeMetrics(world, reg, opts);
  // 記録（3か月前との比較用）
  if (!st.samples.length || world.day - st.samples[st.samples.length - 1].day >= 10) {
    st.samples.push({ day: world.day, loyalty: world.loyalty, security: world.security, population: world.population.total });
    while (st.samples.length > 12) st.samples.shift();
  }
  const active = A.advices.filter((a) => evalCondition(a.when, m));
  const todo = active.filter((a) => a.todo).sort((a, b) => b.priority - a.priority).map((a) => ({ id: a.id, priority: a.priority, text: fillText(a.todo, m), title: fillText(a.title, m) }));
  const result = { show: null, todo, tutorial: null, metrics: m };
  // チュートリアル（初回）: 順番に進める
  if (opts.tutorial && !st.tutorialDone && A.tutorial?.length) {
    const step = A.tutorial[st.tutorialStep];
    if (!step) st.tutorialDone = true;
    else {
      const shownAt = st.shown[step.id];
      const done = step.done ? evalCondition(step.done, m) : shownAt !== undefined && world.day - shownAt >= 3;
      if (done) { st.tutorialStep++; st.stepStartDay = world.day; const next = A.tutorial[st.tutorialStep]; if (!next) st.tutorialDone = true; else result.tutorial = present(next, m, st, world, 'tutorial'); }
      else if (shownAt === undefined || world.day - shownAt >= 60) result.tutorial = present(step, m, st, world, 'tutorial');
      if (result.tutorial) return result;   // 案内中は助言を出さない（一覧は出す）
      if (!st.tutorialDone) return result;
    }
  }
  if (!freq.cooldownScale) return result;   // オフ
  const gap = world.day - st.lastAnyDay;
  const candidates = active.filter((a) => {
    const shownAt = st.shown[a.id];
    const cooldown = (a.cooldownDays ?? 60) * freq.cooldownScale;
    if (shownAt !== undefined && world.day - shownAt < cooldown) return false;
    const minGap = a.priority >= 5 ? Math.min(freq.minGapDays, 3) : freq.minGapDays;
    return gap >= minGap;
  }).sort((a, b) => b.priority - a.priority || (st.shown[a.id] ?? -1) - (st.shown[b.id] ?? -1));
  if (candidates.length) result.show = present(candidates[0], m, st, world, 'advice');
  return result;
}

function present(entry, m, st, world, kind) {
  st.shown[entry.id] = world.day;
  st.lastAnyDay = world.day;
  const out = { id: entry.id, kind, day: world.day, expression: entry.expression || 'normal', title: fillText(entry.title, m), text: fillText(entry.text, m), priority: entry.priority ?? 0 };
  st.history.push(out);
  while (st.history.length > 40) st.history.shift();
  return out;
}

/** 案内をやり直す */
export function restartTutorial(world) {
  const st = ensureAdvisorState(world);
  st.tutorialStep = 0; st.tutorialDone = false; st.stepStartDay = world.day; st.base = null;
  for (const k of Object.keys(st.shown)) if (k.startsWith('t_')) delete st.shown[k];
}
