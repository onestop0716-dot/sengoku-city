// Service Worker: オフラインでも起動できるようにファイルをキャッシュする。
// VERSION は公開時に置き換えられ（GitHub Actions が commit の SHA を入れる）、版が変わると古いキャッシュを消す。
const VERSION = '__BUILD__';
const CACHE = `sengoku-city-${VERSION}`;
const CORE = ['./', './index.html', './manifest.webmanifest', './src/main.js', './src/ui/styles.css', './assets/ui/advisor.png', './vendor/three/three.module.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sengoku-city-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
// 同じサイトの GET はキャッシュ優先。なければネットから取って保存する（版が変わればキャッシュごと入れ替わる）
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
    catch (err) { if (req.mode === 'navigate') { const idx = await c.match('./index.html'); if (idx) return idx; } throw err; }
  }));
});
