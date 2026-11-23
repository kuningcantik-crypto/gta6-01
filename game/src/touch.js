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

  // Stick directions, as data: each one names the held action and the test
  // on the stick vector that turns it on. The dead zone is 0.18.
  const STICK_DIRECTIONS = [
    ['up', (v) => v.y < -0.18],
    ['down', (v) => v.y > 0.18],
    ['left', (v) => v.x < -0.18],
    ['right', (v) => v.x > 0.18],
  ];
  function applyJoystick() {
    for (const [action, test] of STICK_DIRECTIONS) controls.setHeld(action, test(joyVec));
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

  // The touch buttons, as data: [element id, kind, action]. Hold buttons
  // keep a held action set while the finger is down; tap buttons fire one
  // press. 'camera' is the one tap that is a callback, not an input action.
  const TOUCH_BUTTONS = [
    ['btn-gas', 'hold', 'up'],
    ['btn-brake', 'hold', 'down'],
    ['btn-act', 'tap', 'enter'],
    ['btn-wpn', 'tap', 'cycleWeapon'],
    ['btn-cam', 'tap', 'camera'],
    ['btn-msn', 'tap', 'missions'],
  ];
  for (const [id, kind, action] of TOUCH_BUTTONS) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (kind === 'hold') {
      el.addEventListener('pointerdown', (event) => {
        controls.setHeld(action, true);
        event.preventDefault();
      });
      const release = () => controls.setHeld(action, false);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    } else {
      el.addEventListener('pointerdown', (event) => {
        if (action === 'camera') callbacks.onCamera();
        else controls.press(action);
        event.preventDefault();
      });
    }
  }

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
