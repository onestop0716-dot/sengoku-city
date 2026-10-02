// 左の状況カード: 案内役の「いまやるべきこと」上位3件を札で出す。押すと案内役のパネルを開く。
import { icon } from './icons.js';

export function createStatusCards(world, advisor, { onOpen } = {}) {
  const el = document.getElementById('status-cards');
  let lastKey = '';
  const iconFor = (t) => t.priority >= 4 ? 'warn' : t.priority >= 2 ? 'flag' : 'info';
  return {
    update() {
      const todo = advisor.todo().slice(0, 3);
      const key = todo.map((t) => t.id + t.priority).join('|') + world.day % 10;
      if (key === lastKey) return;
      lastKey = key;
      el.innerHTML = todo.map((t) => `<div class="card p${t.priority}" data-id="${t.id}">${icon(iconFor(t), 18)}<span>${t.title}</span></div>`).join('');
      el.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => onOpen?.()));
    },
  };
}
