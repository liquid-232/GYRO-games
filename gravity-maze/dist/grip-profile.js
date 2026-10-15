// 2026-10-15 COM29 实测：前倾为负俯仰，右倾为负横滚。
// 仅首次加载本版本时应用方向；之后尊重用户的手动调整。
export const GRIP_PROFILE = 'com29-front-negative-pitch-right-negative-roll-v1';
export function applyMeasuredGrip(settings, direction, storage) {
  try { if (storage?.getItem('gravity-maze-grip-profile') === GRIP_PROFILE) return {settings, direction}; } catch {}
  const next = {...settings, invertX:true, invertY:false, swap:false};
  try {
    storage?.setItem('gravity-maze-axis','+X');
    storage?.setItem('gravity-maze-controls',JSON.stringify(next));
    storage?.setItem('gravity-maze-grip-profile',GRIP_PROFILE);
  } catch {} // 存储不可用时，本次会话仍使用实测方向。
  return {settings:next, direction:'+X'};
}
