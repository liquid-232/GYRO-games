import * as T from './vendor/three.module.js';

// Sensor coordinates: +X towards mounting holes, +Y towards VCC, +Z out of chip face.
// Dimensions approximately follow the supplied GY-521 board (15.56 x 20.26 mm).
export function createGyroModel(makeLabel = () => null) {
  const root = new T.Group(); root.name = 'MPU6050-GY521';
  const mat = (color, metalness = 0, roughness = .5) => new T.MeshStandardMaterial({ color, metalness, roughness });
  const blue = mat(0x14619c, .35, .3), chip = mat(0x151b22, .15, .42);
  const gold = mat(0xeec879, .8, .24), silver = mat(0xcad7db, .8, .25), ceramic = mat(0xc1ac81, .15, .5);
  const box = (name, x, y, z, w, h, d, material) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    mesh.name = name; mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const label = (text, x, y, z, width, height, color = '#d7f1f4') => {
    const mesh = makeLabel(text, width, height, color);
    if (mesh) { mesh.position.set(x, y, z); mesh.rotation.z = -Math.PI / 2; root.add(mesh); }
  };
  const shape = new T.Shape();
  shape.moveTo(-.998, -.813); shape.lineTo(.558, -.813); shape.lineTo(.558, 1.213); shape.lineTo(-.998, 1.213); shape.closePath();
  for (const y of [-.59, .99]) { const hole = new T.Path(); hole.absarc(.33, y, .145, 0, Math.PI * 2, true); shape.holes.push(hole); }
  const pcb = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false, curveSegments: 24 }), blue);
  pcb.position.z = -.15; pcb.name = 'PCB'; root.add(pcb);
  for (const y of [-.59, .99]) {
    for (const z of [-.069, -.151]) {
      const ring = new T.Mesh(new T.RingGeometry(.145, .18, 32), new T.MeshStandardMaterial({ color: 0xeec879, metalness: .8, roughness: .24, side: T.DoubleSide }));
      ring.position.set(.33, y, z); root.add(ring);
    }
  }
  box('MPU6050', 0, 0, 0, .4, .4, .14, chip);
  for (let side = 0; side < 4; side++) for (let i = 0; i < 6; i++) {
    const pin = box('chip-pad', 0, 0, -.025, .065, .024, .022, silver);
    const a = side * Math.PI / 2, t = (i - 2.5) * .056;
    pin.position.x = Math.cos(a) * .217 - Math.sin(a) * t;
    pin.position.y = Math.sin(a) * .217 + Math.cos(a) * t;
    pin.rotation.z = a;
  }
  label('MPU6050', 0, 0, .072, .34, .085, '#99a4ad');
  label('GY-521', .47, .16, -.065, .4, .095);
  const pinNames = ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'];
  for (let i = 0; i < 8; i++) {
    const y = 1.08 - i * .254;
    box('header-' + pinNames[i], -.85, y, -.26, .21, .245, .22, chip);
    box('pin-' + pinNames[i], -.85, y, -.38, .055, .055, .68, gold);
    const pad = new T.Mesh(new T.TorusGeometry(.063, .018, 8, 16), silver);
    pad.position.set(-.85, y, -.055); root.add(pad);
    label(pinNames[i], -.59, y, -.061, .21, .095);
  }
  // Regulator, capacitor and surrounding passives are illustrative component geometry.
  box('regulator', -.23, .81, .015, .24, .29, .17, chip);
  for (let i = 0; i < 3; i++) box('regulator-pad', -.40, .72 + i * .08, -.025, .15, .035, .025, silver);
  box('tantalum', .34, .14, .035, .15, .25, .2, ceramic);
  for (const [x, y, w, h] of [[-.25,.43,.12,.17], [.05,.53,.13,.12], [-.16,-.4,.18,.10], [.12,-.41,.11,.13], [-.39,-.48,.12,.10], [-.4,.15,.10,.12]]) {
    box('passive', x, y, -.005, w, h, .1, ceramic);
    for (const sign of [-1, 1]) box('solder', x, y + sign * h * .45, -.005, w * 1.05, .028, .104, silver);
  }
  const led = mat(0x64eeb0); led.emissive.set(0x1e6b41);
  box('power-led', -.27, -.65, -.01, .1, .06, .09, led);
  label('PWR', -.12, -.66, -.064, .18, .06);
  return root;
}

export { poseQuaternion } from './control-frame.js';

export function createBodyAxes(makeLabel = () => null) {
  const group = new T.Group(); group.name = 'sensor-axes';
  for (const [name, color, direction] of [ ['X', 0xff7987, [1,0,0]], ['Y', 0x86efac, [0,1,0]], ['Z', 0x78b9ff, [0,0,1]] ]) {
    const vector = new T.Vector3(...direction);
    const arrow = new T.ArrowHelper(vector, new T.Vector3(), 1.55, color, .14, .075);
    arrow.name = name; group.add(arrow);
    const negative = new T.Line(new T.BufferGeometry().setFromPoints([vector.clone().multiplyScalar(-1.3), new T.Vector3()]), new T.LineDashedMaterial({ color, dashSize: .055, gapSize: .045, transparent: true, opacity: .5 }));
    negative.computeLineDistances(); group.add(negative);
    const label = makeLabel('+' + name, .34, .22, '#' + color.toString(16));
    if (label) { label.position.copy(vector.multiplyScalar(1.74)); group.add(label); }
  }
  group.traverse(object => {
    if (object.material) { object.material.depthTest = false; object.material.depthWrite = false; object.renderOrder = 5; }
  });
  return group;
}
