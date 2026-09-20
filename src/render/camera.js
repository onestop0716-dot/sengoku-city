// 360度回転・ズーム・パンできる俯瞰カメラ。右ドラッグ=回転、中ドラッグ=パン、ホイール=ズーム、WASD/矢印=パン、Q/E=回転。
import * as THREE from 'three';

export function createOrbitCamera(canvas, { centerX, centerZ, aspect, maxDistance = 130 }) {
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
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) drag = { mode: 'rotate', x: e.clientX, y: e.clientY };
    else if (e.button === 1) { drag = { mode: 'pan', x: e.clientX, y: e.clientY }; e.preventDefault(); }
    if (drag) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.mode === 'rotate') {
      state.yaw -= dx * 0.006;
      state.pitch = Math.min(state.maxPitch, Math.max(state.minPitch, state.pitch + dy * 0.005));
    } else {
      // 画面上の移動量をワールドへ
      const s = state.distance * 0.0022;
      const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
      state.target.x -= (dx * fz - dy * fx) * s;
      state.target.z -= (-dx * fx - dy * fz) * s;
    }
  });
  const endDrag = (e) => { if (drag) { drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch { /* 無視 */ } } };
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
    isDragging: () => drag !== null,
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
      apply();
    },
  };
}
