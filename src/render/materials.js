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

/** 質感つきの MeshStandardMaterial を作る。defaultTex は tex 属性が無いときの質感 */
export function createTexturedMaterial({ defaultTex = 0, roughness = 0.9, metalness = 0, vertexColors = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors, roughness, metalness });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDefaultTex = { value: defaultTex };
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
      .replace('#include <common>', '#include <common>\nvarying float vTex;\nvarying vec3 vWPos;\nuniform float uDefaultTex;\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= texPattern(vTex > 0.5 ? vTex : uDefaultTex, vWPos);');
  };
  mat.customProgramCacheKey = () => `tex${defaultTex}`;
  return mat;
}
