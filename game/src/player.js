// Rico Vane on foot: an articulated figure built from boxes and a sphere,
// plus the walking, running and jumping that moves him around the city.
// No model files anywhere — the whole cast is geometry and paint.
import * as THREE from 'three';
import { PLAYER } from './config.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({color: 0xe8b48a});
  const shirtMat = new THREE.MeshLambertMaterial({color: 0x2b6fd9});
  const pantsMat = new THREE.MeshLambertMaterial({color: 0x2b3242});
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), shirtMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const hairMat = new THREE.MeshLambertMaterial({color: 0x1a1a1a});
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
  hair.position.y = 1.76;
  group.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), shirtMat);
  armL.position.set(-0.42, 1.1, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), pantsMat);
  legL.position.set(-0.16, 0.35, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

// WASD relative to the camera yaw, normalised so diagonals are not
// faster than straight lines. Returns the direction and whether Rico is
// moving at all.
function moveDirection(input, cameraYaw) {
  const forward = (input.held.up ? 1 : 0) - (input.held.down ? 1 : 0);
  const strafe = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  if (!forward && !strafe) return {mx: 0, mz: 0, moving: false};
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  const mx = sin * forward + cos * strafe;
  const mz = cos * forward - sin * strafe;
  const len = Math.hypot(mx, mz) || 1;
  return {mx: mx / len, mz: mz / len, moving: true};
}

// Gravity and jumping: Space launches Rico, the ground catches him.
function stepJump(rico, input, dt) {
  if (input.wasPressed('jump') && rico.y <= 0.01) rico.vy = PLAYER.jumpSpeed;
  rico.vy -= PLAYER.gravity * dt;
  rico.y += rico.vy * dt;
  if (rico.y < 0) {
    rico.y = 0;
    rico.vy = 0;
  }
}

// On-foot movement: WASD relative to the camera yaw, Shift to run, Space
// to jump. Axis-separated collision so Rico slides along walls.
export function stepPlayerOnFoot(rico, input, dt, cameraYaw, collide) {
  const running = !!input.held.run;
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const {mx, mz, moving} = moveDirection(input, cameraYaw);
  if (moving) rico.angle = Math.atan2(mx, mz);
  const nx = rico.x + mx * speed * dt;
  const nz = rico.z + mz * speed * dt;
  if (!collide(nx, rico.z, PLAYER.radius)) rico.x = nx;
  if (!collide(rico.x, nz, PLAYER.radius)) rico.z = nz;
  rico.moving = moving;
  rico.running = running && moving;
  stepJump(rico, input, dt);
  rico.walkPhase = (rico.walkPhase || 0) + dt * speed * (moving ? 1.6 : 0);
}
