// 表示モードの UI: 上部の「表示」ボタンとメニュー、画面端の凡例（モード名・色の意味・区画の集計）、ホバー時の内訳、キー操作。
import { STATE_MODES, STATE_MODE_IDS, ZONE_KIND_COLORS, ZONE_KIND_NAMES, gradientColor } from '../sim/view-data.js';

const rgbCss = ([r, g, b]) => `rgb(${r},${g},${b})`;

export function createViewModePanel(world, reg, viewMode, { button } = {}) {
  const menu = document.getElementById('view-menu');
  const legend = document.getElementById('view-legend');
  const tip = document.getElementById('view-tip');
  const items = [['normal', '通常'], ['zones', '区画'], ...STATE_MODE_IDS.map((id) => [id, STATE_MODES[id].name])];
  menu.innerHTML = `<div class="vm-head">表示モード <span class="vm-key">Tab: 順送り / Esc: 通常</span></div>
    <button data-mode="normal">通常</button><button data-mode="zones">区画</button>
    <div class="vm-sub">状態</div>${STATE_MODE_IDS.map((id) => `<button data-mode="${id}" class="sub">${STATE_MODES[id].name}</button>`).join('')}`;
  menu.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { viewMode.set(b.dataset.mode); menu.style.display = 'none'; }));
  const toggleMenu = () => { menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; };
  button?.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== button) menu.style.display = 'none'; });

  const nameOf = (m) => items.find(([id]) => id === m)?.[1] || m;
  let legendStamp = '';
  const renderLegend = () => {
    const m = viewMode.mode;
    if (m === 'normal') { legend.style.display = 'none'; legendStamp = ''; return; }
    legend.style.display = 'block';
    let html = `<div class="vl-title">表示: <b>${m === 'zones' ? '区画' : '状態 › ' + STATE_MODES[m].name}</b> <span class="vm-key">Tab / Esc</span></div>`;
    if (m === 'zones') {
      const stats = viewMode.zoneStats();
      const stamp = 'z' + stats.map((s) => `${s.id}:${s.tiles}:${s.built}:${s.noRoad}`).join(',');
      if (stamp === legendStamp) return; legendStamp = stamp;
      html += stats.length ? `<table class="vl-table">${stats.map((s) => `<tr><td><span class="sw" style="background:${s.color}"></span>${s.name}</td><td>${s.tiles} マス</td><td>${s.tiles ? Math.round((s.built / s.tiles) * 100) : 0}% 建築</td><td>${s.noRoad ? `<span class="vl-bad">道路なし ${s.noRoad}</span>` : ''}</td></tr>`).join('')}</table>` : '<div class="note">区画はまだありません</div>';
      html += `<div class="vl-row">${Object.entries(ZONE_KIND_COLORS).map(([k, c]) => `<span><span class="sw${Number(k) === 1 ? ' sw-road' : ''}" style="background:${c}"></span>${ZONE_KIND_NAMES[k]}</span>`).join('')}<span><span class="sw sw-hatch"></span>未建築の区画（斜線）</span><span><span class="sw sw-dots"></span>道路が届かない区画（点線・家が建たない）</span></div>`;
    } else {
      const stamp = 's' + m;
      if (stamp === legendStamp) return; legendStamp = stamp;
      const L = STATE_MODES[m].legend;
      html += `<div class="vl-grad"><span>${L[0]}</span><span class="vl-bar" style="background:linear-gradient(90deg,${rgbCss(gradientColor(0))},${rgbCss(gradientColor(0.5))},${rgbCss(gradientColor(1))})"></span><span>${L[2]}</span></div>`;
      const notes = { road: '点線: 区画はあるが道路が遠くて建たないマス。道路を延ばすと直ります', water: '輪: 井戸・水路の効果範囲', security: '輪: 官府・獄・望楼などの効果範囲', prosperity: '点線: 区画はあるが建物が建つ基準に届いていないマス', market: '枠: 市・市亭の範囲', food: '枠: 官倉・水路', loyalty: '枠: 民忠を上げる建築', fertility: '', environment: '隣の工房で下がり、貴族の邸などで上がる' };
      if (notes[m]) html += `<div class="note">${notes[m]}</div>`;
      html += `<div class="note">建築を選ぶと、置いたときに改善するマスが明滅します</div>`;
    }
    legend.innerHTML = html;
  };
  viewMode.onChange(() => { legendStamp = ''; renderLegend(); });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Tab') { e.preventDefault(); viewMode.cycle(); }
    else if (e.code === 'Escape') viewMode.set('normal');
  });

  return {
    /** マスにカーソルが乗ったとき（input.js から呼ぶ）。tile が null なら消す */
    hover(tile, clientX, clientY) {
      if (!tile || viewMode.mode === 'normal') { tip.style.display = 'none'; return; }
      const d = viewMode.describe(tile.x, tile.y);
      if (!d) { tip.style.display = 'none'; return; }
      tip.innerHTML = `<b>${d.title}</b>（${tile.x}, ${tile.y}）<div>${d.value}</div>${d.preview ? `<div class="vt-preview">ここに建てると: ${d.preview}</div>` : ''}${d.parts.length ? `<table>${d.parts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>` : ''}`;
      tip.style.display = 'block';
      tip.style.left = Math.min(clientX + 14, window.innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.min(clientY + 14, window.innerHeight - tip.offsetHeight - 8) + 'px';
    },
    update() { if (viewMode.mode === 'zones') renderLegend(); },   // 集計が変わったときだけ描き直す（stamp で判定）
    nameOf,
  };
}
