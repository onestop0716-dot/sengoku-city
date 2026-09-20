// 出来事の選択画面: 発生中はゲームを止め、選択肢を選ぶまで閉じない。
import { applyCommand } from '../sim/commands.js';
import { choiceAvailable } from '../sim/events.js';

export function createEventModal(world, reg, loop, log) {
  const el = document.getElementById('event-modal');
  let shown = null, resumeIndex = null;
  const render = () => {
    const p = world.events?.pending;
    if (!p) { if (shown) { el.style.display = 'none'; shown = null; if (resumeIndex !== null) { loop.setSpeedIndex(resumeIndex); resumeIndex = null; } } return; }
    if (shown === p) return;
    shown = p;
    const ev = reg.eventById.get(p.id);
    resumeIndex = loop.speedIndex; loop.setSpeedIndex(0);
    el.innerHTML = `<div class="ev-card"><div class="ev-kind">${{ disaster: '災い', social: '民の動き', visitor: '来訪', political: '政', historical: '史実' }[ev.kind] || ''}</div><h3>${ev.name}</h3><p>${ev.text}</p>${p.rec.notes?.length ? `<div class="note">${p.rec.notes.join('。')}</div>` : ''}
      <div class="ev-choices">${ev.choices.map((c, i) => `<button class="btn" data-choice="${i}" ${choiceAvailable(world, c) ? '' : 'disabled title="条件が足りません"'}>${c.text}</button>`).join('')}</div>${ev.note ? `<div class="note src">根拠: ${ev.note}</div>` : ''}</div>`;
    el.style.display = 'flex';
    el.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => { const r = applyCommand(world, reg, { type: 'event.choose', choice: Number(b.dataset.choice) }); if (!r.ok) log.push(r.message); render(); }));
  };
  return { update: render };
}
