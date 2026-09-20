// 右の情報パネル: マス／建物の詳細と繁栄度の内訳。
import { idx } from '../core/grid.js';
import { computeProsperity, zoneDefAt } from '../sim/zones.js';
import { fieldYield } from '../sim/farming.js';

export function createInfoPanel(world, reg, tooltip) {
  const el = document.getElementById('info');
  let selected = null; // {x,y}
  const render = () => {
    if (!selected) { el.innerHTML = `<h3>情報</h3><div style="opacity:.75">マスや建物をクリックすると詳細が出ます。<br><br>操作: 右ドラッグ=回転 / 中ドラッグ・WASD=移動 / ホイール=ズーム / Q,E=回転 / Space=一時停止</div>`; return; }
    const { x, y } = selected;
    const i = idx(world.map.w, x, y);
    const t = reg.tiles[world.map.tile[i]];
    const res = world.map.resource[i] ? reg.resources[world.map.resource[i] - 1] : null;
    const zone = zoneDefAt(world, reg, i);
    const rd = world.roadDist ? world.roadDist[i] : 0xffff;
    let html = `<h3>${t.name}（${x}, ${y}）</h3><table>`;
    html += `<tr><td>肥沃度</td><td>${Math.round(world.map.fertility[i] * 100)}</td></tr>`;
    html += `<tr><td>水辺まで</td><td>${world.map.waterDist[i] >= 0xffff ? '遠い' : world.map.waterDist[i] + ' マス'}</td></tr>`;
    html += `<tr><td>道路まで</td><td>${rd >= 0xffff ? '遠い' : rd + ' マス'}</td></tr>`;
    if (res) html += `<tr><td>資源</td><td>${res.name}</td></tr>`;
    if (world.roads[i]) html += `<tr><td>道路</td><td>あり</td></tr>`;
    if (zone) html += `<tr><td>区画</td><td>${zone.name}</td></tr>`;
    html += `</table>`;
    const bid = world.buildingAt[i];
    if (bid !== -1) {
      const b = world.buildings.get(bid);
      const def = reg.buildingById.get(b.buildingType);
      const lv = def.levels[b.level - 1];
      html += `<h3 style="margin-top:10px">${def.name} Lv${b.level}</h3><table>`;
      html += `<tr><td>状態</td><td>${b.state === 'building' ? `建設中 ${b.progress}/${b.buildDays}日` : '完成'}</td></tr>`;
      if (lv.capacity) html += `<tr><td>収容</td><td>${lv.capacity}人</td></tr>`;
      if (b.category === 'field' && b.state === 'built') { const y = fieldYield(world, reg, b); html += `<tr><td>見込み収量</td><td>${y.crop?.baseYield > 0 ? `${y.grain.toFixed(1)} 石/年（${y.crop.harvestMonth}月）` : `${Math.round(y.value)} 銭相当/年（${y.crop?.harvestMonth}月）`}</td></tr>`; }
      const p = computeProsperity(world, reg, b.x, b.y, reg.zoneById.get(b.zone), b);
      html += `<tr><td>${tooltip.termHtml('prosperity')}</td><td><b>${p.total}</b></td></tr>`;
      for (const [k, v] of Object.entries(p.parts)) if (k !== '基本') html += `<tr><td style="padding-left:12px;opacity:.8">${k}</td><td>${v > 0 ? '+' : ''}${Math.round(v)}</td></tr>`;
      const G = reg.balance.growth;
      html += `<tr><td>成長まで</td><td>${b.level >= def.levels.length ? '最大' : p.total >= G.levelUp.threshold ? `${G.levelUp.days - b.upTimer}日` : `繁栄度${G.levelUp.threshold}以上が必要`}</td></tr>`;
      if (p.total < G.levelDown.threshold) html += `<tr><td>衰退まで</td><td>${G.levelDown.days - b.downTimer}日</td></tr>`;
      html += `</table>`;
    } else if (zone) {
      const p = computeProsperity(world, reg, x, y, zone);
      html += `<div style="margin-top:8px">この場所の${tooltip.termHtml('prosperity')}: <b>${p.total}</b>（${reg.balance.growth.buildThreshold}以上で建ちます）</div><table>`;
      for (const [k, v] of Object.entries(p.parts)) if (k !== '基本') html += `<tr><td style="padding-left:12px;opacity:.8">${k}</td><td>${v > 0 ? '+' : ''}${Math.round(v)}</td></tr>`;
      html += `</table>`;
    }
    el.innerHTML = html;
  };
  render();
  return { select(tile) { selected = tile; render(); }, update() { if (selected) render(); } };
}
