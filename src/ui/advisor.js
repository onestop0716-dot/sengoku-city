// 案内役の表示: 右下に案内役の画像（advice.json の characters、設定で選ぶ）と吹き出し。押すと「いまやるべきこと」と助言の履歴。
// 表情の差分は持たず、状態は動き（ふわふわ・跳ねる・傾く・震える）と記号（♪・汗・！）で表す。
// 助言の条件・文は data/advice.json、判断は sim/advisor.js。
import { evaluate, restartTutorial, ensureAdvisorState, characterOf, applyTone } from '../sim/advisor.js';

const TUTORIAL_KEY = 'sengoku-city.tutorialDone';
const MINI_KEY = 'sengoku-city.advisorMini';

export function createAdvisorUi(world, reg, settings, { onOpenSettings, onOpen, onView } = {}) {
  const A = reg.advice;
  let ch = characterOf(reg, settings.advisorCharacter);
  const root = document.getElementById('advisor');
  const panel = document.getElementById('advisor-panel');
  const firstPlay = (() => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; } })();
  let mini = (() => { try { return localStorage.getItem(MINI_KEY) === '1'; } catch { return false; } })();
  let tutorial = firstPlay;
  root.innerHTML = `
    <div class="adv-bubble" id="adv-bubble" style="display:none"><button class="adv-close" title="閉じる">×</button><b class="adv-title"></b><div class="adv-text"></div><button class="btn adv-view" style="display:none">表示モードで確認</button></div>
    <div class="adv-char state-normal">
      <img class="adv-img" alt="" draggable="false">
      <span class="adv-mark" aria-hidden="true"><svg class="adv-mark-note" viewBox="0 0 24 30" width="24" height="30"><path d="M9 4 L21 1 L21 19 a4.5 3.5 0 1 1 -3 -3.2 L18 6 L12 7.6 L12 23 a4.5 3.5 0 1 1 -3 -3.2 Z" fill="#f0b428" stroke="#7a4a10" stroke-width="1.4" stroke-linejoin="round"/></svg><svg class="adv-mark-bang" viewBox="0 0 16 30" width="16" height="30"><path d="M4 2 L12 2 L10.5 19 L5.5 19 Z" fill="#e0321e" stroke="#7a1a10" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="25" r="3.2" fill="#e0321e" stroke="#7a1a10" stroke-width="1.4"/></svg><svg class="adv-mark-sweat" viewBox="0 0 20 28" width="18" height="25"><path d="M10 1 C10 1 2 13 2 18 a8 8 0 0 0 16 0 C18 13 10 1 10 1 Z" fill="#8fd0f0" stroke="#3a86b8" stroke-width="1.5"/><ellipse cx="7" cy="17" rx="1.6" ry="3" fill="#fff" opacity=".8"/></svg></span>
      <span class="adv-badge" style="display:none"></span>
      <button class="adv-mini" title="小さくする">－</button>
    </div>`;
  const bubble = root.querySelector('#adv-bubble'), titleEl = root.querySelector('.adv-title'), textEl = root.querySelector('.adv-text'), viewBtn = root.querySelector('.adv-view');
  let currentView = null;
  viewBtn.addEventListener('click', (e) => { e.stopPropagation(); if (currentView) onView?.(currentView); bubble.style.display = 'none'; hideAt = 0; });
  const charEl = root.querySelector('.adv-char'), badge = root.querySelector('.adv-badge'), miniBtn = root.querySelector('.adv-mini'), imgEl = root.querySelector('.adv-img');
  const imageFor = (ex) => ch.images?.[ex] || ch.image || 'assets/ui/advisor.png';
  const applyCharacter = () => { imgEl.src = imageFor('normal'); imgEl.alt = ch.name; charEl.title = `${ch.name}（${ch.reading}）: ${ch.role}。押すと「いまやるべきこと」`; };
  applyCharacter();
  let hideAt = 0, lastDay = -1, lastTodo = [];
  /** 状態 → 動きと記号（normal: ふわふわ / happy: 跳ねる+♪ / troubled: 傾く+汗 / warning: 震える+！+赤い吹き出し） */
  const setExpression = (ex) => { for (const e of A.expressions) charEl.classList.toggle(`state-${e}`, e === ex); bubble.classList.toggle('warn', ex === 'warning'); const src = imageFor(ex); if (imgEl.getAttribute('src') !== src) imgEl.src = src; };
  const applyMini = () => { root.classList.toggle('mini', mini); miniBtn.textContent = mini ? '＋' : '－'; miniBtn.title = mini ? '元の大きさに戻す' : '小さくする'; if (mini) bubble.style.display = 'none'; };
  miniBtn.addEventListener('click', (e) => { e.stopPropagation(); mini = !mini; try { localStorage.setItem(MINI_KEY, mini ? '1' : '0'); } catch { /* 無視 */ } applyMini(); });
  root.querySelector('.adv-close').addEventListener('click', (e) => { e.stopPropagation(); bubble.style.display = 'none'; });
  applyMini();

  const speak = (adv) => {
    if (!adv) return;
    setExpression(adv.expression);
    titleEl.textContent = adv.title; textEl.textContent = adv.text;
    currentView = adv.view || null; viewBtn.style.display = currentView && onView ? 'inline-block' : 'none';
    if (!mini) bubble.style.display = 'block';
    charEl.classList.remove('adv-pop'); void charEl.offsetWidth; charEl.classList.add('adv-pop');
    hideAt = performance.now() + 9000 + adv.text.length * 90;
  };

  const renderPanel = () => {
    const st = ensureAdvisorState(world);
    const hist = st.history.slice().reverse();
    panel.innerHTML = `<h3>${ch.name}のひとこと <span style="font-size:11px;opacity:.6;font-weight:normal">${ch.role}</span></h3>
      <h4>いまやるべきこと</h4>
      ${lastTodo.length ? `<ol class="adv-todo">${lastTodo.map((t) => `<li class="p${t.priority}"><span class="adv-pri">${t.priority >= 5 ? '至急' : t.priority >= 4 ? '重要' : t.priority >= 3 ? '要対応' : t.priority >= 2 ? '提案' : '目標'}</span>${t.text}</li>`).join('')}</ol>` : `<div class="note">いまは差し迫ったことはありません。${st.tutorialDone || !tutorial ? applyTone('人口と収支を眺めつつ、区画を少しずつ広げよう', ch.tone) + '。' : applyTone('案内に沿って進めてね', ch.tone) + '。'}</div>`}
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
    restart() { tutorial = true; lastDay = -1; },
    setExpression,   // 確認ツール用
    /** 設定で案内役を変えたとき: 画像と名前を替え、ひとこと挨拶する */
    refreshCharacter() {
      const next = characterOf(reg, settings.advisorCharacter);
      if (next.id === ch.id) return;
      ch = next; applyCharacter(); lastTodo = lastTodo.slice();
      speak({ expression: 'happy', title: applyTone(`${ch.name}だよ`, ch.tone), text: applyTone(`これからは${ch.name}が案内するよ。${ch.role}だ。`, ch.tone), view: null });
      if (panel.style.display === 'block') renderPanel();
    },
    /** 毎フレーム。日が変わったときだけ判断する */
    update() {
      if (world.day === lastDay) { if (hideAt && performance.now() > hideAt) { bubble.style.display = 'none'; hideAt = 0; } return; }
      lastDay = world.day;
      const r = evaluate(world, reg, { frequency: settings.advisor, tutorial, character: ch });
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
