// エンディング / 敗北の画面。続けて遊べる。
export function createEndingScreen(world, reg, loop) {
  const el = document.getElementById('ending');
  let shown = false;
  return {
    update() {
      if (shown || !world.ending) return;
      shown = true;
      const n = reg.nationById.get(world.nationId);
      const k = world.ending.kind;
      loop.setSpeedIndex(0);
      el.innerHTML = `<div class="card"><h1>${k === 'unified' ? '天下統一' : '首都陥落'}</h1><p>${k === 'unified' ? `${n.name}は七雄の首都をすべて領し、天下を一つにしました。あなたの県から始まった治世は、ここに極まりました。` : `${n.name}の首都が敵の手に落ちました。国は傾きましたが、あなたの県はまだ続いています。`}</p><p class="note">${world.day} 日目（${world.calendar.year < 0 ? '前' + -world.calendar.year : world.calendar.year}年）。${k === 'unified' ? '統一後も続けて遊べます。' : '亡命は実装していません。続けて遊ぶか、メニューからタイトルへ戻れます。'}</p><button class="btn primary" data-continue>続ける</button></div>`;
      el.style.display = 'flex';
      el.querySelector('[data-continue]').addEventListener('click', () => { el.style.display = 'none'; loop.setSpeedIndex(1); });
    },
  };
}
