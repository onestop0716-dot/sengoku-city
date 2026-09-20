// 戦闘の判定（純ロジック、決定的）。ラウンド制で戦力比に応じて損耗し、4割を失った側が敗走する。
// 戦力 = 兵数 × 兵種係数 × (0.5 + 練度/100) × 装備 × 将軍 × 陣形 × 士気 × 技術。攻城では守備側に城壁などの防御係数。

/** 側の戦力（攻撃/防御）を計算する */
export function sideStrength(side, reg, mode, opts = {}) {
  const B = reg.military.balance;
  const form = reg.formationById.get(side.formation) || { attack: 1, defense: 1 };
  const mods = side.mods || {};
  let total = 0;
  for (const [id, n] of Object.entries(side.units || {})) {
    if (!n) continue;
    const u = reg.unitById.get(id);
    if (!u) continue;
    let k = mode === 'attack' ? u.attack : u.defense;
    if (id === 'crossbow') k *= (form.ranged || 1) * (1 + (mods.ranged || 0));
    if (id === 'cavalry') k *= (form.cavalry || 1) * (1 + (mods.cavalry || 0));
    if (id === 'infantry') k *= 1 + (mods.infantry || 0);
    total += n * k;
  }
  total *= 0.5 + (side.training || 0) / 100;
  total *= side.equipment || 1;
  total *= 1 + ((side.general?.lead || 0) + (side.general?.valor || 0)) / 400;   // 統率・武勇 80/80 で +40%
  total *= mode === 'attack' ? form.attack : form.defense;
  total *= 0.6 + (side.morale ?? 60) / 100 * 0.6 * (1 + (mods.morale || 0));
  total *= side.supply ?? 1;
  total *= 1 + (mods.all || 0);
  if (opts.fortification) total *= 1 + opts.fortification;
  return total;
}

/**
 * 戦闘を解決する。
 * @param {{attacker:object, defender:object, kind:'field'|'siege'|'defense', fortification?:number, siegeBonus?:number, rng:()=>number}} p
 * @returns {{ winner:'attacker'|'defender', rounds:Array, casualties:{attacker:number, defender:number}, attackerLeft:object, defenderLeft:object }}
 */
export function resolveBattle({ attacker, defender, kind = 'field', fortification = 0, siegeBonus = 0, rng = () => 0.5 }, reg) {
  const B = reg.military.balance;
  const a = { ...attacker, units: { ...attacker.units } }, d = { ...defender, units: { ...defender.units } };
  const count = (s) => Object.values(s.units).reduce((x, y) => x + y, 0);
  const a0 = count(a), d0 = count(d);
  const fort = kind === 'field' ? 0 : Math.max(0, fortification * (1 - siegeBonus));
  const rounds = [];
  let winner = null;
  for (let r = 0; r < B.rounds; r++) {
    const sa = sideStrength(a, reg, 'attack') * (0.9 + rng() * 0.2);
    const sd = sideStrength(d, reg, 'defense', { fortification: fort }) * (0.9 + rng() * 0.2);
    // 損耗: 相手の戦力に比例（自軍の頭数で割る）
    const lossA = Math.min(0.5, (sd / Math.max(1, sa + sd)) * B.casualtyScale * 2);
    const lossD = Math.min(0.5, (sa / Math.max(1, sa + sd)) * B.casualtyScale * 2 / (1 + fort * 0.5));
    for (const id of Object.keys(a.units)) a.units[id] = Math.max(0, Math.round(a.units[id] * (1 - lossA)));
    for (const id of Object.keys(d.units)) d.units[id] = Math.max(0, Math.round(d.units[id] * (1 - lossD)));
    rounds.push({ round: r + 1, attackerStrength: Math.round(sa), defenderStrength: Math.round(sd), attackerLeft: count(a), defenderLeft: count(d) });
    if (count(a) <= a0 * (1 - B.routLossRatio) || count(a) === 0) { winner = 'defender'; break; }
    if (count(d) <= d0 * (1 - B.routLossRatio) || count(d) === 0) { winner = 'attacker'; break; }
  }
  if (!winner) winner = count(a) / Math.max(1, a0) >= count(d) / Math.max(1, d0) ? 'attacker' : 'defender';
  return { winner, rounds, casualties: { attacker: a0 - count(a), defender: d0 - count(d) }, attackerLeft: a.units, defenderLeft: d.units, kind };
}
