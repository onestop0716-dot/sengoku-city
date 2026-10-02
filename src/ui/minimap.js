// 右上のミニマップ: 地形・区画・道路・水を描き、いまの視点の位置を枠で示す。クリック／ドラッグでその場所へ移動。
// 描画は 1 秒ごと（区画や道路が変わりうる）。視点枠は毎フレーム。
export function createMinimap(world, reg, orbit, env) {
  const el = document.getElementById('minimap');
  const { w, h } = world.map;
  const size = 168;
  el.innerHTML = `<canvas class="mm-map" width="${w}" height="${h}"></canvas><canvas class="mm-cam" width="${size}" height="${size}"></canvas>`;
  const mapC = el.querySelector('.mm-map'), camC = el.querySelector('.mm-cam');
  const mctx = mapC.getContext('2d'), cctx = camC.getContext('2d');
  const img = mctx.createImageData(w, h);
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const tileRgb = reg.tiles.map((t) => hex(t.color || '#9db55a'));
  const zoneRgb = reg.zones.map((z) => hex(z.color));
  const road = [92, 78, 58], struct = [240, 228, 200];
  const redraw = () => {
    const d = img.data;
    for (let i = 0; i < w * h; i++) {
      let c = tileRgb[world.map.tile[i]];
      if (world.zones[i]) { const z = zoneRgb[world.zones[i] - 1]; c = world.buildingAt[i] !== -1 ? z : [(z[0] + c[0]) >> 1, (z[1] + c[1]) >> 1, (z[2] + c[2]) >> 1]; }
      if (world.structAt && world.structAt[i] !== -1) c = struct;
      if (world.roads[i]) c = road;
      const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    mctx.putImageData(img, 0, 0);
  };
  const drawCam = () => {
    cctx.clearRect(0, 0, size, size);
    const s = size / Math.max(w, h);
    const t = orbit.state.target;
    const ext = orbit.state.distance * 0.55;   // だいたい見えている範囲
    cctx.save();
    cctx.translate(t.x * s, t.z * s);
    cctx.rotate(-orbit.state.yaw);
    cctx.strokeStyle = 'rgba(255,240,200,0.95)'; cctx.lineWidth = 1.5;
    cctx.strokeRect(-ext * s, -ext * s * 0.7, ext * 2 * s, ext * 2 * s * 0.7);
    cctx.restore();
    cctx.fillStyle = '#ffe9a8'; cctx.beginPath(); cctx.arc(t.x * s, t.z * s, 2.2, 0, Math.PI * 2); cctx.fill();
  };
  const moveTo = (e) => {
    const r = camC.getBoundingClientRect();
    const s = Math.max(w, h) / r.width;
    const x = Math.max(0, Math.min(w - 1, (e.clientX - r.left) * s)), z = Math.max(0, Math.min(h - 1, (e.clientY - r.top) * s));
    orbit.state.target.set(x, env.terrain.heightAt(x, z), z);
  };
  let down = false;
  camC.addEventListener('pointerdown', (e) => { down = true; camC.setPointerCapture(e.pointerId); moveTo(e); });
  camC.addEventListener('pointermove', (e) => { if (down) moveTo(e); });
  for (const ev of ['pointerup', 'pointercancel']) camC.addEventListener(ev, () => { down = false; });
  let last = -1;
  redraw();
  return { el, update() { const now = performance.now(); if (now - last > 1000) { last = now; redraw(); } drawCam(); } };
}
