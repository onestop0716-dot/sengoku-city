import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashString, hash2 } from '../src/core/rng.js';
import { distanceMap, lPath, normRect } from '../src/core/grid.js';

test('同じシードなら同じ乱数列', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const c = createRng(43);
  assert.notEqual(a.next(), c.next());
});

test('乱数は 0 以上 1 未満、int は範囲内', () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) { const v = r.next(); assert.ok(v >= 0 && v < 1); const n = r.int(3, 5); assert.ok(n >= 3 && n <= 5); }
});

test('hashString / hash2 は決定的', () => {
  assert.equal(hashString('咸陽'), hashString('咸陽'));
  assert.equal(hash2(3, 4, 9), hash2(3, 4, 9));
  assert.notEqual(hash2(3, 4, 9), hash2(4, 3, 9));
});

test('distanceMap は格子距離を返す', () => {
  const d = distanceMap(5, 5, (i) => i === 12, 10);
  assert.equal(d[12], 0); assert.equal(d[13], 1); assert.equal(d[0], 4); assert.equal(d[24], 4);
  const limited = distanceMap(5, 5, (i) => i === 12, 1);
  assert.equal(limited[0], 0xffff);
});

test('lPath は横→縦の順に進む', () => {
  const p = lPath(0, 0, 2, 1);
  assert.deepEqual(p, [[0, 0], [1, 0], [2, 0], [2, 1]]);
  assert.deepEqual(normRect(3, 3, 1, 1), { x0: 1, y0: 1, x1: 3, y1: 3 });
});
