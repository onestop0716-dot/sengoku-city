// 住民の近景表示: 部品ごとの InstancedMesh を関節で動かす（歩行・作業・待機）。
// agents-view から「見た目（look）」と「姿勢（pose）」を受け取って毎フレーム行列を書く。
import * as THREE from 'three';
import { PART_GENERATORS, WARDROBE, SKIN_TONES } from './models/people.js';

const HEADS = ['bun', 'cap', 'crown', 'tall_crown', 'helmet', 'female'];
const TORSOS = ['short', 'robe', 'wide_robe', 'armor'];
const ARMS = ['narrow', 'wide'];
const ITEMS = ['hoe', 'pole', 'bundle', 'ge', 'slips', 'basket'];

function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  return g;
}

/** 決定的な乱数（見た目の割り当て用） */
const rnd01 = (seed) => { let t = (seed + 0x6d2b79f5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

/** 住民1人の見た目を決める（性別・年齢・体格・服・持ち物） */
export function makeLook(kind, seed) {
  const W = WARDROBE[kind] || WARDROBE.person_farmer;
  const female = rnd01(seed) < (W.female ?? 0);
  const ageR = rnd01(seed + 1);
  const age = ageR < 0.08 ? 'child' : ageR > 0.9 ? 'elder' : 'adult';
  const scale = (age === 'child' ? 0.62 : age === 'elder' ? 0.94 : 0.96 + rnd01(seed + 2) * 0.1) * (female ? 0.95 : 1);
  const cloth = new THREE.Color(pick(W.cloth, rnd01(seed + 3))).convertSRGBToLinear();
  cloth.multiplyScalar(0.9 + rnd01(seed + 4) * 0.2);
  const trousers = new THREE.Color(pick(W.trousers, rnd01(seed + 5))).convertSRGBToLinear();
  const skin = new THREE.Color(pick(SKIN_TONES, rnd01(seed + 6))).convertSRGBToLinear();
  const item = age === 'child' ? null : pick(W.items, rnd01(seed + 7));
  return { kind, female, age, scale, cloth, trousers, skin, head: female ? 'female' : pick(W.head, rnd01(seed + 8)), torso: W.torso, arm: W.arm, item, stoop: age === 'elder' ? 0.25 : 0 };
}

export function createPeopleView(scene, material) {
  const group = new THREE.Group();
  scene.add(group);
  const CAP = 700;
  const mesh = (m, cap = CAP) => {
    const im = new THREE.InstancedMesh(toGeometry(m), material, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; im.count = 0;
    im.setColorAt(0, new THREE.Color(1, 1, 1));       // instanceColor を有効化
    group.add(im);
    return im;
  };
  const parts = {
    head: Object.fromEntries(HEADS.map((v) => [v, mesh(PART_GENERATORS.head({ variant: v }), 400)])),
    torso: Object.fromEntries(TORSOS.map((v) => [v, mesh(PART_GENERATORS.torso({ variant: v }), 400)])),
    arm: Object.fromEntries(ARMS.map((v) => [v, mesh(PART_GENERATORS.arm({ variant: v }), 800)])),
    hand: mesh(PART_GENERATORS.hand(), 800),
    leg: mesh(PART_GENERATORS.leg(), 800),
    item: Object.fromEntries(ITEMS.map((v) => [v, mesh(PART_GENERATORS.item({ kind: v }), 400)])),
  };
  const all = [...Object.values(parts.head), ...Object.values(parts.torso), ...Object.values(parts.arm), parts.hand, parts.leg, ...Object.values(parts.item)];
  const counts = new Map();
  const root = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (im, m, color) => {
    if (!im) return;
    const n = counts.get(im) || 0;
    if (n >= im.instanceMatrix.count) return;
    im.setMatrixAt(n, m); im.setColorAt(n, color); counts.set(im, n + 1);
  };
  /** 関節: root × T(pivot) × Rx(pitch) × Rz(roll) */
  const joint = (px, py, pz, pitch, roll = 0) => {
    local.makeTranslation(px, py, pz);
    if (pitch) { tmp.makeRotationX(pitch); local.multiply(tmp); }
    if (roll) { tmp.makeRotationZ(roll); local.multiply(tmp); }
    return out.multiplyMatrices(root, local);
  };

  return {
    group,
    begin() { counts.clear(); },
    /**
     * 1人分を描く。pose: { x, y, z, rot, phase(歩行位相), moving, action('walk'|'idle'|'work'|'talk'|'carry'), t(秒) }
     */
    draw(look, pose) {
      const s = look.scale;
      pos.set(pose.x, pose.y, pose.z); quat.setFromAxisAngle(up, pose.rot); scl.set(s, s, s);
      root.compose(pos, quat, scl);
      const hip = 0.42, shoulder = 0.42 + 0.34, neck = 0.42 + 0.38;
      let legSwing = 0, armSwing = 0, torsoPitch = look.stoop, armR = 0, armL = 0, bob = 0;
      if (pose.action === 'walk') { legSwing = Math.sin(pose.phase) * 0.65; armSwing = Math.sin(pose.phase) * 0.45; bob = Math.abs(Math.cos(pose.phase)) * 0.02; }
      else if (pose.action === 'work') { const k = Math.sin(pose.t * 5); torsoPitch += 0.35 + k * 0.1; armR = -1.6 + k * 0.7; armL = -1.3 + k * 0.6; }
      else if (pose.action === 'talk') { armR = -0.5 + Math.sin(pose.t * 3) * 0.2; armL = -0.15; }
      else { armR = Math.sin(pose.t * 1.5) * 0.05; armL = -Math.sin(pose.t * 1.5) * 0.05; }
      if (look.item === 'pole') { armR = -1.5; armL = -1.5; }
      if (look.item === 'ge') armR = -0.3;
      if (look.item === 'slips') { armR = -1.2; armL = -1.2; }
      if (look.item === 'basket') armL = Math.min(armL, -0.15);
      // 胴（腰が原点）と頭
      root.multiply(tmp.makeTranslation(0, bob, 0));
      put(parts.torso[look.torso], joint(0, hip, 0, torsoPitch), look.cloth);
      // 頭は胴の傾きに合わせて前へ
      put(parts.head[look.head], joint(0, hip + 0.38 * Math.cos(torsoPitch), 0.38 * Math.sin(torsoPitch), torsoPitch * 0.6), look.skin);
      // 腕・手（肩が原点）
      const sy = hip + 0.34 * Math.cos(torsoPitch), sz = 0.34 * Math.sin(torsoPitch);
      const armGeo = parts.arm[look.arm];
      for (const [side, base] of [[1, armR], [-1, armL]]) {
        const pitch = base + (side === 1 ? -armSwing : armSwing);
        const m = joint(side * 0.15, sy, sz, pitch, side * 0.12);
        put(armGeo, m, look.cloth); put(parts.hand, m, look.skin);
        if (side === 1 && look.item && look.item !== 'pole' && look.item !== 'bundle') put(parts.item[look.item], m, look.item === 'slips' ? look.skin : look.cloth);
      }
      if (look.item === 'pole' || look.item === 'bundle') put(parts.item[look.item], joint(0, hip, 0, torsoPitch), look.cloth);
      // 脚（腰が原点）
      for (const side of [1, -1]) put(parts.leg, joint(side * 0.06, hip, 0, side === 1 ? legSwing : -legSwing), look.trousers);
      void neck; void shoulder;
    },
    end() {
      for (const im of all) { im.count = counts.get(im) || 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    },
  };
}
