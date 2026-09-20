// 設定パネル: 描画品質（高・中・低）。
import { QUALITIES, saveSettings } from '../app/settings.js';

export function createSettingsPanel(settings, onChange) {
  const el = document.getElementById('settings');
  el.innerHTML = `<h3>設定</h3>
    <div class="row"><span>描画品質</span>${Object.entries(QUALITIES).map(([k, q]) => `<label><input type="radio" name="quality" value="${k}" ${settings.quality === k ? 'checked' : ''}> ${q.name}</label>`).join('')}</div>
    <div class="note">高: 地形4分割・影2048 / 中: 2分割・影1024 / 低: 分割なし・影なし。動きが重いときは下げてください。</div>
    <button class="btn" id="settings-close">閉じる</button>`;
  el.querySelectorAll('input[name="quality"]').forEach((r) => r.addEventListener('change', () => { settings.quality = r.value; saveSettings(settings); onChange(settings); }));
  el.querySelector('#settings-close').addEventListener('click', () => { el.style.display = 'none'; });
  return { toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; } };
}
