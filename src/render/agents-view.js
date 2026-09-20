// 住民と乗り物の表示（表示専用。ゲームのロジックには影響しない）。
// 家 → 仕事場（畑・工房・市・官府）を道路づたいに歩き、しばらくして帰る。牛車は畑から穀倉へ、荷車は工房から市へ、
// 馬車は士・貴族の邸から官府へ、舟は船着場の間を水路づたいに行き来する。
import * as THREE from 'three';
import { idx, inBounds, N4 } from '../core/grid.js';
import { createPeopleView, makeLook } from './people-view.js';
import { createVehiclesView } from './vehicles-view.js';
import { PERSON_SCALE } from './models/people.js';

const PERSON_KINDS = ['person_farmer', 'person_artisan', 'person_merchant', 'person_shi', 'person_noble', 'person_soldier'];

export function createAgentsView(world, reg, scene, assets, env) {
  const group = new THREE.Group();
  scene.add(group);
  const meshes = new Map();
  const people = createPeopleView(group, assets.material);
  let cap = { people: 300, vehicles: 60 }, nearDist = 45;
  let lookSeed = 1;
  const agents = [];
  let rngState = 12345;
  const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const ensure = (kind) => {
    let m = meshes.get(kind);
    if (m) return m;
    const { geometry, material } = assets.procedural(kind);
    m = new THREE.InstancedMesh(geometry, material, 400);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; m.count = 0;
    group.add(m); meshes.set(kind, m);
    return m;
  };
  for (const k of PERSON_KINDS) for (let v = 0; v < 3; v++) ensure(`${k}_${v}`);

  const W = world.map.w, H = world.map.h;
  const isRoad = (x, y) => inBounds(W, H, x, y) && world.roads[idx(W, x, y)] === 1;
  const isWater = (x, y) => inBounds(W, H, x, y) && reg.tiles[world.map.tile[idx(W, x, y)]].water === true;
  /** 建物の足元に接する道路マス（入口側を優先） */
  const doorTile = (b) => {
    const cands = [];
    for (let d = 1; d <= 2; d++) {
      for (let x = b.x - d; x < b.x + b.w + d; x++) { if (isRoad(x, b.y + b.h - 1 + d)) cands.push([x, b.y + b.h - 1 + d]); if (isRoad(x, b.y - d)) cands.push([x, b.y - d]); }
      for (let y = b.y - d; y < b.y + b.h + d; y++) { if (isRoad(b.x + b.w - 1 + d, y)) cands.push([b.x + b.w - 1 + d, y]); if (isRoad(b.x - d, y)) cands.push([b.x - d, y]); }
      if (cands.length) break;
    }
    return cands.length ? cands[Math.floor(rnd() * cands.length)] : null;
  };
  /** 幅優先で経路（マス列）。passable で道路か水を選ぶ */
  const findPath = (from, to, passable, limit = 6000) => {
    if (!from || !to) return null;
    const prev = new Map();
    const key = (x, y) => y * W + x;
    const queue = [from]; prev.set(key(from[0], from[1]), null);
    let visited = 0;
    while (queue.length && visited < limit) {
      const cur = queue.shift(); visited++;
      if (cur[0] === to[0] && cur[1] === to[1]) {
        const path = []; let k = key(cur[0], cur[1]);
        while (k !== null && k !== undefined) { path.push([k % W, (k / W) | 0]); k = prev.get(k); }
        return path.reverse();
      }
      for (const [dx, dy] of N4) {
        const nx = cur[0] + dx, ny = cur[1] + dy, nk = key(nx, ny);
        if (prev.has(nk) || !passable(nx, ny)) continue;
        prev.set(nk, key(cur[0], cur[1])); queue.push([nx, ny]);
      }
    }
    return null;
  };
  const wander = (from, passable, steps) => {
    const path = [from]; let cur = from, prevDir = null;
    for (let s = 0; s < steps; s++) {
      const opts = N4.filter(([dx, dy]) => passable(cur[0] + dx, cur[1] + dy) && !(prevDir && dx === -prevDir[0] && dy === -prevDir[1]));
      if (!opts.length) break;
      const d = opts[Math.floor(rnd() * opts.length)];
      cur = [cur[0] + d[0], cur[1] + d[1]]; prevDir = d; path.push(cur);
    }
    return path.length > 1 ? path : null;
  };

  let nextRefresh = 0;
  const collect = () => {
    const homes = { commoner: [], shi: [], noble: [] }, work = { field: [], workshop: [], market: [], yamen: [], granary: [], dock: [], barracks: [] };
    for (const b of world.buildings.values()) {
      if (b.state !== 'built') continue;
      if (b.buildingType === 'house_shi') homes.shi.push(b); else if (b.buildingType === 'house_noble') homes.noble.push(b);
      else if (b.category === 'residential' || b.category === 'farm_house') homes.commoner.push(b);
      if (b.category === 'field') work.field.push(b); else if (b.category === 'workshop') work.workshop.push(b); else if (b.category === 'market') work.market.push(b);
      else if (b.buildingType === 'barracks') work.barracks.push(b);
    }
    for (const s of world.structures.values()) { if (s.state !== 'built') continue; if (s.type === 'yamen') work.yamen.push(s); if (s.type === 'granary') work.granary.push(s); if (s.type === 'dock') work.dock.push(s); }
    return { homes, work };
  };
  const pick = (arr) => (arr.length ? arr[Math.floor(rnd() * arr.length)] : null);

  const spawn = (kind, from, to, passable, speed) => {
    if (!from) return false;
    let path = findPath(from, to, passable, 4000) || wander(from, passable, 20 + Math.floor(rnd() * 20));
    if (!path || path.length < 2) return false;
    const seed = lookSeed++;
    const look = kind.startsWith('person_') ? makeLook(kind, seed) : null;
    agents.push({ kind, path, t: rnd() * (path.length - 1), dir: 1, speed: speed * (0.8 + rnd() * 0.4) * (look?.age === 'child' ? 0.8 : look?.age === 'elder' ? 0.7 : 1), wait: 0, life: 60 + rnd() * 120, look, seed, variant: seed % 3, phase: rnd() * 6.28, clock: rnd() * 10, odo: 0 });
    return true;
  };

  const refresh = () => {
    const { homes, work } = collect();
    const people = agents.filter((a) => a.kind.startsWith('person_')).length, vehicles = agents.length - people;
    const P = world.population;
    const targetPeople = Math.min(cap.people, Math.round(P.total / 8));
    const targetVehicles = Math.min(cap.vehicles, Math.round((work.field.length / 30) + work.workshop.length / 4 + (homes.shi.length + homes.noble.length) / 6 + work.dock.length * 2));
    const roadPass = isRoad;
    let tries = 0;
    for (let n = people; n < targetPeople && tries < targetPeople * 3; tries++) {
      const r = rnd();
      let kind, home, dest;
      if (r < 0.55 && work.field.length) { kind = 'person_farmer'; home = pick(homes.commoner); dest = pick(work.field); }
      else if (r < 0.7 && work.workshop.length) { kind = 'person_artisan'; home = pick(homes.commoner); dest = pick(work.workshop); }
      else if (r < 0.82 && work.market.length) { kind = 'person_merchant'; home = pick(homes.commoner); dest = pick(work.market); }
      else if (r < 0.9 && homes.shi.length) { kind = rnd() < 0.5 && work.yamen.length ? 'person_official' : 'person_shi'; home = pick(homes.shi); dest = kind === 'person_official' ? pick(work.yamen) : pick(work.market) || pick(work.yamen); }
      else if (r < 0.94 && homes.noble.length) { kind = 'person_noble'; home = pick(homes.noble); dest = pick(work.yamen); }
      else if (work.barracks.length) { kind = 'person_soldier'; home = pick(work.barracks); dest = pick(work.yamen) || pick(homes.commoner); }
      else { kind = 'person_farmer'; home = pick(homes.commoner); dest = pick(work.market) || pick(work.field) || pick(work.yamen); }
      if (!home) break;
      if (spawn(kind, doorTile(home), dest ? doorTile(dest) : null, roadPass, 1.6)) n++;
    }
    let vtries = 0;
    for (let n = vehicles; n < targetVehicles && vtries < targetVehicles * 4; vtries++) {
      const before = agents.length;
      const r = rnd();
      if (r < 0.4 && work.field.length) { const f = pick(work.field); const g = pick(work.granary) || pick(work.yamen); spawn('oxcart', doorTile(f), g ? doorTile(g) : null, roadPass, 1.0); }
      else if (r < 0.65 && work.workshop.length) { const ws = pick(work.workshop); const m = pick(work.market) || pick(work.yamen); spawn('handcart', doorTile(ws), m ? doorTile(m) : null, roadPass, 1.2); }
      else if (r < 0.85 && (homes.shi.length || homes.noble.length)) { const hm = pick(homes.noble) || pick(homes.shi); spawn('carriage', doorTile(hm), pick(work.yamen) ? doorTile(pick(work.yamen)) : null, roadPass, 2.0); }
      else if (work.dock.length) {
        const d1 = pick(work.dock); const d2 = work.dock.length > 1 ? pick(work.dock.filter((d) => d !== d1)) : null;
        const waterNear = (s) => { for (let y = s.y - 1; y <= s.y + s.h; y++) for (let x = s.x - 1; x <= s.x + s.w; x++) if (isWater(x, y)) return [x, y]; return null; };
        const a = waterNear(d1), b = d2 ? waterNear(d2) : null;
        if (a) { if (b) spawn('boat', a, b, isWater, 1.4); else { const p = wander(a, isWater, 30); if (p) agents.push({ kind: 'boat', path: p, t: 0, dir: 1, speed: 1.2, wait: 0, life: 200, seed: lookSeed++, variant: 0, phase: 0, clock: 0, odo: 0 }); } }
      } else if (work.field.length) { const f = pick(work.field); spawn('oxcart', doorTile(f), doorTile(pick(work.yamen) || f), roadPass, 1.0); }
      if (agents.length > before) n++;
    }
  };

  const tmp = new THREE.Vector3();
  const vehicles = createVehiclesView(group, assets, people, makeLook);
  const angleTo = (from, to) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  return {
    group,
    debug() { return { agents: agents.length, shown: Array.from(meshes.values()).map((m) => m.count).reduce((a, b) => a + b, 0) }; },
    setQuality(q) { cap = { people: q.maxAgents ?? 300, vehicles: q.maxVehicles ?? 60 }; nearDist = q.peopleNear ?? 45; if (agents.length > cap.people + cap.vehicles) agents.length = cap.people + cap.vehicles; },
    update(dt, gameSpeed, camPos) {
      const now = performance.now();
      if (now >= nextRefresh) { nextRefresh = now + 2000; refresh(); }
      const spd = gameSpeed > 0 ? Math.sqrt(gameSpeed) : 0;
      const counts = new Map();
      people.begin(); vehicles.begin();
      for (let i = agents.length - 1; i >= 0; i--) {
        const a = agents[i];
        a.life -= dt;
        if (a.life <= 0) { vehicles.forget(a); agents.splice(i, 1); continue; }
        a.clock += dt;
        let moving = false;
        if (a.wait > 0) a.wait -= dt;
        else {
          const step = a.speed * spd * dt;
          a.t += a.dir * step;
          a.odo = (a.odo || 0) + step;
          a.phase += step * (a.look ? 7 : 5);
          moving = step > 0;
          if (a.t >= a.path.length - 1) { a.t = a.path.length - 1; a.dir = -1; a.wait = 8 + rnd() * 20; }
          else if (a.t <= 0) { a.t = 0; a.dir = 1; a.wait = 5 + rnd() * 15; }
        }
        const i0 = Math.floor(a.t), i1 = Math.min(a.path.length - 1, i0 + 1), f = a.t - i0;
        const p0 = a.path[i0], p1 = a.path[i1];
        const x = p0[0] + 0.5 + (p1[0] - p0[0]) * f, z = p0[1] + 0.5 + (p1[1] - p0[1]) * f;
        // 進行方向。角では急に向きを変えず、なめらかに回る
        const dx = (p1[0] - p0[0]) * a.dir, dz = (p1[1] - p0[1]) * a.dir;
        const target = (dx || dz) ? Math.atan2(dx, dz) : (a.heading ?? 0);
        if (a.heading === undefined) a.heading = target;
        else if (a.wait <= 0 || a.kind === 'boat') a.heading += angleTo(a.heading, target) * Math.min(1, dt * (a.look ? 8 : 5));
        const rot = a.heading;
        // 経路上のマス列が同じ道路でも複数の住民が重ならないように、少し横にずらす
        const side = ((i * 7919) % 5 - 2) * (a.look ? 0.12 : 0.05);
        const px = x - Math.cos(rot) * side, pz = z + Math.sin(rot) * side;
        const isBoat = a.kind === 'boat';
        const y = isBoat ? env.terrain.field.waterLevel + 0.02 + Math.sin(a.clock * 1.7) * 0.012 : env.terrain.heightAt(px, pz);
        tmp.set(px, y, pz);
        const dist = camPos ? tmp.distanceTo(camPos) : 0;
        if (dist > 140) continue;
        // 坂: 前後の地面の高さの差から傾きを求める（舟は波で少し揺れる）
        let pitch = 0;
        if (isBoat) pitch = Math.sin(a.clock * 1.3) * 0.02;
        else if (dist < nearDist * 2) { const hx = Math.sin(rot) * 0.35, hz = Math.cos(rot) * 0.35; pitch = -Math.atan2(env.terrain.heightAt(px + hx, pz + hz) - env.terrain.heightAt(px - hx, pz - hz), 0.7); }
        if (!a.look) {
          vehicles.draw(a, { x: px, y, z: pz, heading: rot, pitch, odo: a.odo || 0, phase: a.phase, moving, t: a.clock });
          continue;
        }
        if (dist < nearDist) {
          // 近景: 関節つきの人。仕事場に着いた農民は作業、商人は客と話す
          const atWork = a.wait > 0 && a.dir === -1;
          const action = a.wait <= 0 && spd > 0 ? 'walk' : atWork && a.kind === 'person_farmer' && a.look.item === 'hoe' ? 'work' : atWork && (a.kind === 'person_merchant' || a.kind === 'person_official') ? 'talk' : 'idle';
          people.draw(a.look, { x: px, y, z: pz, rot, pitch: pitch * 0.5, phase: a.phase, action, t: a.clock });
          continue;
        }
        // 遠景: 組み立て済みの静止モデル
        const kindKey = `${a.kind === 'person_official' ? 'person_shi' : a.kind}_${a.variant}`;
        const mesh = ensure(kindKey);
        const n = counts.get(kindKey) || 0;
        pos.copy(tmp); quat.setFromAxisAngle(up, rot); scl.setScalar(a.look.scale / PERSON_SCALE);
        m4.compose(pos, quat, scl); mesh.setMatrixAt(n, m4); counts.set(kindKey, n + 1);
      }
      for (const [kind, mesh] of meshes) { mesh.count = counts.get(kind) || 0; mesh.instanceMatrix.needsUpdate = true; }
      people.end(); vehicles.end();
    },
  };
}
