import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { decodeMotion, MotionFeed } from './dist/ble-protocol.js';

function frame(sequence, deviceUs, roll = 0, pitch = 0, flags = 5, motion = 0) {
  const v = new DataView(new ArrayBuffer(20));
  v.setUint32(0, 0x31425947, true); v.setUint32(4, sequence, true); v.setUint32(8, deviceUs, true);
  v.setInt16(12, Math.round(roll * 100), true); v.setInt16(14, Math.round(pitch * 100), true);
  v.setUint8(16, flags); v.setUint8(17, motion); v.setUint16(18, 5000, true);
  return v;
}

const decoded = decodeMotion(frame(10, 1000, -32.17, 14.29));
assert.equal(decoded.roll, -32.17); assert.equal(decoded.pitch, 14.29);
const shifted = new Uint8Array(27); shifted.set(new Uint8Array(frame(10, 1000).buffer), 3);
assert.equal(decodeMotion(new DataView(shifted.buffer, 3, 20)).sequence, 10, 'DataView byte offset is respected');
assert.throws(() => decodeMotion(new ArrayBuffer(19)));
assert.throws(() => decodeMotion(frame(1, 0, 181)));
assert.throws(() => decodeMotion(frame(1, 0, 0, 91)));
assert.throws(() => decodeMotion(frame(1, 0, 0, 0, 7)));
assert.throws(() => decodeMotion(frame(1, 0, 0, 0, 4)), 'READY requires a valid sensor');

const feed = new MotionFeed();
feed.ingest(frame(1, 0), 0);
assert.equal(feed.isFresh(149), true); assert.equal(feed.isFresh(150), false);
feed.ingest(frame(1, 0), 149);
assert.equal(feed.isFresh(150), false, 'duplicates cannot revive a stopped sensor');
assert.equal(feed.ingest(frame(0, 0), 151), false, 'out of order is discarded');
assert.equal(feed.lastPacketAt, 149);
feed.ingest(frame(2, 5000, 0, 0, 3), 155);
assert.equal(feed.isFresh(155), false); assert.equal(feed.history.length, 0, 'calibration drops ready samples');
feed.ingest(frame(3, 10000), 160); feed.ingest(frame(3, 10000, 0, 0, 0), 165);
assert.equal(feed.isFresh(165), false, 'sensor fault status invalidates the latest sample');
feed.clear(); feed.ingest(frame(0xffffffff, 0xffffff00), 0);
feed.ingest(frame(0, 0x1288), 5); assert.equal(feed.packet.sequence, 0, 'sequence rollover accepted');
feed.anchorClock(0xffffff00, 10);
assert.equal(feed.ingest(frame(1, 0x1288), 15), true, 'device clock rollover accepted');
assert.equal(feed.ingest(frame(2, 0x1288), 200), false, 'certainly stale device timestamp discarded');
feed.clear(); feed.ingest(frame(0, 0, 0, 0, 0), 0);
assert.equal(feed.age(50), null, 'missing sensor must not invent a sample time');

let clock = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { textContent: '', dataset: {}, value: '', type: 'range', checked: false,
    classList: { add() {}, remove() {}, contains() { return true; } }, setAttribute() {}, addEventListener() {}, focus() {} });
  return elements.get(id);
};
globalThis.document = { getElementById: element, addEventListener() {}, hidden: false };
globalThis.window = { isSecureContext: true, addEventListener() {} };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const originalInterval = globalThis.setInterval;
globalThis.setInterval = () => 1;
class Characteristic {
  constructor() { this.listeners = new Set(); }
  addEventListener(_, listener) { this.listeners.add(listener); }
  removeEventListener(_, listener) { this.listeners.delete(listener); }
  async startNotifications() { return this; }
  emit(value) { for (const listener of this.listeners) listener({ target: { value } }); }
}
const motion = new Characteristic();
let lastCommand, wrongReply = false;
const control = {
  async writeValueWithResponse(bytes) { lastCommand = new DataView(bytes); },
  async readValue() {
    const reply = new DataView(new ArrayBuffer(9));
    reply.setUint8(0, lastCommand.getUint8(0)); reply.setUint32(1, lastCommand.getUint32(1, true) + (wrongReply ? 1 : 0), true);
    reply.setUint32(5, clock * 1000, true); return reply;
  }
};
const listeners = new Set();
const device = { name: 'GYRO-C3-BLE-TEST',
  addEventListener(_, listener) { listeners.add(listener); }, removeEventListener(_, listener) { listeners.delete(listener); },
  gatt: { connected: false,
    async connect() { this.connected = true; return this; },
    async getPrimaryService() { return { getCharacteristic: async uuid => uuid.startsWith('7b6a0002') ? motion : control }; },
    disconnect() { this.connected = false; for (const listener of [...listeners]) listener(); }
  }
};
Object.defineProperty(globalThis, 'navigator', { value: { bluetooth: { requestDevice: async () => device } }, configurable: true });
const { GyroController } = await import('./dist/gyro.js');
const interruptions = [];
const controller = new GyroController({ onInterrupt: message => interruptions.push(message) });
await controller.connect(); await controller.commandTail;
controller.selected = true;
for (let seq = 1; seq <= 20; seq++) { clock += 10; motion.emit(frame(seq, clock * 1000)); }
controller.center(); assert.equal(controller.canFly, true);
assert.deepEqual(controller.sample(.02), { x: 0, y: 0 });
clock += 10; motion.emit(frame(21, clock * 1000, 25, -25));
assert.ok(controller.sample(.1).x > .99); assert.ok(controller.output.y > .99, 'tilt moves both game axes');
clock += 151; controller.renderStatus();
assert.equal(controller.canFly, false); assert.equal(controller.neutral, null); assert.ok(interruptions.length);
clock += 10; motion.emit(frame(22, clock * 1000)); assert.equal(controller.canFly, false, 'recovery cannot silently resume without centering');
wrongReply = true; await assert.rejects(controller.command(2), /应答不匹配/); wrongReply = false;
controller.disconnect();
assert.equal(controller.connected, false); assert.equal(motion.listeners.size, 0);
motion.emit(frame(23, clock * 1000)); assert.equal(controller.feed.packet, null, 'old connection notifications are detached');
globalThis.setInterval = originalInterval;
console.log('PASS: BLE format/range, duplicates, order/clock rollover, stale watchdog, calibration, mocked connect/tilt/center/disconnect and command acknowledgment.');
