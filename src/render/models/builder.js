// 三角形を積み上げてローポリ形状を作るビルダー。Three.js に依存しない（テスト可能）。
// 座標系: x/z が水平、y が上。建物は足元 y=0、中心 (0,0) に置く。色は頂点色（リニア）。
// 面取り箱・反りのある屋根・回転体（滑らかな法線）を持つ。

export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function rgb(hex) { return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)]; }
export function shade(hex, f) { const [r, g, b] = rgb(hex); const c = (v) => Math.max(0, Math.min(1, v * f)); return [c(r), c(g), c(b)]; }
const toCol = (c) => (typeof c === 'number' ? rgb(c) : c);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

export function createBuilder() {
  const pos = [], nor = [], col = [];
  const push = (p, n, c) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]); };
  const tri = (a, b, c, color) => {
    const raw = cross(sub(b, a), sub(c, a));
    if (Math.hypot(raw[0], raw[1], raw[2]) < 1e-9) return;   // 潰れた三角形は捨てる
    const n = norm(raw);
    const cc = toCol(color);
    push(a, n, cc); push(b, n, cc); push(c, n, cc);
  };
  const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };
  /** 頂点ごとに法線を指定する四角形（滑らかな面用） */
  const quadN = (a, b, c, d, na, nb, nc, nd, color) => {
    const cc = toCol(color);
    const geo = cross(sub(b, a), sub(c, a));
    if (dot(geo, na) < 0) { [b, d] = [d, b]; [nb, nd] = [nd, nb]; }   // 表裏を法線に合わせる
    push(a, na, cc); push(b, nb, cc); push(c, nc, cc);
    push(a, na, cc); push(c, nc, cc); push(d, nd, cc);
  };
  /** 外向きになるよう向きを直してから三角形を追加 */
  const triOut = (a, b, c, color, center) => {
    const n = cross(sub(b, a), sub(c, a));
    const mid = [(a[0] + b[0] + c[0]) / 3 - center[0], (a[1] + b[1] + c[1]) / 3 - center[1], (a[2] + b[2] + c[2]) / 3 - center[2]];
    if (dot(n, mid) < 0) tri(a, c, b, color); else tri(a, b, c, color);
  };
  const rotXZ = (cx, cz, rotY) => { const c = Math.cos(rotY), s = Math.sin(rotY); return (x, y, z) => [cx + x * c - z * s, y, cz + x * s + z * c]; };

  const B = {
    tri, quad, quadN,
    /** 直方体（中心 cx,cz、底面 y0） */
    box(cx, y0, cz, sx, sy, sz, color, rotY = 0) { return B.chamferBox(cx, y0, cz, sx, sy, sz, color, { chamfer: 0, rotY }); },
    /** 面取りした直方体 */
    chamferBox(cx, y0, cz, sx, sy, sz, color, { chamfer = 0.03, rotY = 0, topColor = null } = {}) {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2, cy = y0 + hy;
      const c = Math.min(chamfer, hx * 0.45, hy * 0.45, hz * 0.45);
      const P = rotXZ(cx, cz, rotY);
      const pt = (x, y, z) => P(x, cy + y, z);
      const center = [cx, cy, cz];
      if (c <= 0) {
        const p = (sx_, sy_, sz_) => pt(sx_ * hx, sy_ * hy, sz_ * hz);
        const faces = [
          [p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1), topColor || color], [p(-1, -1, 1), p(1, -1, 1), p(1, -1, -1), p(-1, -1, -1), color],
          [p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1), color], [p(1, -1, 1), p(-1, -1, 1), p(-1, 1, 1), p(1, 1, 1), color],
          [p(1, -1, -1), p(1, -1, 1), p(1, 1, 1), p(1, 1, -1), color], [p(-1, -1, 1), p(-1, -1, -1), p(-1, 1, -1), p(-1, 1, 1), color],
        ];
        for (const [a, b_, c_, d, col_] of faces) quad(a, b_, c_, d, col_);
        return B;
      }
      // 各角に3点（x面・y面・z面に属する点）
      const cornerPts = (sx_, sy_, sz_) => ({
        x: pt(sx_ * hx, sy_ * (hy - c), sz_ * (hz - c)), y: pt(sx_ * (hx - c), sy_ * hy, sz_ * (hz - c)), z: pt(sx_ * (hx - c), sy_ * (hy - c), sz_ * hz),
      });
      const K = {};
      for (const sx_ of [-1, 1]) for (const sy_ of [-1, 1]) for (const sz_ of [-1, 1]) K[`${sx_},${sy_},${sz_}`] = cornerPts(sx_, sy_, sz_);
      const g = (sx_, sy_, sz_) => K[`${sx_},${sy_},${sz_}`];
      const q = (a, b_, c_, d, col_) => { triOut(a, b_, c_, col_, center); triOut(a, c_, d, col_, center); };
      // 6面
      q(g(1, -1, -1).x, g(1, -1, 1).x, g(1, 1, 1).x, g(1, 1, -1).x, color); q(g(-1, -1, -1).x, g(-1, -1, 1).x, g(-1, 1, 1).x, g(-1, 1, -1).x, color);
      q(g(-1, 1, -1).y, g(1, 1, -1).y, g(1, 1, 1).y, g(-1, 1, 1).y, topColor || color); q(g(-1, -1, -1).y, g(1, -1, -1).y, g(1, -1, 1).y, g(-1, -1, 1).y, color);
      q(g(-1, -1, 1).z, g(1, -1, 1).z, g(1, 1, 1).z, g(-1, 1, 1).z, color); q(g(-1, -1, -1).z, g(1, -1, -1).z, g(1, 1, -1).z, g(-1, 1, -1).z, color);
      // 12辺
      for (const sy_ of [-1, 1]) for (const sz_ of [-1, 1]) q(g(-1, sy_, sz_).y, g(1, sy_, sz_).y, g(1, sy_, sz_).z, g(-1, sy_, sz_).z, color);   // x方向の辺（y-z）
      for (const sx_ of [-1, 1]) for (const sz_ of [-1, 1]) q(g(sx_, -1, sz_).x, g(sx_, 1, sz_).x, g(sx_, 1, sz_).z, g(sx_, -1, sz_).z, color);   // y方向の辺（x-z）
      for (const sx_ of [-1, 1]) for (const sy_ of [-1, 1]) q(g(sx_, sy_, -1).x, g(sx_, sy_, 1).x, g(sx_, sy_, 1).y, g(sx_, sy_, -1).y, color);   // z方向の辺（x-y）
      // 8隅
      for (const sx_ of [-1, 1]) for (const sy_ of [-1, 1]) for (const sz_ of [-1, 1]) { const k = g(sx_, sy_, sz_); triOut(k.x, k.y, k.z, color, center); }
      return B;
    },
    /**
     * 反りのある切妻屋根（瓦の縦筋つき）。ridgeAxis='x' なら棟が x 方向。
     * curve>1 で軒先が上向きに反る。tileStripes=false なら茅葺きの無地。
     */
    curvedRoof(cx, y0, cz, sx, sz, height, color, { ridgeAxis = 'x', overhang = 0.1, strips = 7, curve = 1.6, tileStripes = true, thickness = 0.045, gableColor = null, ridgeColor = null, rotY = 0 } = {}) {
      const P = rotXZ(cx, cz, rotY);
      const roofCenter = [cx, y0 + height * 0.25, cz];
      const qOut = (a, b, c, d, col_) => { triOut(a, b, c, col_, roofCenter); triOut(a, c, d, col_, roofCenter); };
      const along = ridgeAxis === 'x';                       // 棟方向
      const L = (along ? sx : sz) / 2 + overhang;            // 棟方向の半長
      const W = (along ? sz : sx) / 2 + overhang;            // 傾斜方向の半長
      const prof = (t) => [t * W, height * Math.pow(1 - t, curve)];   // [水平, 高さ]
      const N = Math.max(3, strips);
      const cols = Math.max(2, Math.round(L * 2 / 0.16));    // 瓦の列数
      const light = shade(typeof color === 'number' ? color : 0x888888, 1.08), dark = shade(typeof color === 'number' ? color : 0x888888, 0.9);
      const baseCol = toCol(color);
      const pt = (u, s, side, dy = 0) => {                   // u: 棟方向 -L..L、s: 傾斜方向の距離、side: ±1
        const [d, hgt] = prof(s / W);
        return along ? P(u, y0 + hgt + dy, side * d) : P(side * d, y0 + hgt + dy, u);
      };
      const nrm = (s, side) => {                              // 傾斜方向の接線から法線（上向き）
        const e = 0.01, t = s / W;
        const [d0, h0] = prof(Math.max(0, t - e)), [d1, h1] = prof(Math.min(1, t + e));
        const dd = d1 - d0, dh = h1 - h0;                     // dd>0, dh<0
        return norm(along ? [0, dd, -side * dh] : [-side * dh, dd, 0]);
      };
      for (const side of [-1, 1]) {
        for (let i = 0; i < N; i++) {
          const s0 = (i / N) * W, s1 = ((i + 1) / N) * W;
          const n0 = nrm(s0, side), n1 = nrm(s1, side);
          for (let k = 0; k < cols; k++) {
            const u0 = -L + (2 * L * k) / cols, u1 = -L + (2 * L * (k + 1)) / cols;
            const cc = tileStripes ? (k % 2 ? dark : light) : baseCol;
            const a = pt(u0, s0, side), b = pt(u1, s0, side), c = pt(u1, s1, side), d = pt(u0, s1, side);
            if (side === 1) quadN(a, b, c, d, n0, n0, n1, n1, cc); else quadN(b, a, d, c, n0, n0, n1, n1, cc);
          }
        }
        // 軒先の厚み
        const e0 = pt(-L, W, side), e1 = pt(L, W, side), e0b = pt(-L, W, side, -thickness), e1b = pt(L, W, side, -thickness);
        qOut(e0b, e1b, e1, e0, dark);
      }
      // 棟
      const rc = ridgeColor ? toCol(ridgeColor) : dark;
      const r0 = pt(-L, 0, 1, 0.035), r1 = pt(L, 0, 1, 0.035), r0b = pt(-L, 0.045, 1, 0.0), r1b = pt(L, 0.045, 1, 0.0), r0c = pt(-L, 0.045, -1, 0.0), r1c = pt(L, 0.045, -1, 0.0);
      qOut(r0b, r1b, r1, r0, rc); qOut(r1c, r0c, r0, r1, rc);
      // 妻（両端）を反った輪郭で埋める
      const gc = gableColor ? toCol(gableColor) : dark;
      for (const end of [-1, 1]) {
        const u = end * (L - overhang * 0.99);
        const ring = [];
        for (let i = 0; i <= N; i++) ring.push(pt(u, (i / N) * W, 1, -thickness));
        for (let i = N; i >= 0; i--) ring.push(pt(u, (i / N) * W, -1, -thickness));
        const base = pt(u, 0, 1, -thickness);
        for (let i = 0; i < ring.length - 1; i++) triOut(base, ring[i], ring[i + 1], gc, roofCenter);
      }
      return B;
    },
    /** 反りのある寄棟屋根（四方に傾斜）。 */
    curvedHipRoof(cx, y0, cz, sx, sz, height, color, { overhang = 0.12, strips = 6, curve = 1.6, ridgeColor = null } = {}) {
      const hx = sx / 2 + overhang, hz = sz / 2 + overhang;
      const roofCenter = [cx, y0 + height * 0.2, cz];
      const qOut = (a, b, c, d, col_) => { triOut(a, b, c, col_, roofCenter); triOut(a, c, d, col_, roofCenter); };
      const ridge = Math.max(0.06, (sx - sz) / 2);           // 棟の半長（x 方向）
      const prof = (t) => Math.pow(1 - t, curve) * height;
      const N = strips;
      const light = shade(typeof color === 'number' ? color : 0x888888, 1.08), dark = shade(typeof color === 'number' ? color : 0x888888, 0.9);
      // 傾斜 t（0=棟,1=軒）での外形（矩形）: x半長 = ridge + (hx-ridge)t, z半長 = hz t
      const outline = (t) => [ridge + (hx - ridge) * t, hz * t];
      const P = (x, t, zsign, xsign, which) => {              // which: 'z' 面（前後）/ 'x' 面（左右）
        const [ox, oz] = outline(t);
        if (which === 'z') return [cx + x, y0 + prof(t), cz + zsign * oz];
        return [cx + xsign * ox, y0 + prof(t), cz + x];
      };
      const cols = Math.max(2, Math.round(hx * 2 / 0.16));
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;
        // 前後の面
        for (const zs of [-1, 1]) for (let k = 0; k < cols; k++) {
          const [ox0] = outline(t0), [ox1] = outline(t1);
          const a = P(-ox0 + (2 * ox0 * k) / cols, t0, zs, 0, 'z'), b = P(-ox0 + (2 * ox0 * (k + 1)) / cols, t0, zs, 0, 'z');
          const c = P(-ox1 + (2 * ox1 * (k + 1)) / cols, t1, zs, 0, 'z'), d = P(-ox1 + (2 * ox1 * k) / cols, t1, zs, 0, 'z');
          qOut(a, b, c, d, k % 2 ? dark : light);
        }
        // 左右の面（三角形に近い）
        for (const xs of [-1, 1]) {
          const [, oz0] = outline(t0), [, oz1] = outline(t1);
          const a = P(-oz0, t0, 0, xs, 'x'), b = P(oz0, t0, 0, xs, 'x'), c = P(oz1, t1, 0, xs, 'x'), d = P(-oz1, t1, 0, xs, 'x');
          qOut(a, b, c, d, dark);
        }
      }
      // 棟
      const rc = ridgeColor ? toCol(ridgeColor) : dark;
      B.box(cx, y0 + height - 0.01, cz, ridge * 2 + 0.06, 0.05, 0.08, rc);
      // 軒裏（底面）
      const [ex, ez] = outline(1);
      qOut([cx - ex, y0 - 0.04, cz + ez], [cx + ex, y0 - 0.04, cz + ez], [cx + ex, y0 - 0.04, cz - ez], [cx - ex, y0 - 0.04, cz - ez], dark);
      for (const [a, b_] of [[[cx - ex, cz - ez], [cx + ex, cz - ez]], [[cx + ex, cz - ez], [cx + ex, cz + ez]], [[cx + ex, cz + ez], [cx - ex, cz + ez]], [[cx - ex, cz + ez], [cx - ex, cz - ez]]]) {
        qOut([a[0], y0, a[1]], [b_[0], y0, b_[1]], [b_[0], y0 - 0.04, b_[1]], [a[0], y0 - 0.04, a[1]], dark);
      }
      return B;
    },
    /** 回転体。profile は [[半径, 高さ], ...]（下から上）。法線は滑らか。 */
    lathe(cx, y0, cz, profile, color, seg = 8, { colors = null, twist = 0 } = {}) {
      const cc = toCol(color);
      const n = profile.length;
      const nrmAt = (i) => {
        const p0 = profile[Math.max(0, i - 1)], p1 = profile[Math.min(n - 1, i + 1)];
        const dr = p1[0] - p0[0], dy = p1[1] - p0[1];
        const l = Math.hypot(dr, dy) || 1;
        return [dy / l, -dr / l];                            // (径方向, 上方向)
      };
      for (let i = 0; i < n - 1; i++) {
        const [r0, h0] = profile[i], [r1, h1] = profile[i + 1];
        const [nr0, ny0] = nrmAt(i), [nr1, ny1] = nrmAt(i + 1);
        const c0 = colors ? toCol(colors[i]) : cc, c1 = colors ? toCol(colors[i + 1]) : cc;
        for (let k = 0; k < seg; k++) {
          const t0 = (k / seg) * Math.PI * 2 + twist * i, t1 = ((k + 1) / seg) * Math.PI * 2 + twist * i;
          const t0b = t0 + twist, t1b = t1 + twist;
          const a = [cx + r0 * Math.cos(t0), y0 + h0, cz + r0 * Math.sin(t0)], b = [cx + r0 * Math.cos(t1), y0 + h0, cz + r0 * Math.sin(t1)];
          const c = [cx + r1 * Math.cos(t1b), y0 + h1, cz + r1 * Math.sin(t1b)], d = [cx + r1 * Math.cos(t0b), y0 + h1, cz + r1 * Math.sin(t0b)];
          const na = [nr0 * Math.cos(t0), ny0, nr0 * Math.sin(t0)], nb = [nr0 * Math.cos(t1), ny0, nr0 * Math.sin(t1)];
          const nc = [nr1 * Math.cos(t1b), ny1, nr1 * Math.sin(t1b)], nd = [nr1 * Math.cos(t0b), ny1, nr1 * Math.sin(t0b)];
          push(b, nb, c0); push(a, na, c0); push(d, nd, c1);
          push(b, nb, c0); push(d, nd, c1); push(c, nc, c1);
        }
      }
      // 上端・下端を閉じる
      const top = profile[n - 1], bot = profile[0];
      if (top[0] > 0.001) for (let k = 0; k < seg; k++) { const t0 = (k / seg) * Math.PI * 2 + twist * (n - 1), t1 = ((k + 1) / seg) * Math.PI * 2 + twist * (n - 1); tri([cx, y0 + top[1], cz], [cx + top[0] * Math.cos(t1), y0 + top[1], cz + top[0] * Math.sin(t1)], [cx + top[0] * Math.cos(t0), y0 + top[1], cz + top[0] * Math.sin(t0)], colors ? colors[n - 1] : color); }
      if (bot[0] > 0.001) for (let k = 0; k < seg; k++) { const t0 = (k / seg) * Math.PI * 2, t1 = ((k + 1) / seg) * Math.PI * 2; tri([cx, y0 + bot[1], cz], [cx + bot[0] * Math.cos(t0), y0 + bot[1], cz + bot[0] * Math.sin(t0)], [cx + bot[0] * Math.cos(t1), y0 + bot[1], cz + bot[0] * Math.sin(t1)], colors ? colors[0] : color); }
      return B;
    },
    /** 球っぽい塊（回転体） */
    blob(cx, cy, cz, rx, ry, color, seg = 8, rings = 6, squash = 1) {
      const prof = [];
      for (let i = 0; i <= rings; i++) { const t = -Math.PI / 2 + (Math.PI * i) / rings; prof.push([Math.max(0, Math.cos(t) * rx), Math.sin(t) * ry * squash]); }
      return B.lathe(cx, cy, cz, prof, color, seg);
    },
    cylinder(cx, y0, cz, r, h, color, seg = 8, rTop = null) { return B.lathe(cx, y0, cz, [[r, 0], [rTop ?? r, h]], color, seg); },
    cone(cx, y0, cz, r, h, color, seg = 8, rTop = 0) { return B.lathe(cx, y0, cz, [[r, 0], [rTop, h]], color, seg); },
    /** 平らな板 */
    slab(cx, y0, cz, sx, sz, color) {
      quad([cx - sx / 2, y0, cz - sz / 2], [cx - sx / 2, y0, cz + sz / 2], [cx + sx / 2, y0, cz + sz / 2], [cx + sx / 2, y0, cz - sz / 2], color);
      return B;
    },
    /** 壁面に貼る暗い四角（戸・窓）。面の法線方向 dir に少し浮かせる */
    panel(cx, y0, cz, sw, sh, dir, color, rotY = 0) {
      const P = rotXZ(cx, cz, rotY);
      const e = 0.006;
      const along = dir === 'z+' || dir === 'z-';
      const s = dir.endsWith('+') ? 1 : -1;
      const p = (u, y) => along ? P(u, y0 + y, s * e) : P(s * e, y0 + y, u);
      const a = p(-sw / 2, 0), b = p(sw / 2, 0), c = p(sw / 2, sh), d = p(-sw / 2, sh);
      const outward = along ? P(0, y0, s * 10) : P(s * 10, y0, 0);
      const inner = [2 * a[0] - outward[0] + a[0] * 0, 0, 0];
      const centerIn = [a[0] + (a[0] - outward[0]) * 0.01, y0, a[2] + (a[2] - outward[2]) * 0.01];
      void inner;
      triOut(a, b, c, color, centerIn); triOut(a, c, d, color, centerIn);
      return B;
    },
    build() {
      return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), vertexCount: pos.length / 3 };
    },
  };
  return B;
}
