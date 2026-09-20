// 描画フレームと固定ステップ（1日=1tick）の橋渡し。速度切替と一時停止。
import { tick } from '../sim/world.js';

export function createGameLoop(world, reg, { onFrame, onTick }) {
  const speeds = reg.balance.time.speeds;
  const daysPerSecond = reg.balance.time.daysPerSecond;
  let speedIndex = 1, acc = 0, last = performance.now(), running = false;
  const stats = { tickMs: 0, fps: 0, frames: 0, fpsTime: 0 };
  const loop = {
    stats,
    get speedIndex() { return speedIndex; },
    get speed() { return speeds[speedIndex]; },
    setSpeedIndex(i) { speedIndex = Math.max(0, Math.min(speeds.length - 1, i)); },
    togglePause() { if (speedIndex === 0) loop.setSpeedIndex(loop.lastRunning || 1); else { loop.lastRunning = speedIndex; loop.setSpeedIndex(0); } },
    start() {
      running = true;
      const frame = (now) => {
        if (!running) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        acc += dt * daysPerSecond * speeds[speedIndex];
        // 1フレームに詰め込む日数の上限。tick が重いときは減らして描画を止めない（更新を複数フレームに分散）
        const maxSteps = stats.tickMs > 12 ? 1 : stats.tickMs > 6 ? 2 : stats.tickMs > 3 ? 4 : 8;
        let steps = 0;
        while (acc >= 1 && steps < maxSteps) { const t0 = performance.now(); const flags = tick(world, reg); stats.tickMs = stats.tickMs * 0.8 + (performance.now() - t0) * 0.2; onTick?.(flags); acc -= 1; steps++; }
        if (acc > 8) acc = 0;
        stats.frames++; stats.fpsTime += dt; if (stats.fpsTime >= 1) { stats.fps = stats.frames / stats.fpsTime; stats.frames = 0; stats.fpsTime = 0; }
        onFrame(dt);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
  };
  return loop;
}
