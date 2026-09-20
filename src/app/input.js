// 左ドラッグでツールを適用する（区画・道路・撤去）。
import { normRect, rectTiles, lPath } from '../core/grid.js';
import { applyCommand } from '../sim/commands.js';

const COLORS = { road: 0xd9c27a, demolish: 0xff5544, zone: 0x66ff88, select: 0xffffff };

export function createInput({ canvas, picker, overlay, world, reg, toolbar, infoPanel, log, orbit }) {
  let dragStart = null, hover = null;
  const previewTiles = (a, b) => {
    const tool = toolbar.current;
    if (tool === 'road') return lPath(a.x, a.y, b.x, b.y);
    return Array.from(rectTiles(normRect(a.x, a.y, b.x, b.y)));
  };
  const colorFor = () => { const t = toolbar.current; return t.startsWith('zone:') ? COLORS.zone : COLORS[t] || COLORS.select; };
  const refresh = () => {
    if (dragStart && hover) overlay.setTiles(previewTiles(dragStart, hover), colorFor());
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
    if (orbit.isDragging()) { hover = null; overlay.clear(); return; }
    hover = picker.tileAt(e.clientX, e.clientY);
    refresh();
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
    if (result && !result.ok) log.push(result.message);
    if (result && result.ok && result.count === 0 && tool !== 'select') log.push('ここには置けません（山・水・道路・建物の上には置けません）');
    dragStart = null; refresh();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; if (!dragStart) overlay.clear(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') { dragStart = null; toolbar.set('select'); refresh(); } });
}
