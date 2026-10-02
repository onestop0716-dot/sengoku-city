// 右の情報パネル: マスと、そこにある建物・建築の詳細（満足度の内訳、格上げの条件、修繕・移動・撤去のボタン）。
import { idx } from '../core/grid.js';
import { computeSatisfaction, upgradeStatus, isConnected, capacityOf } from '../sim/satisfaction.js';
import { fieldYield } from '../sim/farming.js';
import { costOf, costText } from '../sim/materials.js';
import { applyCommand } from '../sim/commands.js';
import { effectText } from './structure-info.js';
import { structureName } from '../sim/structures.js';

export function createInfoPanel(world, reg, tooltip) {
  const el = document.getElementById('info');
  let selected = null; // {x,y}
  /** 移動ボタンなどの受け口（input.js ができてから main.js が入れる） */
  const actions = { onMove: null, log: null };
  const stateText = (o) => (o.state === 'building' ? `建設中 ${Math.floor(o.progress)}/${o.buildDays}日` : o.state === 'abandoned' ? '廃屋（人が住まず働かない）' : o.upgrade ? `格上げ工事中 ${Math.floor(o.upgrade.progress)}/${o.upgrade.days}日` : '完成');
  const buttons = (kind, id, extra = '') => `<div class="frow">${extra}<button class="btn" data-act="move" data-kind="${kind}" data-id="${id}">移動</button><button class="btn" data-act="remove" data-kind="${kind}" data-id="${id}">撤去</button></div>`;
  const render = () => {
    if (!selected) { el.innerHTML = `<h3>情報</h3><div style="opacity:.75">マスや建物をクリックすると詳細が出ます。<br><br>操作: 右ドラッグ=回転 / 中ドラッグ・WASD=移動 / ホイール=ズーム / Q,E=回転 / Space=一時停止 / R=建物の向き</div>`; return; }
    const { x, y } = selected;
    const i = idx(world.map.w, x, y);
    const t = reg.tiles[world.map.tile[i]];
    const res = world.map.resource[i] ? reg.resources[world.map.resource[i] - 1] : null;
    const rd = world.roadDist ? world.roadDist[i] : 0xffff;
    let html = `<h3>${t.name}（${x}, ${y}）</h3><table>`;
    html += `<tr><td>肥沃度</td><td>${Math.round(world.map.fertility[i] * 100)}</td></tr>`;
    html += `<tr><td>水辺まで</td><td>${world.map.waterDist[i] >= 0xffff ? '遠い' : world.map.waterDist[i] + ' マス'}</td></tr>`;
    html += `<tr><td>道路まで</td><td>${rd >= 0xffff ? '遠い' : rd + ' マス'}</td></tr>`;
    if (res) html += `<tr><td>資源</td><td>${res.name}</td></tr>`;
    if (world.roads[i]) html += `<tr><td>道路</td><td>あり</td></tr>`;
    if (world.services.insideWall && world.services.insideWall[i]) html += `<tr><td>${tooltip.termHtml('inner_city', '内城')}</td><td>城壁の内側</td></tr>`;
    if (world.services.marketAdmin && world.services.marketAdmin[i]) html += `<tr><td>市亭の範囲</td><td>市の店を置ける</td></tr>`;
    if (world.services.irrigation && world.services.irrigation[i]) html += `<tr><td>灌漑</td><td>あり</td></tr>`;
    html += `</table>`;
    const sid = world.structAt[i];
    if (sid !== -1) {
      const s = world.structures.get(sid);
      const def = reg.structureById.get(s.type);
      html += `<h3 style="margin-top:10px">${def.term ? tooltip.termHtml(def.term, structureName(reg, def, world.nationId)) : structureName(reg, def, world.nationId)}</h3><table>`;
      html += `<tr><td>状態</td><td>${stateText(s)}</td></tr>`;
      html += `<tr><td>維持費</td><td>${def.upkeep} 銭/月</td></tr>`;
      for (const e of def.effects) html += `<tr><td colspan="2" style="opacity:.85">・${effectText(e)}</td></tr>`;
      if (def.note) html += `<tr><td colspan="2" style="opacity:.6;font-size:11px">${def.note}</td></tr>`;
      html += `</table>`;
      if (!def.initial) html += def.linear ? `<div class="frow"><button class="btn" data-act="remove" data-kind="structure" data-id="${s.id}">撤去</button></div>` : buttons('structure', s.id);
    }
    const bid = world.buildingAt[i];
    if (bid !== -1) {
      const b = world.buildings.get(bid);
      const def = reg.buildingById.get(b.buildingType);
      html += `<h3 style="margin-top:10px">${def.term ? tooltip.termHtml(def.term, def.name) : def.name} Lv${b.level}</h3><table>`;
      html += `<tr><td>状態</td><td>${stateText(b)}</td></tr>`;
      const cap = capacityOf(reg, b);
      if (cap) html += `<tr><td>収容</td><td>${cap}人</td></tr>`;
      if (def.jobs) html += `<tr><td>働き口</td><td>${Math.round(def.jobs * (1 + 0.5 * (b.level - 1)))}人</td></tr>`;
      if (def.category === 'field') html += `<tr><td>働き口</td><td>${b.w * b.h * reg.balance.economy.farmJobsPerTile}人</td></tr>`;
      if (b.category === 'field' && b.state === 'built') { const yv = fieldYield(world, reg, b); html += `<tr><td>見込み収量</td><td>${yv.crop?.baseYield > 0 ? `${yv.grain.toFixed(0)} 石/年（${yv.crop.harvestMonth}月）` : `${Math.round(yv.value)} 銭相当/年（${yv.crop?.harvestMonth}月）`}</td></tr>`; }
      if (!isConnected(world, reg, b)) html += `<tr><td colspan="2" class="vl-bad">道路から遠く、住まず・働きません（${def.requires?.roadWithin ?? 3}マス以内に道路が必要）</td></tr>`;
      if (b.state !== 'building') {
        const p = computeSatisfaction(world, reg, def, b.x, b.y, b.w, b.h);
        html += `<tr><td>${tooltip.termHtml('prosperity', '満足度')}</td><td><b>${p.total}</b></td></tr>`;
        for (const [k, v] of Object.entries(p.parts)) if (k !== '基本' && v !== 0) html += `<tr><td style="padding-left:12px;opacity:.8">${k}</td><td>${v > 0 ? '+' : ''}${Math.round(v)}</td></tr>`;
        const U = reg.balance.upgrade;
        const up = b.state === 'built' && !b.upgrade ? upgradeStatus(world, reg, b) : null;
        if (b.state === 'built' && !b.upgrade) {
          if (!up) html += `<tr><td>格上げ</td><td>最大レベル</td></tr>`;
          else {
            const lacks = [];
            if (p.total < up.threshold) lacks.push(`満足度 ${up.threshold} 以上`);
            for (const m of up.missing) lacks.push(m);
            html += `<tr><td>Lv${up.next}へ</td><td>${lacks.length ? `必要: ${lacks.join('、')}` : `あと ${Math.max(0, U.levelUp.days - b.upTimer)} 日で自動で格上げ`}</td></tr>`;
          }
          if (p.total < U.levelDown.threshold) html += `<tr><td class="vl-bad">衰退まで</td><td>${Math.max(0, (b.level > 1 ? U.levelDown.days : U.abandonDays) - b.downTimer)} 日</td></tr>`;
        }
      }
      html += `</table>`;
      const repair = b.state === 'abandoned' ? `<button class="btn" data-act="repair" data-id="${b.id}">修繕（${costText(costOf(def, reg.balance.placement.repairCostRate))}）</button>` : '';
      html += buttons('building', b.id, repair);
    } else if (sid === -1 && t.clearable) {
      html += `<div class="advice">森は建物や道路を置くと自動で伐採され、木材が手に入ります。近くに伐木場を置くと毎月木材ができます。</div>`;
    }
    el.innerHTML = html;
  };
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const id = Number(btn.dataset.id), kind = btn.dataset.kind;
    if (btn.dataset.act === 'move') actions.onMove?.(kind, id);
    else if (btn.dataset.act === 'remove') { if (!confirm('撤去しますか？（戻せません）')) return; const r = applyCommand(world, reg, { type: 'build.remove', kind, id }); if (!r.ok) actions.log?.push(r.message); }
    else if (btn.dataset.act === 'repair') { const r = applyCommand(world, reg, { type: 'build.repair', id }); if (!r.ok) actions.log?.push(r.message); }
    render();
  });
  render();
  let lastDay = -1;
  return { select(tile) { selected = tile; render(); }, update() { if (selected && world.day !== lastDay) { lastDay = world.day; render(); } }, actions };
}
