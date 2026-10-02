// UI のアイコン（インライン SVG、外部素材なし）。アニメ調の太い線と単色の塗りで統一する。
// icon(id, size, color) で文字列を返す。色は currentColor が既定。
const P = {
  coin: '<circle cx="12" cy="12" r="8.5" fill="#e4b64a" stroke="#6b4a12" stroke-width="2"/><rect x="9" y="9" width="6" height="6" fill="#6b4a12"/>',
  grain: '<path d="M12 21 V8" stroke="#6b4a12" stroke-width="2.4" fill="none"/><path d="M12 9 C8 9 6 6 6 3 C9 3 12 5 12 9 Z M12 9 C16 9 18 6 18 3 C15 3 12 5 12 9 Z M12 14 C8 14 6 11 6 8 C9 8 12 10 12 14 Z M12 14 C16 14 18 11 18 8 C15 8 12 10 12 14 Z" fill="#e4b64a" stroke="#6b4a12" stroke-width="1.6"/>',
  wood: '<rect x="3" y="12" width="18" height="5" rx="2.5" fill="#a8743a" stroke="#4a3418" stroke-width="1.8"/><rect x="5" y="6.5" width="14" height="5" rx="2.5" fill="#c08a48" stroke="#4a3418" stroke-width="1.8"/><circle cx="19" cy="14.5" r="1.6" fill="#e8c890"/><circle cx="17" cy="9" r="1.6" fill="#e8c890"/>',
  stone: '<path d="M3 19 L5 12 L10 10 L12 14 L10 19 Z" fill="#a8a196" stroke="#3a3a36" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 19 L12 13 L17 8 L21 12 L20 19 Z" fill="#8a857c" stroke="#3a3a36" stroke-width="1.8" stroke-linejoin="round"/>',
  people: '<circle cx="9" cy="8" r="3.4" fill="#f0c9a0" stroke="#6b4a12" stroke-width="1.8"/><circle cx="16" cy="9" r="2.8" fill="#f0c9a0" stroke="#6b4a12" stroke-width="1.8"/><path d="M3 20 C3 15 6 13 9 13 C12 13 15 15 15 20 Z" fill="#c9403a" stroke="#6b4a12" stroke-width="1.8"/><path d="M14 20 C14.5 16 16 14.5 17.5 14.5 C19.5 14.5 21 16 21 20 Z" fill="#3d5a86" stroke="#6b4a12" stroke-width="1.8"/>',
  loyalty: '<path d="M12 20 C6 15 3 12 3 8.5 C3 6 5 4 7.5 4 C9.5 4 11 5 12 6.5 C13 5 14.5 4 16.5 4 C19 4 21 6 21 8.5 C21 12 18 15 12 20 Z" fill="#d9573f" stroke="#6b2a12" stroke-width="2"/>',
  security: '<path d="M12 2.5 L20 5.5 V11 C20 16 16.5 19.5 12 21.5 C7.5 19.5 4 16 4 11 V5.5 Z" fill="#4e7fb5" stroke="#1e3a5a" stroke-width="2"/><path d="M12 6 V18 M8 11 H16" stroke="#e6eef8" stroke-width="2"/>',
  select: '<path d="M6 3 L18 12 L12.5 13.5 L16 20 L13.5 21 L10 14.5 L6 18 Z" fill="#f3e9d2" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/>',
  road: '<path d="M4 20 L9 4 H15 L20 20 Z" fill="#8a7a62" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/><path d="M12 6 V9 M12 11 V14 M12 16 V19" stroke="#f3e9d2" stroke-width="2"/>',
  house: '<path d="M3 11 L12 3.5 L21 11" fill="none" stroke="#4a3418" stroke-width="2.4" stroke-linejoin="round"/><path d="M5 10.5 V20 H19 V10.5" fill="#d9a85c" stroke="#4a3418" stroke-width="2"/><rect x="10" y="14" width="4" height="6" fill="#4a3418"/>',
  farm: '<path d="M3 20 H21" stroke="#4a3418" stroke-width="2"/><path d="M6 20 V13 M12 20 V9 M18 20 V13" stroke="#6b8f32" stroke-width="2.4"/><path d="M12 9 C9 9 7 7 7 4 C10 4 12 6 12 9 Z M12 12 C15 12 17 10 17 7 C14 7 12 9 12 12 Z" fill="#8fc24a" stroke="#3d5a1e" stroke-width="1.6"/>',
  market: '<path d="M3 9 L5 4 H19 L21 9 Z" fill="#c9403a" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/><path d="M4 9 V20 H20 V9" fill="#e8d7ad" stroke="#4a3418" stroke-width="2"/><rect x="7" y="13" width="4" height="7" fill="#4a3418"/><rect x="13" y="12" width="4" height="4" fill="#4e7fb5"/>',
  workshop: '<path d="M14 4 L20 10 L10 20 L4 14 Z" fill="#8a7a62" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/><path d="M15 9 L9 15" stroke="#f3e9d2" stroke-width="2"/><rect x="2.5" y="16" width="4" height="6" fill="#4a3418"/>',
  military: '<path d="M5 19 L16 8" stroke="#c0c6ce" stroke-width="3"/><path d="M15 5 L19 9" stroke="#4a3418" stroke-width="3"/><path d="M4 20 L7 17" stroke="#6b4a12" stroke-width="4"/><path d="M6 5 H11 L9 7 L11 9 H6 Z" fill="#c9403a" stroke="#4a3418" stroke-width="1.5"/>',
  build: '<path d="M4 20 L11 13" stroke="#6b4a12" stroke-width="3"/><path d="M9 6 L14 3 L21 10 L18 15 Z" fill="#8a7a62" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/>',
  demolish: '<path d="M5 5 L19 19 M19 5 L5 19" stroke="#c9403a" stroke-width="3.5" stroke-linecap="round"/>',
  water: '<path d="M12 3 C12 3 5.5 11 5.5 15 A6.5 6.5 0 0 0 18.5 15 C18.5 11 12 3 12 3 Z" fill="#5aa8e0" stroke="#1e3a5a" stroke-width="2"/>',
  admin: '<path d="M3 9 L12 3 L21 9" fill="none" stroke="#4a3418" stroke-width="2.4"/><path d="M5 9 H19 V20 H5 Z" fill="#b74a3a" stroke="#4a3418" stroke-width="2"/><path d="M8 12 V20 M12 12 V20 M16 12 V20" stroke="#4a3418" stroke-width="1.6"/>',
  storage: '<path d="M6 7 H18 L17 21 H7 Z" fill="#d9a85c" stroke="#4a3418" stroke-width="2"/><path d="M5 7 L12 3 L19 7" fill="none" stroke="#4a3418" stroke-width="2"/>',
  defense: '<path d="M3 20 V9 H6 V6 H9 V9 H15 V6 H18 V9 H21 V20 Z" fill="#a89a80" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/><path d="M10 20 V14 H14 V20" fill="#4a3418"/>',
  temple: '<path d="M2 8 L12 3 L22 8" fill="none" stroke="#4a3418" stroke-width="2.4"/><path d="M5 9 H19 M7 9 V19 M12 9 V19 M17 9 V19 M4 19 H20" stroke="#4a3418" stroke-width="2"/><path d="M7 9 H17 V19 H7 Z" fill="#e8d7ad" stroke="none"/>',
  trade: '<path d="M3 15 L5 20 H19 L21 15 Z" fill="#8a6a42" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/><path d="M12 3 V15 M12 4 L19 10 H12" fill="#f3e9d2" stroke="#4a3418" stroke-width="2"/>',
  gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  menu: '<path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  map: '<path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z" fill="#e8d7ad" stroke="#4a3418" stroke-width="2" stroke-linejoin="round"/><path d="M9 4 V18 M15 6 V20" stroke="#4a3418" stroke-width="1.5"/>',
  flag: '<path d="M6 3 V21" stroke="#4a3418" stroke-width="2.4"/><path d="M6 4 H18 L15 8 L18 12 H6 Z" fill="#c9403a" stroke="#4a3418" stroke-width="1.8"/>',
  pause: '<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>',
  play: '<path d="M7 4 L19 12 L7 20 Z" fill="currentColor"/>',
  warn: '<path d="M12 3 L22 20 H2 Z" fill="#e4b64a" stroke="#6b4a12" stroke-width="2" stroke-linejoin="round"/><path d="M12 9 V14 M12 16.5 V17.5" stroke="#6b4a12" stroke-width="2.4" stroke-linecap="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="#4e7fb5" stroke="#1e3a5a" stroke-width="2"/><path d="M12 10 V17 M12 7.5 V8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
};
export const ICON_IDS = Object.keys(P);
export function icon(id, size = 20, cls = '') {
  const p = P[id] || P.info;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${p}</svg>`;
}
/** 特殊建築のカテゴリ → アイコン */
export const STRUCT_ICON = { water: 'water', admin: 'admin', storage: 'storage', market: 'market', defense: 'defense', military: 'military', temple: 'temple', trade: 'trade', road: 'road' };
