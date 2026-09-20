// 左のツール: 選択 / 道路 / 各区画 / 撤去。
export function createToolbar(reg, onSelect) {
  const el = document.getElementById('toolbar');
  const tools = [
    { id: 'select', label: '選択・情報', tip: 'マスや建物をクリックすると右に情報が出ます' },
    { id: 'road', label: '道路', tip: `ドラッグで L 字に敷きます。1マス ${reg.balance.road.costPerTile} 銭。建物は道路から3マス以内にしか建ちません` },
  ];
  const cats = { residential: '住居区画', farm: '農地区画' };
  const groups = new Map();
  for (const z of reg.zones) { if (!groups.has(z.category)) groups.set(z.category, []); groups.get(z.category).push(z); }
  let html = tools.map((t) => `<button data-tool="${t.id}" data-tip="${t.tip}">${t.label}</button>`).join('');
  for (const [cat, zones] of groups) {
    html += `<h4>${cats[cat] || cat}</h4>`;
    html += zones.map((z) => `<button data-tool="zone:${z.id}" ${z.term ? `data-term="${z.term}"` : `data-tip="ドラッグで範囲を指定。条件を満たすと自動で建ちます"`}><span class="swatch" style="background:${z.color}"></span>${z.name}</button>`).join('');
  }
  html += `<h4>その他</h4><button data-tool="demolish" data-tip="ドラッグ範囲の建物・区画・道路を撤去します">撤去</button>`;
  el.innerHTML = html;
  let current = 'select';
  const buttons = el.querySelectorAll('[data-tool]');
  const set = (id) => { current = id; buttons.forEach((b) => b.classList.toggle('active', b.dataset.tool === id)); onSelect(id); };
  buttons.forEach((b) => b.addEventListener('click', () => set(b.dataset.tool)));
  set('select');
  return { get current() { return current; }, set };
}
