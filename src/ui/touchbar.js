// 画面上の操作ボタン（キーボードの代わり）: 一時停止・速度、視点の回転とズーム、選択解除、表示モード、元に戻す。
// 決定/取消のバーもここで扱う。
export function createTouchBar({ loop, orbit, toolbar, viewMode, input, show }) {
  const el = document.getElementById('touchbar');
  const confirmEl = document.getElementById('confirm-bar');
  el.innerHTML = `
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
    <button data-act="esc" title="選択に戻る（Esc）">✕</button>`;
  el.style.display = show ? 'flex' : 'none';
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
    setVisible(v) { el.style.display = v ? 'flex' : 'none'; },
  };
}
