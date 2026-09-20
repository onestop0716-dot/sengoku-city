// data/*.json をまとめて引けるようにする。sim/render/ui は生の JSON ではなく registry を使う。
import { validateData } from './validate.js';

export const DATA_FILES = ['nations', 'cities', 'terrain', 'zones', 'buildings', 'crops', 'assets', 'balance', 'terms', 'structures', 'difficulties', 'advice', 'persons', 'offices', 'ranks', 'techs', 'goods'];

/** 深いマージ（難易度の上書き用） */
export function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof base?.[k] === 'object' ? deepMerge(base[k], v) : v;
  return out;
}

const byId = (arr) => { const m = new Map(); for (const e of arr) m.set(e.id, e); return m; };

/** @param {object} raw 各ファイルの内容 */
export function createRegistry(raw, { difficulty = 'normal' } = {}) {
  const { errors, warnings } = validateData(raw);
  const diff = (raw.difficulties || []).find((d) => d.id === difficulty) || (raw.difficulties || []).find((d) => d.id === 'normal');
  const balance = diff ? deepMerge(raw.balance, diff.overrides || {}) : raw.balance;
  if (errors.length) throw new Error('データ検証エラー:\n' + errors.join('\n'));
  const tiles = raw.terrain.tiles;
  const tileIndex = new Map(tiles.map((t, i) => [t.id, i]));
  const zoneIndex = new Map(raw.zones.map((z, i) => [z.id, i]));
  return {
    warnings,
    nations: raw.nations, nationById: byId(raw.nations),
    cities: raw.cities, cityById: byId(raw.cities),
    tiles, tileById: byId(tiles), tileIndex,
    resources: raw.terrain.resources, resourceById: byId(raw.terrain.resources),
    zones: raw.zones, zoneById: byId(raw.zones), zoneIndex,
    buildings: raw.buildings, buildingById: byId(raw.buildings),
    structures: raw.structures, structureById: byId(raw.structures),
    crops: raw.crops, cropById: byId(raw.crops),
    assets: raw.assets, assetById: byId(raw.assets),
    terms: raw.terms, termById: byId(raw.terms),
    balance, difficulty: diff ? diff.id : 'normal', difficulties: raw.difficulties || [],
    advice: raw.advice,
    persons: raw.persons, personById: byId(raw.persons),
    offices: raw.offices, officeById: byId(raw.offices),
    ranks: raw.ranks, rankById: byId(raw.ranks),
    techs: raw.techs, techById: byId(raw.techs),
    goods: raw.goods, goodsById: byId(raw.goods),
  };
}

/** ブラウザ用: fetch で読み込む */
export async function loadDataBrowser(baseUrl = './data/') {
  const raw = {};
  await Promise.all(DATA_FILES.map(async (f) => {
    const res = await fetch(`${baseUrl}${f}.json`);
    if (!res.ok) throw new Error(`${f}.json の読み込みに失敗 (${res.status})`);
    raw[f] = await res.json();
  }));
  return raw;
}

/** Node 用: fs で読み込む（テスト・検証スクリプト） */
export async function loadDataNode(dir) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const raw = {};
  for (const f of DATA_FILES) raw[f] = JSON.parse(await fs.readFile(path.join(dir, `${f}.json`), 'utf8'));
  return raw;
}
