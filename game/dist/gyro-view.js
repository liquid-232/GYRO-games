import * as T from './vendor/three.module.js';
import { createGyroModel, createBodyAxes, poseQuaternion } from './gyro-model.js';
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
    this.body = new T.Group(); this.body.add(createGyroModel(boardLabel), createBodyAxes(axisLabel)); this.scene.add(this.body);
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
    this.visible = visible; this.stop();
    if (visible && !document.hidden) { this.resize(); this.draw(); }
  }
  draw() {
    if (!this.visible || document.hidden || this.contextLost) return;
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
    this.stop(); this.visible = false; this.observer.disconnect(); document.removeEventListener('visibilitychange', this.onVisibility);
    const geometries = new Set(), materials = new Set();
    this.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => { material.map?.dispose(); material.dispose(); }); this.renderer.dispose();
  }
}
