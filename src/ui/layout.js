// パネルの開閉（左の建物一覧・右の情報・需要・ログ）と、タッチ端末用の画面調整（操作説明の切り替え）。
const KEY = 'sengoku-city.layout';

export function setupLayout({ touch }) {
  let state = { toolbar: true, info: true, demand: true, log: true };
  try { const raw = localStorage.getItem(KEY); if (raw) state = { ...state, ...JSON.parse(raw) }; } catch { /* なし */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 無視 */ } };
  document.body.classList.toggle('touch', !!touch);
  const hint = document.getElementById('hint');
  if (touch) hint.textContent = '1本指: 移動（ツール選択中はツールを適用）／ 2本指: 移動・ピンチで拡大縮小・ひねりで回転 ／ タップ: 選択 ／ 長押し: 詳細';
  const make = (id, side, label) => {
    const el = document.getElementById(id);
    const tab = document.createElement('button');
    tab.className = `collapse-tab ${side}`; tab.dataset.for = id; tab.textContent = label;
    tab.title = `${label}を開く／閉じる`;
    document.body.appendChild(tab);
    const apply = () => { const open = state[id]; el.classList.toggle('collapsed', !open); tab.classList.toggle('open', open); tab.textContent = open ? (side === 'left' ? '◀' : side === 'right' ? '▶' : '▼') : label; };
    tab.addEventListener('click', () => { state[id] = !state[id]; save(); apply(); });
    apply();
  };
  make('toolbar', 'left', '建物');
  make('info', 'right', '情報');
  make('demand', 'bottomleft', '需要');
  make('log', 'bottom', '記録');
  return { state };
}
