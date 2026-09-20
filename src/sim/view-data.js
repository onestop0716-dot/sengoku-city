// 表示モード（データマップ）の値を計算する純ロジック。描画は render/view-mode.js、UI は ui/view-mode-panel.js。
// ゲームの状態は読むだけで書き換えない。値は 0（悪い）〜1（良い）に正規化し、flags にマスの補助情報を持つ。
import { idx, inBounds } from '../core/grid.js';
import { computeProsperity, zoneDefAt, hasWater } from './zones.js';
import { fieldYield } from './farming.js';
import { structureName } from './structures.js';
import { ensureRoadDist } from './roads.js';

export const FLAG = { UNBUILT: 1, BELOW_THRESHOLD: 2, PREVIEW: 4, WATER_TILE: 8, NONE: 16 };   // NONE: 値がない（灰色で描く）。BELOW_THRESHOLD は点線（基準未満・道路なし）

/** 区画モードのマス種別。ZONE_BASE 以上は区画（index + ZONE_BASE） */
export const ZONE_KIND = { NONE: 0, ROAD: 1, STRUCTURE: 2, WATER: 3, UNBUILDABLE: 4, SHORE: 5, ZONE_BASE: 10 };
export const ZONE_KIND_COLORS = { [ZONE_KIND.ROAD]: '#4a4034', [ZONE_KIND.STRUCTURE]: '#e8e0d0', [ZONE_KIND.WATER]: '#3a78b8', [ZONE_KIND.UNBUILDABLE]: '#5a5550', [ZONE_KIND.SHORE]: '#8fa8b8' };
export const ZONE_KIND_NAMES = { [ZONE_KIND.ROAD]: '道路', [ZONE_KIND.STRUCTURE]: '特殊建築', [ZONE_KIND.WATER]: '水面', [ZONE_KIND.UNBUILDABLE]: '建てられない地形（山）', [ZONE_KIND.SHORE]: '岸辺（区画不可）' };

/** 悪い=赤 → 普通=黄 → 良い=緑 */
export function gradientColor(v) {
  v = Math.max(0, Math.min(1, v));
  const r = v < 0.5 ? 220 : Math.round(220 - (v - 0.5) * 2 * 160), g = v < 0.5 ? Math.round(60 + v * 2 * 150) : 210, b = 50;
  return [r, g, b];
}

/** 区画モード: kind（マス種別）と未建築フラグ、区画ごとの集計 */
export function computeZoneMap(world, reg) {
  const { w, h } = world.map;
  const n = w * h;
  const kind = new Uint8Array(n), flags = new Uint8Array(n);
  const stats = reg.zones.map((z) => ({ id: z.id, name: z.name, color: z.color, tiles: 0, built: 0, noRoad: 0 }));
  const shore = reg.balance.zoning?.shoreDistance ?? 1;
  ensureRoadDist(world, reg);
  for (let i = 0; i < n; i++) {
    const t = reg.tiles[world.map.tile[i]];
    if (world.zones[i]) {
      const zi = world.zones[i] - 1;
      kind[i] = ZONE_KIND.ZONE_BASE + zi;
      stats[zi].tiles++;
      if (world.buildingAt[i] !== -1) stats[zi].built++; else flags[i] |= FLAG.UNBUILT;
      // 道路が届かない区画（家が建たない）: 点線で示す
      if (world.roadDist[i] > reg.zones[zi].roadDistance) { flags[i] |= FLAG.BELOW_THRESHOLD; stats[zi].noRoad++; }
    } else if (world.roads[i]) kind[i] = ZONE_KIND.ROAD;
    else if (world.structAt && world.structAt[i] !== -1) kind[i] = ZONE_KIND.STRUCTURE;
    else if (t.water) { kind[i] = ZONE_KIND.WATER; flags[i] |= FLAG.WATER_TILE; }
    else if (!t.buildable && !t.farmable) kind[i] = ZONE_KIND.UNBUILDABLE;
    else if (world.map.waterDist[i] <= shore) kind[i] = ZONE_KIND.SHORE;
  }
  return { kind, flags, stats: stats.filter((s) => s.tiles > 0) };
}

/** 治安の施設効果（半径つき）をマスごとに足す */
function securityField(world, reg) {
  const { w, h } = world.map;
  const f = new Float32Array(w * h);
  for (const s of world.structures.values()) {
    if (s.state !== 'built') continue;
    for (const e of reg.structureById.get(s.type).effects) {
      if (e.type !== 'security' || !e.radius) continue;
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      for (let y = Math.max(0, Math.floor(cy - e.radius)); y <= Math.min(h - 1, Math.ceil(cy + e.radius)); y++) for (let x = Math.max(0, Math.floor(cx - e.radius)); x <= Math.min(w - 1, Math.ceil(cx + e.radius)); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= e.radius) f[idx(w, x, y)] += e.value;
    }
  }
  return f;
}

const zoneOrDefault = (world, reg, i) => zoneDefAt(world, reg, i) || reg.zoneById.get('res_commoner');
const fmt = (n) => (n > 0 ? '+' : '') + Math.round(n);

/**
 * 状態モードの定義。compute は { values, flags, raw } を返す。describe はホバー時の内訳。
 * structures は強調する建築の効果種別。effects はこの効果を持つ建築を選んだとき自動でこのモードに切り替える。
 */
export const STATE_MODES = {
  road: {
    name: '道路', legend: ['道路が遠い', '', '道路のそば'], effects: [],
    compute(world, reg) {
      const n = world.map.w * world.map.h, values = new Float32Array(n), flags = new Uint8Array(n);
      ensureRoadDist(world, reg);
      const maxD = reg.balance.road?.maxRoadDistance ?? 4;
      for (let i = 0; i < n; i++) {
        if (reg.tiles[world.map.tile[i]].water) { flags[i] |= FLAG.WATER_TILE; continue; }
        const rd = world.roadDist[i];
        values[i] = rd >= 0xffff ? 0 : Math.max(0, 1 - rd / (maxD + 1));
        const zd = zoneDefAt(world, reg, i);
        if (zd && rd > zd.roadDistance) flags[i] |= FLAG.BELOW_THRESHOLD;   // 区画はあるが道路が届かない
      }
      return { values, flags };
    },
    describe(world, reg, i) {
      ensureRoadDist(world, reg);
      const rd = world.roadDist[i], zd = zoneDefAt(world, reg, i);
      if (world.roads[i]) return { value: '道路', parts: [] };
      const far = rd >= 0xffff;
      return { value: far ? '道路が届いていない' : `道路まで ${rd} マス`, parts: zd ? [['区画', zd.name], ['必要な近さ', `${zd.roadDistance} マス以内`], ['判定', rd > zd.roadDistance ? '道路が遠くて建たない' : '建てられる']] : [['区画', 'なし']] };
    },
  },
  water: {
    name: '水', legend: ['水なし', '川の近く', '井戸・水路の範囲'], effects: ['water'],
    compute(world, reg) {
      const n = world.map.w * world.map.h, values = new Float32Array(n), flags = new Uint8Array(n);
      const range = reg.balance.prosperity.water.range;
      for (let i = 0; i < n; i++) {
        const t = reg.tiles[world.map.tile[i]];
        if (t.water) { flags[i] |= FLAG.WATER_TILE; values[i] = 1; continue; }
        values[i] = world.services.water?.[i] ? 1 : world.map.waterDist[i] <= range ? 0.75 : 0;
      }
      return { values, flags };
    },
    describe(world, reg, i) {
      const P = reg.balance.prosperity.water;
      if (reg.tiles[world.map.tile[i]].water) return { value: '水面', parts: [] };
      const served = !!world.services.water?.[i], near = world.map.waterDist[i] <= P.range;
      return { value: served ? `井戸・水路の範囲内（繁栄度 ${fmt(P.bonus)}）` : near ? `川の近く（繁栄度 ${fmt(P.bonus)}）` : `水なし（繁栄度 ${fmt(P.penalty)}）`, parts: [['川や湖まで', world.map.waterDist[i] >= 0xffff ? '遠い' : `${world.map.waterDist[i]} マス`], ['井戸・水路', served ? '範囲内' : '範囲外']] };
    },
  },
  security: {
    name: '治安', legend: ['悪い', '普通', '良い'], effects: ['security'],
    compute(world, reg) {
      const n = world.map.w * world.map.h, values = new Float32Array(n), flags = new Uint8Array(n);
      const f = securityField(world, reg);
      for (let i = 0; i < n; i++) { if (reg.tiles[world.map.tile[i]].water) { flags[i] |= FLAG.WATER_TILE; continue; } values[i] = Math.max(0, Math.min(1, (world.security + f[i]) / 100)); }
      return { values, flags, raw: f };
    },
    describe(world, reg, i, data) {
      const f = data?.raw ? data.raw[i] : 0;
      return { value: `治安 ${Math.round(world.security + f)}`, parts: [['都市全体', Math.round(world.security)], ['施設の効果', fmt(f)], ['城壁の内側', world.services.insideWall?.[i] ? 'はい' : 'いいえ']] };
    },
  },
  prosperity: {
    name: '繁栄度', legend: ['低い', '基準（建つ）', '高い'], effects: [],
    compute(world, reg) {
      const { w, h } = world.map, n = w * h, values = new Float32Array(n), flags = new Uint8Array(n), raw = new Float32Array(n);
      const thr = reg.balance.growth.buildThreshold;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = idx(w, x, y);
        const t = reg.tiles[world.map.tile[i]];
        if (t.water || (!t.buildable && !t.farmable)) { flags[i] |= t.water ? FLAG.WATER_TILE : FLAG.NONE; continue; }
        const zd = zoneDefAt(world, reg, i);
        const bid = world.buildingAt[i];
        const b = bid !== -1 ? world.buildings.get(bid) : null;
        const p = computeProsperity(world, reg, b ? b.x : x, b ? b.y : y, zd || reg.zoneById.get('res_commoner'), b);
        raw[i] = p.total;
        values[i] = p.total / 100;
        if (zd && !b && p.total < thr) flags[i] |= FLAG.BELOW_THRESHOLD;
      }
      return { values, flags, raw };
    },
    describe(world, reg, i, data) {
      const w = world.map.w, x = i % w, y = (i / w) | 0;
      const t = reg.tiles[world.map.tile[i]];
      if (t.water || (!t.buildable && !t.farmable)) return { value: '対象外', parts: [] };
      const zd = zoneDefAt(world, reg, i);
      const bid = world.buildingAt[i]; const b = bid !== -1 ? world.buildings.get(bid) : null;
      const p = computeProsperity(world, reg, b ? b.x : x, b ? b.y : y, zd || reg.zoneById.get('res_commoner'), b);
      const thr = reg.balance.growth.buildThreshold;
      return { value: `繁栄度 ${p.total}${zd ? '' : '（住居を置いた場合の見込み）'}${p.total < thr ? ` — 基準 ${thr} 未満` : ''}`, parts: Object.entries(p.parts).filter(([, v]) => v !== 0).map(([k, v]) => [k, fmt(v)]) };
    },
  },
  market: {
    name: '市への近さ', legend: ['遠い', '', '近い'], effects: ['market_admin'],
    compute(world, reg) {
      const n = world.map.w * world.map.h, values = new Float32Array(n), flags = new Uint8Array(n);
      const md = world.services.marketDist, R = reg.balance.prosperity.market.rangeFarm;
      for (let i = 0; i < n; i++) { if (reg.tiles[world.map.tile[i]].water) { flags[i] |= FLAG.WATER_TILE; continue; } const d = md ? md[i] : 0xffff; values[i] = d >= 0xffff ? 0 : Math.max(0, 1 - d / (R + 5)); }
      return { values, flags };
    },
    describe(world, reg, i) {
      const P = reg.balance.prosperity.market;
      const d = world.services.marketDist ? world.services.marketDist[i] : 0xffff;
      return { value: d >= 0xffff ? '市が届いていない' : `市まで ${d} マス`, parts: [['住居の加点', d <= P.rangeResidential ? `${fmt(P.bonusResidential)}（${P.rangeResidential} マス以内）` : `なし（${P.rangeResidential} マス以内で ${fmt(P.bonusResidential)}）`], ['農地の加点', d <= P.rangeFarm ? `${fmt(P.bonusFarm)}（${P.rangeFarm} マス以内）` : `なし（${P.rangeFarm} マス以内で ${fmt(P.bonusFarm)}）`], ['市亭の範囲', world.services.marketAdmin?.[i] ? '内' : '外']] };
    },
  },
  food: {
    name: '食糧', legend: ['不足・低収量', '', '十分・高収量'], effects: ['granary_capacity', 'irrigation', 'famine_mitigation'],
    compute(world, reg) {
      const n = world.map.w * world.map.h, values = new Float32Array(n), flags = new Uint8Array(n), raw = new Float32Array(n);
      const suff = Math.max(0, Math.min(1, (world.foodSufficiency - 0.5) * 2));
      for (let i = 0; i < n; i++) {
        if (reg.tiles[world.map.tile[i]].water) { flags[i] |= FLAG.WATER_TILE; continue; }
        const bid = world.buildingAt[i]; const b = bid !== -1 ? world.buildings.get(bid) : null;
        if (b && b.category === 'field' && b.state === 'built') { const y = fieldYield(world, reg, b); raw[i] = y.grain; values[i] = Math.max(0, Math.min(1, y.grain / 60)); }
        else values[i] = suff * 0.6 + 0.2 * suff;   // 畑以外は都市全体の充足度
      }
      return { values, flags, raw };
    },
    describe(world, reg, i, data) {
      const bid = world.buildingAt[i]; const b = bid !== -1 ? world.buildings.get(bid) : null;
      const parts = [['食糧充足率', `${Math.round(world.foodSufficiency * 100)}%`], ['蓄え', `${Math.round(world.grain.civil + world.grain.granary).toLocaleString('ja-JP')} 石`]];
      if (b && b.category === 'field' && b.state === 'built') { const y = fieldYield(world, reg, b); return { value: `この畑の収量 約 ${Math.round(y.grain)} 石/年`, parts: [['肥沃度', `${Math.round(world.map.fertility[i] * 100)}`], ['灌漑', world.services.irrigation?.[i] ? 'あり' : 'なし'], ...parts] }; }
      return { value: world.foodSufficient ? '食糧は足りている' : '食糧が不足', parts };
    },
  },
  fertility: {
    name: '肥沃度', legend: ['やせている', '', '肥沃'], effects: [],
    compute(world, reg) {
      const n = world.map.w * world.map.h, values = new Float32Array(n), flags = new Uint8Array(n);
      for (let i = 0; i < n; i++) { const t = reg.tiles[world.map.tile[i]]; if (t.water) { flags[i] |= FLAG.WATER_TILE; continue; } if (!t.farmable) { flags[i] |= FLAG.NONE; continue; } values[i] = world.map.fertility[i]; }
      return { values, flags };
    },
    describe(world, reg, i) {
      const t = reg.tiles[world.map.tile[i]];
      if (t.water) return { value: '水面', parts: [] };
      if (!t.farmable) return { value: '耕せない', parts: [] };
      return { value: `肥沃度 ${Math.round(world.map.fertility[i] * 100)}`, parts: [['地形', t.name], ['川や湖まで', world.map.waterDist[i] >= 0xffff ? '遠い' : `${world.map.waterDist[i]} マス`], ['灌漑', world.services.irrigation?.[i] ? 'あり（収量+）' : 'なし']] };
    },
  },
  loyalty: {
    name: '民忠', legend: ['低い', '普通', '高い'], effects: ['loyalty'],
    compute(world, reg) {
      const n = world.map.w * world.map.h, values = new Float32Array(n), flags = new Uint8Array(n);
      const v = Math.max(0, Math.min(1, world.loyalty / 100));
      for (let i = 0; i < n; i++) { if (reg.tiles[world.map.tile[i]].water) { flags[i] |= FLAG.WATER_TILE; continue; } values[i] = v; }
      return { values, flags };
    },
    describe(world, reg) {
      const P = reg.balance.population.loyalty;
      return { value: `民忠 ${Math.round(world.loyalty)}（都市全体）`, parts: [['基本', P.base], ['口賦（人頭税）', fmt(-world.policy.taxHead * P.headTax)], ['田租', fmt(-world.policy.taxLand * P.landTax)], ['食糧', world.foodSufficient ? fmt(P.foodOk) : fmt(-P.foodShort)], ['施設', fmt(world.services.loyaltyBonus || 0)], ['失業', `${Math.round(world.population.unemployed)} 人`]] };
    },
  },
  environment: {
    name: '周辺環境', legend: ['悪い（工房が隣）', '普通', '良い'], effects: [],
    compute(world, reg) {
      const { w, h } = world.map, n = w * h, values = new Float32Array(n), flags = new Uint8Array(n), raw = new Float32Array(n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = idx(w, x, y);
        const t = reg.tiles[world.map.tile[i]];
        if (t.water || (!t.buildable && !t.farmable)) { flags[i] |= t.water ? FLAG.WATER_TILE : FLAG.NONE; continue; }
        const bid = world.buildingAt[i]; const b = bid !== -1 ? world.buildings.get(bid) : null;
        const env = computeProsperity(world, reg, b ? b.x : x, b ? b.y : y, zoneOrDefault(world, reg, i), b).parts['周辺'] || 0;
        raw[i] = env; values[i] = Math.max(0, Math.min(1, 0.5 + env / 20));
      }
      return { values, flags, raw };
    },
    describe(world, reg, i, data) {
      const env = data?.raw ? data.raw[i] : 0;
      const zd = zoneOrDefault(world, reg, i), adj = zd.prosperity || {};
      const parts = [];
      const w = world.map.w, x = i % w, y = (i / w) | 0;
      const seen = new Set();
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
        if ((xx === x && yy === y) || !inBounds(w, world.map.h, xx, yy)) continue;
        const bid = world.buildingAt[idx(w, xx, yy)]; if (bid === -1) continue;
        const b = world.buildings.get(bid); if (!b || seen.has(b.category)) continue; seen.add(b.category);
        const v = b.category === 'workshop' ? adj.adjWorkshop : b.category === 'field' || b.category === 'farm_house' ? adj.adjFarm : b.buildingType === 'house_noble' ? adj.adjNoble : 0;
        if (v) parts.push([reg.buildingById.get(b.buildingType)?.name || b.category, fmt(v)]);
      }
      return { value: `周辺環境 ${fmt(env)}（${zd.name} として）`, parts };
    },
  },
};
export const STATE_MODE_IDS = Object.keys(STATE_MODES);

/** 効果種別 → 自動で重ねる状態モード */
export function modeForEffects(effects) {
  for (const id of STATE_MODE_IDS) if (effects.some((e) => STATE_MODES[id].effects.includes(e.type))) return id;
  return null;
}

/** そのモードに関係する建築（強調表示用）: { x, y, w, h, radius, name } */
export function relatedStructures(world, reg, modeId) {
  const m = STATE_MODES[modeId];
  if (!m) return [];
  const out = [];
  for (const s of world.structures.values()) {
    if (s.state !== 'built') continue;
    const def = reg.structureById.get(s.type);
    const e = def.effects.find((e) => m.effects.includes(e.type));
    if (!e) continue;
    out.push({ x: s.x, y: s.y, w: s.w, h: s.h, radius: e.radius || (e.type === 'irrigation' ? 1.5 : 0), name: structureName(reg, def, world.nationId) });
  }
  if (modeId === 'market') for (const b of world.buildings.values()) if (b.category === 'market' && b.state === 'built') out.push({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 0, name: '市' });
  return out;
}

/** 建築を置いたときの改善見込み: 範囲内で改善するマス（プレビュー）と説明 */
export function previewImprovement(world, reg, def, tx, ty, modeId) {
  const { w, h } = world.map;
  const tiles = [];
  let text = '';
  for (const e of def.effects) {
    if (!e.radius) continue;
    if (!STATE_MODES[modeId]?.effects.includes(e.type)) continue;
    const cx = tx + def.size[0] / 2, cy = ty + def.size[1] / 2;
    let improved = 0, total = 0;
    for (let y = Math.max(0, Math.floor(cy - e.radius)); y <= Math.min(h - 1, Math.ceil(cy + e.radius)); y++) for (let x = Math.max(0, Math.floor(cx - e.radius)); x <= Math.min(w - 1, Math.ceil(cx + e.radius)); x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > e.radius) continue;
      const i = idx(w, x, y);
      if (reg.tiles[world.map.tile[i]].water) continue;
      total++;
      if (e.type === 'water') { if (!hasWater(world, reg, i)) { improved++; tiles.push(i); } }
      else { improved++; tiles.push(i); }
    }
    if (e.type === 'water') text = `範囲 ${total} マスのうち ${improved} マスが新たに水を得る（繁栄度 ${fmt(reg.balance.prosperity.water.bonus - reg.balance.prosperity.water.penalty)}）`;
    else if (e.type === 'security') text = `範囲 ${total} マスの治安 ${fmt(e.value)}`;
    else if (e.type === 'market_admin') text = `範囲 ${total} マスで市を開けるようになる`;
    else text = `範囲 ${total} マス`;
  }
  return { tiles, text };
}

/** 問題のある場所（その指標がいちばん低い、区画または建物のあるマス）。案内役の「表示モードで確認」用 */
export function worstTile(world, reg, modeId, data) {
  const { w, h } = world.map;
  if (modeId === 'zones') {   // 区画モード: 未建築の区画がいちばん多い所
    const zm = computeZoneMap(world, reg);
    let best = null, bestN = -1;
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { let c = 0; for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) { const xx = x + k, yy = y + j; if (inBounds(w, h, xx, yy) && zm.flags[idx(w, xx, yy)] & FLAG.UNBUILT) c++; } if (c > bestN) { bestN = c; best = [x + 4, y + 4]; } }
    return best;
  }
  const m = STATE_MODES[modeId];
  if (!m) return null;
  const d = data || m.compute(world, reg);
  let best = null, bestV = Infinity, sum = 0, cnt = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = idx(w, x, y);
    if (!world.zones[i] && world.buildingAt[i] === -1) continue;
    if (d.flags[i] & (FLAG.WATER_TILE | FLAG.NONE)) continue;
    cnt++; sum += x; 
    if (d.values[i] < bestV) { bestV = d.values[i]; best = [x, y]; }
  }
  if (!best) return [w >> 1, h >> 1];
  void sum; void cnt;
  return best;
}
