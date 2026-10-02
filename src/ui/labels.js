// 建物の名札: 主要な特殊建築の上に名前を出す（カメラが近いときだけ。遠いと小さく薄く）。
import * as THREE from 'three';
import { structureName } from '../sim/structures.js';

const SHOW = new Set(['yamen', 'market_hall', 'granary', 'palace', 'gate', 'academy', 'ancestral_temple', 'altar', 'dock', 'customs', 'armory', 'drill_ground', 'post_station', 'prison', 'watchtower', 'beacon']);
const MAX = 40;

export function createLabels(world, reg, orbit, env) {
  const root = document.getElementById('labels');
  const pool = [];
  const v = new THREE.Vector3();
  let lastCount = -1, items = [];
  const rebuild = () => {
    items = [];
    for (const s of world.structures.values()) {
      if (s.state !== 'built' || !SHOW.has(s.type)) continue;
      const def = reg.structureById.get(s.type);
      items.push({ x: s.x + s.w / 2, z: s.y + s.h / 2, name: structureName(reg, def, world.nationId), key: s.id });
      if (items.length >= MAX) break;
    }
    lastCount = world.structures.size;
    while (pool.length < items.length) { const d = document.createElement('div'); d.className = 'map-label'; root.appendChild(d); pool.push(d); }
    for (let i = 0; i < pool.length; i++) { pool[i].style.display = i < items.length ? '' : 'none'; if (i < items.length) pool[i].textContent = items[i].name; }
  };
  return {
    update() {
      if (world.structures.size !== lastCount || world.day % 30 === 0 && items.length === 0) rebuild();
      const cam = orbit.camera, W = window.innerWidth, H = window.innerHeight;
      const far = 140;
      for (let i = 0; i < items.length; i++) {
        const it = items[i], d = pool[i];
        v.set(it.x, env.terrain.heightAt(it.x, it.z) + 4.5, it.z);
        const dist = v.distanceTo(cam.position);
        v.project(cam);
        if (v.z > 1 || dist > far || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { d.style.display = 'none'; continue; }
        d.style.display = '';
        const k = Math.max(0.6, Math.min(1, 1.3 - dist / far));
        d.style.transform = `translate(-50%, -100%) translate(${(v.x + 1) / 2 * W}px, ${(1 - v.y) / 2 * H}px) scale(${k.toFixed(2)})`;
        d.style.opacity = String(Math.min(1, (far - dist) / 40));
      }
    },
    refresh: rebuild,
  };
}
