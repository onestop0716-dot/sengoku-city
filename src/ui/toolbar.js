// 左のツール: 選択 / 道路 / 撤去（常時表示）と、折りたためるカテゴリ（区画・特殊建築）。
// 開閉状態は localStorage に保存。選択中のツールを含むカテゴリは見出しを強調する。
import { lockReason, structureName } from '../sim/structures.js';
import { effectText } from './structure-info.js';

const KEY = 'sengoku-city.toolbar';
const STRUCT_GROUPS = [
  ['水利・交通', ['well', 'canal', 'levee', 'bridge', 'dock']],
  ['行政・倉', ['granary', 'market_hall', 'post_station', 'prison', 'customs']],
  ['防衛・軍事', ['wall', 'gate', 'watchtower', 'beacon', 'armory', 'drill_ground']],
  ['祭祀・威信', ['altar', 'ancestral_temple', 'academy', 'palace']],
];

export function createToolbar(reg, world, onSelect) {
  const el = document.getElementById('toolbar');
  let open = { residential: true, farm: true };
  try { const raw = localStorage.getItem(KEY); if (raw) open = { ...open, ...JSON.parse(raw) }; } catch { /* 保存なし */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(open)); } catch { /* 無視 */ } };

  const cats = { residential: '住居区画', farm: '農地区画', market: '商業区画', workshop: '工房区画', military: '軍事区画' };
  const zoneGroups = new Map();
  for (const z of reg.zones) { if (!zoneGroups.has(z.category)) zoneGroups.set(z.category, []); zoneGroups.get(z.category).push(z); }
  const zoneBtn = (z) => `<button data-tool="zone:${z.id}" data-cat="${z.category}" ${z.term ? `data-term="${z.term}"` : `data-tip="ドラッグで範囲を指定。条件を満たすと自動で建ちます"`}><span class="swatch" style="background:${z.color}"></span>${z.name}</button>`;
  const structBtn = (s) => {
    const tip = `${reg.termById.get(s.term)?.desc || ''} 費用 ${s.cost}銭${s.linear ? '/マス（ドラッグで引く）' : ''}、維持 ${s.upkeep}銭/月。${s.effects.map(effectText).join('、')}`;
    return `<button data-tool="struct:${s.id}" data-cat="structure" data-tip="${tip.replace(/"/g, '&quot;')}"><span class="cost">${s.cost}</span>${structureName(reg, s, world.nationId)}</button>`;
  };
  const section = (id, title, body) => `<div class="cat" data-cat-id="${id}"><h4 class="cat-head" data-toggle="${id}"><span class="arrow"></span>${title}</h4><div class="cat-body">${body}</div></div>`;

  let html = `<button data-tool="select" data-tip="マスや建物をクリックすると右に情報が出ます">選択・情報</button>`;
  html += `<button data-tool="road" data-tip="ドラッグで L 字に敷きます。1マス ${reg.balance.road.costPerTile} 銭。建物は道路から3マス以内にしか建ちません。森は伐採されます">道路</button>`;
  for (const [cat, zones] of zoneGroups) html += section(cat, cats[cat] || cat, zones.map(zoneBtn).join(''));
  const structBody = STRUCT_GROUPS.map(([label, ids]) => `<div class="sub">${label}</div>` + ids.map((id) => reg.structureById.get(id)).filter((s) => s && !s.initial).map(structBtn).join('')).join('');
  html += section('structure', '特殊建築', structBody);
  html += section('other', 'その他', `<button data-tool="demolish" data-cat="other" data-tip="ドラッグ範囲の建物・区画・道路・建築を撤去します">撤去</button>`);
  el.innerHTML = html;

  let current = 'select';
  const buttons = el.querySelectorAll('[data-tool]');
  const heads = el.querySelectorAll('.cat');
  const applyOpen = () => {
    for (const c of heads) {
      const id = c.dataset.catId;
      c.classList.toggle('open', !!open[id]);
      const activeInside = !!c.querySelector('[data-tool].active');
      c.classList.toggle('has-active', activeInside);
    }
  };
  const set = (id) => { current = id; buttons.forEach((b) => b.classList.toggle('active', b.dataset.tool === id)); applyOpen(); onSelect(id); };
  buttons.forEach((b) => b.addEventListener('click', () => { if (!b.classList.contains('locked')) set(b.dataset.tool); }));
  el.querySelectorAll('[data-toggle]').forEach((h) => h.addEventListener('click', () => { const id = h.dataset.toggle; open[id] = !open[id]; save(); applyOpen(); }));
  const refreshLocks = () => {
    for (const b of buttons) {
      if (!b.dataset.tool.startsWith('struct:')) continue;
      const def = reg.structureById.get(b.dataset.tool.slice(7));
      const reason = lockReason(world, reg, def);
      b.classList.toggle('locked', !!reason);
      b.title = reason ? `未解禁: ${reason}` : '';
      const lockTag = b.querySelector('.lock');
      if (reason && !lockTag) b.insertAdjacentHTML('beforeend', `<span class="lock">${reason.includes('官位') ? '郡守' : reason.includes('技術') ? '技術' : '済'}</span>`);
      if (!reason && lockTag) lockTag.remove();
    }
  };
  refreshLocks();
  set('select');
  return { get current() { return current; }, set, update() { if (world.day % 10 === 0) refreshLocks(); } };
}
