export const BLE_SERVICE = '7b6a0001-8e7f-4a23-a83b-e55a7634cc01';
export const BLE_MOTION = '7b6a0002-8e7f-4a23-a83b-e55a7634cc01';
export const BLE_COMMAND = '7b6a0003-8e7f-4a23-a83b-e55a7634cc01';
export const STALE_MS = 150;
export const PAUSE_AFTER_MS = 750;
export const SENSOR_OK = 1, CALIBRATING = 2, READY = 4;
const signedDelta = (value, anchor) => ((value - anchor + 0x80000000) >>> 0) - 0x80000000;

export function decodeMotion(value) {
  const view = value instanceof DataView ? value : new DataView(value);
  if (view.byteLength !== 20 || ![0x31425947, 0x32425947].includes(view.getUint32(0, true))) throw Error('姿态数据格式不匹配，请烧录最新固件');
  const version = view.getUint8(3) - 48;
  const packet = { version, sequence: view.getUint32(4, true), device_us: view.getUint32(8, true),
    roll: view.getInt16(12, true) / 100, pitch: view.getInt16(14, true) / 100,
    flags: view.getUint8(16), motion_dps: view.getUint8(17), period_us: version === 1 ? view.getUint16(18, true) : null,
    yaw: version === 2 ? view.getInt16(18, true) / 100 : null };
  if (Math.abs(packet.roll) > 180 || Math.abs(packet.pitch) > 90 || (packet.yaw != null && Math.abs(packet.yaw) > 180) || packet.flags & ~7
      || (packet.flags & 6) === 6 || (packet.flags & 6 && !(packet.flags & SENSOR_OK))) throw Error('无效的姿态数据');
  return packet;
}

export class MotionFeed {
  constructor() { this.clear(); }
  clear() {
    this.packet = null; this.lastSampleAt = null; this.lastPacketAt = null;
    this.history = []; this.arrivals = []; this.anchor = null; this.receiveDelay = null;
  }
  anchorClock(deviceUs, receivedAt, sentAt = null) {
    this.anchor = { deviceUs, receivedAt, sentAt };
  }
  // 设备执行探测命令的时刻位于浏览器发送与接收应答之间。
  // 用该区间换算采样时钟，避免把 RTT/2 当作精确单向延迟。
  estimateReceiveDelay(packet, now) {
    const anchor = this.anchor;
    if (!anchor || anchor.sentAt == null || anchor.sentAt > anchor.receivedAt
        || now < anchor.receivedAt || now - anchor.receivedAt >= 2000) return null;
    const deltaMs = signedDelta(packet.device_us, anchor.deviceUs) / 1000;
    const lower = now - (anchor.receivedAt + deltaMs);
    const upper = now - (anchor.sentAt + deltaMs);
    // 预留 1 ms 时钟漂移/量化余量；明显来自未来的时间戳不显示。
    if (upper < -1) return null;
    return { min: Math.max(0, lower - 1), max: Math.max(0, upper + 1), clockAt: anchor.receivedAt };
  }
  receptionLatency(now) {
    if (!this.isFresh(now) || !this.receiveDelay || now - this.receiveDelay.clockAt >= 2000) return null;
    return this.receiveDelay;
  }
  ingest(value, now) {
    const packet = decodeMotion(value);
    if (this.anchor && now - this.anchor.receivedAt < 2000 && packet.flags & SENSOR_OK) {
      const latestPossibleTime = this.anchor.receivedAt + signedDelta(packet.device_us, this.anchor.deviceUs) / 1000;
      if (now - latestPossibleTime > STALE_MS) return false;
    }
    const delta = this.packet ? (packet.sequence - this.packet.sequence) >>> 0 : 1;
    if (delta >= 0x80000000) return false;
    this.lastPacketAt = now;
    this.arrivals.push(now);
    this.prune(now);
    if (!delta) {
      // Duplicate status packets keep the link alive without refreshing sample age.
      this.packet.flags = packet.flags;
      if (!(packet.flags & READY)) this.history = [];
      return false;
    }
    this.packet = packet;
    this.receiveDelay = packet.flags & SENSOR_OK ? this.estimateReceiveDelay(packet, now) : null;
    this.lastSampleAt = packet.flags & SENSOR_OK ? now : null;
    if (packet.flags & READY) {
      this.history.push(packet);
      if (this.history.length > 20) this.history.shift();
    } else this.history = [];
    return true;
  }
  prune(now) { while (this.arrivals.length && now - this.arrivals[0] > 1000) this.arrivals.shift(); }
  age(now) { return this.lastSampleAt == null ? null : Math.max(0, now - this.lastSampleAt); }
  isFresh(now) { return !!(this.packet && this.packet.flags & READY && this.packet.flags & SENSOR_OK
    && this.lastSampleAt != null && now - this.lastSampleAt < STALE_MS); }
}
