// Rico Vane on foot: a box-and-sphere figure with swinging limbs, plus
// the walking, running and jumping that carries him around the city.
// Everything is built from plain geometry — no model files anywhere.
import * as THREE from 'three';
import { PLAYER } from './config.js';

// One limb: a box pivoted at its top edge, so rotating it swings the
// whole limb from the joint instead of from its middle.
function limb(width, height, depth, material, x, y) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  geo.translate(0, -height / 2, 0);
  const part = new THREE.Mesh(geo, material);
  part.position.set(x, y, 0);
  part.castShadow = true;
  return part;
}

export function makePlayerMesh() {
  const figure = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({color: 0xe8b48a});
  const shirt = new THREE.MeshLambertMaterial({color: 0x2b6fd9});
  const denim = new THREE.MeshLambertMaterial({color: 0x2b3242});
  const dark = new THREE.MeshLambertMaterial({color: 0x1a1a1a});

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  figure.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  figure.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    dark,
  );
  hair.position.y = 1.76;
  figure.add(hair);

  const armL = limb(0.18, 0.7, 0.18, shirt, -0.42, 1.45);
  const armR = limb(0.18, 0.7, 0.18, shirt, 0.42, 1.45);
  const legL = limb(0.22, 0.7, 0.22, denim, -0.16, 0.7);
  const legR = limb(0.22, 0.7, 0.22, denim, 0.16, 0.7);
  figure.add(armL, armR, legL, legR);
  figure.userData.armL = armL;
  figure.userData.armR = armR;
  figure.userData.legL = legL;
  figure.userData.legR = legR;
  return figure;
}

// WASD, read against the camera yaw: forward is where the camera looks,
// strafe is sideways to it. Diagonals are normalised, so cutting a corner
// is never faster than running straight.
function headingFromKeys(input, cameraYaw) {
  const fwd = (input.held.up ? 1 : 0) - (input.held.down ? 1 : 0);
  const side = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  if (fwd === 0 && side === 0) return null;
  const s = Math.sin(cameraYaw);
  const c = Math.cos(cameraYaw);
  const mx = s * fwd + c * side;
  const mz = c * fwd - s * side;
  const len = Math.hypot(mx, mz) || 1;
  return {x: mx / len, z: mz / len};
}

// Space launches Rico; gravity pulls him back and the ground catches him.
function applyJump(rico, input, dt) {
  if (input.wasPressed('jump') && rico.y <= 0.01) rico.vy = PLAYER.jumpSpeed;
  rico.vy -= PLAYER.gravity * dt;
  rico.y += rico.vy * dt;
  if (rico.y <= 0) {
    rico.y = 0;
    rico.vy = 0;
  }
}

// On foot: WASD against the camera, Shift to sprint, Space to jump.
// Each axis is collision-tested on its own, so Rico slides along walls
// instead of sticking to them.
export function stepPlayerOnFoot(rico, input, dt, cameraYaw, collide) {
  const sprinting = !!input.held.run;
  const pace = sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const heading = headingFromKeys(input, cameraYaw);
  const moving = heading !== null;
  if (moving) rico.angle = Math.atan2(heading.x, heading.z);
  const tryX = rico.x + (moving ? heading.x * pace * dt : 0);
  const tryZ = rico.z + (moving ? heading.z * pace * dt : 0);
  if (!collide(tryX, rico.z, PLAYER.radius)) rico.x = tryX;
  if (!collide(rico.x, tryZ, PLAYER.radius)) rico.z = tryZ;
  rico.moving = moving;
  rico.running = sprinting && moving;
  applyJump(rico, input, dt);
  rico.walkPhase = (rico.walkPhase || 0) + dt * pace * (moving ? 1.6 : 0);
}
