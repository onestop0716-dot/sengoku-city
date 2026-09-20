// 暦: 1年=12か月、1か月=30日（簡略）。季節は 春1-3 / 夏4-6 / 秋7-9 / 冬10-12。
// 史実の暦（秦の顓頊暦は10月始まり）は簡略化している（02_時代考証メモ参照）。

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const SEASONS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

export function createCalendar(startYear = -247) {
  return { year: startYear, month: 1, day: 1 };
}

export function seasonOf(month) {
  if (month <= 3) return 'spring';
  if (month <= 6) return 'summer';
  if (month <= 9) return 'autumn';
  return 'winter';
}

/** 1日進める。戻り値は月替わり・年替わりのフラグ */
export function advanceDay(cal) {
  const flags = { newMonth: false, newYear: false };
  cal.day++;
  if (cal.day > DAYS_PER_MONTH) {
    cal.day = 1; cal.month++; flags.newMonth = true;
    if (cal.month > MONTHS_PER_YEAR) {
      cal.month = 1; flags.newYear = true;
      cal.year++;
      if (cal.year === 0) cal.year = 1; // 紀元0年は存在しない
    }
  }
  return flags;
}

export function formatYear(year) {
  return year < 0 ? `前${-year}年` : `${year}年`;
}

export function formatDate(cal) {
  return `${formatYear(cal.year)} ${cal.month}月${cal.day}日（${SEASONS[seasonOf(cal.month)]}）`;
}
