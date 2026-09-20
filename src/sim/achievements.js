// 実績: 月初に条件を評価し、達成したものを world.achievements に記録する。
import { evalCondition } from './advisor.js';
import { ensureNationState } from './nation/state.js';

const RANKS = ['magistrate', 'governor', 'chancellor', 'general'];

export function achievementMetrics(world, reg) {
  const N = ensureNationState(world, reg);
  const capitals = reg.nations.map((n) => (N.capitals?.[n.id]) || n.capital);
  const unified = capitals.every((c) => N.cities[c].nation === world.nationId);
  const conquered = reg.cities.filter((c) => c.nation !== world.nationId && N.cities[c.id].nation === world.nationId).length;
  return {
    population: world.population.total, money: world.money, rankIndex: Math.min(2, RANKS.indexOf(world.rank || 'magistrate')),
    victories: world.army?.victories || 0, conquered, techsLeft: reg.techs.filter((t) => !world.techs.includes(t.id)).length,
    caravansSent: N.stats.caravansSent || 0, hiredCount: N.stats.hiredTotal || world.persons?.hired.length || 0,
    yearsWithoutDisaster: Math.floor((world.day - (world.events?.lastDisasterDay || 0)) / 360), insideCount: world.services.insideCount || 0, unified,
  };
}

export function tickAchievementsMonthly(world, reg) {
  if (!world.achievements) world.achievements = {};
  const m = achievementMetrics(world, reg);
  const gained = [];
  for (const a of reg.achievements) {
    if (a.id in world.achievements) continue;   // 0日目の達成もあるので in で判定
    if (evalCondition(a.condition, m)) { world.achievements[a.id] = world.day; gained.push(a); world.log.push({ day: world.day, text: `実績「${a.name}」を達成しました` }); }
  }
  return { gained, unified: m.unified };
}

/** 終了判定: 天下統一 / 自国の首都陥落 */
export function checkEnding(world, reg) {
  const N = ensureNationState(world, reg);
  if (world.ending) return world.ending;
  const m = achievementMetrics(world, reg);
  if (m.unified) { world.ending = { kind: 'unified', day: world.day }; world.log.push({ day: world.day, text: `${reg.nationById.get(world.nationId).name}が天下を統一しました！` }); return world.ending; }
  const cap = (N.capitals?.[world.nationId]) || reg.nationById.get(world.nationId).capital;
  if (N.cities[cap].nation !== world.nationId && cap !== world.cityId) { world.ending = { kind: 'defeat', day: world.day }; world.log.push({ day: world.day, text: `${reg.nationById.get(world.nationId).name}の首都が落ちました` }); return world.ending; }
  return null;
}
