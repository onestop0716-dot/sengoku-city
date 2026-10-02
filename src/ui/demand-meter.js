// 暮らしの指標（空き家・入居待ち・働き口・失業）。建築バーの上に表示。何を置けばよいかの目安になる。
export function createDemandMeter(world, tooltip) {
  const el = document.getElementById('demand');
  const rows = [['vacant', '空き家', '人分'], ['waiting', '入居待ち', '人'], ['jobsOpen', '働き口', '人分'], ['unemployed', '失業', '人']];
  el.innerHTML = `<h4>${tooltip.termHtml('demand', '暮らし')}</h4>` + rows.map(([k, l, u]) => `<div class="dm-row"><span>${l}</span><b data-ind="${k}">0</b><span class="dm-unit">${u}</span></div>`).join('');
  const warnIf = { waiting: (v) => v >= 5, unemployed: (v) => v >= 10 };
  return {
    update() {
      const ind = world.indicators || {};
      for (const [k] of rows) {
        const v = Math.round(ind[k] || 0);
        const cell = el.querySelector(`[data-ind="${k}"]`);
        if (cell.textContent !== String(v)) cell.textContent = String(v);
        cell.classList.toggle('dm-warn', !!warnIf[k]?.(v));
      }
    },
  };
}
