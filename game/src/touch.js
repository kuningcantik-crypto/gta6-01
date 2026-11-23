// Touch controls: a virtual joystick (left) for driving/walking plus
// multi-touch action buttons (right). Each finger is tracked by its
// pointer id, so joystick + GAS + buttons work simultaneously. The joystick
// writes the same held actions the keyboard writes, so the world never
// knows — or cares — which device drove it.
//
// Wired in main.js. The body gets the `touch` class on the first touch so
// the touch UI appears on phones and stays hidden on desktop.
export function createTouchControls(input, callbacks) {
  const joystick = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  let joyPointer = null;
  let joyVec = { x: 0, y: 0 };

  function applyJoystick() {
    // Up/down = forward/back, left/right = steer. Dead zone 0.18.
    const dead = 0.18;
    const up = joyVec.y < -dead;
    const down = joyVec.y > dead;
    const left = joyVec.x < -dead;
    const right = joyVec.x > dead;
    input.setHeld('up', up);
    input.setHeld('down', down);
    input.setHeld('left', left);
    input.setHeld('right', right);
    // On foot, pushing the stick also means "run" when pushed far.
    input.setHeld('run', Math.hypot(joyVec.x, joyVec.y) > 0.85);
    if (stick) stick.style.transform = `translate(${joyVec.x * 32}px, ${joyVec.y * 32}px)`;
  }

  function joyMove(event) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (event.clientX - cx) / (rect.width / 2);
    let dy = (event.clientY - cy) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    joyVec = { x: dx, y: dy };
    applyJoystick();
  }
  function joyEnd(event) {
    if (joyPointer !== event.pointerId) return;
    joyPointer = null;
    joyVec = { x: 0, y: 0 };
    applyJoystick();
  }

  if (joystick) {
    joystick.addEventListener('pointerdown', (event) => {
      joyPointer = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      joyMove(event);
      event.preventDefault();
    });
    joystick.addEventListener('pointermove', (event) => {
      if (joyPointer === event.pointerId) joyMove(event);
    });
    joystick.addEventListener('pointerup', joyEnd);
    joystick.addEventListener('pointercancel', joyEnd);
  }

  // Hold-to-drive buttons set held actions; tap buttons fire one press.
  function bindHold(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (event) => {
      input.setHeld(action, true);
      event.preventDefault();
    });
    const release = (event) => { input.setHeld(action, false); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }
  function bindTap(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (event) => { fn(); event.preventDefault(); });
  }

  bindHold('btn-gas', 'up');
  bindHold('btn-brake', 'down');
  bindTap('btn-act', () => input.press('enter'));
  bindTap('btn-wpn', () => input.press('cycleWeapon'));
  bindTap('btn-cam', () => callbacks.onCamera());
  bindTap('btn-msn', () => input.press('missions'));

  // Show the touch UI on the first real touch, and allow firing on foot
  // by tapping the game canvas (shoot) — the joystick handles movement.
  let shown = false;
  window.addEventListener('touchstart', () => {
    if (!shown) {
      shown = true;
      document.body.classList.add('touch');
    }
  }, { passive: true });
  // Expose a probe for the headless touch smoke test.
  window.__touchState = () => ({ joyPointer, joyVec, held: { ...input.held } });
}
