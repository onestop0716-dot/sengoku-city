// 下部の建築バー: 左に 選択・道路・撤去・移動（常時）、タブ（住居・農業・商業・工業・軍事・公共、data/tabs.json）で切り替わる建物のボタン列。
// 建物を選ぶと、右端に「向き」（R キー）と、畑なら「1枚ずつ／範囲」の切り替えが出る。
// 開いているタブは localStorage に保存。選択中のツールを含むタブは見出しを強調する。ツールの値は 'place:<id>'（入力処理と共通）。
import { lockReason, structureName } from '../sim/structures.js';
import { costOf, costText } from '../sim/materials.js';
import { effectText } from './structure-info.js';
import { icon, STRUCT_ICON } from './icons.js';

const KEY = 'sengoku-city.toolbar';
const BUILDING_ICON = { residential: 'house', farm_house: 'house', field: 'farm', market: 'market', workshop: 'workshop', military: 'military' };

export function createToolbar(reg, world, onSelect) {
  const el = document.getElementById('toolbar');
  let open = { tab: reg.tabs[0].id };
  try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); if (typeof o.tab === 'string') open.tab = o.tab; } } catch { /* 保存なし */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(open)); } catch { /* 無視 */ } };
  let rotation = null, areaMode = false;   // rotation: null=自動（入口が道路に面する向き）、0〜3=南・東・北・西
  const listeners = new Set();
  const changed = () => { for (const f of listeners) f(); };

  const nameOf = (id) => { const p = reg.placeableById.get(id); return p.kind === 'structure' ? structureName(reg, p.def, world.nationId) : p.def.name; };
  const itemBtn = (id) => {
    const p = reg.placeableById.get(id);
    if (!p || p.def.initial) return '';
    const def = p.def, cost = costOf(def);
    const ico = p.kind === 'structure' ? STRUCT_ICON[def.category] || 'build' : BUILDING_ICON[def.category] || 'build';
    let tip;
    if (p.kind === 'structure') tip = `${reg.termById.get(def.term)?.desc || ''} 費用 ${costText(cost)}${def.linear ? '/マス（ドラッグで引く）' : ''}、維持 ${def.upkeep}銭/月。${def.effects.map(effectText).join('、')}`;
    else {
      const lv = def.levels[0];
      tip = `${def.size[0]}×${def.size[1]}マス。費用 ${costText(cost)}、${def.buildDays}日。${lv.capacity ? `${lv.capacity}人が住む。` : ''}${def.jobs ? `働き口 ${def.jobs}。` : ''}${def.category === 'field' ? `働き口 ${def.size[0] * def.size[1] * reg.balance.economy.farmJobsPerTile}。` : ''}道路から ${def.requires?.roadWithin ?? 3} マス以内。${def.note || ''}`;
    }
    const short = cost.wood ? `${cost.qian}・木${cost.wood}` : `${cost.qian}`;
    return `<button class="tool" data-tool="place:${id}" data-tip="${tip.replace(/"/g, '&quot;')}"><span class="tool-ico">${icon(ico, 26)}</span><span class="tool-name">${nameOf(id)}</span><span class="cost">${short}</span></button>`;
  };
  const tabs = reg.tabs.map((t) => `<button class="tab" data-tab="${t.id}">${icon(t.icon, 16)}<span>${t.name}</span></button>`).join('');
  const bodies = reg.tabs.map((t) => `<div class="tab-body" data-body="${t.id}">${t.items.map(itemBtn).join('')}</div>`).join('');
  el.innerHTML = `
    <div class="tb-tabs">${tabs}</div>
    <div class="tb-row">
      <div class="tb-fixed">
        <button class="tool" data-tool="select" data-tip="マスや建物をクリックすると右に情報が出ます"><span class="tool-ico">${icon('select', 26)}</span><span class="tool-name">選択</span></button>
        <button class="tool" data-tool="road" data-tip="ドラッグで L 字に敷きます。1マス ${reg.balance.road.costPerTile} 銭。建物は道路の近くにしか置けません。森は伐採されます"><span class="tool-ico">${icon('road', 26)}</span><span class="tool-name">道路</span></button>
        <button class="tool" data-tool="demolish" data-tip="ドラッグ範囲の建物・道路・建築を撤去します（建物の木材は半分戻ります）"><span class="tool-ico">${icon('demolish', 26)}</span><span class="tool-name">撤去</span></button>
        <button class="tool" data-tool="move" data-tip="建物を押して持ち上げ、新しい場所で置き直します。完成済みは費用の ${Math.round(reg.balance.placement.moveCostRate * 100)}% と工事の日数がかかります"><span class="tool-ico">${icon('build', 26)}</span><span class="tool-name">移動</span></button>
      </div>
      <div class="tb-scroll">${bodies}</div>
      <div class="tb-opts" style="display:none">
        <button class="tool" data-opt="rotate" data-tip="向きを変える（R キー）。入口の向きです。「自動」は道路に面する向き"><span class="tool-ico" data-rot-ico>${icon('select', 22)}</span><span class="tool-name">向き</span></button>
        <button class="tool" data-opt="area" data-tip="範囲で埋める: ドラッグした長方形を畑で敷きつめます。もう一度押すと1枚ずつに戻ります"><span class="tool-ico">${icon('farm', 22)}</span><span class="tool-name" data-area-label>1枚ずつ</span></button>
      </div>
    </div>`;

  let current = 'select';
  const buttons = el.querySelectorAll('[data-tool]');
  const tabBtns = el.querySelectorAll('[data-tab]');
  const bodyEls = el.querySelectorAll('[data-body]');
  const opts = el.querySelector('.tb-opts'), rotBtn = el.querySelector('[data-opt="rotate"]'), areaBtn = el.querySelector('[data-opt="area"]');
  const placeDef = () => (current.startsWith('place:') ? reg.placeableById.get(current.slice(6)) : null);
  const ROT_NAMES = ['南', '東', '北', '西'];
  const ROT_ORDER = [null, 0, 1, 2, 3];
  const applyOpts = () => {
    const p = placeDef();
    const rotatable = (p && !p.def.linear) || current === 'move';
    opts.style.display = rotatable ? 'flex' : 'none';
    rotBtn.querySelector('.tool-name').textContent = `向き: ${rotation === null ? '自動' : ROT_NAMES[rotation]}`;
    rotBtn.querySelector('[data-rot-ico]').style.transform = `rotate(${(rotation ?? 0) * 90}deg)`;
    const canArea = !!p && (p.def.place || []).includes('area');
    areaBtn.style.display = canArea ? '' : 'none';
    if (!canArea) areaMode = false;
    areaBtn.classList.toggle('active', areaMode);
    areaBtn.querySelector('[data-area-label]').textContent = areaMode ? '範囲で埋める' : '1枚ずつ';
  };
  const applyOpen = () => {
    if (!reg.tabById.has(open.tab)) open.tab = reg.tabs[0].id;
    for (const t of tabBtns) { t.classList.toggle('open', t.dataset.tab === open.tab); t.classList.toggle('has-active', !!el.querySelector(`[data-body="${t.dataset.tab}"] [data-tool].active`)); }
    for (const b of bodyEls) b.classList.toggle('open', b.dataset.body === open.tab);
  };
  const set = (id) => {
    current = id; buttons.forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    const body = el.querySelector(`[data-tool="${id}"]`)?.closest('[data-body]');
    if (body) { open.tab = body.dataset.body; save(); }
    applyOpen(); applyOpts(); onSelect(id); changed();
  };
  const rotate = (dir = 1) => { const k = ROT_ORDER.indexOf(rotation); rotation = ROT_ORDER[(k + dir + ROT_ORDER.length) % ROT_ORDER.length]; applyOpts(); changed(); };
  const setRotation = (r) => { rotation = r === null ? null : ((r % 4) + 4) % 4; applyOpts(); changed(); };
  buttons.forEach((b) => b.addEventListener('click', () => { if (!b.classList.contains('locked')) set(b.dataset.tool); }));
  tabBtns.forEach((t) => t.addEventListener('click', () => { open.tab = t.dataset.tab; save(); applyOpen(); }));
  rotBtn.addEventListener('click', () => rotate(1));
  areaBtn.addEventListener('click', () => { areaMode = !areaMode; applyOpts(); changed(); });
  const refreshLocks = () => {
    for (const b of buttons) {
      if (!b.dataset.tool.startsWith('place:')) continue;
      const def = reg.placeableById.get(b.dataset.tool.slice(6)).def;
      let reason = lockReason(world, reg, def);
      if (!reason && def.requires?.nationAny && !def.requires.nationAny.includes(world.nationId)) reason = `国（${def.requires.nationAny.map((n) => reg.nationById.get(n)?.name).join('・')}のみ）`;
      b.classList.toggle('locked', !!reason);
      b.title = reason ? `未解禁: ${reason}` : '';
      const lockTag = b.querySelector('.lock');
      const tag = !reason ? '' : reason.includes('官位') ? '郡守' : reason.includes('技術') ? '技術' : reason.includes('国') ? '国' : '済';
      if (reason && (!lockTag || lockTag.textContent !== tag)) { lockTag?.remove(); b.insertAdjacentHTML('beforeend', `<span class="lock">${tag}</span>`); }
      if (!reason && lockTag) lockTag.remove();
    }
  };
  refreshLocks();
  set('select');
  return {
    get current() { return current; },
    get rotation() { return rotation; },
    get areaMode() { return areaMode; },
    set, rotate, setRotation,
    onChange(f) { listeners.add(f); },
    update() { if (world.day % 10 === 0) refreshLocks(); },
  };
}
