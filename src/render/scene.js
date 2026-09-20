// レンダラー・シーン・光・空。品質設定に応じて影などを切り替える。
import * as THREE from 'three';

const SKY_VERT = /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */`precision highp float; varying vec3 vDir; uniform vec3 top; uniform vec3 horizon;
  void main(){ float t = smoothstep(-0.05, 0.45, vDir.y); gl_FragColor = vec4(mix(horizon, top, t), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment> }`;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const horizon = new THREE.Color('#e6ede9').convertSRGBToLinear();
  scene.background = horizon.clone();                        // 万一空が描けない領域があっても黒くしない
  scene.fog = new THREE.Fog(horizon.clone(), 140, 320);

  // 空（グラデーションの球）
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 24, 12),
    new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#8fb6d8').convertSRGBToLinear() }, horizon: { value: horizon.clone() } } }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(new THREE.Color('#dfe9f5'), new THREE.Color('#8a7a5e'), 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#fff2dc'), 2.2);
  sun.position.set(60, 90, 35);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
  scene.add(sun); scene.add(sun.target);
  const sunDir = sun.position.clone().normalize();

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    return { w, h };
  };

  return {
    renderer, scene, sun, sunDir, sky, resize,
    /** 空のドームは常にカメラを中心に置く（描画距離で切れないように） */
    followCamera(camPos) { sky.position.copy(camPos); },
    /** 霞の範囲（ズーム上限に合わせる） */
    setFog(near, far) { scene.fog.near = near; scene.fog.far = far; },
    /** 影の範囲をカメラの注視点に追従させる */
    followShadow(target, radius) {
      sun.position.set(target.x + 60, 90, target.z + 35);
      sun.target.position.copy(target);
      const c = sun.shadow.camera;
      c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
      c.updateProjectionMatrix();
    },
    applyQuality(q) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
      renderer.shadowMap.enabled = q.shadows;
      sun.castShadow = q.shadows;
      if (q.shadows) { sun.shadow.mapSize.set(q.shadowMap, q.shadowMap); sun.shadow.map?.dispose(); sun.shadow.map = null; }
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    },
  };
}
