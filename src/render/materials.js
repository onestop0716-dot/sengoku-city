// 共通マテリアル: 頂点色 + 手続き質感（木目・土壁・瓦・茅・葉・草・布・石）。
// UV を持たない形状でも使えるよう、ワールド座標からシェーダー内で模様を作る。質感の種類は頂点属性 tex（なければ既定値）。
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */`
  float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // 質感ごとの明るさの揺らぎ（1.0 が変化なし）
  float texPattern(float t, vec3 p) {
    if (t < 0.5) return 1.0;
    if (t < 1.5) {                                   // 木目: 一方向の縞 + ゆらぎ
      float g = sin((p.y * 0.6 + p.x * 0.25 + p.z * 0.15) * 38.0 + vnoise(p * 9.0) * 4.0);
      return 0.93 + 0.07 * (g * 0.5 + 0.5) + (vnoise(p * 40.0) - 0.5) * 0.06;
    }
    if (t < 2.5) {                                   // 版築・土: 細かい粒 + 横の層
      float layers = sin(p.y * 28.0) * 0.5 + 0.5;
      return 0.94 + 0.05 * layers + (vnoise(p * 30.0) - 0.5) * 0.12 + (vnoise(p * 4.0) - 0.5) * 0.06;
    }
    if (t < 3.5) {                                   // 瓦: 段の陰影
      float row = fract((p.y * 0.8 + p.z * 0.5 + p.x * 0.5) * 9.0);
      return 0.9 + 0.12 * smoothstep(0.0, 0.35, row) * (1.0 - smoothstep(0.75, 1.0, row)) + (vnoise(p * 25.0) - 0.5) * 0.05;
    }
    if (t < 4.5) {                                   // 茅・藁: 縦の筋
      float s = sin((p.x + p.z) * 70.0 + vnoise(p * 12.0) * 6.0);
      return 0.92 + 0.08 * (s * 0.5 + 0.5) + (vnoise(p * 50.0) - 0.5) * 0.08;
    }
    if (t < 5.5) return 0.86 + 0.24 * vnoise(p * 6.0) + (vnoise(p * 22.0) - 0.5) * 0.12;   // 葉
    if (t < 6.5) return 0.94 + 0.1 * vnoise(p * 3.0) + (vnoise(p * 14.0) - 0.5) * 0.08;    // 草地
    if (t < 7.5) return 0.95 + (vnoise(p * 60.0) - 0.5) * 0.06;                            // 布
    return 0.9 + 0.12 * vnoise(p * 5.0) + (vnoise(p * 30.0) - 0.5) * 0.1;                   // 石
  }`;

/** 表示モード用の共有ユニフォーム（地形: マスごとの色テクスチャ / 建物: 半透明化）。render/view-mode.js が書き換える */
export const viewUniforms = {
  uViewOn: { value: 0 },                       // 0: 通常 / 1: 区画 / 2: 状態
  uViewTex: { value: null },                   // W×H の RGBA: rgb=色, a=フラグ
  uViewSize: { value: new THREE.Vector2(1, 1) },
  uViewTime: { value: 0 },
  uViewFade: { value: 0.35 },                  // 建物・木の不透明度
};

// 表示モード: 地形にマスごとの色を重ね、グリッド線・斜線（未建築）・点線（基準未満）・明滅（改善見込み）を描く
const VIEW_TERRAIN_GLSL = /* glsl */`
  if (uViewOn > 0.5) {
    vec2 uv = vec2(vWPos.x / uViewSize.x, vWPos.z / uViewSize.y);
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      vec4 s = texture2D(uViewTex, uv);
      float f = floor(s.a * 255.0 + 0.5);
      bool unbuilt = mod(f, 2.0) >= 1.0, below = mod(floor(f / 2.0), 2.0) >= 1.0, preview = mod(floor(f / 4.0), 2.0) >= 1.0, none = mod(floor(f / 16.0), 2.0) >= 1.0;
      vec3 col = s.rgb;
      float lum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
      vec3 base = mix(diffuseColor.rgb, vec3(lum), 0.6);
      float k = none ? 0.35 : 0.78;
      vec3 outc = mix(base, col, k);
      vec2 fx = fract(vWPos.xz);
      if (uViewOn < 1.5) {                                      // 区画モード: グリッド線
        float g = step(fx.x, 0.035) + step(fx.y, 0.035);
        outc *= 1.0 - 0.35 * clamp(g, 0.0, 1.0);
      }
      if (unbuilt) {                                             // 未建築の区画: 斜線（ゆっくり流れる）
        float st = fract((vWPos.x + vWPos.z) * 2.5 - uViewTime * 0.5);
        outc = mix(outc, outc * 0.55, step(st, 0.4));
      }
      if (below) {                                               // 基準未満: 点線の格子
        float d = step(fract(vWPos.x * 4.0), 0.5) * step(fract(vWPos.z * 4.0), 0.5);
        outc = mix(outc, vec3(0.25, 0.05, 0.05), d * 0.55);
      }
      if (preview) {                                             // 改善見込み: 明滅
        outc = mix(outc, vec3(0.5, 1.0, 0.7), 0.35 + 0.25 * sin(uViewTime * 4.0));
      }
      diffuseColor.rgb = outc;
    }
  }`;
// 表示モード: 建物・木・人は灰色がかった半透明にして地面の色を隠さない
const VIEW_OBJECT_GLSL = /* glsl */`
  if (uViewOn > 0.5) {
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum * 0.9 + 0.15), 0.75);
    diffuseColor.a *= uViewFade;
  }`;

/** 質感つきの MeshStandardMaterial を作る。defaultTex は tex 属性が無いときの質感。role: 'terrain' は表示モードの色を重ね、'object' は半透明化 */
export function createTexturedMaterial({ defaultTex = 0, roughness = 0.9, metalness = 0, vertexColors = true, role = 'object' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors, roughness, metalness });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDefaultTex = { value: defaultTex };
    Object.assign(shader.uniforms, viewUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tex;\nvarying float vTex;\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vTex = tex;
        vec4 wpTex = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpTex = instanceMatrix * wpTex;
        #endif
        vWPos = (modelMatrix * wpTex).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTex;\nvarying vec3 vWPos;\nuniform float uDefaultTex;\nuniform float uViewOn; uniform sampler2D uViewTex; uniform vec2 uViewSize; uniform float uViewTime; uniform float uViewFade;\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= texPattern(vTex > 0.5 ? vTex : uDefaultTex, vWPos);\n' + (role === 'terrain' ? VIEW_TERRAIN_GLSL : VIEW_OBJECT_GLSL));
  };
  mat.customProgramCacheKey = () => `tex${defaultTex}:${role}`;
  if (role === 'object') { mat.transparent = false; }
  return mat;
}
