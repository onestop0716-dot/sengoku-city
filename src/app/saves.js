// セーブ: localStorage のスロット（1〜5 + オートセーブ）、ファイルの書き出し・読み込み（PC と iPad で同じ JSON）。
import { serializeWorld } from '../sim/save/serialize.js';

const PREFIX = 'sengoku-city.save.';
export const SLOTS = ['auto', '1', '2', '3', '4', '5'];
const store = () => { try { return globalThis.localStorage; } catch { return null; } };

export function slotKey(slot) { return PREFIX + slot; }

/** スロットの一覧（メタ情報だけ） */
export function listSlots() {
  const s = store(); if (!s) return [];
  return SLOTS.map((slot) => {
    try { const raw = s.getItem(slotKey(slot)); if (!raw) return { slot, empty: true }; const d = JSON.parse(raw); return { slot, empty: false, meta: d.meta || {} }; } catch { return { slot, empty: true }; }
  });
}

export function makeSaveData(world, reg) {
  const data = serializeWorld(world);
  data.meta = { cityName: reg.cityById.get(world.cityId)?.name, nationName: reg.nationById.get(world.nationId)?.name, year: world.calendar.year, month: world.calendar.month, day: world.day, population: world.population.total, rank: reg.rankById?.get(world.rank || 'magistrate')?.name, savedAt: new Date().toISOString(), size: world.map.w, difficulty: world.difficulty };
  return data;
}

export function saveToSlot(world, reg, slot) {
  const s = store(); if (!s) return { ok: false, message: 'この環境では保存できません' };
  try { s.setItem(slotKey(slot), JSON.stringify(makeSaveData(world, reg))); return { ok: true }; }
  catch (e) { return { ok: false, message: `保存できませんでした（容量不足の可能性）: ${e.message}` }; }
}
export function loadFromSlot(slot) {
  const s = store(); if (!s) return null;
  const raw = s.getItem(slotKey(slot)); if (!raw) return null;
  return JSON.parse(raw);
}
export function deleteSlot(slot) { store()?.removeItem(slotKey(slot)); }

/** 読み込むデータを次の起動に渡す（ページを読み直して世界を作り直す） */
export function setPendingLoad(data) { try { sessionStorage.setItem('sengoku-city.pendingLoad', JSON.stringify(data)); return true; } catch { return false; } }
export function takePendingLoad() { try { const raw = sessionStorage.getItem('sengoku-city.pendingLoad'); if (!raw) return null; sessionStorage.removeItem('sengoku-city.pendingLoad'); return JSON.parse(raw); } catch { return null; } }

export function fileName(world, reg) {
  const m = makeSaveData(world, reg).meta;
  return `sengoku-city_${m.nationName}${m.cityName}_${m.year < 0 ? '前' + -m.year : m.year}年.json`;
}

/** ファイルに書き出す。共有シートが使えれば（iPad）それを、なければダウンロード */
export async function exportToFile(world, reg) {
  const text = JSON.stringify(makeSaveData(world, reg));
  const name = fileName(world, reg);
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return { ok: true, via: 'share' }; } catch (e) { if (e.name === 'AbortError') return { ok: false, message: '共有を取り消しました' }; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { ok: true, via: 'download' };
}

/** ファイルを読む（内容を JSON として返す） */
export function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(String(r.result)); if (!d.version || !d.map) throw new Error('セーブデータの形式ではありません'); resolve(d); } catch (e) { reject(e); } };
    r.onerror = () => reject(new Error('ファイルを読めませんでした'));
    r.readAsText(file);
  });
}
