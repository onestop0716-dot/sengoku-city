// 設定パネル: 描画品質（高・中・低）。
import { QUALITIES, saveSettings } from '../app/settings.js';

export function createSettingsPanel(settings, onChange, { advisorFrequencies = null, advisorCharacters = null, onAdvisor = null } = {}) {
  const el = document.getElementById('settings');
  el.innerHTML = `<h3>設定</h3>
    <div class="row"><span>描画品質</span><label><input type="radio" name="quality" value="auto" ${settings.quality === 'auto' ? 'checked' : ''}> 自動</label>${Object.entries(QUALITIES).map(([k, q]) => `<label><input type="radio" name="quality" value="${k}" ${settings.quality === k ? 'checked' : ''}> ${q.name}</label>`).join('')}</div>
    <div class="row"><span>操作の確認</span><label><input type="checkbox" name="confirm" ${settings.confirmActions ? 'checked' : ''}> 区画や道路をドラッグした後に「決定」「取消」で確定する（タッチ端末向け）</label></div>
    <div class="note">自動: 端末に合わせて始め、動きが重くなったら段階的に下げます。高: 地形4分割・影2048 / 中: 2分割・影1024 / 低: 分割なし・影なし。</div>
    <div class="note" id="settings-fps"></div>
    ${advisorFrequencies ? `<div class="row"><span>案内役の助言</span>${Object.entries(advisorFrequencies).map(([k, f]) => `<label><input type="radio" name="advisor" value="${k}" ${settings.advisor === k ? 'checked' : ''}> ${f.name}</label>`).join('')}</div><div class="note">右下の案内役が状況に応じて助言します。「オフ」でも案内役を押せば「いまやるべきこと」は見られます。</div>` : ''}
    ${advisorCharacters?.length ? `<div class="row"><span>案内役</span>${advisorCharacters.map((c) => `<label title="${c.role}"><input type="radio" name="advisorCharacter" value="${c.id}" ${settings.advisorCharacter === c.id ? 'checked' : ''}> <img src="${c.images?.normal || c.image}" alt="" style="height:28px;vertical-align:middle;margin-right:2px"> ${c.name}</label>`).join('')}</div><div class="note">${advisorCharacters.map((c) => `${c.name}: ${c.role}`).join(' / ')}</div>` : ''}
    <button class="btn" id="settings-close">閉じる</button>`;
  el.querySelectorAll('input[name="quality"]').forEach((r) => r.addEventListener('change', () => { settings.quality = r.value; saveSettings(settings); onChange(settings); }));
  el.querySelector('input[name="confirm"]').addEventListener('change', (e) => { settings.confirmActions = e.target.checked; saveSettings(settings); });
  el.querySelectorAll('input[name="advisor"]').forEach((r) => r.addEventListener('change', () => { settings.advisor = r.value; saveSettings(settings); onAdvisor?.(settings); }));
  el.querySelectorAll('input[name="advisorCharacter"]').forEach((r) => r.addEventListener('change', () => { settings.advisorCharacter = r.value; saveSettings(settings); onAdvisor?.(settings); }));
  el.querySelector('#settings-close').addEventListener('click', () => { el.style.display = 'none'; });
  const fpsEl = el.querySelector('#settings-fps');
  return { toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; }, update(stats) { if (el.style.display === 'block' && stats) fpsEl.textContent = `描画 ${Math.round(stats.fps)} fps / 1日分の計算 ${stats.tickMs.toFixed(1)} ms`; } };
}
