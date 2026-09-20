// 描画フレームと固定ステップ（1日=1tick）の橋渡し。速度切替と一時停止。
import { tick } from '../sim/world.js';

export function createGameLoop(world, reg, { onFrame, onTick }) {
  const speeds = reg.balance.time.speeds;
  const daysPerSecond = reg.balance.time.daysPerSecond;
  let speedIndex = 1, acc = 0, last = performance.now(), running = false;
  const loop = {
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
        let steps = 0;
        while (acc >= 1 && steps < 8) { const flags = tick(world, reg); onTick?.(flags); acc -= 1; steps++; }
        if (acc > 8) acc = 0;
        onFrame(dt);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
  };
  return loop;
}
