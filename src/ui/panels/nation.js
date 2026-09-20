// 全国パネル: 七雄の勢力図（Canvas 2D）、国力・功績・昇進、貿易（商隊）、外交（贈物・提案）、王命、郡の運営。
import { applyCommand } from '../../sim/commands.js';
import { ensureNationState, reachableCities, cityPrice, powerRanking, promotionStatus, POLICY_NAMES, dist } from '../../sim/nation/state.js';
import { homeStock, hasMarketHall, caravanFee } from '../../sim/nation/trade.js';

const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
const TABS = [['overview', '概況'], ['trade', '貿易'], ['diplomacy', '外交'], ['orders', '王命'], ['commandery', '郡']];

export function createNationPanel(world, reg, tooltip, log) {
  const el = document.getElementById('panel-nation');
  let tab = 'overview', dest = null, cargoGoods = 'salt', cargoQty = 10, buyGoods = '';
  const run = (cmd) => { const r = applyCommand(world, reg, cmd); if (!r.ok) log.push(r.message); render(); };
  el.innerHTML = `<div class="panel-head"><h3>全国</h3><button class="btn close" data-close>閉じる</button></div>
    <canvas id="nation-map" width="880" height="330"></canvas>
    <div class="ntabs">${TABS.map(([id, n]) => `<button data-tab="${id}">${n}</button>`).join('')}</div>
    <div id="nation-body"></div>`;
  el.querySelector('[data-close]').addEventListener('click', () => { el.style.display = 'none'; });
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  const canvas = el.querySelector('#nation-map'), body = el.querySelector('#nation-body');
  // 地図座標 → キャンバス（都市の座標は x 180〜720, y 140〜500）
  const X = (x) => (x - 150) / 600 * canvas.width, Y = (y) => (y - 125) / 410 * canvas.height;
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect(); const mx = (e.clientX - r.left) * canvas.width / r.width, my = (e.clientY - r.top) * canvas.height / r.height;
    let best = null, bd = 18;
    for (const c of reg.cities) { const d = Math.hypot(X(c.mapPos[0]) - mx, Y(c.mapPos[1]) - my); if (d < bd) { bd = d; best = c; } }
    if (best && best.id !== world.cityId) { dest = best.id; tab = 'trade'; render(); }
  });

  const drawMap = () => {
    const N = ensureNationState(world, reg);
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#e8dcc0'; ctx.fillRect(0, 0, W, H);
    // 川（簡略）: 黄河と長江・淮水
    ctx.strokeStyle = '#7fa8c8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    const river = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); };
    river([[200, 250], [260, 300], [310, 345], [400, 330], [470, 345], [520, 330], [600, 280], [700, 260]]);       // 黄河（簡略）
    river([[180, 520], [280, 500], [400, 470], [520, 500], [640, 520], [720, 500]]);                                // 長江（簡略）
    river([[450, 430], [530, 450], [600, 440], [680, 450]]);                                                          // 淮水（簡略）
    ctx.fillStyle = '#5a6a80'; ctx.font = '11px sans-serif'; ctx.fillText('黄河', X(330), Y(350) - 6); ctx.fillText('長江', X(560), Y(510) + 14); ctx.fillText('淮水', X(610), Y(438) - 4);
    // 国の勢力圏: 都市を国ごとに凸包風に薄く塗る代わりに、都市の周りに色の円
    for (const c of reg.cities) { const n = reg.nationById.get(c.nation); ctx.fillStyle = n.color + '22'; ctx.beginPath(); ctx.arc(X(c.mapPos[0]), Y(c.mapPos[1]), 34, 0, Math.PI * 2); ctx.fill(); }
    // 条約
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    for (const [key, kind] of Object.entries(N.treaties)) { const [a, b] = key.split(':'); const ca = reg.cityById.get(reg.nationById.get(a).capital), cb = reg.cityById.get(reg.nationById.get(b).capital); ctx.strokeStyle = kind === 'alliance' ? '#c0392b' : '#2e7d32'; ctx.beginPath(); ctx.moveTo(X(ca.mapPos[0]), Y(ca.mapPos[1])); ctx.lineTo(X(cb.mapPos[0]), Y(cb.mapPos[1])); ctx.stroke(); }
    ctx.setLineDash([]);
    // 商隊の経路と位置
    const home = reg.cityById.get(world.cityId);
    for (const cv of N.caravans) {
      const d = reg.cityById.get(cv.to); const t = cv.progress / cv.days; const f = cv.phase === 'out' ? t : 1 - t;
      ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(home.mapPos[0]), Y(home.mapPos[1])); ctx.lineTo(X(d.mapPos[0]), Y(d.mapPos[1])); ctx.stroke(); ctx.setLineDash([]);
      const px = X(home.mapPos[0] + (d.mapPos[0] - home.mapPos[0]) * f), py = Y(home.mapPos[1] + (d.mapPos[1] - home.mapPos[1]) * f);
      ctx.fillStyle = '#8b5a2b'; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3a2a1c'; ctx.font = '10px sans-serif'; ctx.fillText(cv.phase === 'out' ? '商隊→' : '←商隊', px + 6, py + 3);
    }
    // 都市
    ctx.font = '11px sans-serif';
    for (const c of reg.cities) {
      const n = reg.nationById.get(c.nation), s = N.cities[c.id];
      const x = X(c.mapPos[0]), y = Y(c.mapPos[1]);
      const rad = c.isCapital ? 7 : 4 + Math.min(3, s.population / 15000);
      ctx.fillStyle = n.color; ctx.beginPath(); if (c.isCapital) ctx.rect(x - rad, y - rad, rad * 2, rad * 2); else ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      if (c.id === world.cityId) { ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, rad + 4, 0, Math.PI * 2); ctx.stroke(); }
      else if (N.commandery.includes(c.id)) { ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(x, y, rad + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      if (dest === c.id) { ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rad + 6, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#2a1e0e'; ctx.fillText(c.name, x + rad + 3, y + 4);
    }
    // 国名
    ctx.font = 'bold 15px sans-serif';
    for (const n of reg.nations) { const cap = reg.cityById.get(n.capital); ctx.fillStyle = n.color; ctx.fillText(n.name, X(cap.mapPos[0]) - 24, Y(cap.mapPos[1]) - 12); }
    ctx.fillStyle = '#5a4a3a'; ctx.font = '10px sans-serif'; ctx.fillText('都市を押すと商隊の行き先になります。■ 首都　◎ あなたの県　点線の輪 郡内の都市　緑の破線 不可侵　赤の破線 同盟', 8, H - 6);
  };

  const render = () => {
    const N = ensureNationState(world, reg);
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    drawMap();
    const rankName = reg.rankById.get(world.rank || 'magistrate')?.name;
    let html = '';
    if (tab === 'overview') {
      const st = promotionStatus(world, reg);
      html += `<div class="cols"><div class="col"><h4>国力の順位</h4><table class="ptable">${powerRanking(world, reg).map((r, i) => `<tr><td>${i + 1}</td><td><span class="sw" style="background:${reg.nationById.get(r.id).color}"></span>${r.name}${r.id === world.nationId ? '（自国）' : ''}</td><td>${r.power}</td></tr>`).join('')}</table><div class="note">国力 = 都市の人口・富・兵の合計。</div></div>
        <div class="col"><h4>あなたの立場</h4><table class="ptable"><tr><td>官位</td><td>${rankName}</td></tr><tr><td>${tooltip.termHtml('merit', '功績')}</td><td>${fmt(N.merit)}</td></tr><tr><td>${tooltip.termHtml('prestige', '威信')}</td><td>${fmt(N.prestige)}</td></tr><tr><td>${tooltip.termHtml('favor', '王の信任')}</td><td>${fmt(N.favor)}</td></tr><tr><td>交易の利益（累計）</td><td>${fmt(N.stats.tradeProfit)} 銭</td></tr><tr><td>王命</td><td>達成 ${N.stats.ordersDone} / 不達 ${N.stats.ordersFailed}</td></tr></table>
        ${st.next ? `<h4>${st.nextName}への昇進</h4><table class="ptable">${st.items.map((i) => `<tr><td>${i.label}</td><td>${fmt(i.now)} / ${fmt(i.need)}</td><td>${i.ok ? '✓' : ''}</td></tr>`).join('')}</table><div class="note">功績は人口の増加・上納・技術の完成・交易の利益・王命の達成で増えます。期限切れの王命があると昇進できません。</div>` : '<div class="note">これ以上の昇進はありません。</div>'}</div></div>`;
    } else if (tab === 'trade') {
      const home0 = reg.cityById.get(world.cityId);
      const reach = reachableCities(world, reg).sort((a, b) => dist(home0, a) - dist(home0, b));
      if (!dest || !reach.some((c) => c.id === dest)) dest = reach[0]?.id || null;
      const d = dest ? reg.cityById.get(dest) : null;
      const home = reg.cityById.get(world.cityId);
      const B = reg.balance.nation.caravan;
      html += `<div class="cols"><div class="col"><h4>${tooltip.termHtml('caravan', '商隊')}を送る</h4>${hasMarketHall(world) ? '' : '<div class="note warn">商隊を送るには市亭が必要です。</div>'}
        <div class="frow"><label>行き先</label><select data-dest>${reach.map((c) => `<option value="${c.id}" ${c.id === dest ? 'selected' : ''}>${c.name}（${reg.nationById.get(c.nation).name}）</option>`).join('')}</select>${d ? `<span class="note">片道 ${Math.max(2, Math.round(dist(home, d) / B.speedPerDay))} 日</span>` : ''}</div>
        <div class="frow"><label>積荷</label><select data-cargo>${reg.goods.map((g) => `<option value="${g.id}" ${g.id === cargoGoods ? 'selected' : ''}>${g.name}（手持ち ${homeStock(world, g.id)}）</option>`).join('')}</select><input type="number" min="1" data-qty value="${cargoQty}" style="width:70px"></div>
        <div class="frow"><label>現地で買う</label><select data-buy><option value="">買わない</option>${reg.goods.map((g) => `<option value="${g.id}" ${g.id === buyGoods ? 'selected' : ''}>${g.name}</option>`).join('')}</select></div>
        ${d ? `<div class="note">${d.name}の相場: 売値 ${reg.goodsById.get(cargoGoods).name} ${cityPrice(world, reg, dest, cargoGoods).toFixed(1)} 銭（基準 ${reg.goodsById.get(cargoGoods).basePrice}）${buyGoods ? `　買値 ${reg.goodsById.get(buyGoods).name} ${cityPrice(world, reg, dest, buyGoods).toFixed(1)} 銭` : ''}<br>特産（${d.specialties.map((s) => reg.goods.find((g) => g.specialty === s)?.name || s).join('・') || 'なし'}）は安く買え、首都では高く売れます。費用 ${caravanFee(world, reg, cargoQty * reg.goodsById.get(cargoGoods).basePrice)} 銭</div>` : ''}
        <button class="btn" data-send ${hasMarketHall(world) && dest ? '' : 'disabled'}>送る</button>
        <div class="note">県令は近くの都市へ、郡守は自国全域と近隣へ、相邦は全国へ送れます。友好度の低い国へは送れません。</div></div>
        <div class="col"><h4>移動中の商隊（${N.caravans.length} / ${B.maxActive}）</h4>${N.caravans.length ? `<table class="ptable">${N.caravans.map((c) => `<tr><td>${reg.cityById.get(c.to).name}</td><td>${c.phase === 'out' ? '往路' : '復路'} ${c.progress}/${c.days} 日</td><td>${Object.entries(c.cargo).map(([id, q]) => `${reg.goodsById.get(id).name} ${q}`).join('・')}${c.phase === 'back' ? `　→ 銭 ${fmt(c.revenue)}${Object.entries(c.bought).map(([id, q]) => `・${reg.goodsById.get(id).name} ${q}`).join('')}` : ''}</td></tr>`).join('')}</table>` : '<div class="note">いません。</div>'}
        <h4>手持ちの交易品</h4><div class="note">${reg.goods.map((g) => `${g.name} ${homeStock(world, g.id)}`).join('　')}</div><div class="note">工房で作った品と商隊が持ち帰った品。市があれば毎月少しずつ売れます。</div></div></div>`;
    } else if (tab === 'diplomacy') {
      html += `<h4>${tooltip.termHtml('relation', '友好度')}（${reg.nationById.get(world.nationId).name}から見た）</h4><table class="ptable">${reg.nations.filter((n) => n.id !== world.nationId).map((n) => { const v = N.relations[world.nationId][n.id]; const key = [world.nationId, n.id].sort().join(':'); return `<tr><td><span class="sw" style="background:${n.color}"></span>${n.name}</td><td><span class="bar"><span style="width:${Math.round((v + 100) / 2)}%;background:${v < 0 ? '#e06060' : '#5fbf6a'}"></span></span> ${Math.round(v)}</td><td>${N.treaties[key] ? (N.treaties[key] === 'alliance' ? '同盟' : '不可侵') : ''}</td><td><input type="number" min="100" step="100" value="300" data-gift-amount="${n.id}" style="width:80px"> 銭 <button class="btn" data-gift="${n.id}">贈物</button></td><td><button class="btn" data-propose="${n.id}" data-kind="non_aggression" ${N.treaties[key] ? 'disabled' : ''}>不可侵</button> <button class="btn" data-propose="${n.id}" data-kind="alliance" ${N.treaties[key] === 'alliance' ? 'disabled' : ''}>同盟</button></td></tr>`; }).join('')}</table>
        <div class="note">贈物は ${reg.balance.nation.relations.giftPerPoint} 銭で友好度 +1（1回で最大 +${reg.balance.nation.relations.giftMax}）。使者を任命すると効きが良くなります。不可侵は郡守から（友好度 ${reg.balance.nation.relations.nonAggressionMin} 以上）、同盟は相邦から（${reg.balance.nation.relations.allianceMin} 以上）。${tooltip.termHtml('hezong', '合従')}・${tooltip.termHtml('lianheng', '連衡')}の史実イベントはフェーズ7で入ります。</div>`;
    } else if (tab === 'orders') {
      const open = N.orders.filter((o) => o.state === 'open'), past = N.orders.filter((o) => o.state !== 'open').slice(-8).reverse();
      const text = (o) => o.kind === 'money' ? `銭 ${fmt(o.amount)} を納めよ` : `穀物 ${fmt(o.amount)} 石を納めよ`;
      html += `<h4>${tooltip.termHtml('royal_order', '王命')}</h4>${open.length ? `<table class="ptable">${open.map((o) => `<tr><td>${text(o)}</td><td>期限まで ${Math.max(0, o.deadlineDay - world.day)} 日</td><td><button class="btn" data-fulfill="${o.id}">納める</button></td></tr>`).join('')}</table>` : '<div class="note">いま王命はありません。数年ごとに王から命令が届きます。</div>'}
        ${past.length ? `<h4>これまで</h4><table class="ptable">${past.map((o) => `<tr><td>${text(o)}</td><td>${o.state === 'done' ? '達成' : '不達'}</td></tr>`).join('')}</table>` : ''}
        <div class="note">達成すると功績 +${reg.balance.nation.merit.perOrder}、王の信任 +${reg.balance.nation.merit.favorOrder}。期限を過ぎると信任 ${reg.balance.nation.merit.favorFailed}。</div>`;
    } else if (tab === 'commandery') {
      html += `<h4>${tooltip.termHtml('commandery', '郡')}の運営</h4>`;
      if (!N.commandery.length) html += `<div class="note">郡守に昇進すると、近くの自国都市 ${reg.balance.nation.cities.commanderyCount} つに方針を指示でき、郡税が入ります（概況の昇進条件を参照）。</div>`;
      else html += `<table class="ptable"><tr><th>都市</th><th>人口</th><th>富</th><th>兵</th><th>方針</th></tr>${N.commandery.map((id) => { const c = reg.cityById.get(id), s = N.cities[id]; return `<tr><td>${c.name}</td><td>${fmt(s.population)}</td><td>${fmt(s.wealth)}</td><td>${fmt(s.army)}</td><td><select data-policy="${id}">${Object.entries(POLICY_NAMES).map(([k, n]) => `<option value="${k}" ${s.policy === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>`; }).join('')}</table><div class="note">農業重視: 人口が増える／商業重視: 富が増え郡税が増える／軍備重視: 兵が増える（フェーズ6）。郡税は各都市の富の ${Math.round(reg.balance.nation.cities.commanderyIncomeRate * 100)}%/年。</div>`;
    }
    body.innerHTML = html;
    body.querySelector('[data-dest]')?.addEventListener('change', (e) => { dest = e.target.value; render(); });
    body.querySelector('[data-cargo]')?.addEventListener('change', (e) => { cargoGoods = e.target.value; render(); });
    body.querySelector('[data-qty]')?.addEventListener('change', (e) => { cargoQty = Math.max(1, Number(e.target.value) || 1); });
    body.querySelector('[data-buy]')?.addEventListener('change', (e) => { buyGoods = e.target.value; render(); });
    body.querySelector('[data-send]')?.addEventListener('click', () => run({ type: 'caravan.send', to: dest, goods: { [cargoGoods]: cargoQty }, buy: buyGoods || null }));
    body.querySelectorAll('[data-gift]').forEach((b) => b.addEventListener('click', () => run({ type: 'diplomacy.gift', nationId: b.dataset.gift, amount: Number(body.querySelector(`[data-gift-amount="${b.dataset.gift}"]`).value) })));
    body.querySelectorAll('[data-propose]').forEach((b) => b.addEventListener('click', () => run({ type: 'diplomacy.propose', nationId: b.dataset.propose, kind: b.dataset.kind })));
    body.querySelectorAll('[data-fulfill]').forEach((b) => b.addEventListener('click', () => run({ type: 'order.fulfill', orderId: Number(b.dataset.fulfill) })));
    body.querySelectorAll('[data-policy]').forEach((s) => s.addEventListener('change', () => run({ type: 'commandery.policy', cityId: s.dataset.policy, policy: s.value })));
  };
  let lastDay = -1;
  return { el, render, toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; if (el.style.display === 'block') { lastDay = world.day; render(); } }, update() { if (el.style.display !== 'block' || world.day === lastDay) return; lastDay = world.day; if (!el.contains(document.activeElement)) { if (world.day % 5 === 0) render(); else drawMap(); } } };
}
