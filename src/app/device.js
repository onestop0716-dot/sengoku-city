// 端末の判定と初期の描画品質。iPad（Safari）は Macintosh を名乗ることがあるので、タッチ点の数でも判定する。
export function detectDevice() {
  const ua = navigator.userAgent || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const touch = coarse || touchPoints > 1;
  const memory = navigator.deviceMemory || (isIOS ? 4 : 8);
  const cores = navigator.hardwareConcurrency || (isIOS ? 6 : 4);
  const standalone = window.navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  // 初期品質: iPad や省メモリ端末は「中」から、それ以外は「高」から始めて、fps を見て自動で下げる
  let initialQuality = 'high';
  if (isIOS || touch || memory <= 4 || cores <= 4) initialQuality = 'medium';
  if (memory <= 2) initialQuality = 'low';
  return { ua, touch, isIOS, isIPad, memory, cores, standalone, initialQuality, pixelRatioCap: isIOS ? 1.5 : 2 };
}
