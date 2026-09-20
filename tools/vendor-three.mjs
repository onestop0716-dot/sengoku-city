// Three.js を vendor/three/ に同梱し、index.html の import map を差し替える。
// 使い方: npm run vendor:three   （ネットワーク接続が必要）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.env.THREE_VERSION || '0.160.0';
const base = `https://cdn.jsdelivr.net/npm/three@${VERSION}`;
const files = ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'LICENSE'];

for (const f of files) {
  const res = await fetch(`${base}/${f}`);
  if (!res.ok) throw new Error(`取得失敗: ${f} (${res.status})`);
  const out = path.join(root, 'vendor/three', f.replace('build/', '').replace('examples/jsm/', 'addons/'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await res.text());
  console.log('saved', out);
}
const html = path.join(root, 'index.html');
let s = fs.readFileSync(html, 'utf8');
s = s.replace(/"three":\s*"[^"]+"/, '"three": "./vendor/three/three.module.js"')
     .replace(/"three\/addons\/":\s*"[^"]+"/, '"three/addons/": "./vendor/three/addons/"');
fs.writeFileSync(html, s);
console.log(`index.html の import map を vendor/three/ に向けました。CREDITS.md にバージョン ${VERSION} を記録してください。`);
