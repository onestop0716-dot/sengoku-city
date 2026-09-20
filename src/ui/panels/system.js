// メニュー（≡）: 保存・読み込み・書き出し・取り込み、実績、設定、案内のやり直し、タイトルへ。
import { listSlots, saveToSlot, loadFromSlot, deleteSlot, exportToFile, importFromFile, setPendingLoad } from '../../app/saves.js';
import { achievementMetrics } from '../../sim/achievements.js';

export function createSystemPanel(world, reg, log, { onSettings, onRestartTutorial } = {}) {
  const el = document.getElementById('panel-system');
  let tab = 'save';
  const fmtDate = (m) => m ? `${m.nationName}・${m.cityName}　${m.year < 0 ? '前' + -m.year : m.year}年${m.month}月　人口 ${m.population?.toLocaleString('ja-JP')}　${m.rank || ''}` : '';
  const render = () => {
    const slots = listSlots();
    let html = `<div class="panel-head"><h3>メニュー</h3><button class="btn close" data-close>閉じる</button></div><div class="ntabs"><button data-tab="save" class="${tab === 'save' ? 'active' : ''}">保存・読込</button><button data-tab="ach" class="${tab === 'ach' ? 'active' : ''}">実績</button><button data-tab="other" class="${tab === 'other' ? 'active' : ''}">その他</button></div>`;
    if (tab === 'save') {
      html += `<h4>スロット</h4><table class="ptable">${slots.map((s) => `<tr><td>${s.slot === 'auto' ? 'オート' : `スロット ${s.slot}`}</td><td class="note">${s.empty ? '（空き）' : fmtDate(s.meta)}</td><td>${s.slot === 'auto' ? '' : `<button class="btn" data-save="${s.slot}">保存</button>`} ${s.empty ? '' : `<button class="btn" data-load="${s.slot}">読込</button> <button class="btn" data-del="${s.slot}">削除</button>`}</td></tr>`).join('')}</table>
        <div class="note">オートセーブは毎年の初めと、画面を閉じたり別のアプリへ切り替えたときに保存されます。ブラウザの保存領域は長く使わないと消えることがあるので、大事なデータはファイルに書き出してください。</div>
        <h4>ファイル</h4><div class="frow"><button class="btn" data-export>ファイルに書き出す</button><label class="btn">ファイルから読み込む<input type="file" accept=".json,application/json" data-import style="display:none"></label></div>
        <div class="note">iPad では共有メニューから「ファイル」に保存できます。PC で書き出したファイルも読み込めます。</div>`;
    } else if (tab === 'ach') {
      const got = world.achievements || {};
      html += `<h4>実績（${Object.keys(got).length} / ${reg.achievements.length}）</h4><table class="ptable">${reg.achievements.map((a) => `<tr class="${a.id in got ? 'done' : 'locked'}"><td>${a.id in got ? '★' : '☆'}</td><td>${a.name}</td><td class="note">${a.desc}${a.id in got ? `　（${got[a.id]}日目）` : ''}</td></tr>`).join('')}</table>`;
    } else {
      html += `<div class="frow"><button class="btn" data-settings>設定（描画品質・助言の頻度）</button></div><div class="frow"><button class="btn" data-tutorial>案内をやり直す</button></div><div class="frow"><button class="btn" data-title>タイトルへ戻る（保存してから）</button></div>
        <h4>出来事の記録</h4>${world.events?.history?.length ? `<table class="ptable">${world.events.history.slice().reverse().slice(0, 10).map((h) => `<tr><td>${h.day}日目</td><td>${h.name}</td><td class="note">${h.choice ? `「${h.choice}」` : ''}</td></tr>`).join('')}</table>` : '<div class="note">まだ出来事はありません。</div>'}`;
    }
    el.innerHTML = html;
    el.querySelector('[data-close]').addEventListener('click', () => { el.style.display = 'none'; });
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    el.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => { const r = saveToSlot(world, reg, b.dataset.save); log.push(r.ok ? `スロット ${b.dataset.save} に保存しました` : r.message); render(); }));
    el.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => { if (!confirm('いまの進行を捨てて読み込みますか？（先に保存しておくと安心です）')) return; const d = loadFromSlot(b.dataset.load); if (d && setPendingLoad(d)) location.reload(); }));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { if (confirm('削除しますか？')) { deleteSlot(b.dataset.del); render(); } }));
    el.querySelector('[data-export]')?.addEventListener('click', async () => { const r = await exportToFile(world, reg); log.push(r.ok ? (r.via === 'share' ? '共有しました' : 'ファイルを書き出しました') : r.message); });
    el.querySelector('[data-import]')?.addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const d = await importFromFile(f); if (confirm('このファイルを読み込みますか？（いまの進行は捨てられます）') && setPendingLoad(d)) location.reload(); } catch (err) { log.push(`読み込めません: ${err.message}`); } });
    el.querySelector('[data-settings]')?.addEventListener('click', () => { el.style.display = 'none'; onSettings?.(); });
    el.querySelector('[data-tutorial]')?.addEventListener('click', () => { el.style.display = 'none'; onRestartTutorial?.(); });
    el.querySelector('[data-title]')?.addEventListener('click', () => { saveToSlot(world, reg, 'auto'); location.reload(); });
  };
  return { el, render, toggle() { el.style.display = el.style.display === 'block' ? 'none' : 'block'; if (el.style.display === 'block') render(); }, update() {}, metrics: () => achievementMetrics(world, reg) };
}
