import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataNode } from '../src/data/registry.js';
import { validateData } from '../src/data/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('data/*.json は検証を通る（エラー0）', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  const { errors, warnings } = validateData(raw);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('検証は壊れた参照を検出する', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  raw.zones = [{ ...raw.zones[0], buildings: [{ id: 'nope' }] }];
  const { errors } = validateData(raw);
  assert.ok(errors.some((e) => e.includes('nope')));
});

test('検証は禁止語を警告する', async () => {
  const raw = await loadDataNode(path.join(root, 'data'));
  raw.terms = [...raw.terms, { id: 'bad', term: '紙', desc: 'x' }];
  const { warnings } = validateData(raw);
  assert.ok(warnings.some((w) => w.includes('紙')));
});
