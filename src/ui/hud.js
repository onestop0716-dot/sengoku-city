// 上部バー: 日付・銭・住居の収容数・速度。
import { formatDate } from '../sim/calendar.js';

export function createHud(world, reg, loop, tooltip, onSettings) {
  const el = document.getElementById('hud');
  const nation = reg.nationById.get(world.nationId), city = reg.cityById.get(world.cityId);
  const speeds = reg.balance.time.speeds;
  el.innerHTML = `
    <div class="stat"><span>${nation.name}・${city.name}</span></div>
    <div class="stat"><span id="hud-date"></span></div>
    <div class="stat">${tooltip.termHtml('qian', nation.currencyName)} <b id="hud-money"></b></div>
    <div class="stat" data-tip="完成した住居に住める人数の合計。人口の本実装はフェーズ2"><span>住居</span> <b id="hud-cap"></b>人</div>
    <div class="stat"><span>建物</span> <b id="hud-bld"></b></div>
    <div class="spacer"></div>
    <div class="stat" data-tip="1秒あたりの描画回数（fps）と1日分の計算にかかる時間"><span id="hud-fps" style="opacity:.6;font-size:11px"></span></div>
    <button id="hud-settings" title="設定">設定</button>
    <div id="hud-speed">${speeds.map((s, i) => `<button data-speed="${i}" title="${s === 0 ? '一時停止 (Space)' : s + '倍速'}">${s === 0 ? '❚❚' : '▶'.repeat(Math.log2(s) + 1)}</button>`).join('')}</div>
  `;
  el.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => loop.setSpeedIndex(Number(b.dataset.speed))));
  el.querySelector('#hud-settings').addEventListener('click', () => onSettings?.());
  const dateEl = el.querySelector('#hud-date'), moneyEl = el.querySelector('#hud-money'), capEl = el.querySelector('#hud-cap'), bldEl = el.querySelector('#hud-bld'), fpsEl = el.querySelector('#hud-fps');
  return {
    update() {
      dateEl.textContent = formatDate(world.calendar);
      moneyEl.textContent = Math.floor(world.money).toLocaleString('ja-JP');
      capEl.textContent = world.stats.housingCapacity.toLocaleString('ja-JP');
      bldEl.textContent = world.buildings.size;
      if (loop.stats) fpsEl.textContent = `${Math.round(loop.stats.fps)} fps / ${loop.stats.tickMs.toFixed(1)} ms`;
      el.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === loop.speedIndex));
    },
  };
}
