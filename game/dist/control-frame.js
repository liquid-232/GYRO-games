import * as T from './vendor/three.module.js';
export const NOSE_DIRECTIONS = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
export function aircraftMountQuaternion(direction = '+X') {
  if (!NOSE_DIRECTIONS.includes(direction)) direction = '+X';
  const forward = new T.Vector3().setComponent('XYZ'.indexOf(direction[1]), direction[0] === '+' ? 1 : -1);
  const up = new T.Vector3(...(direction[1] === 'Z' ? [1,0,0] : [0,0,1]));
  const left = new T.Vector3().crossVectors(up, forward);
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(forward, left, up));
}
export function poseQuaternion(packet, target = new T.Quaternion()) {
  return target.setFromEuler(new T.Euler(T.MathUtils.degToRad(packet.roll), T.MathUtils.degToRad(packet.pitch), T.MathUtils.degToRad(packet.yaw ?? 0), 'ZYX'));
}
export function centeredControlAngles(packet, neutral, direction) {
  const center = neutral.orientation ? new T.Quaternion(...neutral.orientation) : poseQuaternion(neutral);
  const relative = center.invert().multiply(poseQuaternion(packet));
  const mount = aircraftMountQuaternion(direction);
  // Convert the rotation since centering from sensor axes to aircraft body axes.
  const body = mount.clone().invert().multiply(relative).multiply(mount);
  const euler = new T.Euler().setFromQuaternion(body, 'ZYX');
  return { x: T.MathUtils.radToDeg(euler.x), y: -T.MathUtils.radToDeg(euler.y) };
}
export function meanPose(packets) {
  const reference = poseQuaternion(packets.at(-1)), mean = new T.Quaternion(0,0,0,0);
  for (const packet of packets) {
    const q = poseQuaternion(packet), sign = q.dot(reference) < 0 ? -1 : 1;
    mean.x += q.x * sign; mean.y += q.y * sign; mean.z += q.z * sign; mean.w += q.w * sign;
  }
  return mean.normalize().toArray();
}
