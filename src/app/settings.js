// 表示設定。localStorage に保存。品質は 高/中/低 の3段階。
export const QUALITIES = {
  high:   { name: '高', segments: 4, shadows: true,  shadowMap: 2048, shadowRadius: 45, pixelRatio: 2,   treeLod: [70, 140], buildingLod: 150, ripple: 1 },
  medium: { name: '中', segments: 2, shadows: true,  shadowMap: 1024, shadowRadius: 40, pixelRatio: 1.5, treeLod: [50, 100], buildingLod: 110, ripple: 1 },
  low:    { name: '低', segments: 1, shadows: false, shadowMap: 512,  shadowRadius: 30, pixelRatio: 1,   treeLod: [30, 60],  buildingLod: 80,  ripple: 0.5 },
};
const KEY = 'sengoku-city.settings';

export function loadSettings() {
  let s = { quality: 'high' };
  try { const raw = localStorage.getItem(KEY); if (raw) s = { ...s, ...JSON.parse(raw) }; } catch { /* 保存なし */ }
  if (!QUALITIES[s.quality]) s.quality = 'high';
  return s;
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 保存できない環境 */ } }
export const qualityOf = (s) => QUALITIES[s.quality];
