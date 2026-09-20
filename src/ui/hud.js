// 上部バー: 日付・銭・穀・人口・民忠・治安・速度・パネルの開閉。
import { formatDate } from '../sim/calendar.js';

export function createHud(world, reg, loop, tooltip, { onSettings, onPanel } = {}) {
  const el = document.getElementById('hud');
  const nation = reg.nationById.get(world.nationId), city = reg.cityById.get(world.cityId);
  const speeds = reg.balance.time.speeds;
  el.innerHTML = `
    <div class="stat"><span>${nation.name}・${city.name}</span></div>
    <div class="stat"><span id="hud-date"></span></div>
    <span id="hud-fps" style="display:none"></span>
    <div class="stat">${tooltip.termHtml('qian', nation.currencyName)} <b id="hud-money"></b></div>
    <div class="stat">${tooltip.termHtml('grain', '穀')} <b id="hud-grain"></b><span style="opacity:.7;font-size:11px" id="hud-grain2"></span></div>
    <div class="stat" data-tip="人口 / 住居の収容数"><span>人口</span> <b id="hud-pop"></b><span style="opacity:.7;font-size:11px" id="hud-cap"></span></div>
    <div class="stat">${tooltip.termHtml('loyalty', '民忠')} <b id="hud-loy"></b></div>
    <div class="stat">${tooltip.termHtml('security', '治安')} <b id="hud-sec"></b></div>
    <div class="stat" id="hud-food"></div>
    <div class="spacer"></div>
    <button data-panel="finance">財政</button>
    <button data-panel="population">人口</button>
    <button data-panel="persons">人材</button>
    <button data-panel="research">研究</button>
    <button id="hud-view" title="表示モード（Tab で順送り、Esc で通常）">表示</button>
    <button id="hud-settings" title="設定">設定</button>
    <div id="hud-speed">${speeds.map((s, i) => `<button data-speed="${i}" title="${s === 0 ? '一時停止 (Space)' : s + '倍速'}">${s === 0 ? '❚❚' : '▶'.repeat(Math.log2(s) + 1)}</button>`).join('')}</div>
  `;
  el.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => loop.setSpeedIndex(Number(b.dataset.speed))));
  el.querySelector('#hud-settings').addEventListener('click', () => onSettings?.());
  el.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => onPanel?.(b.dataset.panel)));
  const q = (id) => el.querySelector(id);
  const viewBtn = q('#hud-view');
  const dateEl = q('#hud-date'), moneyEl = q('#hud-money'), grainEl = q('#hud-grain'), grain2El = q('#hud-grain2'), popEl = q('#hud-pop'), capEl = q('#hud-cap'), loyEl = q('#hud-loy'), secEl = q('#hud-sec'), foodEl = q('#hud-food'), fpsEl = q('#hud-fps');
  const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
  return {
    viewButton: viewBtn,
    setViewMode(name) { viewBtn.textContent = name === '通常' ? '表示' : `表示: ${name}`; viewBtn.classList.toggle('active', name !== '通常'); },
    update() {
      dateEl.textContent = formatDate(world.calendar);
      moneyEl.textContent = fmt(world.money);
      moneyEl.style.color = world.money < 0 ? '#ff7b6b' : '';
      grainEl.textContent = fmt(world.grain.civil + world.grain.granary);
      grain2El.textContent = `（官倉 ${fmt(world.grain.granary)}）`;
      popEl.textContent = fmt(world.population.total);
      capEl.textContent = `/${fmt(world.stats.housingCapacity)}`;
      loyEl.textContent = Math.round(world.loyalty); secEl.textContent = Math.round(world.security);
      const f = world.foodSufficiency;
      foodEl.innerHTML = f < reg.balance.economy.famineThreshold ? '<b style="color:#ff7b6b">飢饉</b>' : f < 0.9 ? '<span style="color:#ffc46b">食糧不足</span>' : '';
      if (loop.stats) fpsEl.textContent = `${Math.round(loop.stats.fps)} fps / ${loop.stats.tickMs.toFixed(1)} ms`;
      el.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === loop.speedIndex));
    },
  };
}
