const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const angleDelta = (value, center) => ((value - center + 540) % 360) - 180;
const axisValue = (angle, fullScale, deadzone) => Math.sign(angle) * clamp((Math.abs(angle) - deadzone) / (fullScale - deadzone), 0, 1);

export class GyroController {
  constructor({ onInterrupt, onNotice }) {
    this.onInterrupt = onInterrupt;
    this.onNotice = onNotice;
    this.selected = false;
    this.state = null;
    this.neutral = null;
    this.history = [];
    this.output = { x: 0, y: 0 };
    this.lastEvent = 0;
    this.lastSession = null;
    this.calibrationPending = false;
    this.settings = { fullScale: 25, deadzone: 1.5, invertX: false, invertY: false, swap: false };
    try {
      const saved = JSON.parse(localStorage.getItem('gyro-controls') || '{}');
      this.settings = {
        fullScale: clamp(Number(saved.fullScale) || 25, 12, 45),
        deadzone: clamp(Number.isFinite(saved.deadzone) ? saved.deadzone : 1.5, 0, 5),
        invertX: saved.invertX === true, invertY: saved.invertY === true, swap: saved.swap === true
      };
    } catch {}
    this.bindUI();
    this.events = new EventSource('/api/gyro/events');
    this.events.onmessage = event => {
      try {
        const state = JSON.parse(event.data);
        if (state.session !== this.lastSession) {
          this.invalidate();
          this.lastSession = state.session;
        }
        this.state = state;
        this.lastEvent = performance.now();
        if (!state.ready) this.invalidate();
        if (state.calibrating) this.calibrationPending = false;
        if (state.ready && state.sample && this.history.at(-1)?.sequence !== state.sample.sequence) {
          this.history.push(state.sample);
          if (this.history.length > 20) this.history.shift();
        }
      } catch { this.invalidate(); }
    };
    this.events.onerror = () => {
      this.lastEvent = 0;
      this.invalidate();
      if (this.selected) this.onInterrupt('体感连接已中断，请检查游戏服务窗口。');
    };
    this.events.onopen = () => {
      // A new stream requires a fresh center even if the device session survived.
      this.invalidate();
    };
    this.uiTimer = setInterval(() => this.renderStatus(), 100);
    window.addEventListener('pagehide', () => this.events.close());
    this.renderStatus();
  }

  invalidate() {
    this.neutral = null;
    this.output = { x: 0, y: 0 };
    this.history = [];
  }

  get fresh() {
    return this.state?.ready && !this.calibrationPending && performance.now() - this.lastEvent < 150
      && Date.now() - this.state.received_wall_ms < 150;
  }

  get canFly() { return !this.selected || !!(this.fresh && this.neutral); }

  sample(dt) {
    if (!this.selected) return null;
    if (!this.canFly) {
      this.output = { x: 0, y: 0 };
      this.onInterrupt('体感数据未就绪：请连接、保持静止，再设置中位。');
      return this.output;
    }
    const { roll, pitch } = this.state.sample;
    const s = this.settings;
    let x = angleDelta(roll, this.neutral.roll), y = -angleDelta(pitch, this.neutral.pitch);
    if (s.swap) [x, y] = [y, x];
    x = axisValue(x, s.fullScale, s.deadzone) * (s.invertX ? -1 : 1);
    y = axisValue(y, s.fullScale, s.deadzone) * (s.invertY ? -1 : 1);
    const mix = 1 - Math.exp(-Math.max(0, dt) / .012);
    this.output.x += (x - this.output.x) * mix;
    this.output.y += (y - this.output.y) * mix;
    return this.output;
  }

  center() {
    if (!this.fresh || this.history.length < 15) {
      this.message('请先连接，并将控制器静置到“姿态就绪”。');
      return;
    }
    const last = this.history.at(-1);
    const stable = this.history.every(p => Math.abs(angleDelta(p.roll, last.roll)) < 1.5
      && Math.abs(p.pitch - last.pitch) < 1.5 && Math.hypot(p.gx, p.gy, p.gz) < 6);
    if (!stable) { this.message('控制器仍在移动，请保持舒适的握持姿态静止片刻。'); return; }
    this.neutral = {
      roll: last.roll + this.history.reduce((n, p) => n + angleDelta(p.roll, last.roll), 0) / this.history.length,
      pitch: this.history.reduce((n, p) => n + p.pitch, 0) / this.history.length
    };
    this.output = { x: 0, y: 0 };
    this.message('中位已设定，可以开始体感飞行。');
    this.renderStatus();
  }

  message(text) { document.getElementById('gyroMessage').textContent = text; }

  async command(action, body = {}) {
    const response = await fetch(`/api/gyro/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000)
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '连接失败');
    return data;
  }

  bindUI() {
    const $ = id => document.getElementById(id);
    const open = () => {
      $('gyroPanel').classList.remove('hidden');
      $('gyroToggle').setAttribute('aria-expanded', 'true');
      this.onInterrupt('调整体感设置后，可继续飞行。');
      $('gyroClose').focus();
    };
    const close = () => {
      $('gyroPanel').classList.add('hidden');
      $('gyroToggle').setAttribute('aria-expanded', 'false');
      $('gyroToggle').focus();
    };
    $('gyroToggle').onclick = () => $('gyroPanel').classList.contains('hidden') ? open() : close();
    $('gyroClose').onclick = close;
    $('gyroPanel').addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); event.stopPropagation(); }
    });
    $('controlMode').onchange = () => {
      this.selected = $('controlMode').value === 'gyro';
      this.output = { x: 0, y: 0 };
      this.onInterrupt('操控方式已切换，请确认后继续。');
      this.renderStatus();
    };
    $('gyroConnect').onclick = async () => {
      $('gyroConnect').disabled = true;
      this.invalidate();
      this.calibrationPending = false;
      try {
        this.state = await this.command('connect', { address: $('gyroAddress').value.trim() });
        this.message('正在连接。请确认电脑已加入 GYRO-C3 Wi-Fi，首次启动保持控制器静止约 2–4 秒。');
      } catch (error) { this.message(`连接未完成：${error.message}。请从桌面快捷方式启动游戏。`); }
      finally { $('gyroConnect').disabled = false; }
    };
    $('gyroDisconnect').onclick = async () => {
      this.invalidate();
      this.onInterrupt('控制器已断开。');
      try { this.state = await this.command('disconnect'); this.message('已断开控制器。'); }
      catch { this.message('本地服务无响应，请重新打开桌面快捷方式。'); }
    };
    $('gyroCenter').onclick = () => this.center();
    $('gyroCalibrate').onclick = async () => {
      this.invalidate();
      this.calibrationPending = true;
      this.onInterrupt('正在重新校准传感器，请保持静止。');
      try { await this.command('calibrate'); this.message('请将控制器放稳约 2–4 秒，姿态就绪后重新设置中位。'); }
      catch (error) { this.calibrationPending = false; this.message(error.message); }
      // A lost UDP command remains unusable instead of silently accepting the old calibration.
    };
    for (const [id, key] of [['gyroSensitivity', 'fullScale'], ['gyroDeadzone', 'deadzone'],
      ['gyroInvertX', 'invertX'], ['gyroInvertY', 'invertY'], ['gyroSwap', 'swap']]) {
      const input = $(id), checkbox = input.type === 'checkbox';
      if (checkbox) input.checked = this.settings[key]; else input.value = this.settings[key];
      input.oninput = () => {
        this.settings[key] = checkbox ? input.checked : Number(input.value);
        this.output = { x: 0, y: 0 };
        try { localStorage.setItem('gyro-controls', JSON.stringify(this.settings)); } catch {}
        this.renderStatus();
      };
    }
  }

  renderStatus() {
    const $ = id => document.getElementById(id), state = this.state;
    if (this.neutral && !this.fresh) this.invalidate();
    const alive = performance.now() - this.lastEvent < 500;
    const age = state?.sample ? Math.max(0, Date.now() - state.received_wall_ms) : null;
    const linked = alive && state?.connected;
    let status = '尚未连接';
    if (!alive) status = '等待本地游戏服务';
    else if (state?.requested && !linked) status = '等待开发板 / 信号中断';
    else if (linked && !state.sensor_ok) status = '请检查 MPU6050 接线';
    else if (linked && (state.calibrating || this.calibrationPending)) status = '静置校准中';
    else if (this.fresh) status = this.neutral ? '体感已就绪' : '姿态就绪 · 请设置中位';
    else if (linked) status = '采样中断 · 请检查传感器';
    $('gyroStatus').textContent = status;
    $('gyroStatus').dataset.ready = String(!!(this.fresh && this.neutral));
    $('gyroToggle').textContent = this.selected ? `体感 · ${this.canFly ? '已就绪' : '待连接'}` : '体感控制';
    $('gyroRtt').textContent = linked && state.rtt_ms != null ? `${state.rtt_ms.toFixed(1)} ms` : '—';
    $('gyroRate').textContent = linked ? `${state.receive_hz} Hz` : '—';
    $('gyroAge').textContent = state?.sensor_ok && age != null ? `${Math.min(9999, Math.round(age))} ms` : '—';
    $('gyroTilt').textContent = linked && state.sensor_ok && state.sample ? `${state.sample.roll.toFixed(1)}° / ${state.sample.pitch.toFixed(1)}°` : '— / —';
    $('gyroSensitivityValue').textContent = `${this.settings.fullScale}°`;
    $('gyroDeadzoneValue').textContent = `${this.settings.deadzone.toFixed(1)}°`;
    $('gyroCenter').disabled = !this.fresh;
    $('gyroCalibrate').disabled = !linked || !state?.sensor_ok;
    $('gyroDisconnect').disabled = !state?.requested;
    $('controlHint').textContent = this.selected ? '倾斜控制器移动 · 空格开火 · P 暂停' : 'WASD / 方向键移动 · 空格开火';
    if (this.selected && !this.canFly) this.onInterrupt('体感信号未就绪。请打开“体感控制”检查连接并设置中位。');
  }
}
