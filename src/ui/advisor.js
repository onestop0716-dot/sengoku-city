// 案内役の表示: 右下に若い書記官（SVG で描く完全オリジナルの人物）と吹き出し。押すと「いまやるべきこと」と助言の履歴。
// 助言の条件・文は data/advice.json、判断は sim/advisor.js。
import { evaluate, restartTutorial, ensureAdvisorState } from '../sim/advisor.js';

const TUTORIAL_KEY = 'sengoku-city.tutorialDone';
const MINI_KEY = 'sengoku-city.advisorMini';

/** 書記官のSVG。表情は data-ex 属性（normal / happy / troubled / warning）で切り替える */
function characterSvg() {
  return `<svg viewBox="0 0 96 112" width="96" height="112" xmlns="http://www.w3.org/2000/svg" data-ex="normal" aria-label="書記官">
  <defs>
    <linearGradient id="adv-robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d4f7a"/><stop offset="1" stop-color="#2b3756"/></linearGradient>
    <radialGradient id="adv-cheek" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f0a090" stop-opacity="0.7"/><stop offset="1" stop-color="#f0a090" stop-opacity="0"/></radialGradient>
  </defs>
  <!-- 体: 深衣（裾の広がる長衣）と帯 -->
  <path d="M30 66 L66 66 L76 110 L20 110 Z" fill="url(#adv-robe)"/>
  <path d="M48 66 L58 66 L52 108 L44 108 Z" fill="#33426a" opacity="0.6"/>
  <rect x="31" y="78" width="34" height="5" rx="1" fill="#8b1a1a"/>
  <!-- 左腕: 竹簡を抱える -->
  <path d="M30 70 Q16 78 22 96 L34 92 Q30 82 38 76 Z" fill="#3d4f7a"/>
  <g transform="translate(14 84) rotate(-12)">
    <rect x="0" y="0" width="4" height="22" rx="1" fill="#d8c48a"/><rect x="5" y="0" width="4" height="22" rx="1" fill="#cbb77a"/><rect x="10" y="0" width="4" height="22" rx="1" fill="#d8c48a"/><rect x="15" y="0" width="4" height="22" rx="1" fill="#cbb77a"/><rect x="20" y="0" width="4" height="22" rx="1" fill="#d8c48a"/>
    <rect x="-1" y="5" width="26" height="1.4" fill="#6b4a2a"/><rect x="-1" y="15" width="26" height="1.4" fill="#6b4a2a"/>
    <g stroke="#3a2a1c" stroke-width="0.8"><line x1="2" y1="3" x2="2" y2="19"/><line x1="7" y1="3" x2="7" y2="14"/><line x1="12" y1="3" x2="12" y2="19"/><line x1="17" y1="3" x2="17" y2="12"/><line x1="22" y1="3" x2="22" y2="17"/></g>
  </g>
  <!-- 右腕: 筆 -->
  <path d="M66 70 Q82 76 78 94 L66 92 Q68 82 60 76 Z" fill="#3d4f7a"/>
  <ellipse cx="72" cy="92" rx="5" ry="4" fill="#f0d0b0"/>
  <g class="adv-brush" transform="translate(72 92)">
    <line x1="0" y1="2" x2="10" y2="-26" stroke="#7a4a2a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M9.5 -26 L12.5 -33 L11 -26 Z" fill="#222"/>
  </g>
  <!-- 頭: 大きめ（2.5頭身） -->
  <ellipse cx="48" cy="42" rx="24" ry="25" fill="#f3d6b8"/>
  <path d="M24 40 Q26 14 48 14 Q70 14 72 40 Q64 32 48 30 Q32 32 24 40 Z" fill="#2a1e14"/>
  <!-- 髻（もとどり）と幘（頭巾） -->
  <ellipse cx="48" cy="14" rx="7" ry="6" fill="#2a1e14"/>
  <path d="M26 30 Q48 20 70 30 L70 24 Q48 12 26 24 Z" fill="#4a3a6a"/>
  <path d="M40 12 L56 12 L54 18 L42 18 Z" fill="#4a3a6a"/>
  <!-- 耳 -->
  <ellipse cx="25" cy="46" rx="4" ry="5" fill="#f0c9a8"/><ellipse cx="71" cy="46" rx="4" ry="5" fill="#f0c9a8"/>
  <!-- 頬 -->
  <circle cx="34" cy="52" r="6" fill="url(#adv-cheek)"/><circle cx="62" cy="52" r="6" fill="url(#adv-cheek)"/>
  <!-- 表情: 通常 -->
  <g class="ex ex-normal">
    <path d="M32 38 Q38 35 43 38" stroke="#2a1e14" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M53 38 Q58 35 64 38" stroke="#2a1e14" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="38" cy="46" rx="3.2" ry="4" fill="#2a1e14"/><ellipse cx="58" cy="46" rx="3.2" ry="4" fill="#2a1e14"/>
    <circle cx="39" cy="44.5" r="1.1" fill="#fff"/><circle cx="59" cy="44.5" r="1.1" fill="#fff"/>
    <path d="M42 57 Q48 61 54 57" stroke="#a04a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
  <!-- 表情: 喜び -->
  <g class="ex ex-happy">
    <path d="M32 37 Q38 33 43 37" stroke="#2a1e14" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M53 37 Q58 33 64 37" stroke="#2a1e14" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M34 47 Q38 42 42 47" stroke="#2a1e14" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M54 47 Q58 42 62 47" stroke="#2a1e14" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M40 56 Q48 65 56 56 Z" fill="#a04a3a"/>
    <path d="M18 30 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 Z" fill="#f3d36a"/>
  </g>
  <!-- 表情: 困り -->
  <g class="ex ex-troubled">
    <path d="M32 36 Q38 39 43 40" stroke="#2a1e14" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M53 40 Q58 39 64 36" stroke="#2a1e14" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="38" cy="47" rx="3" ry="3.6" fill="#2a1e14"/><ellipse cx="58" cy="47" rx="3" ry="3.6" fill="#2a1e14"/>
    <circle cx="39" cy="46" r="1" fill="#fff"/><circle cx="59" cy="46" r="1" fill="#fff"/>
    <path d="M42 59 Q45 56 48 59 Q51 62 54 59" stroke="#a04a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M70 28 q4 6 0 9 q-4 -3 0 -9 Z" fill="#8fc3e8"/>
  </g>
  <!-- 表情: 警告 -->
  <g class="ex ex-warning">
    <path d="M32 34 Q38 36 43 39" stroke="#2a1e14" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M53 39 Q58 36 64 34" stroke="#2a1e14" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse cx="38" cy="47" rx="3.6" ry="4.4" fill="#2a1e14"/><ellipse cx="58" cy="47" rx="3.6" ry="4.4" fill="#2a1e14"/>
    <circle cx="39" cy="45" r="1.2" fill="#fff"/><circle cx="59" cy="45" r="1.2" fill="#fff"/>
    <ellipse cx="48" cy="59" rx="4" ry="4.5" fill="#a04a3a"/>
    <g fill="#e05a3a"><rect x="76" y="20" width="4" height="12" rx="2"/><circle cx="78" cy="37" r="2.2"/></g>
  </g>
</svg>`;
}

export function createAdvisorUi(world, reg, settings, { onOpenSettings, onOpen } = {}) {
  const A = reg.advice;
  const root = document.getElementById('advisor');
  const panel = document.getElementById('advisor-panel');
  const firstPlay = (() => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; } })();
  let mini = (() => { try { return localStorage.getItem(MINI_KEY) === '1'; } catch { return false; } })();
  let tutorial = firstPlay;
  root.innerHTML = `
    <div class="adv-bubble" id="adv-bubble" style="display:none"><button class="adv-close" title="閉じる">×</button><b class="adv-title"></b><div class="adv-text"></div></div>
    <div class="adv-char" title="${A.character.name}（${A.character.reading}）: ${A.character.role}。押すと「いまやるべきこと」">
      ${characterSvg()}
      <span class="adv-badge" style="display:none"></span>
      <button class="adv-mini" title="小さくする">－</button>
    </div>`;
  const bubble = root.querySelector('#adv-bubble'), titleEl = root.querySelector('.adv-title'), textEl = root.querySelector('.adv-text');
  const svg = root.querySelector('svg'), charEl = root.querySelector('.adv-char'), badge = root.querySelector('.adv-badge'), miniBtn = root.querySelector('.adv-mini');
  let hideAt = 0, lastDay = -1, lastTodo = [];
  const setExpression = (ex) => svg.setAttribute('data-ex', ex);
  const applyMini = () => { root.classList.toggle('mini', mini); miniBtn.textContent = mini ? '＋' : '－'; miniBtn.title = mini ? '元の大きさに戻す' : '小さくする'; if (mini) bubble.style.display = 'none'; };
  miniBtn.addEventListener('click', (e) => { e.stopPropagation(); mini = !mini; try { localStorage.setItem(MINI_KEY, mini ? '1' : '0'); } catch { /* 無視 */ } applyMini(); });
  root.querySelector('.adv-close').addEventListener('click', (e) => { e.stopPropagation(); bubble.style.display = 'none'; });
  applyMini();

  const speak = (adv) => {
    if (!adv) return;
    setExpression(adv.expression);
    titleEl.textContent = adv.title; textEl.textContent = adv.text;
    if (!mini) bubble.style.display = 'block';
    charEl.classList.remove('adv-pop'); void charEl.offsetWidth; charEl.classList.add('adv-pop');
    hideAt = performance.now() + 9000 + adv.text.length * 90;
  };

  const renderPanel = () => {
    const st = ensureAdvisorState(world);
    const hist = st.history.slice().reverse();
    panel.innerHTML = `<h3>${A.character.name}の帳面 <span style="font-size:11px;opacity:.6;font-weight:normal">${A.character.role}</span></h3>
      <h4>いまやるべきこと</h4>
      ${lastTodo.length ? `<ol class="adv-todo">${lastTodo.map((t) => `<li class="p${t.priority}"><span class="adv-pri">${t.priority >= 5 ? '至急' : t.priority >= 4 ? '重要' : t.priority >= 3 ? '要対応' : t.priority >= 2 ? '提案' : '目標'}</span>${t.text}</li>`).join('')}</ol>` : `<div class="note">いまは差し迫ったことはありません。${st.tutorialDone || !tutorial ? '人口と収支を眺めつつ、区画を少しずつ広げましょう。' : '案内に沿って進めてください。'}</div>`}
      <h4>助言の履歴</h4>
      ${hist.length ? `<ul class="adv-hist">${hist.map((h) => `<li><span class="day">${h.day}日目</span><b>${h.title}</b><div>${h.text}</div></li>`).join('')}</ul>` : '<div class="note">まだ助言はありません。</div>'}
      <div class="adv-actions"><button class="btn" id="adv-restart">案内をやり直す</button><button class="btn" id="adv-settings">助言の頻度を変える</button><button class="btn" id="adv-close">閉じる</button></div>`;
    panel.querySelector('#adv-restart').addEventListener('click', () => { restartTutorial(world); tutorial = true; lastDay = -1; panel.style.display = 'none'; });
    panel.querySelector('#adv-settings').addEventListener('click', () => { panel.style.display = 'none'; onOpenSettings?.(); });
    panel.querySelector('#adv-close').addEventListener('click', () => { panel.style.display = 'none'; });
  };
  charEl.addEventListener('click', () => {
    if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
    onOpen?.(); renderPanel(); panel.style.display = 'block'; badge.style.display = 'none';
  });

  return {
    el: panel,
    /** 毎フレーム。日が変わったときだけ判断する */
    update() {
      if (world.day === lastDay) { if (hideAt && performance.now() > hideAt) { bubble.style.display = 'none'; hideAt = 0; } return; }
      lastDay = world.day;
      const r = evaluate(world, reg, { frequency: settings.advisor, tutorial });
      lastTodo = r.todo;
      const urgent = r.todo.filter((t) => t.priority >= 4).length;
      badge.style.display = urgent ? 'inline-block' : 'none'; badge.textContent = urgent;
      if (r.tutorial) speak(r.tutorial);
      else if (r.show) speak(r.show);
      else if (!hideAt) setExpression(r.metrics.fine ? 'normal' : urgent ? 'troubled' : 'normal');
      if (tutorial && ensureAdvisorState(world).tutorialDone) { tutorial = false; try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* 無視 */ } }
      if (panel.style.display === 'block') renderPanel();
    },
  };
}
