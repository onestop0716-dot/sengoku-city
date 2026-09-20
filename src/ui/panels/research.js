// 研究パネル: 研究中の技術と進み、分野ごとの技術の一覧（状態・費用・期間・効果・根拠）。
import { applyCommand } from '../../sim/commands.js';
import { canResearch, researchSpeed, hasTech, effectSummary } from '../../sim/research.js';

const FIELDS = [['agriculture', '農'], ['craft', '工'], ['military', '軍'], ['politics', '政'], ['commerce', '商']];

export function createResearchPanel(world, reg, tooltip, log) {
  const el = document.getElementById('panel-research');
  const run = (cmd) => { const r = applyCommand(world, reg, cmd); if (!r.ok) log.push(r.message); render(); };
  const render = () => {
    const r = world.research || { current: null, progress: 0 };
    const cur = r.current ? reg.techById.get(r.current) : null;
    const nation = reg.nationById.get(world.nationId);
    let html = `<div class="panel-head"><h3>${tooltip.termHtml('tech', '研究')}</h3><button class="btn close" data-close>閉じる</button></div>`;
    if (cur) {
      const spd = researchSpeed(world, reg, cur.id), left = Math.max(0, Math.ceil((cur.days - r.progress) / spd));
      html += `<div class="rcurrent"><b>研究中: ${cur.name}</b>　<span class="bar wide"><span style="width:${Math.round((r.progress / cur.days) * 100)}%"></span></span> ${Math.round((r.progress / cur.days) * 100)}%　残り約 ${left} 日（速さ ×${spd.toFixed(2)}、費用 ${cur.cost} 銭/月）<button class="btn" data-cancel>中止</button></div>`;
    } else html += `<div class="rcurrent note">研究していません。下から選んでください。研究費は毎月引かれ、客館・国の得意分野・配下の知略で速くなります。${nation?.techBonus ? `　${nation.name}の得意: ${Object.keys(nation.techBonus).map((k) => ({ agriculture: '農', craft: '工', military: '軍', politics: '政', commerce: '商', law: '法', cavalry: '騎兵', infantry: '歩兵', irrigation: '灌漑', crossbow: '弩', iron: '鉄', scholarship: '学問', trade: '交易' }[k] || k)).join('・')}` : ''}</div>`;
    html += '<div class="rfields">';
    for (const [fid, fname] of FIELDS) {
      const techs = reg.techs.filter((t) => t.field === fid);
      html += `<div class="rfield"><h4>${fname}</h4>${techs.map((t) => {
        const done = hasTech(world, t.id), active = r.current === t.id, c = canResearch(world, reg, t.id);
        const cls = done ? 'done' : active ? 'active' : c.ok ? 'ready' : 'locked';
        const spd = researchSpeed(world, reg, t.id);
        return `<div class="tech ${cls}"><div class="tname">${t.name}${done ? ' <span class="tag">完成</span>' : active ? ' <span class="tag">研究中</span>' : ''}</div>
          <div class="note">${t.desc}</div>
          <div class="teff">${(t.effects || []).map(effectSummary).join('、')}${t.unlocks?.length ? `、解禁: ${t.unlocks.map((u) => reg.structureById.get(u)?.name).join('・')}` : ''}</div>
          ${!done ? `<div class="note">${t.cost} 銭/月・約 ${Math.ceil(t.days / spd)} 日${t.requires?.length ? `・前提: ${t.requires.map((x) => reg.techById.get(x)?.name).join('・')}` : ''}</div>` : ''}
          ${t.note ? `<div class="note src">根拠: ${t.note}</div>` : ''}
          ${!done && !active ? `<button class="btn" data-start="${t.id}" ${c.ok ? '' : `disabled title="${c.message}"`}>研究</button>` : ''}</div>`;
      }).join('')}</div>`;
    }
    html += '</div>';
    el.innerHTML = html;
    el.querySelector('[data-close]').addEventListener('click', () => { el.style.display = 'none'; });
    el.querySelector('[data-cancel]')?.addEventListener('click', () => run({ type: 'research.cancel' }));
    el.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => run({ type: 'research.start', techId: b.dataset.start })));
  };
  let lastDay = -1;
  return { el, render, toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; if (el.style.display === 'block') { lastDay = world.day; render(); } }, update() { if (el.style.display !== 'block' || world.day === lastDay) return; lastDay = world.day; if (world.day % 5 === 0 && !el.contains(document.activeElement)) render(); } };
}
