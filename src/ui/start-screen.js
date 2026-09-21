// 開始画面: 「はじめから」（国 → 都市 → シード → 難易度 → 大きさ → 着任）と「続きから」（スロット / ファイル）を切り替える。保存があれば「続きから」を先に開く。
import { hashString } from '../core/rng.js';
import { listSlots, loadFromSlot, setPendingLoad, importFromFile } from '../app/saves.js';

export function showStartScreen(reg) {
  return new Promise((resolve) => {
    const el = document.getElementById('start');
    const nationSel = el.querySelector('#start-nation'), citySel = el.querySelector('#start-city'), seedIn = el.querySelector('#start-seed'), sizeSel = el.querySelector('#start-size'), note = el.querySelector('#start-note');
    const diffSel = el.querySelector('#start-difficulty'), diffNote = el.querySelector('#start-diff-note');
    diffSel.innerHTML = reg.difficulties.map((d) => `<option value="${d.id}" ${d.id === 'normal' ? 'selected' : ''}>${d.name}</option>`).join('');
    const showDiff = () => { diffNote.textContent = reg.difficulties.find((d) => d.id === diffSel.value)?.desc || ''; };
    diffSel.addEventListener('change', showDiff); showDiff();
    nationSel.innerHTML = reg.nations.map((n) => `<option value="${n.id}">${n.name}</option>`).join('');
    const fillCities = () => {
      const n = reg.nationById.get(nationSel.value);
      citySel.innerHTML = n.startCities.map((cid) => { const c = reg.cityById.get(cid); return `<option value="${cid}">${c.name}${c.isCapital ? '（首都）' : ''}</option>`; }).join('');
      showNote();
    };
    const showNote = () => { const c = reg.cityById.get(citySel.value); note.textContent = c.note || ''; };
    nationSel.addEventListener('change', fillCities);
    citySel.addEventListener('change', showNote);
    seedIn.value = String(Math.floor(Math.random() * 1e9)); // 初期シードだけはブラウザ乱数で良い（以後はシード付き乱数）
    // 続きから（スロット / ファイル）
    const cont = el.querySelector('#start-continue');
    const slots = listSlots().filter((s) => !s.empty);
    cont.innerHTML = `<label>保存データ</label>${slots.length ? slots.map((s) => `<button class="btn wide" data-slot="${s.slot}">${s.slot === 'auto' ? 'オートセーブ' : `スロット ${s.slot}`}: ${s.meta.nationName}・${s.meta.cityName} ${s.meta.year < 0 ? '前' + -s.meta.year : s.meta.year}年${s.meta.month}月（人口 ${(s.meta.population || 0).toLocaleString('ja-JP')}）</button>`).join('') : '<div class="note">保存データはありません</div>'}<label class="btn wide">ファイルから読み込む<input type="file" accept=".json,application/json" data-import style="display:none"></label><div class="note" id="start-load-note"></div>`;
    cont.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => { const d = loadFromSlot(b.dataset.slot); if (d) { el.style.display = 'none'; resolve({ load: d }); } }));
    cont.querySelector('[data-import]').addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const d = await importFromFile(f); el.style.display = 'none'; resolve({ load: d }); } catch (err) { cont.querySelector('#start-load-note').textContent = `読み込めません: ${err.message}`; } });
    void setPendingLoad;
    // タブ切り替え
    const tabs = { new: el.querySelector('#start-tab-new'), continue: el.querySelector('#start-tab-continue') };
    const panes = { new: el.querySelector('#start-new'), continue: cont };
    const showTab = (k) => { for (const t of Object.keys(tabs)) { tabs[t].classList.toggle('active', t === k); tabs[t].setAttribute('aria-selected', t === k ? 'true' : 'false'); panes[t].style.display = t === k ? 'block' : 'none'; } };
    tabs.new.addEventListener('click', () => showTab('new'));
    tabs.continue.addEventListener('click', () => showTab('continue'));
    showTab(slots.length ? 'continue' : 'new');
    fillCities();
    el.querySelector('#start-btn').addEventListener('click', () => {
      const seedText = seedIn.value.trim();
      const seed = /^\d+$/.test(seedText) ? Number(seedText) >>> 0 : hashString(seedText || 'seed');
      el.style.display = 'none';
      resolve({ nationId: nationSel.value, cityId: citySel.value, seed, size: Number(sizeSel.value), difficulty: diffSel.value });
    });
  });
}
