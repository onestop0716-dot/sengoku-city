// 描画品質の自動調整: fps が落ちたら段階的に下げ、余裕が続けば少し戻す。
import { QUALITIES } from './settings.js';

const ORDER = ['high', 'medium', 'low'];

export function createAutoQuality({ settings, device, ctx, apply }) {   // ctx.loop / ctx.log は後から入る
  let level = device.initialQuality;
  let timer = 0, sinceChange = 0, lowFor = 0, highFor = 0, lowered = 0;
  const current = () => (settings.quality === 'auto' ? level : settings.quality);
  return {
    get level() { return current(); },
    /** 品質定義を返す（自動のときは端末上限の pixelRatio を掛ける） */
    quality() { const q = { ...QUALITIES[current()] }; q.pixelRatio = Math.min(q.pixelRatio, device.pixelRatioCap); return q; },
    update(dt) {
      if (settings.quality !== 'auto') return;
      timer += dt; sinceChange += dt;
      if (timer < 1) return;
      timer = 0;
      if (!ctx.loop) return;
      const fps = ctx.loop.stats.fps || 60;
      if (fps < 24) { lowFor++; highFor = 0; } else if (fps > 50) { highFor++; lowFor = 0; } else { lowFor = 0; highFor = 0; }
      const i = ORDER.indexOf(level);
      if (lowFor >= 4 && sinceChange > 8 && i < ORDER.length - 1) { level = ORDER[i + 1]; lowered++; sinceChange = 0; lowFor = 0; apply(level); ctx.log?.push(`描画が重いため品質を「${QUALITIES[level].name}」に下げました（設定で固定できます）`); }
      else if (highFor >= 30 && sinceChange > 30 && lowered > 0 && i > ORDER.indexOf(device.initialQuality)) { level = ORDER[i - 1]; lowered--; sinceChange = 0; highFor = 0; apply(level); }
    },
  };
}
