// 人口パネル: 身分別の人口、仕事、指標。
export function createPopulationPanel(world, reg, tooltip) {
  const el = document.getElementById('panel-population');
  const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
  el.innerHTML = `<div class="panel-head"><h3>人口</h3><button class="btn close" data-close>閉じる</button></div><div class="cols"><div class="col"><h4>身分</h4><table id="pop-class"></table></div><div class="col"><h4>指標</h4><table id="pop-stats"></table></div></div>`;
  el.querySelector('[data-close]').addEventListener('click', () => { el.style.display = 'none'; });
  const cls = el.querySelector('#pop-class'), st = el.querySelector('#pop-stats');
  const bar = (v) => `<span class="bar"><span style="width:${Math.round(Math.max(0, Math.min(100, v)))}%"></span></span> ${Math.round(v)}`;
  const render = () => {
    const p = world.population, c = world.stats.capacity || {};
    cls.innerHTML = `
      <tr><td>${tooltip.termHtml('commoner', '庶民')}</td><td>${fmt(p.commoner)} / ${fmt(c.commoner || 0)}</td></tr>
      <tr><td style="padding-left:14px">農民</td><td>${fmt(p.farmers)}</td></tr>
      <tr><td style="padding-left:14px">工人・商人</td><td>${fmt(p.artisans + p.merchants)}（工房・市はフェーズ3）</td></tr>
      <tr><td style="padding-left:14px">仕事なし</td><td>${fmt(p.unemployed)}</td></tr>
      <tr><td>${tooltip.termHtml('shi', '士')}</td><td>${fmt(p.shi)} / ${fmt(c.shi || 0)}</td></tr>
      <tr><td>${tooltip.termHtml('noble', '貴族')}</td><td>${fmt(p.noble)} / ${fmt(c.noble || 0)}</td></tr>
      <tr><th>合計</th><th>${fmt(p.total)} / ${fmt(world.stats.housingCapacity)}</th></tr>
      <tr><td>農地の仕事</td><td>${fmt(world.stats.farmJobs)}（畑 ${fmt(world.stats.farmTiles)} 区画）</td></tr>`;
    st.innerHTML = `
      <tr><td>${tooltip.termHtml('loyalty', '民忠')}</td><td>${bar(world.loyalty)}</td></tr>
      <tr><td>${tooltip.termHtml('security', '治安')}</td><td>${bar(world.security)}</td></tr>
      <tr><td>${tooltip.termHtml('hygiene', '衛生')}</td><td>${bar(world.hygiene)}</td></tr>
      <tr><td>${tooltip.termHtml('food', '食糧充足')}</td><td>${bar(world.foodSufficiency * 100)}%</td></tr>
      <tr><td>穀物（民間）</td><td>${fmt(world.grain.civil)} 石</td></tr>
      <tr><td>穀物（官倉）</td><td>${fmt(world.grain.granary)} / ${fmt(world.grain.granaryCap)} 石</td></tr>
      <tr><td>年間の消費</td><td>${fmt(p.total * reg.balance.economy.consumptionPerPersonPerYear)} 石</td></tr>`;
  };
  render();
  return { el, render, toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; if (el.style.display === 'block') render(); }, update() { if (el.style.display === 'block' && world.day % 5 === 0) render(); } };
}
