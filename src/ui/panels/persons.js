// 人材パネル: 官職への任命、配下の一覧（忠誠・俸禄）、登用候補と客館の来客、人物の詳細（事績・出典・要確認）。
import { applyCommand } from '../../sim/commands.js';
import { listCandidates, listPatrons, officeSlots, usedSlots, effectiveStats, ageOf, STAT_KEYS, STAT_NAMES, ROLE_NAMES } from '../../sim/persons.js';
import { effectSummary } from '../../sim/research.js';

export function createPersonsPanel(world, reg, tooltip, log) {
  const el = document.getElementById('panel-persons');
  let detailId = null;
  const nationName = (id) => reg.nationById.get(id)?.name || id;
  const statsHtml = (p) => { const st = effectiveStats(world, reg, p); return `<span class="pstats">${STAT_KEYS.map((k) => `<span title="${STAT_NAMES[k]}"><i>${STAT_NAMES[k][0]}</i>${st[k]}</span>`).join('')}</span>`; };
  const officeOf = (id) => Object.keys(world.offices || {}).find((k) => world.offices[k] === id);
  const bar = (v) => `<span class="bar"><span style="width:${Math.round(Math.max(0, Math.min(100, v)))}%"></span></span> ${Math.round(v)}`;
  const run = (cmd) => { const r = applyCommand(world, reg, cmd); if (!r.ok) log.push(r.message); render(); };

  const render = () => {
    const hired = world.persons?.hired || [];
    const cands = listCandidates(world, reg);
    const patrons = listPatrons(world, reg);
    const year = world.calendar.year;
    const detail = detailId ? reg.personById.get(detailId) : null;
    el.innerHTML = `<div class="panel-head"><h3>人材 <span class="sub">任命枠 ${usedSlots(world)} / ${officeSlots(world, reg)}${patrons.length ? `　後ろ盾: ${patrons.map((p) => `<span class="plink" data-person="${p.id}">${p.name}</span>`).join('・')}` : ''}</span></h3><button class="btn close" data-close>閉じる</button></div>
      <div class="cols">
        <div class="col">
          <h4>官職</h4>
          <table class="ptable">${reg.offices.map((o) => `<tr><td>${o.term ? tooltip.termHtml(o.term, o.name) : o.name}<div class="note">${o.effects.map((e) => `${STAT_NAMES[o.mainStats[0]]}${o.mainStats[1] ? '・' + STAT_NAMES[o.mainStats[1]] : ''} × ${e.perStat} → ${effectSummary({ ...e, value: e.perStat * 80 }).replace(/（フェーズ\d）/, '')}（能力80のとき）`).join('<br>')}</div></td>
            <td><select data-office="${o.id}"><option value="">（空席）</option>${hired.map((h) => `<option value="${h.id}" ${world.offices[o.id] === h.id ? 'selected' : ''}>${reg.personById.get(h.id)?.name}</option>`).join('')}</select><div class="note">手当 ${o.salary} 銭/月</div></td></tr>`).join('')}</table>
          <h4>配下（${hired.length} 人）</h4>
          ${hired.length ? `<table class="ptable">${hired.map((h) => { const p = reg.personById.get(h.id); const off = officeOf(h.id); return `<tr><td><span class="plink" data-person="${p.id}">${p.name}</span><div class="note">${ROLE_NAMES[p.role] || p.role}${ageOf(p, year) !== null ? `・${ageOf(p, year)}歳` : ''}${off ? `・${reg.officeById.get(off).name}` : '・無役'}</div></td><td>${statsHtml(p)}</td><td>${tooltip.termHtml('loyalty_person', '忠誠')} ${bar(h.loyalty)}<div class="note">俸禄 ${h.salary}${off ? ` + 手当 ${reg.officeById.get(off).salary}` : ''} 銭/月</div></td><td><button class="btn" data-dismiss="${p.id}">解任</button></td></tr>`; }).join('')}</table>` : '<div class="note">まだ誰も登用していません。右の候補から登用し、官職に任命すると効果が出ます。</div>'}
        </div>
        <div class="col">
          <h4>登用できる人物（${cands.length} 人）</h4>
          ${cands.length ? `<table class="ptable">${cands.map((c) => { const p = c.person; return `<tr><td><span class="plink" data-person="${p.id}">${p.name}</span>${c.visitor ? ` <span class="tag">${tooltip.termHtml('visitor', '来客')} あと${Math.max(0, Math.ceil((c.until - world.day) / 30))}か月</span>` : ''}<div class="note">${nationName(p.nation)}${p.homeNation && p.homeNation !== p.nation ? `（${nationName(p.homeNation)}出身）` : ''}・${ROLE_NAMES[p.role] || p.role}${ageOf(p, year) !== null ? `・${ageOf(p, year)}歳` : ''}</div></td><td>${statsHtml(p)}</td><td><div class="note">俸禄 ${c.salary} 銭/月<br>礼金 ${c.gift} 銭</div></td><td><button class="btn" data-recruit="${p.id}" ${world.money < c.gift ? 'disabled title="礼金が足りません"' : ''}>登用</button></td></tr>`; }).join('')}</table>` : '<div class="note">いま登用できる人物はいません。客館（学宮）を建てると他国の賢者が訪れます。</div>'}
          ${detail ? `<div class="pdetail"><h4>${detail.name}<span class="note">　${nationName(detail.nation)}・${ROLE_NAMES[detail.role] || detail.role}・${detail.born !== null ? `前${-detail.born}年生` : '生年不詳'}${detail.died !== null ? `〜前${-detail.died}年` : ''}</span></h4>
            <div>${statsHtml(detail)}${detail.skills?.length ? `<span class="note">　特技: ${detail.skills.join('・')}</span>` : ''}</div>
            <p>${detail.bio}</p><div class="note">出典: ${detail.source}</div>${detail.note ? `<div class="note warn">${detail.note}</div>` : ''}</div>` : '<div class="note">名前を押すと事績と出典を表示します。</div>'}
        </div>
      </div>`;
    el.querySelector('[data-close]').addEventListener('click', () => { el.style.display = 'none'; });
    el.querySelectorAll('select[data-office]').forEach((s) => s.addEventListener('change', () => run({ type: 'office.appoint', officeId: s.dataset.office, personId: s.value || null })));
    el.querySelectorAll('[data-recruit]').forEach((b) => b.addEventListener('click', () => run({ type: 'person.recruit', personId: b.dataset.recruit })));
    el.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => run({ type: 'person.dismiss', personId: b.dataset.dismiss })));
    el.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => { detailId = b.dataset.person; render(); }));
  };
  // 描き直しは日付が変わった 10 日ごとだけ。プルダウンなどを操作中（パネル内に焦点がある）は描き直さない
  let lastDay = -1;
  return { el, render, toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; if (el.style.display === 'block') { lastDay = world.day; render(); } }, update() { if (el.style.display !== 'block' || world.day === lastDay) return; lastDay = world.day; if (world.day % 10 === 0 && !el.contains(document.activeElement)) render(); } };
}
