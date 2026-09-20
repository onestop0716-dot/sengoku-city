// Service Worker の登録と更新の通知。更新版が入ったら画面上部に「再読み込み」を出す。
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  const showUpdate = (reg) => {
    let bar = document.getElementById('update-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'update-bar'; document.body.appendChild(bar); }
    bar.innerHTML = '新しい版があります。<button class="btn" id="update-btn">再読み込み</button>';
    bar.style.display = 'flex';
    bar.querySelector('#update-btn').addEventListener('click', () => { reg.waiting?.postMessage({ type: 'SKIP_WAITING' }); });
  };
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener('updatefound', () => { const nw = reg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg); }); });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (e) { console.warn('Service Worker を登録できませんでした', e); }
  });
}
