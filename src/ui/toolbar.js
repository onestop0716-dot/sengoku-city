// 左のツール: 選択 / 道路 / 各区画 / 特殊建築 / 撤去。
import { lockReason, structureName } from '../sim/structures.js';
import { effectText } from './structure-info.js';

export function createToolbar(reg, world, onSelect) {
  const el = document.getElementById('toolbar');
  const tools = [
    { id: 'select', label: '選択・情報', tip: 'マスや建物をクリックすると右に情報が出ます' },
    { id: 'road', label: '道路', tip: `ドラッグで L 字に敷きます。1マス ${reg.balance.road.costPerTile} 銭。建物は道路から3マス以内にしか建ちません` },
  ];
  const cats = { residential: '住居区画', farm: '農地区画', market: '商業区画', workshop: '工房区画', military: '軍事区画' };
  const groups = new Map();
  for (const z of reg.zones) { if (!groups.has(z.category)) groups.set(z.category, []); groups.get(z.category).push(z); }
  let html = tools.map((t) => `<button data-tool="${t.id}" data-tip="${t.tip}">${t.label}</button>`).join('');
  for (const [cat, zones] of groups) {
    html += `<h4>${cats[cat] || cat}</h4>`;
    html += zones.map((z) => `<button data-tool="zone:${z.id}" ${z.term ? `data-term="${z.term}"` : `data-tip="ドラッグで範囲を指定。条件を満たすと自動で建ちます"`}><span class="swatch" style="background:${z.color}"></span>${z.name}</button>`).join('');
  }
  html += `<h4>特殊建築</h4>`;
  for (const s of reg.structures) {
    if (s.initial) continue;
    const tip = `${reg.termById.get(s.term)?.desc || ''} 費用 ${s.cost}銭${s.linear ? '/マス（ドラッグで引く）' : ''}、維持 ${s.upkeep}銭/月。${s.effects.map(effectText).join('、')}`;
    html += `<button data-tool="struct:${s.id}" data-tip="${tip.replace(/"/g, '&quot;')}"><span class="cost">${s.cost}</span>${structureName(reg, s, world.nationId)}</button>`;
  }
  html += `<h4>その他</h4><button data-tool="demolish" data-tip="ドラッグ範囲の建物・区画・道路・建築を撤去します">撤去</button>`;
  el.innerHTML = html;
  let current = 'select';
  const buttons = el.querySelectorAll('[data-tool]');
  const set = (id) => { current = id; buttons.forEach((b) => b.classList.toggle('active', b.dataset.tool === id)); onSelect(id); };
  buttons.forEach((b) => b.addEventListener('click', () => { if (!b.classList.contains('locked')) set(b.dataset.tool); }));
  set('select');
  const refreshLocks = () => {
    for (const b of buttons) {
      if (!b.dataset.tool.startsWith('struct:')) continue;
      const def = reg.structureById.get(b.dataset.tool.slice(7));
      const reason = lockReason(world, reg, def);
      b.classList.toggle('locked', !!reason);
      b.title = reason || '';
    }
  };
  refreshLocks();
  return { get current() { return current; }, set, update() { if (world.day % 10 === 0) refreshLocks(); } };
}
