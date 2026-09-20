// 左ドラッグ/1本指ドラッグでツールを適用する（区画・道路・撤去・建築）。
// タッチ端末（設定「操作の確認」）では、ドラッグ後に範囲と費用を表示して「決定」「取消」で確定する。「元に戻す」で直前の操作を戻す。
// タップ=選択、長押し=詳細（表示モードの内訳、通常は情報パネル）。2本指の操作はカメラに譲る。
import { normRect, rectTiles, lPath } from '../core/grid.js';
import { applyCommand } from '../sim/commands.js';
import { canPlaceStructure, structureName } from '../sim/structures.js';

const COLORS = { road: 0xd9c27a, demolish: 0xff5544, zone: 0x66ff88, select: 0xffffff, ok: 0x66ff88, ng: 0xff5544, radius: 0x88ccff };

export function createInput({ canvas, picker, overlay, radiusOverlay, world, reg, toolbar, infoPanel, log, orbit, viewMode = null, viewPanel = null, settings = null, onPending = null }) {
  let dragStart = null, hover = null, pending = null, consumed = false, downInfo = null;
  const history = [];   // 元に戻す用（最大 5 件）
  const structDef = () => (toolbar.current.startsWith('struct:') ? reg.structureById.get(toolbar.current.slice(7)) : null);
  const confirmMode = () => !!settings?.confirmActions;
  orbit.setToolActive?.(() => toolbar.current !== 'select');

  /** 建築の足跡と効果範囲のプレビュー */
  const previewStructure = (def, t) => {
    const w = def.size[0], h = def.size[1];
    const tiles = [];
    for (let y = t.y; y < t.y + h; y++) for (let x = t.x; x < t.x + w; x++) tiles.push([x, y]);
    const reason = canPlaceStructure(world, reg, def, t.x, t.y);
    overlay.setTiles(tiles, reason ? COLORS.ng : COLORS.ok);
    const radius = Math.max(0, ...def.effects.map((e) => e.radius || 0));
    if (radius > 0 && radiusOverlay) {
      const cx = t.x + w / 2, cy = t.y + h / 2, r = [];
      for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius && x >= 0 && y >= 0 && x < world.map.w && y < world.map.h) r.push([x, y]);
      radiusOverlay.setTiles(r, COLORS.radius);
    } else radiusOverlay?.clear();
    return reason;
  };
  const previewTiles = (a, b) => {
    const tool = toolbar.current;
    if (tool === 'road') return lPath(a.x, a.y, b.x, b.y);
    return Array.from(rectTiles(normRect(a.x, a.y, b.x, b.y)));
  };
  const colorFor = () => { const t = toolbar.current; return t.startsWith('zone:') ? COLORS.zone : t.startsWith('struct:') ? COLORS.ok : COLORS[t] || COLORS.select; };
  const refresh = () => {
    if (pending) { overlay.setTiles(pending.tiles, pending.color); return; }
    const def = structDef();
    viewMode?.setPlacement(def && !def.linear ? def : null, hover);
    if (def && !def.linear) { if (hover) previewStructure(def, hover); else { overlay.clear(); radiusOverlay?.clear(); } return; }
    radiusOverlay?.clear();
    if (dragStart && hover) overlay.setTiles(def ? lPath(dragStart.x, dragStart.y, hover.x, hover.y) : previewTiles(dragStart, hover), colorFor());
    else if (hover) overlay.setTiles([[hover.x, hover.y]], colorFor());
    else overlay.clear();
  };

  /** 操作をコマンドにまとめる（確認用の説明と費用も） */
  const buildAction = (start, end) => {
    const tool = toolbar.current;
    if (tool === 'road') { const tiles = lPath(start.x, start.y, end.x, end.y).filter(([x, y]) => !world.roads[y * world.map.w + x]); return { cmd: { type: 'road.build', x0: start.x, y0: start.y, x1: end.x, y1: end.y }, tiles: lPath(start.x, start.y, end.x, end.y), color: COLORS.road, text: `道路 ${tiles.length} マス（${tiles.length * reg.balance.road.costPerTile} 銭）` }; }
    if (tool === 'demolish') { const rect = normRect(start.x, start.y, end.x, end.y); const tiles = Array.from(rectTiles(rect)); return { cmd: { type: 'demolish', rect }, tiles, color: COLORS.demolish, text: `撤去 ${tiles.length} マス（戻せません）`, noUndo: true }; }
    if (tool.startsWith('zone:')) { const rect = normRect(start.x, start.y, end.x, end.y); const tiles = Array.from(rectTiles(rect)); return { cmd: { type: 'zone.set', rect, zoneId: tool.slice(5) }, tiles, color: COLORS.zone, text: `${reg.zoneById.get(tool.slice(5)).name} ${tiles.length} マス（建物は民が建てます）` }; }
    if (tool.startsWith('struct:')) {
      const def = reg.structureById.get(tool.slice(7));
      const name = structureName(reg, def, world.nationId);
      if (def.linear) { const tiles = lPath(start.x, start.y, end.x, end.y); return { cmd: { type: 'structure.line', typeId: def.id, x0: start.x, y0: start.y, x1: end.x, y1: end.y }, tiles, color: COLORS.ok, text: `${name} ${tiles.length} マス（最大 ${tiles.length * def.cost} 銭）` }; }
      const tiles = []; for (let y = end.y; y < end.y + def.size[1]; y++) for (let x = end.x; x < end.x + def.size[0]; x++) tiles.push([x, y]);
      return { cmd: { type: 'structure.place', typeId: def.id, x: end.x, y: end.y }, tiles, color: COLORS.ok, text: `${name}（${def.cost} 銭）` };
    }
    return null;
  };

  /** コマンドを実行し、元に戻すための情報を記録する */
  const execute = (action) => {
    const before = { money: world.money, zones: null, roads: null, structIds: null };
    const c = action.cmd;
    if (c.type === 'zone.set') before.zones = action.tiles.map(([x, y]) => [x, y, world.zones[y * world.map.w + x]]);
    if (c.type === 'road.build') before.roads = action.tiles.filter(([x, y]) => !world.roads[y * world.map.w + x]);
    if (c.type.startsWith('structure.')) before.structIds = new Set(world.structures.keys());
    const result = applyCommand(world, reg, c);
    if (result.ok && result.message) log.push(`一部置けませんでした: ${result.message}`);
    if (result && !result.ok) log.push(result.message);
    if (result && result.ok && result.count === 0) log.push('ここには置けません（山・水・道路・建物の上には置けません）');
    if (result.ok && !action.noUndo && (result.count === undefined || result.count > 0)) {
      history.push({ ...before, cmd: c, spent: before.money - world.money, text: action.text });
      if (history.length > 5) history.shift();
    }
    if (result.ok) viewMode?.invalidate();
    onPending?.(null, history.length);
    return result;
  };
  const undo = () => {
    const h = history.pop();
    if (!h) { log.push('戻せる操作はありません'); return; }
    const W = world.map.w;
    if (h.zones) for (const [x, y, old] of h.zones) { const cur = world.zones[y * W + x]; if (cur === old) continue; if (old) applyCommand(world, reg, { type: 'zone.set', rect: { x0: x, y0: y, x1: x, y1: y }, zoneId: reg.zones[old - 1].id }); else applyCommand(world, reg, { type: 'zone.clear', rect: { x0: x, y0: y, x1: x, y1: y } }); }
    if (h.roads) for (const [x, y] of h.roads) if (world.roads[y * W + x]) applyCommand(world, reg, { type: 'road.remove', rect: { x0: x, y0: y, x1: x, y1: y } });
    if (h.structIds) for (const id of Array.from(world.structures.keys())) if (!h.structIds.has(id)) { const s = world.structures.get(id); applyCommand(world, reg, { type: 'demolish', rect: { x0: s.x, y0: s.y, x1: s.x + s.w - 1, y1: s.y + s.h - 1 } }); }
    world.money += h.spent;
    log.push(`元に戻しました: ${h.text}`);
    viewMode?.invalidate();
    onPending?.(null, history.length);
    refresh();
  };
  const commit = (start, end) => {
    const action = buildAction(start, end);
    if (!action) return;
    if (confirmMode()) { pending = action; onPending?.(action, history.length); refresh(); }
    else execute(action);
  };
  const decide = () => { if (!pending) return; const a = pending; pending = null; execute(a); refresh(); };
  const cancelPending = () => { if (!pending) return; pending = null; onPending?.(null, history.length); refresh(); };

  const longPress = (t, x, y) => {
    dragStart = null;
    if (viewMode && viewMode.mode !== 'normal') viewPanel?.hover(t, x, y);
    else infoPanel.select(t);
    overlay.clear();
  };

  canvas.addEventListener('pointerdown', (e) => {
    const touch = e.pointerType !== 'mouse';
    if (!touch && e.button !== 0) return;
    if (touch && orbit.touchCount() >= 2) { dragStart = null; consumed = true; overlay.clear(); return; }
    const t = picker.tileAt(e.clientX, e.clientY);
    if (touch) viewPanel?.hover(null);   // 前の長押しの内訳を消す
    if (!t) return;
    consumed = false;
    downInfo = { x: e.clientX, y: e.clientY, t, time: e.timeStamp, moved: 0 };   // timeStamp は発生時刻（描画で処理が遅れても正しい）
    if (touch && toolbar.current === 'select') { hover = t; return; }   // 選択ツールの1本指はカメラ移動（タップ=選択、長押し=詳細）
    dragStart = t; hover = t; refresh();
  });
  canvas.addEventListener('pointermove', (e) => {
    const touch = e.pointerType !== 'mouse';
    if (touch && orbit.touchCount() >= 2) { if (dragStart) { dragStart = null; overlay.clear(); } consumed = true; return; }
    if (downInfo) downInfo.moved = Math.max(downInfo.moved, Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y));
    if (orbit.isDragging()) { hover = null; overlay.clear(); viewPanel?.hover(null); return; }
    hover = picker.tileAt(e.clientX, e.clientY);
    if (touch && !dragStart) return;   // タッチの選択ツールではホバー表示をしない
    refresh();
    if (!touch) viewPanel?.hover(hover, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', (e) => {
    const touch = e.pointerType !== 'mouse';
    if (!touch && e.button !== 0) return;
    if (consumed) { consumed = false; dragStart = null; downInfo = null; return; }
    const end = picker.tileAt(e.clientX, e.clientY) || hover || dragStart;
    const tool = toolbar.current;
    const held = downInfo ? e.timeStamp - downInfo.time : 0, moved = downInfo ? downInfo.moved : 0;
    // 長押し（動かさずに 0.5 秒以上）= 詳細。描画が重くても誤判定しないよう、離したときに判定する
    if (touch && downInfo && held >= 500 && moved < 12 && downInfo.t) { longPress(downInfo.t, e.clientX, e.clientY); consumed = false; dragStart = null; downInfo = null; return; }
    if (tool === 'select') {
      if (end && downInfo && moved < 12) infoPanel.select(end);
      dragStart = null; downInfo = null; refresh(); return;
    }
    if (!dragStart || !end) { dragStart = null; downInfo = null; return; }
    commit(dragStart, end);
    dragStart = null; downInfo = null; if (!pending) refresh();
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; hover = null; if (!dragStart) overlay.clear(); viewPanel?.hover(null); });   // タッチは離すと leave が来るので消さない
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Escape') { dragStart = null; cancelPending(); toolbar.set('select'); refresh(); }
    if (e.code === 'Enter' && pending) decide();
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
  });
  return { decide, cancel: cancelPending, undo, get pending() { return pending; }, get undoCount() { return history.length; } };
}
