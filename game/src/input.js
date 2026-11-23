// Keyboard, mouse and touch input, all through one small object. Keys are
// read as plain held flags every frame; a mouse click is a one-frame "shootPulse"
// pulse the world consumes. Touch controls drive the same object through
// setHeld() and press(), so the world never knows which device drove it.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_ENTER_CAR = 'enter';
export const ACTION_PUNCH = 'punch';
export const ACTION_RELOAD = 'reload';
export const ACTION_JUMP = 'jump';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
  KeyE: 'enter',
  KeyF: 'punch',
  KeyR: 'reload',
  Enter: 'confirm',
  Escape: 'pause',
  KeyP: 'pause',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4',
  Digit5: 'w5', Digit6: 'w6', Digit7: 'w7',
  KeyQ: 'cycleWeapon',
  KeyC: 'radio',
  KeyZ: 'plates',
  KeyX: 'fix',
  KeyV: 'eyes',
  KeyG: 'garage',
  KeyM: 'missions',
};

// The shared core: held flags, one-shot edges, the shoot pulse, mouse
// delta. Both the live keyboard input and the scripted test input are built
// on it, so a press means exactly one action on either device. Edge reads
// are consumed by the FIRST reader: the world runs up to 15 fixed steps per
// rendered frame, so a press that stayed readable all frame would fire 15
// times — E would enter AND exit the car in one tap, M would open AND close
// the job list, Q would cycle through every weapon.
function makeInputCore() {
  const held = {};
  const edge = {};
  let shootPulse = false;
  let mouseDX = 0;
  return {
    held, edge,
    wasPressed(action) {
      const hit = !!edge[action];
      edge[action] = false;
      return hit;
    },
    takeShoot() {
      const s = shootPulse;
      shootPulse = false;
      return s;
    },
    takeMouseDX() {
      const d = mouseDX;
      mouseDX = 0;
      return d;
    },
    endFrame() {
      for (const k of Object.keys(edge)) edge[k] = false;
    },
    setHeld(action, value) {
      held[action] = !!value;
    },
    press(action) {
      edge[action] = true;
    },
    release(action) {
      held[action] = false;
    },
    queueShoot() {
      shootPulse = true;
    },
    addMouseDX(dx) {
      mouseDX += dx;
    },
  };
}

export function createInput(canvas) {
  const input = makeInputCore();
  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (!input.held[action]) input.edge[action] = true;
    input.held[action] = true;
    if (action === 'jump' || action === 'pause') event.preventDefault();
  }
  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) input.held[action] = false;
  }
  function onMouseDown(event) {
    if (event.button === 0) input.queueShoot();
  }
  function onMouseMove(event) {
    input.addMouseDX(event.movementX || 0);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  return input;
}

// A synthetic input for screenshot autopilots and tests: same shape, scripted.
// Its mouse delta is always zero — scripted play drives the camera directly.
export function createScriptedInput() {
  const input = makeInputCore();
  input.takeMouseDX = () => 0;
  input.set = (action, value) => {
    input.held[action] = value;
  };
  input.clear = () => {
    for (const k of Object.keys(input.held)) input.held[k] = false;
    for (const k of Object.keys(input.edge)) input.edge[k] = false;
  };
  return input;
}
