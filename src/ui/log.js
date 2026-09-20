// 下部の通知ログ。
export function createLog(world) {
  const el = document.getElementById('log');
  let shown = 0;
  return {
    update() {
      if (world.log.length === shown && el.childElementCount) return;
      el.innerHTML = world.log.slice(-40).map((e) => `<div><span class="day">${e.day}日目</span>${e.text}</div>`).join('');
      el.scrollTop = el.scrollHeight;
      shown = world.log.length;
    },
    push(text) { world.log.push({ day: world.day, text }); },
  };
}
