// 財政パネル: 税率・積穀率のスライダー、今月の収支、24か月の推移グラフ。
import { applyCommand } from '../../sim/commands.js';

const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

export function createFinancePanel(world, reg, tooltip) {
  const el = document.getElementById('panel-finance');
  const sliders = [
    ['taxLand', 'tianzu', '田租'], ['taxHead', 'koufu', '口賦'], ['taxMarket', 'shizu', '市租'], ['taxCustoms', 'guanshui', '関税'], ['granaryShare', 'granary_share', '積穀率'],
  ];
  el.innerHTML = `<div class="panel-head"><h3>財政</h3><button class="btn close" data-close>閉じる</button></div>
    <div class="cols">
      <div class="col">
        <h4>税率と政策</h4>
        ${sliders.map(([k, t, label]) => `<div class="slider-row"><label>${tooltip.termHtml(t, label)}</label><input type="range" min="0" max="30" step="1" data-policy="${k}" value="${Math.round(world.policy[k] * 100)}"><span data-val="${k}"></span></div>`).join('')}
        <div class="slider-row"><label>${tooltip.termHtml('relief', '救荒')}</label><input type="checkbox" data-policy="relief" ${world.policy.relief ? 'checked' : ''}><span class="wide">官倉から放出する</span></div>
        <div class="note">市租・関税は市と関所（フェーズ3以降）ができると入ります。</div>
      </div>
      <div class="col">
        <h4>今月の収支</h4>
        <table id="finance-month"></table>
        <div id="finance-harvest" class="note"></div>
      </div>
    </div>
    <h4>24か月の推移（緑=収入 / 赤=支出 / 黄=残高）</h4>
    <canvas id="finance-chart" width="640" height="160"></canvas>`;
  el.querySelectorAll('input[data-policy]').forEach((inp) => inp.addEventListener('input', () => {
    const key = inp.dataset.policy;
    applyCommand(world, reg, { type: 'policy.set', key, value: inp.type === 'checkbox' ? inp.checked : Number(inp.value) / 100 });
    render();
  }));
  el.querySelector('[data-close]').addEventListener('click', () => { el.style.display = 'none'; });
  const table = el.querySelector('#finance-month'), harvestEl = el.querySelector('#finance-harvest'), canvas = el.querySelector('#finance-chart');

  const render = () => {
    for (const [k] of sliders) { const s = el.querySelector(`[data-val="${k}"]`); if (s) s.textContent = `${Math.round(world.policy[k] * 100)}%`; }
    const m = world.finance.month;
    const inc = Object.entries(m.income), exp = Object.entries(m.expense);
    const sum = (o) => o.reduce((a, [, v]) => a + v, 0);
    table.innerHTML = `<tr><th colspan="2">収入 ${fmt(sum(inc))}</th></tr>` + inc.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join('')
      + `<tr><th colspan="2">支出 ${fmt(sum(exp))}</th></tr>` + exp.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join('')
      + `<tr><th>差引</th><th>${fmt(sum(inc) - sum(exp))}</th></tr>`;
    const h = world.finance.lastHarvest;
    harvestEl.textContent = h ? `直近の収穫（${h.month}月）: ${h.tiles} 区画、穀物 ${fmt(h.grain)} 石、価値 ${fmt(h.value)} 銭、田租 ${fmt(h.tax)} 銭` : 'まだ収穫がありません（粟・黍・麻は8月、菽・稲は9月、麦は5月、桑は6月）';
    drawChart();
  };
  const drawChart = () => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, hist = world.finance.history;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 0, W, H);
    if (!hist.length) { ctx.fillStyle = '#ccc'; ctx.font = '12px sans-serif'; ctx.fillText('まだ記録がありません（月が替わると記録されます）', 12, 24); return; }
    const n = reg.balance.economy.historyMonths;
    const maxFlow = Math.max(1, ...hist.map((h) => Math.max(h.income, h.expense)));
    const maxBal = Math.max(1, ...hist.map((h) => Math.abs(h.balance)));
    const bw = W / n;
    hist.forEach((h, k) => {
      const x = (n - hist.length + k) * bw;
      ctx.fillStyle = '#5fbf6a'; ctx.fillRect(x + 2, H - (h.income / maxFlow) * (H - 30), bw / 2 - 3, (h.income / maxFlow) * (H - 30));
      ctx.fillStyle = '#e06060'; ctx.fillRect(x + bw / 2 + 1, H - (h.expense / maxFlow) * (H - 30), bw / 2 - 3, (h.expense / maxFlow) * (H - 30));
      if (h.month === 1) { ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif'; ctx.fillText(h.year < 0 ? `前${-h.year}` : `${h.year}`, x + 2, 12); }
    });
    ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2; ctx.beginPath();
    hist.forEach((h, k) => { const x = (n - hist.length + k) * bw + bw / 2, y = H - 15 - ((h.balance / maxBal) * 0.5 + 0.5) * (H - 30); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif'; ctx.fillText(`最大 収支 ${fmt(maxFlow)} / 残高 ${fmt(maxBal)}`, W - 200, 12);
  };
  render();
  return { el, render, toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; if (el.style.display === 'block') render(); }, update() { if (el.style.display === 'block' && world.day % 5 === 0) render(); } };
}
