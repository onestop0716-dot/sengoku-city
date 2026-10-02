// アニメ調の後処理: 画面をいったんテクスチャに描き、深度の段差に沿った輪郭線（インク線）、段階的な陰影（セル調）、彩度と暖色の味付け、周辺減光を重ねる。
// 設定「画面の調子」で通常描画に戻せる。描画先がテクスチャのときは three がトーンマッピングと色空間変換をしないので、この最終パスで行う。
import * as THREE from 'three';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse; uniform sampler2D tDepth;
  uniform vec2 uTexel; uniform float uNear, uFar; uniform float uEdge, uToon, uSat;
  float linearDepth(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
  void main(){
    vec4 src = texture2D(tDiffuse, vUv);
    vec3 c = src.rgb;
    // 輪郭線: 深度の相対的な段差（遠近で線の太さが変わらないよう距離で割る）
    float dc = linearDepth(vUv);
    float px = 1.25;
    float dl = linearDepth(vUv - vec2(uTexel.x * px, 0.0)), dr = linearDepth(vUv + vec2(uTexel.x * px, 0.0));
    float du = linearDepth(vUv - vec2(0.0, uTexel.y * px)), dd = linearDepth(vUv + vec2(0.0, uTexel.y * px));
    float diff = max(max(abs(dl - dc), abs(dr - dc)), max(abs(du - dc), abs(dd - dc))) / max(dc, 1.0);
    float edge = smoothstep(0.018, 0.05, diff) * uEdge;
    edge *= 1.0 - smoothstep(180.0, 420.0, dc);           // 遠くは線を薄く（霞に溶ける）
    // セル調: 明るさを段に丸める（色相は保つ）
    float L = dot(c, vec3(0.30, 0.59, 0.11));
    float N = 5.0;
    float s = L * N;
    float Lq = (floor(s) + 0.5 + (smoothstep(0.3, 0.7, fract(s)) - 0.5)) / N;   // 段の中央に寄せる（暗くならない）
    c *= mix(1.0, Lq / max(L, 0.02), uToon * 0.5);
    // 彩度と暖色
    float L2 = dot(c, vec3(0.30, 0.59, 0.11));
    c = mix(vec3(L2), c, uSat);
    c *= vec3(1.04, 1.02, 0.97);
    c = (c - 0.5) * 1.04 + 0.5 + 0.04;
    // インク線（濃い茶）
    c = mix(c, vec3(0.08, 0.05, 0.03), edge * 0.8);
    // 周辺減光
    vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.22;
    gl_FragColor = vec4(max(c, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createPostProcess(renderer) {
  const makeTarget = (w, h, samples) => {
    const rt = new THREE.WebGLRenderTarget(w, h, { samples, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    rt.depthTexture.format = THREE.DepthFormat;
    return rt;
  };
  let samples = 4, rt = null, size = { w: 2, h: 2 };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, toneMapped: true,
    uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / 2, 1 / 2) }, uNear: { value: 0.5 }, uFar: { value: 2500 }, uEdge: { value: 1 }, uToon: { value: 1 }, uSat: { value: 1.25 } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let enabled = true;
  const ensure = () => {
    const dpr = renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(size.w * dpr)), h = Math.max(2, Math.floor(size.h * dpr));
    if (rt && rt.width === w && rt.height === h && rt.samples === samples) return;
    rt?.dispose();
    rt = makeTarget(w, h, samples);
    mat.uniforms.uTexel.value.set(1 / w, 1 / h);
  };
  return {
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; },
    setSize(w, h) { size = { w, h }; },
    /** 品質に応じてマルチサンプルを切り替える（低: なし） */
    setSamples(n) { samples = n; },
    render(scene, camera) {
      if (!enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      ensure();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      mat.uniforms.tDiffuse.value = rt.texture; mat.uniforms.tDepth.value = rt.depthTexture;
      mat.uniforms.uNear.value = camera.near; mat.uniforms.uFar.value = camera.far;
      renderer.render(quadScene, quadCam);
    },
  };
}
