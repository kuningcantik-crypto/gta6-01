// Touch controls: a virtual joystick on the left for driving and
// walking, plus multi-touch action buttons on the right. Every finger is
// tracked by its pointer id, so the joystick, GAS and the buttons all work
// at once. The joystick writes the same held actions the keyboard writes,
// so the world never knows — or cares — which device drove it.
//
// Wired in main.js. The body gets the `touch` class on the first real
// touch, which is what makes the touch UI appear on phones and stay
// hidden on a desktop.
const STICK_DEAD = 0.18;
const STICK_RUN = 0.85;
const KNOB_TRAVEL = 32;

export function createTouchControls(controls, callbacks) {
  const pad = document.getElementById('joystick');
  const knob = document.getElementById('stick');
  let activePointer = null;
  let stickVec = {x: 0, y: 0};

  // Which held action each stick direction turns on. The stick must clear
  // a dead zone before anything engages.
  function applyStick() {
    controls.setHeld('up', stickVec.y < -STICK_DEAD);
    controls.setHeld('down', stickVec.y > STICK_DEAD);
    controls.setHeld('left', stickVec.x < -STICK_DEAD);
    controls.setHeld('right', stickVec.x > STICK_DEAD);
    // Shoving the stick to the edge on foot also means "run".
    const magnitude = Math.hypot(stickVec.x, stickVec.y);
    controls.setHeld('run', magnitude > STICK_RUN);
    if (knob !== null) {
      knob.style.transform = 'translate(' + stickVec.x * KNOB_TRAVEL + 'px, ' + stickVec.y * KNOB_TRAVEL + 'px)';
    }
  }

  function moveStick(event) {
    const box = pad.getBoundingClientRect();
    const midX = box.left + box.width / 2;
    const midY = box.top + box.height / 2;
    let dx = (event.clientX - midX) / (box.width / 2);
    let dy = (event.clientY - midY) / (box.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    stickVec = {x: dx, y: dy};
    applyStick();
  }

  function dropStick(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    stickVec = {x: 0, y: 0};
    applyStick();
  }

  if (pad !== null) {
    pad.addEventListener('pointerdown', (event) => {
      activePointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      moveStick(event);
      event.preventDefault();
    });
    pad.addEventListener('pointermove', (event) => {
      if (activePointer === event.pointerId) moveStick(event);
    });
    pad.addEventListener('pointerup', dropStick);
    pad.addEventListener('pointercancel', dropStick);
  }

  // The touch buttons: [element id, behaviour, action]. A hold button
  // keeps a held action set while the finger is down; a tap button fires
  // one press. 'camera' is the one tap that is a callback, not an action.
  const BUTTONS = [
    ['btn-gas', 'hold', 'up'],
    ['btn-brake', 'hold', 'down'],
    ['btn-act', 'tap', 'enter'],
    ['btn-wpn', 'tap', 'cycleWeapon'],
    ['btn-cam', 'tap', 'camera'],
    ['btn-msn', 'tap', 'missions'],
  ];
  function wireHold(button, action) {
    button.addEventListener('pointerdown', (event) => {
      controls.setHeld(action, true);
      event.preventDefault();
    });
    const letGo = () => controls.setHeld(action, false);
    button.addEventListener('pointerup', letGo);
    button.addEventListener('pointercancel', letGo);
    button.addEventListener('pointerleave', letGo);
  }
  function wireTap(button, action) {
    button.addEventListener('pointerdown', (event) => {
      if (action === 'camera') callbacks.onCamera();
      else controls.press(action);
      event.preventDefault();
    });
  }
  for (let i = 0; i < BUTTONS.length; i += 1) {
    const [id, behaviour, action] = BUTTONS[i];
    const button = document.getElementById(id);
    if (button === null) continue;
    if (behaviour === 'hold') wireHold(button, action);
    else wireTap(button, action);
  }

  let touchSeen = false;
  window.addEventListener('touchstart', () => {
    if (touchSeen) return;
    touchSeen = true;
    document.body.classList.add('touch');
  }, {passive: true});
  // Probe for the headless touch smoke test.
  window.__touchState = () => ({
    joyPointer: activePointer,
    joyVec: stickVec,
    held: {...controls.held},
  });
}
