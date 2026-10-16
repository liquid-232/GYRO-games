// 把真实帧间隔拆成至多 1/60 秒的物理步长，低帧率仍保持正常游戏速度。
// 超过 250 ms 的单次停顿限制追赶量，避免恢复时穿透和长时间阻塞。
export function framePlan(seconds) {
  const duration = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, .25)) : 0;
  const steps = duration > 0 ? Math.max(1, Math.ceil(duration * 60 - 1e-8)) : 0;
  return { duration, steps, step: steps ? duration / steps : 0 };
}
export function advanceFrame(seconds, update) {
  const frame = framePlan(seconds);
  let advanced = 0;
  for (let i = 0; i < frame.steps; i++) {
    if (update(frame.step) === false) break;
    advanced += frame.step;
  }
  return advanced;
}

// 持续掉帧才降低绘制分辨率；单次长帧、暂停及后台不会触发降质。
// 稳定恢复后缓慢提高清晰度，避免每帧重建渲染缓冲区。
export class AdaptiveResolution {
  constructor(maxRatio, {minRatio = .85} = {}) {
    this.max = Math.min(maxRatio, 1.6); this.min = Math.min(this.max, minRatio);
    this.ratio = this.max; this.windowMs = 0; this.frames = 0; this.healthyMs = 0;
  }
  observe(frameMs, active) {
    if (!active || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) {
      this.windowMs = this.frames = this.healthyMs = 0; return null;
    }
    this.windowMs += frameMs; this.frames++;
    if (this.windowMs < 1500) return null;
    const average = this.windowMs / this.frames, windowMs = this.windowMs;
    this.windowMs = this.frames = 0;
    let next = this.ratio;
    if (average > 22) { next = Math.max(this.min, this.ratio - .15); this.healthyMs = 0; }
    else if (average < 17.5) {
      this.healthyMs += windowMs;
      if (this.healthyMs >= 8000) { next = Math.min(this.max, this.ratio + .1); this.healthyMs = 0; }
    } else this.healthyMs = 0;
    next = Math.max(this.min, Math.min(this.max, Math.round(next * 100) / 100));
    if (Math.abs(next - this.ratio) < .001) return null;
    this.ratio = next; return next;
  }
}
