// 三角形を積み上げてローポリ形状を作る小さなビルダー。Three.js に依存しない（テスト可能）。
// 座標系: x/z が水平、y が上。建物は足元 y=0、中心 (0,0) に置く。色は頂点色。

/** sRGB の 0..1 をリニアに変換（Three.js は頂点色をリニアとして扱う） */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function rgb(hex) {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}
export function shade(hex, f) {
  const [r, g, b] = rgb(hex);
  const c = (v) => Math.max(0, Math.min(1, v * f));
  return [c(r), c(g), c(b)];
}
const toCol = (c) => (typeof c === 'number' ? rgb(c) : c);

export function createBuilder() {
  const pos = [], nor = [], col = [];
  const tri = (a, b, c, color) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const cc = toCol(color);
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(cc[0], cc[1], cc[2]); }
  };
  const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };

  const B = {
    tri, quad,
    /** 中心 (cx, cz)、底面 y0、大きさ sx×sy×sz の直方体 */
    box(cx, y0, cz, sx, sy, sz, color, rotY = 0) {
      const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
      const c = Math.cos(rotY), s = Math.sin(rotY);
      const P = (x, y, z) => [cx + x * c - z * s, y, cz + x * s + z * c];
      const p000 = P(-hx, y0, -hz), p100 = P(hx, y0, -hz), p110 = P(hx, y1, -hz), p010 = P(-hx, y1, -hz);
      const p001 = P(-hx, y0, hz), p101 = P(hx, y0, hz), p111 = P(hx, y1, hz), p011 = P(-hx, y1, hz);
      quad(p010, p110, p111, p011, color);              // 上
      quad(p001, p101, p100, p000, color);              // 下
      quad(p000, p100, p110, p010, color);              // 奥 (-z)
      quad(p101, p001, p011, p111, color);              // 手前 (+z)
      quad(p100, p101, p111, p110, color);              // 右 (+x)
      quad(p001, p000, p010, p011, color);              // 左 (-x)
      return B;
    },
    /** 切妻屋根。ridgeAxis='x' なら棟が x 方向。overhang は軒の出 */
    gableRoof(cx, y0, cz, sx, sz, height, color, ridgeAxis = 'x', overhang = 0.08, thickness = 0.04) {
      const hx = sx / 2 + overhang, hz = sz / 2 + overhang, y1 = y0 + height;
      if (ridgeAxis === 'x') {
        const a = [cx - hx, y0, cz - hz], b = [cx + hx, y0, cz - hz], c = [cx + hx, y1, cz], d = [cx - hx, y1, cz];
        const e = [cx - hx, y0, cz + hz], f = [cx + hx, y0, cz + hz];
        quad(a, b, c, d, color); quad(f, e, d, c, color);
        // 妻側の三角（壁と同じ色にしたい場合は呼び出し側で box を重ねる）
        tri(a, d, e, color); tri(b, f, c, color);
        // 厚み（下面）
        const a2 = [cx - hx, y0 - thickness, cz - hz], b2 = [cx + hx, y0 - thickness, cz - hz], e2 = [cx - hx, y0 - thickness, cz + hz], f2 = [cx + hx, y0 - thickness, cz + hz];
        quad(b2, a2, a, b, shade(typeof color === 'number' ? color : 0x888888, 0.7)); quad(e2, f2, f, e, shade(typeof color === 'number' ? color : 0x888888, 0.7));
      } else {
        const a = [cx - hx, y0, cz - hz], b = [cx - hx, y0, cz + hz], c = [cx, y1, cz + hz], d = [cx, y1, cz - hz];
        const e = [cx + hx, y0, cz - hz], f = [cx + hx, y0, cz + hz];
        quad(b, a, d, c, color); quad(e, f, c, d, color);
        tri(a, b, c, color); tri(a, c, d, color); // ここは簡略（妻面は下の box が隠す）
        tri(f, e, d, color); tri(f, d, c, color);
      }
      return B;
    },
    /** 寄棟屋根（四方に傾斜、棟が x 方向に短く残る） */
    hipRoof(cx, y0, cz, sx, sz, height, color, overhang = 0.1) {
      const hx = sx / 2 + overhang, hz = sz / 2 + overhang, y1 = y0 + height;
      const r = Math.max(0.05, (sx - sz) / 2);
      const a = [cx - hx, y0, cz - hz], b = [cx + hx, y0, cz - hz], c = [cx + hx, y0, cz + hz], d = [cx - hx, y0, cz + hz];
      const r1 = [cx - r, y1, cz], r2 = [cx + r, y1, cz];
      quad(a, b, r2, r1, color); quad(c, d, r1, r2, color);
      tri(b, c, r2, color); tri(d, a, r1, color);
      quad(d, c, b, a, shade(typeof color === 'number' ? color : 0x888888, 0.7));
      return B;
    },
    cylinder(cx, y0, cz, r, h, color, seg = 6) {
      const y1 = y0 + h;
      for (let i = 0; i < seg; i++) {
        const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
        const a = [cx + r * Math.cos(t0), y0, cz + r * Math.sin(t0)], b = [cx + r * Math.cos(t1), y0, cz + r * Math.sin(t1)];
        const c = [cx + r * Math.cos(t1), y1, cz + r * Math.sin(t1)], d = [cx + r * Math.cos(t0), y1, cz + r * Math.sin(t0)];
        quad(b, a, d, c, color);
        tri([cx, y1, cz], d, c, color);
      }
      return B;
    },
    cone(cx, y0, cz, r, h, color, seg = 6, rTop = 0) {
      const y1 = y0 + h;
      for (let i = 0; i < seg; i++) {
        const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
        const a = [cx + r * Math.cos(t0), y0, cz + r * Math.sin(t0)], b = [cx + r * Math.cos(t1), y0, cz + r * Math.sin(t1)];
        if (rTop > 0) {
          const c = [cx + rTop * Math.cos(t1), y1, cz + rTop * Math.sin(t1)], d = [cx + rTop * Math.cos(t0), y1, cz + rTop * Math.sin(t0)];
          quad(b, a, d, c, color); tri([cx, y1, cz], d, c, color);
        } else tri(b, a, [cx, y1, cz], color);
      }
      return B;
    },
    /** 平らな板（地面の畑など） */
    slab(cx, y0, cz, sx, sz, color) {
      quad([cx - sx / 2, y0, cz - sz / 2], [cx + sx / 2, y0, cz - sz / 2], [cx + sx / 2, y0, cz + sz / 2], [cx - sx / 2, y0, cz + sz / 2], color);
      return B;
    },
    build() {
      return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), vertexCount: pos.length / 3 };
    },
  };
  return B;
}
