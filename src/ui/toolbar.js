// 下部の建築バー: 左に 選択・道路・撤去（常時）、タブ（住居・農地・商業・工房・軍事・建築）で切り替わるアイコンボタン列。
// 開いているタブは localStorage に保存。選択中のツールを含むタブは見出しを強調する。data-tool の値は従来どおり（入力処理と共通）。
import { lockReason, structureName } from '../sim/structures.js';
import { effectText } from './structure-info.js';
import { icon, STRUCT_ICON, ZONE_ICON } from './icons.js';

const KEY = 'sengoku-city.toolbar';
const STRUCT_GROUPS = [
  ['水利・交通', ['well', 'canal', 'levee', 'bridge', 'dock']],
  ['行政・倉', ['granary', 'market_hall', 'post_station', 'prison', 'customs']],
  ['防衛・軍事', ['wall', 'gate', 'watchtower', 'beacon', 'armory', 'drill_ground']],
  ['祭祀・威信', ['altar', 'ancestral_temple', 'academy', 'palace']],
];

export function createToolbar(reg, world, onSelect) {
  const el = document.getElementById('toolbar');
  let open = { tab: 'residential' };
  try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); if (typeof o.tab === 'string') open.tab = o.tab; } } catch { /* 保存なし */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(open)); } catch { /* 無視 */ } };

  const cats = { residential: '住居', farm: '農地', market: '商業', workshop: '工房', military: '軍事' };
  const zoneGroups = new Map();
  for (const z of reg.zones) { if (!zoneGroups.has(z.category)) zoneGroups.set(z.category, []); zoneGroups.get(z.category).push(z); }
  const shortName = (name) => name.replace(/^(住居|農地)（(.+)）$/, '$2');
  const zoneBtn = (z) => `<button class="tool" data-tool="zone:${z.id}" data-cat="${z.category}" ${z.term ? `data-term="${z.term}"` : `data-tip="ドラッグで範囲を指定。条件を満たすと自動で建ちます"`}><span class="tool-ico" style="--zc:${z.color}">${icon(ZONE_ICON[z.category] || 'house', 26)}<span class="swatch" style="background:${z.color}"></span></span><span class="tool-name">${shortName(z.name)}</span></button>`;
  const structBtn = (s) => {
    const tip = `${reg.termById.get(s.term)?.desc || ''} 費用 ${s.cost}銭${s.linear ? '/マス（ドラッグで引く）' : ''}、維持 ${s.upkeep}銭/月。${s.effects.map(effectText).join('、')}`;
    return `<button class="tool" data-tool="struct:${s.id}" data-cat="structure" data-tip="${tip.replace(/"/g, '&quot;')}"><span class="tool-ico">${icon(STRUCT_ICON[s.category] || 'build', 26)}</span><span class="tool-name">${structureName(reg, s, world.nationId)}</span><span class="cost">${s.cost}</span></button>`;
  };
  const tabIds = [...zoneGroups.keys(), 'structure'];
  const tabs = tabIds.map((id) => `<button class="tab" data-tab="${id}">${icon(id === 'structure' ? 'build' : ZONE_ICON[id] || 'house', 16)}<span>${id === 'structure' ? '建築' : cats[id] || id}</span></button>`).join('');
  const bodies = [...zoneGroups].map(([cat, zones]) => `<div class="tab-body" data-body="${cat}">${zones.map(zoneBtn).join('')}</div>`).join('')
    + `<div class="tab-body" data-body="structure">${STRUCT_GROUPS.map(([label, ids]) => `<div class="sub"><span class="sub-label">${label}</span>${ids.map((id) => reg.structureById.get(id)).filter((s) => s && !s.initial).map(structBtn).join('')}</div>`).join('')}</div>`;
  el.innerHTML = `
    <div class="tb-tabs">${tabs}</div>
    <div class="tb-row">
      <div class="tb-fixed">
        <button class="tool" data-tool="select" data-tip="マスや建物をクリックすると右に情報が出ます"><span class="tool-ico">${icon('select', 26)}</span><span class="tool-name">選択</span></button>
        <button class="tool" data-tool="road" data-tip="ドラッグで L 字に敷きます。1マス ${reg.balance.road.costPerTile} 銭。建物は道路から3マス以内にしか建ちません。森は伐採されます"><span class="tool-ico">${icon('road', 26)}</span><span class="tool-name">道路</span></button>
        <button class="tool" data-tool="demolish" data-cat="other" data-tip="ドラッグ範囲の建物・区画・道路・建築を撤去します"><span class="tool-ico">${icon('demolish', 26)}</span><span class="tool-name">撤去</span></button>
      </div>
      <div class="tb-scroll">${bodies}</div>
    </div>`;

  let current = 'select';
  const buttons = el.querySelectorAll('[data-tool]');
  const tabBtns = el.querySelectorAll('[data-tab]');
  const bodyEls = el.querySelectorAll('[data-body]');
  const applyOpen = () => {
    if (!tabIds.includes(open.tab)) open.tab = tabIds[0];
    for (const t of tabBtns) { t.classList.toggle('open', t.dataset.tab === open.tab); t.classList.toggle('has-active', !!el.querySelector(`[data-body="${t.dataset.tab}"] [data-tool].active`)); }
    for (const b of bodyEls) b.classList.toggle('open', b.dataset.body === open.tab);
  };
  const set = (id) => {
    current = id; buttons.forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    const body = el.querySelector(`[data-tool="${id}"]`)?.closest('[data-body]');
    if (body) { open.tab = body.dataset.body; save(); }
    applyOpen(); onSelect(id);
  };
  buttons.forEach((b) => b.addEventListener('click', () => { if (!b.classList.contains('locked')) set(b.dataset.tool); }));
  tabBtns.forEach((t) => t.addEventListener('click', () => { open.tab = t.dataset.tab; save(); applyOpen(); }));
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
