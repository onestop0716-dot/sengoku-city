// 軍パネル: 兵の構成と徴兵・帰農、練度・士気・装備、陣形、将軍、出陣、侵攻の警告、戦闘の記録（ラウンドの推移を図で）。
import { applyCommand } from '../../sim/commands.js';
import { ensureArmy, soldierCount, barracksCapacity, unitAvailable, generalOf, equipmentFactor, playerSide } from '../../sim/military/army.js';
import { campaignTargets, aiSide } from '../../sim/military/campaign.js';
import { sideStrength } from '../../sim/military/battle.js';
import { dist } from '../../sim/nation/state.js';

const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

export function createMilitaryPanel(world, reg, tooltip, log) {
  const el = document.getElementById('panel-military');
  let target = null, sendRatio = 0.8, shownBattle = -1;
  const run = (cmd) => { const r = applyCommand(world, reg, cmd); if (!r.ok) log.push(r.message); render(); };
  const bar = (v, color) => `<span class="bar"><span style="width:${Math.round(Math.max(0, Math.min(100, v)))}%${color ? `;background:${color}` : ''}"></span></span> ${Math.round(v)}`;

  const drawBattle = (canvas, rec) => {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#1f1812'; ctx.fillRect(0, 0, W, H);
    const rounds = rec.rounds; if (!rounds.length) return;
    const max = Math.max(...rounds.map((r) => Math.max(r.attackerStrength, r.defenderStrength)), 1);
    const bw = Math.min(40, (W - 60) / rounds.length / 2 - 4);
    const me = rec.kind === 'defense' ? 'defender' : 'attacker';
    rounds.forEach((r, i) => {
      const x0 = 40 + i * ((W - 60) / rounds.length);
      const ha = (r.attackerStrength / max) * (H - 40), hd = (r.defenderStrength / max) * (H - 40);
      ctx.fillStyle = me === 'attacker' ? '#d9a441' : '#c0392b'; ctx.fillRect(x0, H - 20 - ha, bw, ha);
      ctx.fillStyle = me === 'defender' ? '#d9a441' : '#c0392b'; ctx.fillRect(x0 + bw + 4, H - 20 - hd, bw, hd);
      ctx.fillStyle = '#f3e9d2'; ctx.font = '11px sans-serif'; ctx.fillText(`${r.round}`, x0 + bw, H - 6);
      ctx.fillText(`${r.attackerLeft}`, x0, H - 24 - ha); ctx.fillText(`${r.defenderLeft}`, x0 + bw + 4, H - 24 - hd);
    });
    ctx.fillStyle = '#d9a441'; ctx.fillRect(8, 8, 10, 10); ctx.fillStyle = '#f3e9d2'; ctx.fillText('自軍', 22, 17);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(70, 8, 10, 10); ctx.fillStyle = '#f3e9d2'; ctx.fillText('敵軍（棒=戦力、数字=残り兵）', 84, 17);
  };

  const render = () => {
    const army = ensureArmy(world, reg), B = reg.military.balance;
    const cap = barracksCapacity(world, reg), n = soldierCount(army), gen = generalOf(world, reg);
    const targets = campaignTargets(world, reg);
    if (!target || !targets.some((c) => c.id === target)) target = targets[0]?.id || null;
    const home = reg.cityById.get(world.cityId);
    let html = `<div class="panel-head"><h3>軍 <span class="sub">兵 ${n} / 収容 ${cap.total}　戦勝 ${army.victories}・敗北 ${army.defeats}</span></h3><button class="btn close" data-close>閉じる</button></div>`;
    if (army.invasion) html += `<div class="note warn" style="font-size:13px">⚠ ${reg.nationById.get(army.invasion.nation).name}軍（約 ${army.invasion.size} 人）が${reg.cityById.get(army.invasion.from).name}から接近中。到着まで約 ${Math.max(0, army.invasion.days - army.invasion.progress)} 日。城壁・城門・望楼の防御 +${Math.round((world.stats.defense || 0) * B.wallDefensePerPoint * 100)}%、民兵 ${Math.round(world.population.total * B.militiaRatio)} 人が加わります</div>`;
    html += `<div class="cols"><div class="col"><h4>兵の構成</h4><table class="ptable">${reg.military.units.map((u) => { const av = unitAvailable(world, reg, u.id); return `<tr><td>${u.name}<div class="note">攻 ${u.attack} 守 ${u.defense}・装備 ${u.cost} 銭・維持 ${u.upkeep} 銭/月${av.ok ? '' : `<br><span class="warn">${av.message}</span>`}</div></td><td><b>${army.units[u.id]}</b></td><td>${av.ok ? `<button class="btn" data-conscript="${u.id}" data-n="10">+10</button> <button class="btn" data-conscript="${u.id}" data-n="50">+50</button>` : ''} ${army.units[u.id] > 0 ? `<button class="btn" data-disband="${u.id}" data-n="10">−10</button>` : ''}</td></tr>`; }).join('')}</table>
      <div class="note">兵舎（軍事区画）の収容数まで、人口の ${Math.round(B.maxConscriptRatio * 100)}% まで徴兵できます。兵は農民から抜けるので農業が減ります。騎兵は馬厩、戦車兵は車両工房、弩兵は技術「弩の改良」が必要。</div>
      <table class="ptable" style="margin-top:8px"><tr><td>${tooltip.termHtml('training', '練度')}</td><td>${bar(army.training)}</td><td class="note">${Array.from(world.structures.values()).some((s) => s.state === 'built' && s.type === 'drill_ground') ? '練兵場で毎月上昇' : '練兵場がないと下がる'}</td></tr>
      <tr><td>${tooltip.termHtml('morale', '士気')}</td><td>${bar(army.morale)}</td><td class="note">民忠と財政で変わる</td></tr>
      <tr><td>装備</td><td>×${equipmentFactor(world, reg).toFixed(2)}</td><td class="note">技術・武庫・武器の在庫（${fmt(world.goods?.weapon || 0)}）</td></tr>
      <tr><td>将軍</td><td>${gen ? `${gen.name}（統率 ${gen.lead}・武勇 ${gen.valor}）` : '<span class="warn">未任命</span>'}</td><td class="note">人材パネルの官職「将軍」</td></tr>
      <tr><td>${tooltip.termHtml('formation', '陣形')}</td><td colspan="2"><select data-formation>${reg.military.formations.map((f) => `<option value="${f.id}" ${army.formation === f.id ? 'selected' : ''}>${f.name}（攻 ×${f.attack} 守 ×${f.defense}）</option>`).join('')}</select><div class="note">${reg.formationById.get(army.formation)?.note || ''}</div></td></tr>
      <tr><td>自軍の戦力</td><td colspan="2">攻 ${fmt(sideStrength(playerSide(world, reg), reg, 'attack'))} / 守 ${fmt(sideStrength(playerSide(world, reg), reg, 'defense'))}${world.stats.defense ? `（城壁の防御 +${Math.round(world.stats.defense * B.wallDefensePerPoint * 100)}%）` : ''}</td></tr></table></div>
      <div class="col"><h4>${tooltip.termHtml('campaign', '出陣')}</h4>`;
    if (army.campaign) { const c = army.campaign; html += `<div class="note" style="font-size:13px">${reg.cityById.get(c.target).name}へ${c.phase === 'out' ? '進軍中' : '帰還中'} ${c.progress}/${c.days} 日（${Object.values(c.units).reduce((a, b) => a + b, 0)} 人）${c.result ? `　結果: ${c.result === 'win' ? '勝利' : '敗北'}` : ''}</div>`; }
    else if (!targets.length) html += '<div class="note">出陣できる都市がありません（官位が上がると遠くまで行けます）。</div>';
    else {
      const t = reg.cityById.get(target), s = world.nation.cities[target];
      const enemy = aiSide(world, reg, target);
      const mine = {}; for (const [id, k] of Object.entries(army.units)) mine[id] = Math.floor(k * sendRatio);
      const fort = (t.isCapital ? B.capitalDefense : 0.1) + 0.1;
      const est = sideStrength(playerSide(world, reg, mine), reg, 'attack') * 0.9 / Math.max(1, sideStrength(enemy, reg, 'defense', { fortification: fort * (1 - (world.mods?.military?.siege || 0)) }));
      html += `<div class="frow"><label>目標</label><select data-target>${targets.map((c) => `<option value="${c.id}" ${c.id === target ? 'selected' : ''}>${c.name}（${reg.nationById.get(world.nation.cities[c.id].nation).name}${c.isCapital ? '・首都' : ''}）</option>`).join('')}</select></div>
        <div class="frow"><label>出す割合</label><input type="range" min="20" max="100" step="10" value="${Math.round(sendRatio * 100)}" data-ratio><span>${Math.round(sendRatio * 100)}%（${Object.values(mine).reduce((a, b) => a + b, 0)} 人）</span></div>
        <div class="note">${t.name}: 守兵 約 ${fmt(s.army)}、富 ${fmt(s.wealth)}、片道 ${Math.max(2, Math.round(dist(home, t) / B.campaign.speedPerDay))} 日。${t.isCapital ? '首都は守りが堅い（相邦・大将軍なら領有できる）' : '郡守以上なら勝てば領有できる'}。<br>戦力の目安: ${est >= 1.3 ? '<span style="color:#9fe0a0">優勢</span>' : est >= 0.8 ? '<span style="color:#ffc46b">互角</span>' : '<span class="warn">劣勢</span>'}（×${est.toFixed(2)}）。攻めると相手の国との友好度が ${B.campaign.relationOnAttack} 下がります。</div>
        <button class="btn" data-campaign ${n >= 20 ? '' : 'disabled'}>出陣する</button>`;
    }
    html += `<h4>戦闘の記録</h4>${army.battles.length ? `<table class="ptable">${army.battles.slice().reverse().map((b, i) => `<tr><td>${b.day}日目</td><td>${b.kind === 'defense' ? '守城' : '攻城'} ${b.place}</td><td>${b.winner === 'player' ? '<span style="color:#9fe0a0">勝利</span>' : '<span class="warn">敗北</span>'}</td><td class="note">損害 自 ${b.kind === 'defense' ? b.casualties.defender : b.casualties.attacker} / 敵 ${b.kind === 'defense' ? b.casualties.attacker : b.casualties.defender}</td><td><button class="btn" data-show="${army.battles.length - 1 - i}">図</button></td></tr>`).join('')}</table><canvas id="battle-canvas" width="420" height="150" style="width:100%;border-radius:4px;margin-top:6px"></canvas>` : '<div class="note">まだ戦っていません。</div>'}</div></div>`;
    el.innerHTML = html;
    el.querySelector('[data-close]').addEventListener('click', () => { el.style.display = 'none'; });
    el.querySelectorAll('[data-conscript]').forEach((b) => b.addEventListener('click', () => run({ type: 'army.conscript', unitId: b.dataset.conscript, count: Number(b.dataset.n) })));
    el.querySelectorAll('[data-disband]').forEach((b) => b.addEventListener('click', () => run({ type: 'army.disband', unitId: b.dataset.disband, count: Number(b.dataset.n) })));
    el.querySelector('[data-formation]')?.addEventListener('change', (e) => run({ type: 'army.formation', formation: e.target.value }));
    el.querySelector('[data-target]')?.addEventListener('change', (e) => { target = e.target.value; render(); });
    el.querySelector('[data-ratio]')?.addEventListener('input', (e) => { sendRatio = Number(e.target.value) / 100; render(); });
    el.querySelector('[data-campaign]')?.addEventListener('click', () => { const units = {}; for (const [id, k] of Object.entries(army.units)) units[id] = Math.floor(k * sendRatio); run({ type: 'army.campaign', target, units }); });
    el.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { shownBattle = Number(b.dataset.show); drawBattle(el.querySelector('#battle-canvas'), army.battles[shownBattle]); }));
    const cv = el.querySelector('#battle-canvas');
    if (cv) { if (shownBattle < 0 || shownBattle >= army.battles.length) shownBattle = army.battles.length - 1; drawBattle(cv, army.battles[shownBattle]); }
  };
  let lastDay = -1;
  return { el, render, toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; if (el.style.display === 'block') { lastDay = world.day; render(); } }, update() { if (el.style.display !== 'block' || world.day === lastDay) return; lastDay = world.day; if (world.day % 5 === 0 && !el.contains(document.activeElement)) render(); } };
}
