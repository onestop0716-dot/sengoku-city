import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar, advanceDay, formatDate, seasonOf } from '../src/sim/calendar.js';

test('暦は 30日×12か月で進み、紀元0年を飛ばす', () => {
  const cal = createCalendar(-1);
  let years = 0, months = 0;
  for (let i = 0; i < 360; i++) { const f = advanceDay(cal); if (f.newMonth) months++; if (f.newYear) years++; }
  assert.equal(months, 12); assert.equal(years, 1);
  assert.equal(cal.year, 1);
  assert.equal(formatDate(createCalendar(-247)), '前247年 1月1日（春）');
  assert.equal(seasonOf(8), 'autumn'); assert.equal(seasonOf(12), 'winter');
});
