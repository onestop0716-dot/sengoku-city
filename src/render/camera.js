// 360度回転・ズーム・パンできる俯瞰カメラ。右ドラッグ=回転、中ドラッグ=パン、ホイール=ズーム、WASD/矢印=パン、Q/E=回転。
import * as THREE from 'three';

export function createOrbitCamera(canvas, { centerX, centerZ, aspect, maxDistance = 130, bounds = null }) {
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.5, 2500);
  const state = {
    target: new THREE.Vector3(centerX, 0, centerZ),
    distance: Math.min(45, maxDistance), yaw: Math.PI * 0.25, pitch: 0.85,
    minDistance: 6, maxDistance, minPitch: 0.2, maxPitch: 1.45,
  };
  const keys = new Set();
  let drag = null;

  const apply = () => {
    const { target, distance, yaw, pitch } = state;
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    camera.lookAt(target);
  };

  const pan = (dx, dz) => {
    // カメラの向きに沿って移動
    const s = state.distance * 0.0025;
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
    state.target.x += (-dx * fz + dz * fx) * s * -1;
    state.target.z += (dx * fx + dz * fz) * s * -1;
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // --- マウス: 右ドラッグ=回転、中ドラッグ=移動。タッチ/ペン: 1本=移動（ツール未選択時）、2本=移動+ピンチでズーム+ひねりで回転
  const pointers = new Map();      // タッチ/ペンの指の位置
  let gesture = null;              // 2本指のジェスチャの前回の状態
  let touchDrag = null;            // 1本指の移動
  let toolActive = () => false;    // ツール選択中は1本指をツールに譲る
  const screenPan = (dx, dy) => {
    const s = state.distance * 0.0022;
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
    state.target.x -= (dx * fz - dy * fx) * s;
    state.target.z -= (-dx * fx - dy * fz) * s;
  };
  const gestureOf = () => {
    const [a, b] = Array.from(pointers.values());
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 2) drag = { mode: 'rotate', x: e.clientX, y: e.clientY };
      else if (e.button === 1) { drag = { mode: 'pan', x: e.clientX, y: e.clientY }; e.preventDefault(); }
      if (drag) canvas.setPointerCapture(e.pointerId);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
    if (pointers.size === 1) touchDrag = toolActive() ? null : { x: e.clientX, y: e.clientY, moved: 0 };
    else if (pointers.size === 2) { touchDrag = null; gesture = gestureOf(); }
    else gesture = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.mode === 'rotate') {
        state.yaw -= dx * 0.006;
        state.pitch = Math.min(state.maxPitch, Math.max(state.minPitch, state.pitch + dy * 0.005));
      } else screenPan(dx, dy);
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && gesture) {
      const g = gestureOf();
      screenPan(g.cx - gesture.cx, g.cy - gesture.cy);
      if (gesture.dist > 10) state.distance = Math.min(state.maxDistance, Math.max(state.minDistance, state.distance * (gesture.dist / g.dist)));
      let da = g.angle - gesture.angle; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      state.yaw -= da;
      gesture = g;
    } else if (pointers.size === 1 && touchDrag) {
      const dx = e.clientX - touchDrag.x, dy = e.clientY - touchDrag.y;
      touchDrag.x = e.clientX; touchDrag.y = e.clientY; touchDrag.moved += Math.abs(dx) + Math.abs(dy);
      screenPan(dx, dy);
    }
  });
  const endDrag = (e) => {
    if (e.pointerType === 'mouse') { if (drag) { drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch { /* 無視 */ } } return; }
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* 無視 */ }
    if (pointers.size < 2) gesture = null;
    if (pointers.size === 0) touchDrag = null;
    else if (pointers.size === 1) { const [q] = pointers.values(); touchDrag = toolActive() ? null : { x: q.x, y: q.y, moved: 0 }; }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(e.deltaY * 0.0012);
    state.distance = Math.min(state.maxDistance, Math.max(state.minDistance, state.distance * f));
  }, { passive: false });
  window.addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') keys.add(e.code); });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  return {
    camera, state,
    isDragging: () => drag !== null || gesture !== null || (touchDrag !== null && touchDrag.moved > 6),
    touchCount: () => pointers.size,
    /** ツール選択中かを返す関数を登録（1本指をツールに譲る） */
    setToolActive(fn) { toolActive = fn; },
    /** 画面上のボタン用 */
    rotate(d) { state.yaw += d; },
    zoom(f) { state.distance = Math.min(state.maxDistance, Math.max(state.minDistance, state.distance * f)); },
    setAspect(a) { camera.aspect = a; camera.updateProjectionMatrix(); },
    /** 毎フレーム呼ぶ。dt は秒 */
    update(dt) {
      const v = 260 * dt;
      let dx = 0, dz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) dz += v;
      if (keys.has('KeyS') || keys.has('ArrowDown')) dz -= v;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= v;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += v;
      if (dx || dz) pan(dx, dz);
      if (keys.has('KeyQ')) state.yaw += 1.5 * dt;
      if (keys.has('KeyE')) state.yaw -= 1.5 * dt;
      state.distance = Math.min(state.maxDistance, Math.max(state.minDistance, state.distance));   // 常に上限・下限を守る
      if (bounds) { const m = bounds.margin ?? 0; state.target.x = Math.min(bounds.maxX + m, Math.max(bounds.minX - m, state.target.x)); state.target.z = Math.min(bounds.maxZ + m, Math.max(bounds.minZ - m, state.target.z)); }
      apply();
    },
  };
}
