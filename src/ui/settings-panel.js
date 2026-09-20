// 設定パネル: 描画品質（高・中・低）。
import { QUALITIES, saveSettings } from '../app/settings.js';

export function createSettingsPanel(settings, onChange, { advisorFrequencies = null, onAdvisor = null } = {}) {
  const el = document.getElementById('settings');
  el.innerHTML = `<h3>設定</h3>
    <div class="row"><span>描画品質</span>${Object.entries(QUALITIES).map(([k, q]) => `<label><input type="radio" name="quality" value="${k}" ${settings.quality === k ? 'checked' : ''}> ${q.name}</label>`).join('')}</div>
    <div class="note">高: 地形4分割・影2048 / 中: 2分割・影1024 / 低: 分割なし・影なし。動きが重いときは下げてください。</div>
    <div class="note" id="settings-fps"></div>
    ${advisorFrequencies ? `<div class="row"><span>案内役の助言</span>${Object.entries(advisorFrequencies).map(([k, f]) => `<label><input type="radio" name="advisor" value="${k}" ${settings.advisor === k ? 'checked' : ''}> ${f.name}</label>`).join('')}</div><div class="note">右下の書記官が状況に応じて助言します。「オフ」でも書記官を押せば「いまやるべきこと」は見られます。</div>` : ''}
    <button class="btn" id="settings-close">閉じる</button>`;
  el.querySelectorAll('input[name="quality"]').forEach((r) => r.addEventListener('change', () => { settings.quality = r.value; saveSettings(settings); onChange(settings); }));
  el.querySelectorAll('input[name="advisor"]').forEach((r) => r.addEventListener('change', () => { settings.advisor = r.value; saveSettings(settings); onAdvisor?.(settings); }));
  el.querySelector('#settings-close').addEventListener('click', () => { el.style.display = 'none'; });
  const fpsEl = el.querySelector('#settings-fps');
  return { toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; }, update(stats) { if (el.style.display === 'block' && stats) fpsEl.textContent = `描画 ${Math.round(stats.fps)} fps / 1日分の計算 ${stats.tickMs.toFixed(1)} ms`; } };
}
