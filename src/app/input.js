// 左ドラッグ/1本指ドラッグでツールを適用する（道路・撤去・建物を置く・移動）。
// 建物: カーソルの位置に半透明の見本と足跡の枠（置ける=緑・置けない=赤）を出し、置けない理由を画面下に出す。R キー（タッチは「向き」）で回す。
//   クリック/タップ=1つ置く、ドラッグ=向きに並べる（畑は「範囲」に切り替えると長方形を敷きつめる）。線状の建築（城壁・水路など）は L 字に引く。
// タッチ端末（設定「操作の確認」）では、範囲と費用を表示して「決定」「取消」で確定する。「元に戻す」で直前の操作を戻す（置く・並べる・移動・道路）。
// タップ=選択、長押し=詳細（表示モードの内訳、通常は情報パネル）。2本指の操作はカメラに譲る。
import { normRect, rectTiles, lPath, idx } from '../core/grid.js';
import { applyCommand } from '../sim/commands.js';
import { canPlaceStructure, structureName, removeStructure } from '../sim/structures.js';
import { buildingReasons, footprint, areaPositions, rowPositions, objectAt, moveCost, undoMove, removeBuilding } from '../sim/build.js';
import { chooseFacing } from '../sim/placement.js';
import { costOf, costText, refund, MATERIALS } from '../sim/materials.js';

const COLORS = { road: 0xd9c27a, demolish: 0xff5544, select: 0xffffff, ok: 0x66ff88, ng: 0xff5544, radius: 0x88ccff, move: 0x88ccff };

export function createInput({ canvas, picker, overlay, overlayNg, radiusOverlay, ghost, world, reg, toolbar, infoPanel, log, orbit, viewMode = null, viewPanel = null, settings = null, onPending = null }) {
  let dragStart = null, hover = null, pending = null, consumed = false, downInfo = null;
  let moving = null;     // 移動ツールで持ち上げた物 { kind, id, def }
  const history = [];   // 元に戻す用（最大 balance.placement.undoMax 件）
  const undoMax = reg.balance.placement?.undoMax ?? 5;
  const confirmMode = () => !!settings?.confirmActions;
  orbit.setToolActive?.(() => toolbar.current !== 'select');

  // --- 置く物の情報
  const placeable = () => (toolbar.current.startsWith('place:') ? reg.placeableById.get(toolbar.current.slice(6)) : null);
  const nameOf = (p) => (p.kind === 'structure' ? structureName(reg, p.def, world.nationId) : p.def.name);
  const rotOf = () => toolbar.rotation;                 // null = 自動（入口が道路に面する向き）
  const sizeOf = (def, rot) => footprint(def, rot ?? 0);
  /** カーソルが足跡の真ん中に来るように左上を決める */
  const anchor = (t, def, rot) => { const [w, h] = sizeOf(def, rot); return { x: t.x - ((w - 1) >> 1), y: t.y - ((h - 1) >> 1) }; };
  const reasonsAt = (p, x, y, rot, opts = {}) => {
    if (p.kind === 'building') return buildingReasons(world, reg, p.def, x, y, rot ?? 0, opts);
    const r = canPlaceStructure(world, reg, p.def, x, y, rot ?? 0, opts);
    return r ? [r] : [];
  };
  const modelOf = (kind, def, obj = null) => {
    if (kind === 'building') { if (def.category === 'field') return null; const lv = def.levels[(obj?.level || 1) - 1]; return lv.models[(obj?.variant || 0) % lv.models.length]; }
    return def.models?.[0] || null;
  };
  const footTiles = (x, y, w, h) => { const t = []; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) t.push([xx, yy]); return t; };

  // --- 画面下の案内（名前・費用・置けない理由）
  const hint = document.createElement('div');
  hint.id = 'place-hint';
  document.body.appendChild(hint);
  const showHint = (title, reasons, extra = '') => {
    hint.innerHTML = `<b>${title}</b>${extra ? ` ${extra}` : ''}${reasons.length ? `<ul class="ph-ng">${reasons.map((r) => `<li>${r}</li>`).join('')}</ul>` : ' <span class="ph-ok">置けます</span>'}`;
    hint.style.display = 'block';
  };
  const hideHint = () => { hint.style.display = 'none'; };

  const showRadius = (def, x, y, w, h) => {
    const radius = Math.max(0, ...(def.effects || []).map((e) => e.radius || 0));
    if (!(radius > 0) || !radiusOverlay) { radiusOverlay?.clear(); return; }
    const cx = x + w / 2, cy = y + h / 2, r = [];
    for (let yy = Math.floor(cy - radius); yy <= Math.ceil(cy + radius); yy++) for (let xx = Math.floor(cx - radius); xx <= Math.ceil(cx + radius); xx++) if (Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) <= radius && xx >= 0 && yy >= 0 && xx < world.map.w && yy < world.map.h) r.push([xx, yy]);
    radiusOverlay.setTiles(r, COLORS.radius);
  };
  const clearAll = () => { overlay.clear(); overlayNg?.clear(); radiusOverlay?.clear(); ghost?.hide(); hideHint(); };

  /** 1つ置く見本 */
  const previewOne = (p, t) => {
    const rot = rotOf();
    const a = anchor(t, p.def, rot);
    const [w, h] = sizeOf(p.def, rot);
    const reasons = reasonsAt(p, a.x, a.y, rot);
    const tiles = footTiles(a.x, a.y, w, h);
    if (reasons.length) { overlayNg?.setTiles(tiles, COLORS.ng); overlay.clear(); } else { overlay.setTiles(tiles, COLORS.ok); overlayNg?.clear(); }
    const model = modelOf(p.kind, p.def);
    if (model && ghost) ghost.show(model, a.x, a.y, w, h, rot ?? chooseFacing(world, a.x, a.y, w, h), !reasons.length);
    else ghost?.hide();
    showRadius(p.def, a.x, a.y, w, h);
    showHint(nameOf(p), reasons, `（${costText(costOf(p.def))}${p.kind === 'building' ? `・${w}×${h}マス` : ''}）`);
  };
  /** 並べる・範囲で埋める位置と、置けるかどうか */
  const multiPlan = (p, a, b) => {
    const rot = rotOf();
    const positions = toolbar.areaMode ? areaPositions(p.def, rot ?? 0, normRect(a.x, a.y, b.x, b.y)) : (() => { const s = anchor(a, p.def, rot), e = anchor(b, p.def, rot); return rowPositions(p.def, rot ?? 0, s.x, s.y, e.x, e.y); })();
    const [w, h] = sizeOf(p.def, rot);
    const unit = costOf(p.def);
    const ok = [], ng = [], reasons = new Set();
    let n = 0;
    for (const [x, y] of positions) {
      const r = reasonsAt(p, x, y, rot, { ignoreCost: true });
      const cost = { qian: unit.qian * (n + 1), wood: unit.wood * (n + 1), stone: unit.stone * (n + 1) };
      const afford = world.money >= cost.qian && MATERIALS.every((k) => !cost[k] || (world.materials?.[k] ?? 0) >= cost[k]);
      if (!afford) r.push('銭か材料が足りない');
      // 同じ操作の中で重ならないか（並べる位置どうしは重ならないので、既存の物との重なりだけ見ればよい）
      if (r.length) { for (const q of r) reasons.add(q); ng.push(...footTiles(x, y, w, h)); } else { ok.push(...footTiles(x, y, w, h)); n++; }
    }
    if (!positions.length) reasons.add(`範囲が狭い（${w}×${h}マス以上ドラッグしてください）`);
    return { positions, ok, ng, count: n, reasons: [...reasons], cost: { qian: unit.qian * n, wood: unit.wood * n, stone: unit.stone * n }, rot };
  };
  const previewMulti = (p, a, b) => {
    const plan = multiPlan(p, a, b);
    overlay.setTiles(plan.ok, COLORS.ok); overlayNg?.setTiles(plan.ng, COLORS.ng);
    ghost?.hide(); radiusOverlay?.clear();
    showHint(`${nameOf(p)} × ${plan.count}`, plan.count ? [] : (plan.reasons.length ? plan.reasons : ['置ける場所がない']), `（${costText(plan.cost)}）${plan.ng.length && plan.count ? `<span class="ph-ng">置けない所 ${plan.positions.length - plan.count}: ${plan.reasons.slice(0, 2).join('・')}</span>` : ''}`);
    return plan;
  };
  /** 移動の見本 */
  const previewMove = (t) => {
    const def = moving.def, rot = rotOf() ?? moving.obj.rotation ?? 0;
    const a = anchor(t, def, rot);
    const [w, h] = sizeOf(def, rot);
    const cost = moving.kind === 'building' ? moveCost(reg, def, moving.obj.state) : moving.obj.state === 'building' ? { qian: 0, wood: 0, stone: 0 } : costOf(def, reg.balance.placement.moveCostRate);
    let reasons;
    if (moving.kind === 'building') reasons = buildingReasons(world, reg, def, a.x, a.y, rot, { ignoreId: moving.id, cost });
    else {   // 建築は自分の足跡を一時的に外して確かめる
      const s = moving.obj, W = world.map.w;
      for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) world.structAt[idx(W, xx, yy)] = -1;
      const r = canPlaceStructure(world, reg, def, a.x, a.y, rot, { cost, ignoreUnique: true });
      for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) world.structAt[idx(W, xx, yy)] = s.id;
      reasons = r ? [r] : [];
    }
    const tiles = footTiles(a.x, a.y, w, h);
    if (reasons.length) { overlayNg?.setTiles(tiles, COLORS.ng); overlay.clear(); } else { overlay.setTiles(tiles, COLORS.ok); overlayNg?.clear(); }
    const model = modelOf(moving.kind, def, moving.obj);
    if (model && ghost) ghost.show(model, a.x, a.y, w, h, rot, !reasons.length); else ghost?.hide();
    showHint(`${moving.kind === 'structure' ? structureName(reg, def, world.nationId) : def.name}を移す`, reasons, `（${costText(cost)}）`);
    return { a, rot, reasons };
  };

  const refresh = () => {
    if (pending) { overlay.setTiles(pending.tiles, pending.color); overlayNg?.setTiles(pending.ngTiles || [], COLORS.ng); return; }
    const p = placeable();
    viewMode?.setPlacement(p && p.kind === 'structure' && !p.def.linear ? p.def : null, hover);
    if (toolbar.current === 'move') {
      if (moving && hover) { previewMove(hover); return; }
      clearAll();
      if (hover) { const o = objectAt(world, reg, hover.x, hover.y); if (o) overlay.setTiles(footTiles(o.obj.x, o.obj.y, o.obj.w, o.obj.h), COLORS.move); hint.innerHTML = '<b>移動</b> 移す建物を押してください'; hint.style.display = 'block'; }
      return;
    }
    if (p && !p.def.linear) {
      if (dragStart && hover && (dragStart.x !== hover.x || dragStart.y !== hover.y)) previewMulti(p, dragStart, hover);
      else if (hover) previewOne(p, hover);
      else clearAll();
      return;
    }
    ghost?.hide(); hideHint(); radiusOverlay?.clear(); overlayNg?.clear();
    const color = p ? COLORS.ok : COLORS[toolbar.current] || COLORS.select;
    if (dragStart && hover) overlay.setTiles(toolbar.current === 'demolish' ? Array.from(rectTiles(normRect(dragStart.x, dragStart.y, hover.x, hover.y))) : lPath(dragStart.x, dragStart.y, hover.x, hover.y), color);
    else if (hover) overlay.setTiles([[hover.x, hover.y]], color);
    else overlay.clear();
  };
  toolbar.onChange?.(() => { if (toolbar.current !== 'move') moving = null; refresh(); });

  /** 操作をコマンドにまとめる（確認用の説明と費用も） */
  const buildAction = (start, end) => {
    const tool = toolbar.current;
    if (tool === 'road') { const tiles = lPath(start.x, start.y, end.x, end.y).filter(([x, y]) => !world.roads[y * world.map.w + x]); return { cmd: { type: 'road.build', x0: start.x, y0: start.y, x1: end.x, y1: end.y }, tiles: lPath(start.x, start.y, end.x, end.y), color: COLORS.road, text: `道路 ${tiles.length} マス（${tiles.length * reg.balance.road.costPerTile} 銭）` }; }
    if (tool === 'demolish') { const rect = normRect(start.x, start.y, end.x, end.y); const tiles = Array.from(rectTiles(rect)); return { cmd: { type: 'demolish', rect }, tiles, color: COLORS.demolish, text: `撤去 ${tiles.length} マス（戻せません）`, noUndo: true }; }
    if (tool === 'move') {
      if (!moving) return null;
      const m = previewMove(end);
      if (m.reasons.length) { log.push(`ここには移せません: ${m.reasons[0]}`); return null; }
      const [w, h] = sizeOf(moving.def, m.rot);
      return { cmd: { type: 'build.move', kind: moving.kind, id: moving.id, x: m.a.x, y: m.a.y, rotation: rotOf() }, tiles: footTiles(m.a.x, m.a.y, w, h), color: COLORS.ok, text: `${moving.def.name}を移す` };
    }
    const p = placeable();
    if (!p) return null;
    const name = nameOf(p);
    if (p.def.linear) { const tiles = lPath(start.x, start.y, end.x, end.y); return { cmd: { type: 'structure.line', typeId: p.def.id, x0: start.x, y0: start.y, x1: end.x, y1: end.y }, tiles, color: COLORS.ok, text: `${name} ${tiles.length} マス（最大 ${costText(costOf(p.def, tiles.length))}）` }; }
    const rot = rotOf();
    if (start.x === end.x && start.y === end.y) {
      const a = anchor(end, p.def, rot);
      const reasons = reasonsAt(p, a.x, a.y, rot);
      if (reasons.length) { log.push(`${name}は置けません: ${reasons[0]}`); return null; }
      const [w, h] = sizeOf(p.def, rot);
      return { cmd: { type: 'build.place', typeId: p.def.id, x: a.x, y: a.y, rotation: rot }, tiles: footTiles(a.x, a.y, w, h), color: COLORS.ok, text: `${name}（${costText(costOf(p.def))}）` };
    }
    const plan = multiPlan(p, start, end);
    if (!plan.count) { log.push(`${name}は置けません: ${plan.reasons[0] || '場所がありません'}`); return null; }
    const cmd = toolbar.areaMode ? { type: 'build.area', typeId: p.def.id, rect: normRect(start.x, start.y, end.x, end.y), rotation: rot } : (() => { const s = anchor(start, p.def, rot), e = anchor(end, p.def, rot); return { type: 'build.row', typeId: p.def.id, x0: s.x, y0: s.y, x1: e.x, y1: e.y, rotation: rot }; })();
    return { cmd, tiles: plan.ok, ngTiles: plan.ng, color: COLORS.ok, text: `${name} × ${plan.count}（${costText(plan.cost)}）` };
  };

  /** コマンドを実行し、元に戻すための情報を記録する */
  const execute = (action) => {
    const c = action.cmd;
    const before = { money: world.money, materials: { ...world.materials }, roads: null, buildingIds: new Set(world.buildings.keys()), structIds: new Set(world.structures.keys()) };
    if (c.type === 'road.build') before.roads = action.tiles.filter(([x, y]) => !world.roads[y * world.map.w + x]);
    const result = applyCommand(world, reg, c);
    if (result.ok && result.message) log.push(`一部置けませんでした: ${result.message}`);
    if (result && !result.ok) log.push(result.message);
    if (result && result.ok && result.count === 0) log.push('ここには置けません（山・水・道路・建物の上には置けません）');
    if (result.ok && !action.noUndo && (result.count === undefined || result.count > 0)) {
      const spent = { qian: before.money - world.money, wood: before.materials.wood - world.materials.wood, stone: before.materials.stone - world.materials.stone };
      history.push(c.type === 'build.move' ? { move: { kind: c.kind, id: c.id, old: result.old, cost: result.cost }, text: action.text } : { ...before, spent, text: action.text });
      if (history.length > undoMax) history.shift();
    }
    if (c.type === 'build.move' && result.ok) { moving = null; }
    if (result.ok) viewMode?.invalidate();
    onPending?.(null, history.length);
    return result;
  };
  const undo = () => {
    const h = history.pop();
    if (!h) { log.push('戻せる操作はありません'); return; }
    const W = world.map.w;
    if (h.move) undoMove(world, reg, h.move.kind, h.move.id, h.move.old, h.move.cost);
    else {
      if (h.roads) for (const [x, y] of h.roads) if (world.roads[y * W + x]) applyCommand(world, reg, { type: 'road.remove', rect: { x0: x, y0: y, x1: x, y1: y } });
      for (const id of Array.from(world.buildings.keys())) if (!h.buildingIds.has(id)) removeBuilding(world, reg, id);
      for (const id of Array.from(world.structures.keys())) if (!h.structIds.has(id)) removeStructure(world, reg, id);
      refund(world, h.spent);
    }
    log.push(`元に戻しました: ${h.text}`);
    viewMode?.invalidate();
    onPending?.(null, history.length);
    refresh();
  };
  const commit = (start, end) => {
    const action = buildAction(start, end);
    if (!action) { refresh(); return; }
    if (confirmMode()) { pending = action; onPending?.(action, history.length); refresh(); }
    else execute(action);
  };
  const decide = () => { if (!pending) return; const a = pending; pending = null; execute(a); refresh(); };
  const cancelPending = () => { if (!pending) return; pending = null; onPending?.(null, history.length); refresh(); };
  /** 移動を始める（情報パネルの「移動」からも呼ぶ） */
  const startMove = (kind, id) => {
    const obj = kind === 'structure' ? world.structures.get(id) : world.buildings.get(id);
    if (!obj) return;
    const def = kind === 'structure' ? reg.structureById.get(obj.type) : reg.buildingById.get(obj.buildingType);
    if (kind === 'structure' && (def.linear || def.initial)) { log.push(`${structureName(reg, def, world.nationId)}は移動できません`); return; }
    if (toolbar.current !== 'move') toolbar.set('move');
    moving = { kind, id, def, obj };
    toolbar.setRotation?.(obj.rotation ?? 0);
    refresh();
  };

  const longPress = (t, x, y) => {
    dragStart = null;
    if (viewMode && viewMode.mode !== 'normal') viewPanel?.hover(t, x, y);
    else infoPanel.select(t);
    clearAll();
  };

  canvas.addEventListener('pointerdown', (e) => {
    const touch = e.pointerType !== 'mouse';
    if (!touch && e.button !== 0) return;
    if (touch && orbit.touchCount() >= 2) { dragStart = null; consumed = true; clearAll(); return; }
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
    if (touch && orbit.touchCount() >= 2) { if (dragStart) { dragStart = null; clearAll(); } consumed = true; return; }
    if (downInfo) downInfo.moved = Math.max(downInfo.moved, Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y));
    if (orbit.isDragging()) { hover = null; clearAll(); viewPanel?.hover(null); return; }
    const t = picker.tileAt(e.clientX, e.clientY);
    const same = t && hover && t.x === hover.x && t.y === hover.y;
    hover = t;
    if (touch && !dragStart) return;   // タッチの選択ツールではホバー表示をしない
    if (!same) refresh();
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
    if (tool === 'move' && !moving) {   // 移す物を持ち上げる
      const o = end && objectAt(world, reg, end.x, end.y);
      if (o) startMove(o.kind, o.id); else log.push('移す建物を押してください');
      dragStart = null; downInfo = null; return;
    }
    if (!dragStart || !end) { dragStart = null; downInfo = null; return; }
    const start = tool === 'move' ? end : dragStart;
    dragStart = null; downInfo = null;
    commit(start, end);
    if (!pending) refresh();
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; hover = null; if (!dragStart) clearAll(); viewPanel?.hover(null); });   // タッチは離すと leave が来るので消さない
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Escape') { dragStart = null; moving = null; cancelPending(); toolbar.set('select'); clearAll(); }
    if (e.code === 'Enter' && pending) decide();
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && (placeable() || toolbar.current === 'move')) { toolbar.rotate(e.shiftKey ? -1 : 1); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
  });
  return { decide, cancel: () => { cancelPending(); moving = null; clearAll(); }, undo, startMove, get pending() { return pending; }, get undoCount() { return history.length; } };
}
