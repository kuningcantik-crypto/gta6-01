// Rico Vane on foot: a simple articulated figure, walk / run / jump,
// and a punch. The figure is boxes and spheres — no model files.
import * as THREE from 'three';
import { PLAYER } from './config.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b48a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2b6fd9 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3242 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), shirt);
  body.position.y = 1.1; body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72; head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.76; group.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), shirt);
  armL.position.set(-0.42, 1.1, 0); group.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), pants);
  legL.position.set(-0.16, 0.35, 0); group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; group.add(legR);
  group.userData.armL = armL; group.userData.armR = armR;
  group.userData.legL = legL; group.userData.legR = legR;
  return group;
}

// On-foot movement: WASD relative to the camera yaw, Shift to run, Space to jump.
export function stepPlayerOnFoot(player, input, dt, cameraYaw, collide) {
  const forward = (input.held.up ? 1 : 0) - (input.held.down ? 1 : 0);
  const strafe = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
  const running = !!input.held.run;
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let mx = 0;
  let mz = 0;
  if (forward || strafe) {
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    mx = sin * forward + cos * strafe;
    mz = cos * forward - sin * strafe;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;
    player.angle = Math.atan2(mx, mz);
  }
  const nx = player.x + mx * speed * dt;
  const nz = player.z + mz * speed * dt;
  if (!collide(nx, player.z, PLAYER.radius)) player.x = nx;
  if (!collide(player.x, nz, PLAYER.radius)) player.z = nz;
  player.moving = !!(forward || strafe);
  player.running = running && player.moving;
  // Jump and gravity.
  if (input.wasPressed('jump') && player.y <= 0.01) player.vy = PLAYER.jumpSpeed;
  player.vy -= PLAYER.gravity * dt;
  player.y += player.vy * dt;
  if (player.y < 0) { player.y = 0; player.vy = 0; }
  player.walkPhase = (player.walkPhase || 0) + dt * speed * (player.moving ? 1.6 : 0);
}
