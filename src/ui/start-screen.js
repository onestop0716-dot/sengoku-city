// 開始画面: 国 → 都市 → シード → 開始。
import { hashString } from '../core/rng.js';

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
    fillCities();
    el.querySelector('#start-btn').addEventListener('click', () => {
      const seedText = seedIn.value.trim();
      const seed = /^\d+$/.test(seedText) ? Number(seedText) >>> 0 : hashString(seedText || 'seed');
      el.style.display = 'none';
      resolve({ nationId: nationSel.value, cityId: citySel.value, seed, size: Number(sizeSel.value), difficulty: diffSel.value });
    });
  });
}
