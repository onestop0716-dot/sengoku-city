// 外交: 贈物で友好度を上げる。郡守は不可侵、相邦は同盟を提案できる。
import { ensureNationState } from './state.js';

export function sendGift(world, reg, nationId, amount) {
  const N = ensureNationState(world, reg), R = reg.balance.nation.relations;
  if (nationId === world.nationId || !reg.nationById.get(nationId)) return { ok: false, message: '相手の国が正しくありません' };
  amount = Math.floor(Number(amount) || 0);
  if (amount <= 0) return { ok: false, message: '贈物の額を入れてください' };
  if (world.money < amount) return { ok: false, message: '銭が足りません' };
  world.money -= amount; world.finance.month.expense['維持費'] += amount;
  const gain = Math.min(R.giftMax, amount / R.giftPerPoint * (1 + (world.mods?.diplomacy || 0)));
  N.relations[world.nationId][nationId] = Math.round(Math.min(100, N.relations[world.nationId][nationId] + gain) * 10) / 10;
  N.relations[nationId][world.nationId] = Math.round(Math.min(100, N.relations[nationId][world.nationId] + gain * 0.8) * 10) / 10;
  world.log.push({ day: world.day, text: `${reg.nationById.get(nationId).name}に ${amount} 銭を贈りました。友好度 +${gain.toFixed(1)}` });
  return { ok: true, gain };
}

/** 提案: 不可侵（郡守以上、友好度 30 以上）/ 同盟（相邦、友好度 60 以上） */
export function propose(world, reg, nationId, kind) {
  const N = ensureNationState(world, reg), R = reg.balance.nation.relations;
  const RANKS = ['magistrate', 'governor', 'chancellor', 'general'];
  const rank = RANKS.indexOf(world.rank || 'magistrate');
  if (kind === 'non_aggression' && rank < 1) return { ok: false, message: '不可侵の提案は郡守から' };
  if (kind === 'alliance' && rank < 2) return { ok: false, message: '同盟の提案は相邦から' };
  const key = [world.nationId, nationId].sort().join(':');
  const rel = N.relations[nationId][world.nationId];
  const need = kind === 'alliance' ? R.allianceMin : R.nonAggressionMin;
  if (rel < need) return { ok: false, message: `友好度 ${need} 以上が必要です（いま ${Math.round(rel)}）` };
  N.treaties[key] = kind;
  world.log.push({ day: world.day, text: `${reg.nationById.get(nationId).name}と${kind === 'alliance' ? '同盟' : '不可侵'}を結びました` });
  N.prestige += 5;
  return { ok: true };
}
