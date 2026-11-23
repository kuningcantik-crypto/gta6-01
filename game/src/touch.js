// Touch controls: a virtual joystick on the left for driving and walking,
// plus multi-touch action buttons on the right. Every finger is tracked by
// its pointer id, so the joystick, GAS and the buttons all work at once.
// The joystick writes the same held actions the keyboard writes, so the
// world never knows — or cares — which device drove it.
//
// Wired in main.js. The body gets the `touch` class on the first real touch,
// which is what makes the touch UI appear on phones and stay hidden on a
// desktop.
export function createTouchControls(controls, callbacks) {
  const joystick = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  let joyPointer = null;
  let joyVec = {x: 0, y: 0};

  function applyJoystick() {
    const dead = 0.18;
    const up = joyVec.y < -dead;
    const down = joyVec.y > dead;
    const left = joyVec.x < -dead;
    const right = joyVec.x > dead;
    controls.setHeld('up', up);
    controls.setHeld('down', down);
    controls.setHeld('left', left);
    controls.setHeld('right', right);
    // Pushing the stick to the edge on foot also means "run".
    controls.setHeld('run', Math.hypot(joyVec.x, joyVec.y) > 0.85);
    if (stick) stick.style.transform = `translate(${joyVec.x * 32}px, ${joyVec.y * 32}px)`;
  }

  function joyMove(event) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (event.clientX - cx) / (rect.width / 2);
    let dy = (event.clientY - cy) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    joyVec = {x: dx, y: dy};
    applyJoystick();
  }
  function joyEnd(event) {
    if (joyPointer !== event.pointerId) return;
    joyPointer = null;
    joyVec = {x: 0, y: 0};
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

  // Hold-to-drive buttons set a held action; tap buttons fire one press.
  function bindHold(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (event) => {
      controls.setHeld(action, true);
      event.preventDefault();
    });
    const release = () => {
      controls.setHeld(action, false);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
  }
  function bindTap(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (event) => {
      fn();
      event.preventDefault();
    });
  }

  bindHold('btn-gas', 'up');
  bindHold('btn-brake', 'down');
  bindTap('btn-act', () => controls.press('enter'));
  bindTap('btn-wpn', () => controls.press('cycleWeapon'));
  bindTap('btn-cam', () => callbacks.onCamera());
  bindTap('btn-msn', () => controls.press('missions'));

  let shown = false;
  window.addEventListener('touchstart', () => {
    if (!shown) {
      shown = true;
      document.body.classList.add('touch');
    }
  }, {passive: true});
  // Probe for the headless touch smoke test.
  window.__touchState = () => ({joyPointer, joyVec, held: {...controls.held}});
}
