// 畑の季節段階（表示専用）。播種月〜収穫月の間で 芽 → 成長 → 実り、収穫の翌月以降は刈り取り後、播種前は裸地。
// 年をまたぐ作物（冬麦: 9月播種・5月収穫）にも対応する。
export function cropStage(crop, month) {
  if (!crop) return 'ripe';
  const sow = crop.sowMonth ?? 3, harvest = crop.harvestMonth ?? 8;
  const span = ((harvest - sow) % 12 + 12) % 12;                   // 播種から収穫までの月数
  const since = ((month - sow) % 12 + 12) % 12;                    // 播種からの経過月
  if (crop.perennial || crop.id === 'mulberry') return month >= sow && month <= harvest + 3 ? 'ripe' : since <= span ? 'growing' : 'sprout';
  if (since > span) return since - span <= 2 ? 'stubble' : 'bare';   // 収穫後2か月は刈り株、その後は裸地
  const f = span > 0 ? since / span : 1;
  return f < 0.3 ? 'sprout' : f < 0.8 ? 'growing' : 'ripe';
}
