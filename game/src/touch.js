// Touch controls: a virtual joystick on the left for driving and
// walking, plus multi-touch action buttons on the right. Every finger is
// tracked by its pointer id, so the joystick, GAS and the buttons all work
// at once. The joystick writes the same held actions the keyboard writes,
// so the world never knows — or cares — which device drove it.
//
// Wired in main.js. The body gets the `touch` class on the first real
// touch, which is what makes the touch UI appear on phones and stay
// hidden on a desktop.
const DEAD_ZONE = 0.18;
const RUN_EDGE = 0.85;
const KNOB_RANGE = 32;

export function createTouchControls(controls, callbacks) {
  const pad = document.getElementById('joystick');
  const knob = document.getElementById('stick');
  let activePointer = null;
  let stickVec = {x: 0, y: 0};

  // Which held action each stick direction turns on. The stick must clear
  // a dead zone before anything engages.
  function syncStick() {
    controls.setHeld('up', stickVec.y < -DEAD_ZONE);
    controls.setHeld('down', stickVec.y > DEAD_ZONE);
    controls.setHeld('left', stickVec.x < -DEAD_ZONE);
    controls.setHeld('right', stickVec.x > DEAD_ZONE);
    // Shoving the stick to the edge on foot also means "run".
    const reach = Math.hypot(stickVec.x, stickVec.y);
    controls.setHeld('run', reach > RUN_EDGE);
    if (knob !== null) {
      knob.style.transform = `translate(${stickVec.x * KNOB_RANGE}px, ${stickVec.y * KNOB_RANGE}px)`;
    }
  }

  function dragStick(event) {
    const padBox = pad.getBoundingClientRect();
    const midX = padBox.left + padBox.width / 2;
    const midY = padBox.top + padBox.height / 2;
    let dx = (event.clientX - midX) / (padBox.width / 2);
    let dy = (event.clientY - midY) / (padBox.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    stickVec = {x: dx, y: dy};
    syncStick();
  }

  function liftStick(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    stickVec = {x: 0, y: 0};
    syncStick();
  }

  if (pad !== null) {
    pad.addEventListener('pointerdown', (event) => {
      activePointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      dragStick(event);
      event.preventDefault();
    });
    pad.addEventListener('pointermove', (event) => {
      if (activePointer === event.pointerId) dragStick(event);
    });
    pad.addEventListener('pointerup', liftStick);
    pad.addEventListener('pointercancel', liftStick);
  }

  // The touch buttons: id, behaviour, action. A hold button keeps a held
  // action set while the finger is down; a tap button fires one press.
  // 'camera' is the one tap that is a callback, not an action.
  const BUTTON_SPECS = [
    {id: 'btn-gas', kind: 'hold', action: 'up'},
    {id: 'btn-brake', kind: 'hold', action: 'down'},
    {id: 'btn-act', kind: 'tap', action: 'enter'},
    {id: 'btn-wpn', kind: 'tap', action: 'cycleWeapon'},
    {id: 'btn-cam', kind: 'tap', action: 'camera'},
    {id: 'btn-msn', kind: 'tap', action: 'missions'},
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
    // Tap buttons fire on CLICK, not pointerdown: a touch tap also
    // produces a compatibility click a moment later, and if the first
    // press opened a full-screen overlay (JOBS), that late click would
    // land on the overlay's Close button and shut it again at once.
    // Firing on the click itself means one tap is exactly one action.
    button.addEventListener('click', () => {
      if (action === 'camera') callbacks.onCamera();
      else controls.press(action);
    });
  }
  for (const spec of BUTTON_SPECS) {
    const button = document.getElementById(spec.id);
    if (button === null) continue;
    if (spec.kind === 'hold') wireHoldButton(button, spec.action);
    else wireTapButton(button, spec.action);
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
