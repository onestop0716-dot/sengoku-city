// 左ドラッグでツールを適用する（区画・道路・撤去）。
import { normRect, rectTiles, lPath } from '../core/grid.js';
import { applyCommand } from '../sim/commands.js';
import { canPlaceStructure } from '../sim/structures.js';

const COLORS = { road: 0xd9c27a, demolish: 0xff5544, zone: 0x66ff88, select: 0xffffff, ok: 0x66ff88, ng: 0xff5544, radius: 0x88ccff };

export function createInput({ canvas, picker, overlay, radiusOverlay, world, reg, toolbar, infoPanel, log, orbit, viewMode = null, viewPanel = null }) {
  let dragStart = null, hover = null;
  const structDef = () => (toolbar.current.startsWith('struct:') ? reg.structureById.get(toolbar.current.slice(7)) : null);
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
    const def = structDef();
    viewMode?.setPlacement(def && !def.linear ? def : null, hover);
    if (def && !def.linear) { if (hover) previewStructure(def, hover); else { overlay.clear(); radiusOverlay?.clear(); } return; }
    radiusOverlay?.clear();
    if (dragStart && hover) overlay.setTiles(def ? lPath(dragStart.x, dragStart.y, hover.x, hover.y) : previewTiles(dragStart, hover), colorFor());
    else if (hover) overlay.setTiles([[hover.x, hover.y]], colorFor());
    else overlay.clear();
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = picker.tileAt(e.clientX, e.clientY);
    if (!t) return;
    dragStart = t; hover = t; refresh();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (orbit.isDragging()) { hover = null; overlay.clear(); viewPanel?.hover(null); return; }
    hover = picker.tileAt(e.clientX, e.clientY);
    refresh();
    viewPanel?.hover(hover, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !dragStart) return;
    const end = picker.tileAt(e.clientX, e.clientY) || hover || dragStart;
    const tool = toolbar.current;
    let result = null;
    if (tool === 'select') infoPanel.select(end);
    else if (tool === 'road') result = applyCommand(world, reg, { type: 'road.build', x0: dragStart.x, y0: dragStart.y, x1: end.x, y1: end.y });
    else if (tool === 'demolish') result = applyCommand(world, reg, { type: 'demolish', rect: normRect(dragStart.x, dragStart.y, end.x, end.y) });
    else if (tool.startsWith('zone:')) result = applyCommand(world, reg, { type: 'zone.set', rect: normRect(dragStart.x, dragStart.y, end.x, end.y), zoneId: tool.slice(5) });
    else if (tool.startsWith('struct:')) {
      const def = reg.structureById.get(tool.slice(7));
      if (def.linear) result = applyCommand(world, reg, { type: 'structure.line', typeId: def.id, x0: dragStart.x, y0: dragStart.y, x1: end.x, y1: end.y });
      else { result = applyCommand(world, reg, { type: 'structure.place', typeId: def.id, x: end.x, y: end.y }); if (result.ok) result.count = 1; }
      if (result.ok && result.message) log.push(`一部置けませんでした: ${result.message}`);
    }
    if (result && result.ok) viewMode?.invalidate();
    if (result && !result.ok) log.push(result.message);
    if (result && result.ok && result.count === 0 && tool !== 'select') log.push('ここには置けません（山・水・道路・建物の上には置けません）');
    dragStart = null; refresh();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; if (!dragStart) overlay.clear(); viewPanel?.hover(null); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') { dragStart = null; toolbar.set('select'); refresh(); } });
}
