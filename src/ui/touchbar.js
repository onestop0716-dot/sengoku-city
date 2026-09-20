// 画面上の操作ボタン（キーボードの代わり）: 一時停止・速度、視点の回転とズーム、元に戻す、表示モード、選択解除。
// 持ち手（⋮⋮）をドラッグで移動でき、「－」で隠せる（小さな「操作」タブで戻す）。位置と表示は記憶する。決定/取消のバーもここで扱う。
const KEY = 'sengoku-city.touchbar';

export function createTouchBar({ loop, orbit, toolbar, viewMode, input, show }) {
  const el = document.getElementById('touchbar');
  const confirmEl = document.getElementById('confirm-bar');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* なし */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* 無視 */ } };
  el.innerHTML = `
    <span class="grip" title="ドラッグで移動">⋮⋮</span>
    <button data-act="pause" title="一時停止/再開">⏸</button>
    <button data-act="speed" title="速度">▶</button>
    <span class="sep"></span>
    <button data-act="rotl" title="左に回転">⟲</button>
    <button data-act="rotr" title="右に回転">⟳</button>
    <button data-act="zoomin" title="近づく">＋</button>
    <button data-act="zoomout" title="遠ざかる">－</button>
    <span class="sep"></span>
    <button data-act="undo" title="元に戻す">↶</button>
    <button data-act="view" title="表示モード（Tab）">表示</button>
    <button data-act="esc" title="ツールをやめて選択に戻る（Esc）">解除</button>
    <span class="sep"></span>
    <button data-act="hide" title="このパネルを隠す">－</button>`;
  const tab = document.createElement('button');
  tab.id = 'touchbar-tab'; tab.textContent = '操作'; tab.title = '操作パネルを表示'; tab.style.display = 'none';
  document.body.appendChild(tab);
  const hold = (btn, fn) => { let iv = null; const stop = () => { if (iv) { clearInterval(iv); iv = null; } }; btn.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); iv = setInterval(fn, 40); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, stop); };
  const q = (a) => el.querySelector(`[data-act="${a}"]`);
  q('pause').addEventListener('click', () => loop.togglePause());
  q('speed').addEventListener('click', () => { const n = loop.speedIndex; loop.setSpeedIndex(n >= 3 ? 1 : Math.max(1, n + 1)); });
  hold(q('rotl'), () => orbit.rotate(0.04)); hold(q('rotr'), () => orbit.rotate(-0.04));
  hold(q('zoomin'), () => orbit.zoom(0.97)); hold(q('zoomout'), () => orbit.zoom(1.03));
  q('undo').addEventListener('click', () => input.undo());
  q('view').addEventListener('click', () => viewMode.cycle());
  q('esc').addEventListener('click', () => { input.cancel(); toolbar.set('select'); });
  confirmEl.innerHTML = `<span class="ct"></span><button class="btn ok" data-ok>決定</button><button class="btn" data-cancel>取消</button>`;
  confirmEl.querySelector('[data-ok]').addEventListener('click', () => input.decide());
  confirmEl.querySelector('[data-cancel]').addEventListener('click', () => input.cancel());

  // --- 表示/非表示
  let visible = show && saved.hidden !== true;
  const applyVisible = () => { el.style.display = visible ? 'flex' : 'none'; tab.style.display = show && !visible ? 'block' : 'none'; };
  q('hide').addEventListener('click', () => { visible = false; saved.hidden = true; persist(); applyVisible(); });
  tab.addEventListener('click', () => { visible = true; saved.hidden = false; persist(); applyVisible(); });

  // --- ドラッグで移動（持ち手）。位置は左上の座標で記憶し、画面内に収める
  const clamp = () => {
    const r = el.getBoundingClientRect();
    const x = Math.max(4, Math.min(window.innerWidth - r.width - 4, saved.x)), y = Math.max(4, Math.min(window.innerHeight - r.height - 4, saved.y));
    el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.bottom = 'auto'; el.style.transform = 'none';
  };
  const applyPos = () => { if (typeof saved.x === 'number' && typeof saved.y === 'number') clamp(); };
  const grip = el.querySelector('.grip');
  let drag = null;
  grip.addEventListener('pointerdown', (e) => { const r = el.getBoundingClientRect(); drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top }; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
  grip.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; saved.x = e.clientX - drag.dx; saved.y = e.clientY - drag.dy; clamp(); });
  const endDrag = (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; persist(); };
  grip.addEventListener('pointerup', endDrag); grip.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', applyPos);
  applyVisible(); applyPos();

  return {
    setPending(action, undoCount) {
      if (action) { confirmEl.querySelector('.ct').textContent = action.text; confirmEl.style.display = 'flex'; } else confirmEl.style.display = 'none';
      q('undo').disabled = !undoCount;
    },
    update() {
      q('pause').textContent = loop.speedIndex === 0 ? '▶' : '⏸';
      q('speed').textContent = ['⏸', '▶', '▶▶', '▶▶▶'][loop.speedIndex] || '▶';
      q('undo').disabled = !input.undoCount;
    },
    setVisible(v) { visible = v; applyVisible(); },
    get visible() { return visible; },
  };
}
