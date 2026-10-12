import * as T from './vendor/three.module.js';
import { createGyroModel, createBodyAxes, poseQuaternion } from './gyro-model.js';
import { createAircraftPoseModel, setAircraftNoseDirection, NOSE_DIRECTIONS } from './aircraft-model.js';
import { CALIBRATING, SENSOR_OK } from './ble-protocol.js';

function textTexture(text, color) {
  const canvas = document.createElement('canvas'); canvas.height = 112;
  const ctx = canvas.getContext('2d'); ctx.font = '600 76px monospace';
  canvas.width = Math.ceil(ctx.measureText(text).width) + 20;
  ctx.fillStyle = color; ctx.font = '600 76px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, 58);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}
const boardLabel = (text, width, height, color) => new T.Mesh(new T.PlaneGeometry(width, height),
  new T.MeshBasicMaterial({ map: textTexture(text, color), transparent: true, depthWrite: false }));
const axisLabel = (text, width, height, color) => {
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: textTexture(text, color), transparent: true }));
  sprite.scale.set(width, height, 1); return sprite;
};

export class GyroPoseView {
  constructor(container, controller) {
    this.container = container; this.controller = controller; this.visible = false; this.frame = null;
    this.$ = id => document.getElementById(id);
    this.renderer = new T.WebGLRenderer({ canvas: this.$('gyroModelCanvas'), antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x06131d, 0); this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.scene = new T.Scene(); this.camera = new T.PerspectiveCamera(38, 1, .1, 40); this.camera.up.set(0, 0, 1);
    this.scene.add(new T.HemisphereLight(0xdcefff, 0x385376, 3));
    const light = new T.DirectionalLight(0xe4f6ff, 4); light.position.set(-3, -2, 6); this.scene.add(light);
    const warm = new T.DirectionalLight(0xffdba2, 2); warm.position.set(2, 4, 3); this.scene.add(warm);
    this.board = createGyroModel(boardLabel); this.aircraft = null; this.aircraftLoad = null;
    this.noseDirection = controller.noseDirection;
    this.requestedModel = 'aircraft'; this.modelKind = 'aircraft'; this.disposed = false;
    this.board.visible = false;
    this.body = new T.Group(); this.body.add(this.board, createBodyAxes(axisLabel)); this.scene.add(this.body);
    this.$('gyroShowBoard').onclick = () => this.selectModel('board');
    this.$('gyroShowAircraft').onclick = () => this.selectModel('aircraft');
    const grid = new T.GridHelper(5, 20, 0x33586c, 0x1a3547); grid.rotation.x = Math.PI / 2; grid.position.z = -.95;
    grid.material.transparent = true; grid.material.opacity = .5; this.scene.add(grid);
    this.target = new T.Quaternion(); this.hasPose = false;
    this.$('gyroViewIso').onclick = () => this.setView(false);
    this.$('gyroViewTop').onclick = () => this.setView(true);
    this.setView(false);
    this.observer = new ResizeObserver(() => { if (this.visible) this.resize(); }); this.observer.observe(container);
    this.onVisibility = () => { this.stop(); if (this.visible && !document.hidden) this.draw(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.$('gyroModelCanvas').addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.contextLost = true; this.stop(); this.setState('3D 预览已暂停，请刷新页面恢复', false);
    });
    this.$('gyroModelCanvas').addEventListener('webglcontextrestored', () => { this.contextLost = false; if (this.visible && !document.hidden) this.draw(); });
    window.addEventListener('pagehide', () => this.dispose(), { once: true });
    void this.selectModel('aircraft');
  }
  async selectModel(kind) {
    this.requestedModel = kind;
    this.$('gyroModelLoading').textContent = '';
    if (kind === 'aircraft' && !this.aircraft) {
      this.$('gyroModelLoading').textContent = '正在装载飞机…';
      this.$('gyroShowAircraft').disabled = true;
      try {
        if (!this.aircraftLoad) this.aircraftLoad = this.loadAircraft();
        await this.aircraftLoad;
      } catch {
        if (!this.disposed && this.requestedModel === 'aircraft') this.$('gyroModelLoading').textContent = '装载失败，点击飞机重试';
        return;
      } finally {
        this.aircraftLoad = null;
        if (!this.disposed) this.$('gyroShowAircraft').disabled = false;
      }
    }
    if (this.disposed || this.requestedModel !== kind) return;
    this.modelKind = kind;
    this.board.visible = kind === 'board';
    if (this.aircraft) this.aircraft.visible = kind === 'aircraft';
    this.$('gyroModelLoading').textContent = '';
    this.$('gyroShowBoard').setAttribute('aria-pressed', String(kind === 'board'));
    this.$('gyroShowAircraft').setAttribute('aria-pressed', String(kind === 'aircraft'));
    this.$('gyroModelTitle').textContent = kind === 'board' ? 'MPU6050 · 实时姿态' : 'F-22 · 实时姿态';
    this.$('gyroModelWatermark').textContent = kind === 'board' ? 'GY-521 / BODY AXES' : 'F-22 RAPTOR / BODY AXES';
    this.$('gyroModelCanvas').setAttribute('aria-label', `${kind === 'board' ? 'MPU6050' : 'F-22 飞机'}三维模型，红色 X 横滚轴、绿色 Y 俯仰轴、蓝色 Z 偏航轴`);
    this.$('gyroNoseDirection').disabled = kind === 'board';
    this.$('gyroModelAxesHelp').textContent = kind === 'board'
      ? '三轴交于芯片中心，箭头指向正方向。X 指向安装孔一侧，Y 指向 VCC 一端，Z 垂直芯片面向上。浅色网格为水平参考。'
      : `三轴交于机身中心；机头朝向 ${this.noseDirection ?? '+X'}。箭头指向传感器正方向，浅色网格为水平参考。`;
  }
  setNoseDirection(direction) {
    if (!NOSE_DIRECTIONS.includes(direction)) return;
    this.noseDirection = direction;
    if (this.aircraft) setAircraftNoseDirection(this.aircraft, direction);
    if (this.modelKind === 'aircraft') this.$('gyroModelAxesHelp').textContent = `三轴交于机身中心；机头朝向 ${direction}。箭头指向传感器正方向，浅色网格为水平参考。`;
  }
  async loadAircraft() {
    const response = await fetch('assets/airplane-f22.glb');
    if (!response.ok) throw Error(`Aircraft HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (this.disposed) return;
    const aircraft = createAircraftPoseModel(buffer);
    setAircraftNoseDirection(aircraft, this.noseDirection);
    aircraft.visible = false; this.body.add(aircraft); this.aircraft = aircraft;
    // Local studio reflections preserve the metal finish of the game's aircraft.
    const studio = new T.Scene(); studio.background = new T.Color(0x344a5d);
    for (const [x,y,z,color] of [[-8,9,0,0xdcf6ff],[8,5,2,0xffe0b0],[0,3,-10,0x78bfff]]) {
      const panel = new T.Mesh(new T.PlaneGeometry(7,17), new T.MeshBasicMaterial({color,side:T.DoubleSide}));
      panel.position.set(x,y,z); panel.lookAt(0,0,0); studio.add(panel);
    }
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(studio,.02); this.scene.environment = this.environment.texture; pmrem.dispose();
    studio.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
  setState(text, live) {
    const node = this.$('gyroModelState'); if (node.textContent !== text) node.textContent = text;
    node.dataset.live = String(live);
  }
  setView(top) {
    this.camera.position.set(...(top ? [-.001, 0, 6.9] : [-3.7, -2.9, 4.1]));
    this.camera.up.set(...(top ? [1, 0, 0] : [0, 0, 1])); this.camera.lookAt(0, 0, 0);
    this.$('gyroViewIso').setAttribute('aria-pressed', String(!top)); this.$('gyroViewTop').setAttribute('aria-pressed', String(top));
  }
  resize() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }
  stop() { if (this.frame != null) cancelAnimationFrame(this.frame); this.frame = null; }
  setVisible(visible) {
    this.visible = visible && this.controller.selected; this.stop();
    if (this.visible && !document.hidden) { this.resize(); this.draw(); }
  }
  draw() {
    if (!this.visible || !this.controller.selected || document.hidden || this.contextLost) return;
    const gyro = this.controller, packet = gyro.feed.packet, live = gyro.fresh;
    if (!gyro.connected) {
      this.hasPose = false; this.body.quaternion.identity();
      this.setState('未连接 · 显示水平参考模型', false);
    } else if (gyro.calibrationPending || packet?.flags & CALIBRATING) {
      this.setState('静置校准中 · 等待有效姿态', false);
    } else if (packet && !(packet.flags & SENSOR_OK)) {
      this.setState('传感器异常 · 姿态已冻结，请检查接线', false);
    } else if (live) {
      poseQuaternion(packet, this.target); this.body.quaternion.copy(this.target); this.hasPose = true;
      this.setState(packet.yaw == null ? '实时横滚 / 俯仰 · 升级固件后可显示偏航' : '实时三轴姿态 · 偏航为相对角度', true);
    } else {
      this.setState(this.hasPose ? '数据暂停 · 保留最后有效姿态' : '已连接 · 等待姿态数据', false);
    }
    for (const [id, key] of [['gyroRollValue','roll'], ['gyroPitchValue','pitch'], ['gyroYawValue','yaw']]) {
      const text = live && packet?.[key] != null ? `${packet[key] > 0 ? '+' : ''}${packet[key].toFixed(1)}°` : '—';
      const node = this.$(id); if (node.textContent !== text) node.textContent = text;
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(() => this.draw());
  }
  dispose() {
    this.disposed = true; this.stop(); this.visible = false; this.observer.disconnect(); document.removeEventListener('visibilitychange', this.onVisibility);
    const geometries = new Set(), materials = new Set();
    this.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    const textures = new Set();
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => {
      for (const key of ['map', 'bumpMap', 'roughnessMap']) if (material[key]) textures.add(material[key]);
      material.dispose();
    }); textures.forEach(texture => texture.dispose()); this.environment?.dispose(); this.renderer.dispose();
  }
}
