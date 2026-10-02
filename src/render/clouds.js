// 空に漂う雲（アニメ調のもくもく）。Canvas で描いた雲のテクスチャをスプライトにして、マップの周りをゆっくり流す。
import * as THREE from 'three';

function cloudTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const puffs = [];
  const n = 7 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) puffs.push({ x: 40 + rnd() * 176, y: 60 + rnd() * 40, r: 18 + rnd() * 26 });
  // 下側の影 → 本体 → ハイライト の順に描く
  const draw = (dx, dy, color, scale) => { g.fillStyle = color; for (const p of puffs) { g.beginPath(); g.arc(p.x + dx, p.y + dy, p.r * scale, 0, Math.PI * 2); g.fill(); } };
  draw(0, 6, 'rgba(150,170,200,0.9)', 1.02);
  draw(0, 0, 'rgba(255,255,255,1)', 1);
  draw(-3, -5, 'rgba(255,255,255,1)', 0.8);
  // 底を平らに
  g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 108, 256, 20); g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createClouds(scene, { centerX, centerZ, radius }) {
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < 12; i++) {
    const tex = cloudTexture(100 + i * 7919);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
    const a = (i / 12) * Math.PI * 2 + (i % 3) * 0.3, d = radius * (1.15 + (i % 4) * 0.15);
    const w = 70 + (i % 5) * 18;
    sp.scale.set(w, w * 0.5, 1);
    sp.position.set(centerX + Math.cos(a) * d, 34 + (i % 4) * 8, centerZ + Math.sin(a) * d);
    sp.renderOrder = -1;
    group.add(sp); items.push({ sp, a, d, speed: 0.004 + (i % 3) * 0.002 });
  }
  scene.add(group);
  return {
    update(dt) { for (const it of items) { it.a += dt * it.speed; it.sp.position.x = centerX + Math.cos(it.a) * it.d; it.sp.position.z = centerZ + Math.sin(it.a) * it.d; } },
  };
}
