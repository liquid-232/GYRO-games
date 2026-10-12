import { BLE_SERVICE, BLE_MOTION, BLE_COMMAND, MotionFeed, SENSOR_OK, CALIBRATING, READY, STALE_MS } from './ble-protocol.js';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const angleDelta = (value, center) => ((value - center + 540) % 360) - 180;
const axisValue = (angle, fullScale, deadzone) => Math.sign(angle) * clamp((Math.abs(angle) - deadzone) / (fullScale - deadzone), 0, 1);
const deadline = async (operation, ms = 5000) => {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('蓝牙操作超时，请重新连接')), ms); })]); }
  finally { clearTimeout(timer); }
};

export class GyroController {
  constructor({ onInterrupt }) {
    this.onInterrupt = onInterrupt;
    this.selected = false; this.neutral = null; this.feed = new MotionFeed();
    this.output = { x: 0, y: 0 }; this.device = null; this.motion = null; this.control = null;
    this.generation = 0; this.connecting = false; this.calibrationPending = false;
    this.commandTail = Promise.resolve(); this.pendingCommands = 0; this.rtt = null;
    this.settings = { fullScale: 25, deadzone: 1.5, invertX: false, invertY: false, swap: false };
    this.supported = !!navigator.bluetooth && window.isSecureContext;
    try {
      const saved = JSON.parse(localStorage.getItem('gyro-controls') || '{}');
      this.settings = { fullScale: clamp(Number(saved.fullScale) || 25, 12, 45),
        deadzone: clamp(Number.isFinite(saved.deadzone) ? saved.deadzone : 1.5, 0, 5),
        invertX: saved.invertX === true, invertY: saved.invertY === true, swap: saved.swap === true };
    } catch {}
    this.bindUI();
    this.uiTimer = setInterval(() => this.renderStatus(), 100);
    window.addEventListener('pagehide', () => this.disconnect());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.invalidate(); });
    if (!this.supported) this.message('体感模式需要 Chrome 或 Edge，并从桌面快捷方式打开本地游戏。请检查电脑蓝牙已开启。');
    this.renderStatus();
  }

  invalidate() { this.neutral = null; this.output = { x: 0, y: 0 }; this.feed.history = []; }
  get connected() { return !!(this.device?.gatt.connected && this.motion && this.control); }
  get fresh() { return this.connected && !this.calibrationPending && this.feed.isFresh(performance.now()); }
  get canFly() { return !this.selected || !!(this.fresh && this.neutral); }

  sample(dt) {
    if (!this.selected) return null;
    if (!this.canFly) {
      this.output = { x: 0, y: 0 };
      this.onInterrupt('蓝牙体感未就绪：请连接、保持静止，再设置中位。');
      return this.output;
    }
    const { roll, pitch } = this.feed.packet, s = this.settings;
    let x = angleDelta(roll, this.neutral.roll), y = -angleDelta(pitch, this.neutral.pitch);
    if (s.swap) [x, y] = [y, x];
    x = axisValue(x, s.fullScale, s.deadzone) * (s.invertX ? -1 : 1);
    y = axisValue(y, s.fullScale, s.deadzone) * (s.invertY ? -1 : 1);
    const mix = 1 - Math.exp(-Math.max(0, dt) / .012);
    this.output.x += (x - this.output.x) * mix; this.output.y += (y - this.output.y) * mix;
    return this.output;
  }

  center() {
    if (!this.fresh || this.feed.history.length < 15) { this.message('请先连接蓝牙，并将控制器静置到“姿态就绪”。'); return; }
    const history = this.feed.history, last = history.at(-1);
    if (!history.every(p => Math.abs(angleDelta(p.roll, last.roll)) < 1.5 && Math.abs(p.pitch - last.pitch) < 1.5 && p.motion_dps < 6)) {
      this.message('控制器仍在移动，请保持舒适的握持姿态静止片刻。'); return;
    }
    this.neutral = { roll: last.roll + history.reduce((n, p) => n + angleDelta(p.roll, last.roll), 0) / history.length,
      pitch: history.reduce((n, p) => n + p.pitch, 0) / history.length };
    this.output = { x: 0, y: 0 };
    this.message('中位已设定，可以开始蓝牙体感飞行。'); this.renderStatus();
  }
  message(text) { document.getElementById('gyroMessage').textContent = text; }

  disconnect(message = '') {
    this.generation++;
    clearInterval(this.pingTimer);
    if (this.motion && this.notificationHandler) this.motion.removeEventListener('characteristicvaluechanged', this.notificationHandler);
    if (this.device && this.disconnectHandler) this.device.removeEventListener('gattserverdisconnected', this.disconnectHandler);
    if (this.device?.gatt.connected) this.device.gatt.disconnect();
    this.device = this.motion = this.control = null;
    this.connecting = false; this.calibrationPending = false; this.rtt = null;
    this.feed.clear(); this.invalidate();
    if (message) { this.message(message); this.onInterrupt(message); }
  }

  async connect() {
    if (!this.supported) throw Error('请用 Chrome 或 Edge 从本地快捷方式打开游戏');
    this.disconnect();
    const generation = this.generation;
    this.connecting = true;
    this.message('请在浏览器蓝牙窗口中选择 GYRO-C3-BLE-xxxx。');
    try {
      // requestDevice runs directly inside the click handler's user gesture.
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE] }] });
      if (generation !== this.generation) return;
      this.device = device;
      this.disconnectHandler = () => { if (this.device === device) this.disconnect('蓝牙连接已断开，请重新连接并设置中位。'); };
      device.addEventListener('gattserverdisconnected', this.disconnectHandler);
      const connecting = device.gatt.connect();
      connecting.then(server => { if (generation !== this.generation && server.connected) server.disconnect(); }, () => {});
      const server = await deadline(connecting, 25000);
      const service = await deadline(server.getPrimaryService(BLE_SERVICE), 10000);
      const motion = await deadline(service.getCharacteristic(BLE_MOTION));
      const control = await deadline(service.getCharacteristic(BLE_COMMAND));
      if (generation !== this.generation) { if (server.connected) server.disconnect(); return; }
      this.motion = motion; this.control = control;
      this.notificationHandler = event => {
        if (generation !== this.generation) return;
        try {
          this.feed.ingest(event.target.value, performance.now());
          if (this.feed.packet?.flags & CALIBRATING) this.calibrationPending = false;
          if (!(this.feed.packet?.flags & READY)) this.invalidate();
        } catch (error) { this.disconnect(error.message); }
      };
      motion.addEventListener('characteristicvaluechanged', this.notificationHandler);
      await deadline(motion.startNotifications());
      if (generation !== this.generation) return;
      this.connecting = false;
      this.message(`已连接 ${device.name || 'GYRO-C3-BLE'}。请静置约 2–4 秒，姿态就绪后设置中位。`);
      const ping = () => {
        if (!this.connected || this.pendingCommands) return;
        this.command(2).catch(error => { if (generation === this.generation) this.message(error.message); });
      };
      ping(); this.pingTimer = setInterval(ping, 1000);
    } catch (error) {
      if (generation === this.generation) this.disconnect();
      if (error.name === 'NotFoundError') throw Error('未选择控制器；请确认开发板已烧录蓝牙固件并有电');
      throw error;
    } finally { if (generation === this.generation) this.connecting = false; this.renderStatus(); }
  }

  command(op) {
    const generation = this.generation;
    this.pendingCommands++;
    const operation = this.commandTail.catch(() => {}).then(async () => {
      if (generation !== this.generation || !this.connected) throw Error('蓝牙已断开');
      const control = this.control, id = crypto.getRandomValues(new Uint32Array(1))[0];
      const bytes = new ArrayBuffer(5), view = new DataView(bytes);
      view.setUint8(0, op); view.setUint32(1, id, true);
      const started = performance.now();
      await deadline(control.writeValueWithResponse(bytes));
      const reply = await deadline(control.readValue());
      const now = performance.now();
      if (generation !== this.generation) throw Error('蓝牙连接已变化，请重试');
      if (reply.byteLength !== 9 || reply.getUint8(0) !== op || reply.getUint32(1, true) !== id) throw Error('蓝牙指令应答不匹配');
      if (op === 2) { this.rtt = now - started; this.feed.anchorClock(reply.getUint32(5, true), now); }
    });
    this.commandTail = operation;
    return operation.finally(() => { this.pendingCommands--; });
  }

  bindUI() {
    const $ = id => document.getElementById(id);
    const open = () => { $('gyroPanel').classList.remove('hidden'); $('gyroToggle').setAttribute('aria-expanded', 'true'); this.onInterrupt('调整体感设置后，可继续飞行。'); $('gyroClose').focus(); };
    const close = () => { $('gyroPanel').classList.add('hidden'); $('gyroToggle').setAttribute('aria-expanded', 'false'); $('gyroToggle').focus(); };
    $('gyroToggle').onclick = () => $('gyroPanel').classList.contains('hidden') ? open() : close();
    $('gyroClose').onclick = close;
    $('gyroPanel').addEventListener('keydown', event => { if (event.key === 'Escape') { close(); event.stopPropagation(); } });
    $('controlMode').onchange = () => { this.selected = $('controlMode').value === 'gyro'; this.output = { x: 0, y: 0 }; this.onInterrupt('操控方式已切换，请确认后继续。'); this.renderStatus(); };
    $('gyroConnect').onclick = () => this.connect().catch(error => this.message(error.message));
    $('gyroDisconnect').onclick = () => { this.disconnect('控制器已断开。'); this.renderStatus(); };
    $('gyroCenter').onclick = () => this.center();
    $('gyroCalibrate').onclick = async () => {
      this.invalidate(); this.calibrationPending = true;
      this.onInterrupt('正在重新校准传感器，请保持静止。');
      try { await this.command(1); this.message('请将控制器放稳约 2–4 秒，姿态就绪后重新设置中位。'); }
      catch (error) { this.calibrationPending = false; this.message(error.message); }
    };
    for (const [id, key] of [['gyroSensitivity', 'fullScale'], ['gyroDeadzone', 'deadzone'], ['gyroInvertX', 'invertX'], ['gyroInvertY', 'invertY'], ['gyroSwap', 'swap']]) {
      const input = $(id), checkbox = input.type === 'checkbox';
      if (checkbox) input.checked = this.settings[key]; else input.value = this.settings[key];
      input.oninput = () => { this.settings[key] = checkbox ? input.checked : Number(input.value); this.output = { x: 0, y: 0 };
        try { localStorage.setItem('gyro-controls', JSON.stringify(this.settings)); } catch {} this.renderStatus(); };
    }
  }

  renderStatus() {
    const $ = id => document.getElementById(id), now = performance.now(), packet = this.feed.packet;
    if (this.neutral && !this.fresh) this.invalidate();
    this.feed.prune(now);
    const linked = this.connected, alive = linked && this.feed.lastPacketAt != null && now - this.feed.lastPacketAt < STALE_MS;
    let status = '蓝牙尚未连接';
    if (!this.supported) status = '请使用支持蓝牙的 Chrome / Edge';
    else if (this.connecting) status = '正在选择 / 连接蓝牙控制器';
    else if (linked && !alive) status = '蓝牙已连接 · 等待姿态数据';
    else if (alive && !(packet?.flags & SENSOR_OK)) status = '蓝牙已连接 · 请检查 MPU6050 接线';
    else if (alive && (packet?.flags & CALIBRATING || this.calibrationPending)) status = '静置校准中';
    else if (this.fresh) status = this.neutral ? '蓝牙体感已就绪' : '姿态就绪 · 请设置中位';
    else if (alive) status = '采样中断 · 请检查传感器';
    $('gyroStatus').textContent = status; $('gyroStatus').dataset.ready = String(!!(this.fresh && this.neutral));
    $('gyroDevice').textContent = this.device?.name || 'GYRO-C3-BLE-xxxx';
    $('gyroToggle').textContent = this.selected ? `蓝牙体感 · ${this.canFly ? '已就绪' : '待连接'}` : '蓝牙体感';
    $('gyroConnect').disabled = !this.supported || this.connecting;
    $('gyroDisconnect').disabled = !this.device;
    $('gyroRtt').textContent = alive && this.rtt != null ? `${this.rtt.toFixed(1)} ms` : '—';
    $('gyroRate').textContent = alive ? `${this.feed.arrivals.length} Hz` : '—';
    const age = this.feed.age(now);
    $('gyroAge').textContent = linked && packet?.flags & SENSOR_OK && age != null ? `${Math.min(9999, Math.round(age))} ms` : '—';
    $('gyroTilt').textContent = alive && packet?.flags & SENSOR_OK ? `${packet.roll.toFixed(1)}° / ${packet.pitch.toFixed(1)}°` : '— / —';
    $('gyroSensitivityValue').textContent = `${this.settings.fullScale}°`; $('gyroDeadzoneValue').textContent = `${this.settings.deadzone.toFixed(1)}°`;
    $('gyroCenter').disabled = !this.fresh; $('gyroCalibrate').disabled = !alive || !(packet?.flags & SENSOR_OK) || this.pendingCommands > 0;
    $('controlHint').textContent = this.selected ? '蓝牙倾斜移动 · 空格开火 · P 暂停' : 'WASD / 方向键移动 · 空格开火';
    if (this.selected && !this.canFly) this.onInterrupt('蓝牙体感未就绪，请检查连接并设置中位。');
  }
}
