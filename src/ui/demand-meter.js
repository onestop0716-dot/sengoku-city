// 需要メーター（住・農・商・工）。ツールバーの下に表示。
export function createDemandMeter(world, tooltip) {
  const el = document.getElementById('demand');
  const rows = [['residential', '住'], ['farm', '農'], ['market', '商'], ['workshop', '工']];
  el.innerHTML = `<h4>${tooltip.termHtml('demand', '需要')}</h4>` + rows.map(([k, l]) => `<div class="dm-row"><span>${l}</span><span class="dm-bar"><span class="dm-neg" data-neg="${k}"></span><span class="dm-pos" data-pos="${k}"></span></span></div>`).join('');
  return {
    update() {
      for (const [k] of rows) {
        const v = world.demand[k] ?? 0;
        el.querySelector(`[data-pos="${k}"]`).style.width = `${Math.max(0, v) / 2}%`;
        el.querySelector(`[data-neg="${k}"]`).style.width = `${Math.max(0, -v) / 2}%`;
      }
    },
  };
}
