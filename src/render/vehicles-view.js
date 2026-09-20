// 乗り物の表示: 部品ごとの InstancedMesh（車体・車輪・牛馬の胴と脚・舟）を組み立て、車輪を回し脚を振る。
// 前は +z。引き手の人や船頭は people-view で描く。
import * as THREE from 'three';

const LAYOUT = {
  oxcart:   { cart: 'veh_cart_oxcart',   wheelX: 0.25, wheelR: 0.2,  axleY: 0.2,  animals: [{ body: 'veh_ox_body',    leg: 'veh_ox_leg',    x: 0, z: 0.72, legY: 0.2,  legX: 0.08, legZ: 0.16 }] },
  handcart: { cart: 'veh_cart_handcart', wheelX: 0.21, wheelR: 0.16, axleY: 0.17, animals: [], puller: { z: 0.86, arms: 0.55 } },
  carriage: { cart: 'veh_cart_carriage', wheelX: 0.26, wheelR: 0.24, axleY: 0.24, animals: [{ body: 'veh_horse_body', leg: 'veh_horse_leg', x: -0.13, z: 0.66, legY: 0.24, legX: 0.07, legZ: 0.18 }, { body: 'veh_horse_body', leg: 'veh_horse_leg', x: 0.13, z: 0.66, legY: 0.24, legX: 0.07, legZ: 0.18 }], driver: { z: -0.05, y: 0.31 } },
  boat:     { boat: 'veh_boat', boatman: { z: 0.3, y: 0.05 } },
};

export function createVehiclesView(scene, assets, people, makeLook) {
  const group = new THREE.Group();
  scene.add(group);
  const meshes = new Map();
  const mesh = (id, cap) => {
    let im = meshes.get(id);
    if (im) return im;
    const { geometry, material } = assets.procedural(id);
    im = new THREE.InstancedMesh(geometry, material, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; im.count = 0;
    group.add(im); meshes.set(id, im);
    return im;
  };
  for (const id of ['veh_cart_oxcart', 'veh_cart_handcart', 'veh_cart_carriage', 'veh_boat', 'veh_ox_body', 'veh_horse_body']) mesh(id, 120);
  mesh('veh_wheel', 240); mesh('veh_ox_leg', 480); mesh('veh_horse_leg', 960);
  const counts = new Map();
  const root = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(1, 1, 1), euler = new THREE.Euler();
  const put = (im, m) => { const n = counts.get(im) || 0; if (n >= im.instanceMatrix.count) return; im.setMatrixAt(n, m); counts.set(im, n + 1); };
  const at = (x, y, z, rx = 0, ry = 0) => {
    local.makeTranslation(x, y, z);
    if (ry) { tmp.makeRotationY(ry); local.multiply(tmp); }
    if (rx) { tmp.makeRotationX(rx); local.multiply(tmp); }
    return out.multiplyMatrices(root, local);
  };
  const looks = new Map();
  const lookFor = (a) => { let l = looks.get(a); if (!l) { l = makeLook(a.kind === 'boat' ? 'person_merchant' : 'person_farmer', a.seed || 1); l.item = null; l.age = 'adult'; looks.set(a, l); } return l; };

  return {
    group,
    begin() { counts.clear(); },
    /** pose: { x, y, z, heading, pitch, roll, odo(進んだ距離), phase(脚の位相), moving, t } */
    draw(a, pose) {
      const L = LAYOUT[a.kind];
      if (!L) return;
      pos.set(pose.x, pose.y, pose.z);
      euler.set(pose.pitch || 0, pose.heading, pose.roll || 0, 'YXZ');
      quat.setFromEuler(euler);
      root.compose(pos, quat, scl);
      if (L.boat) {
        put(meshes.get(L.boat), at(0, 0, 0));
        const look = lookFor(a);
        people.drawInFrame(look, root, { x: 0, y: L.boatman.y, z: L.boatman.z, rot: 0, action: pose.moving ? 'pole' : 'idle', phase: pose.phase, t: pose.t });
        return;
      }
      put(meshes.get(L.cart), at(0, 0, 0));
      const spin = -(pose.odo || 0) / L.wheelR;
      for (const s of [-1, 1]) put(meshes.get('veh_wheel'), at(s * L.wheelX, L.axleY, 0, spin));
      const legSwing = pose.moving ? Math.sin(pose.phase) * 0.45 : 0;
      for (const an of L.animals) {
        put(meshes.get(an.body), at(an.x, 0, an.z, pose.moving ? Math.sin(pose.phase * 2) * 0.015 : 0));
        let k = 0;
        for (const lz of [an.legZ, -an.legZ]) for (const lx of [-an.legX, an.legX]) {
          const sign = ((k === 0 || k === 3) ? 1 : -1);        // 対角の脚が同時に出る
          put(meshes.get(an.leg), at(an.x + lx, an.legY, an.z + lz, legSwing * sign));
          k++;
        }
      }
      if (L.puller) {
        const look = lookFor(a);
        people.drawInFrame(look, root, { x: 0, y: 0, z: L.puller.z, rot: 0, action: pose.moving ? 'walk' : 'idle', arms: L.puller.arms, phase: pose.phase, t: pose.t });
      }
      if (L.driver) {
        const look = lookFor(a);
        people.drawInFrame(look, root, { x: 0, y: L.driver.y, z: L.driver.z, rot: 0, action: 'idle', arms: -0.6, phase: pose.phase, t: pose.t, kneel: true });
      }
    },
    end() { for (const im of meshes.values()) { im.count = counts.get(im) || 0; im.instanceMatrix.needsUpdate = true; } },
    forget(a) { looks.delete(a); },
  };
}
