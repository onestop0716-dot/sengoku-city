// 表示設定。localStorage に保存。品質は 高/中/低 の3段階。
export const QUALITIES = {
  high:   { name: '高', segments: 4, shadows: true,  shadowMap: 2048, shadowRadius: 45, pixelRatio: 2,   treeLod: [70, 140], buildingLod: 150, ripple: 1, nearCap: 2500, treeNearCap: 1500, maxAgents: 300, maxVehicles: 60, peopleNear: 90 },
  medium: { name: '中', segments: 2, shadows: true,  shadowMap: 1024, shadowRadius: 40, pixelRatio: 1.5, treeLod: [50, 100], buildingLod: 110, ripple: 1, nearCap: 1200, treeNearCap: 900, maxAgents: 150, maxVehicles: 30, peopleNear: 60 },
  low:    { name: '低', segments: 1, shadows: false, shadowMap: 512,  shadowRadius: 30, pixelRatio: 1,   treeLod: [30, 60],  buildingLod: 80,  ripple: 0.5, nearCap: 500, treeNearCap: 400, maxAgents: 60, maxVehicles: 12, peopleNear: 30 },
};
const KEY = 'sengoku-city.settings';

export function loadSettings() {
  let s = { quality: 'high', advisor: 'normal' };
  try { const raw = localStorage.getItem(KEY); if (raw) s = { ...s, ...JSON.parse(raw) }; } catch { /* 保存なし */ }
  if (!QUALITIES[s.quality]) s.quality = 'high';
  if (!['many', 'normal', 'few', 'off'].includes(s.advisor)) s.advisor = 'normal';
  return s;
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 保存できない環境 */ } }
/** マップの大きさに応じて地形の分割数を抑える（頂点数の上限 ≈ 60万） */
export function qualityFor(s, mapSize) {
  const q = { ...QUALITIES[s.quality] };
  const maxSeg = Math.max(1, Math.floor(Math.sqrt(600000) / mapSize));
  q.segments = Math.min(q.segments, maxSeg);
  const k = mapSize / 96;
  q.treeLod = q.treeLod.map((d) => Math.round(d * Math.sqrt(k)));
  q.buildingLod = Math.round(q.buildingLod * Math.sqrt(k));
  return q;
}
export const qualityOf = (s) => QUALITIES[s.quality];
