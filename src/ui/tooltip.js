// data-term="id" を持つ要素にホバーすると terms.json の説明を出す。
export function createTooltip(reg) {
  const el = document.getElementById('tooltip');
  const show = (text, x, y) => {
    el.textContent = text; el.style.display = 'block';
    el.style.left = Math.min(x + 12, window.innerWidth - el.offsetWidth - 8) + 'px';
    el.style.top = Math.min(y + 12, window.innerHeight - el.offsetHeight - 8) + 'px';
  };
  const hide = () => { el.style.display = 'none'; };
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-term], [data-tip]');
    if (!t) return;
    const text = t.dataset.tip || reg.termById.get(t.dataset.term)?.desc;
    if (text) show(text, e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-term], [data-tip]')) hide(); });
  document.addEventListener('mousemove', (e) => { if (el.style.display === 'block') show(el.textContent, e.clientX, e.clientY); });
  /** 用語をツールチップ付きで表示する HTML を返す */
  return { show, hide, termHtml: (termId, label) => { const t = reg.termById.get(termId); return t ? `<span class="term" data-term="${termId}">${label || t.term}</span>` : (label || termId); } };
}
