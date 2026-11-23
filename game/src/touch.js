// Touch controls: a virtual joystick on the left for driving and
// walking, plus multi-touch action buttons on the right. Every finger is
// tracked by its pointer id, so the joystick, GAS and the buttons all work
// at once. The joystick writes the same held actions the keyboard writes,
// so the world never knows — or cares — which device drove it.
//
// Wired in main.js. The body gets the `touch` class on the first real
// touch, which is what makes the touch UI appear on phones and stay
// hidden on a desktop.
export function createTouchControls(controls, callbacks) {
  const pad = document.getElementById('joystick');
  const knob = document.getElementById('stick');
  let activePointer = null;
  let stickVec = {x: 0, y: 0};

  // Which held action each stick direction turns on. The stick must clear
  // a 0.18 dead zone before anything engages.
  function pushStickToInput() {
    controls.setHeld('up', stickVec.y < -0.18);
    controls.setHeld('down', stickVec.y > 0.18);
    controls.setHeld('left', stickVec.x < -0.18);
    controls.setHeld('right', stickVec.x > 0.18);
    // Shoving the stick to the edge on foot also means "run".
    controls.setHeld('run', Math.hypot(stickVec.x, stickVec.y) > 0.85);
    if (knob) knob.style.transform = `translate(${stickVec.x * 32}px, ${stickVec.y * 32}px)`;
  }

  function trackStick(event) {
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
    pushStickToInput();
  }
  function releaseStick(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    stickVec = {x: 0, y: 0};
    pushStickToInput();
  }

  if (pad) {
    pad.addEventListener('pointerdown', (event) => {
      activePointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      trackStick(event);
      event.preventDefault();
    });
    pad.addEventListener('pointermove', (event) => {
      if (activePointer === event.pointerId) trackStick(event);
    });
    pad.addEventListener('pointerup', releaseStick);
    pad.addEventListener('pointercancel', releaseStick);
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
  function wireHoldButton(button, action) {
    button.addEventListener('pointerdown', (event) => {
      controls.setHeld(action, true);
      event.preventDefault();
    });
    const letGo = () => controls.setHeld(action, false);
    button.addEventListener('pointerup', letGo);
    button.addEventListener('pointercancel', letGo);
    button.addEventListener('pointerleave', letGo);
  }
  function wireTapButton(button, action) {
    button.addEventListener('pointerdown', (event) => {
      if (action === 'camera') callbacks.onCamera();
      else controls.press(action);
      event.preventDefault();
    });
  }
  for (const [id, behaviour, action] of BUTTONS) {
    const button = document.getElementById(id);
    if (!button) continue;
    if (behaviour === 'hold') wireHoldButton(button, action);
    else wireTapButton(button, action);
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
