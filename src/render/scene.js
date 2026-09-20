// レンダラー・シーン・ライトの初期化。
import * as THREE from 'three';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe7ee);
  scene.fog = new THREE.Fog(0xdfe7ee, 120, 260);

  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a7a60, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(60, 100, 40);
  scene.add(sun);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    return { w, h };
  };
  return { renderer, scene, resize };
}
