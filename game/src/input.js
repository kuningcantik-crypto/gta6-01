// Keyboard, mouse and touch input through one small object. Keys are
// read as plain held flags every frame; a mouse click is a one-frame
// shoot pulse the world consumes. Touch controls drive the same object
// through setHeld() and press(), so the world never knows which device
// drove it.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_ENTER_CAR = 'enter';
export const ACTION_PUNCH = 'punch';
export const ACTION_RELOAD = 'reload';
export const ACTION_JUMP = 'jump';

// Physical key to game action. Both WASD and the arrow keys drive.
// [physical code, action]
const KEY_ROWS = [
  ['KeyW', 'up'], ['ArrowUp', 'up'],
  ['KeyS', 'down'], ['ArrowDown', 'down'],
  ['KeyA', 'left'], ['ArrowLeft', 'left'],
  ['KeyD', 'right'], ['ArrowRight', 'right'],
  ['ShiftLeft', 'run'], ['ShiftRight', 'run'],
  ['Space', 'jump'],
  ['KeyE', 'enter'],
  ['KeyF', 'punch'],
  ['KeyR', 'reload'],
  ['Enter', 'confirm'],
  ['Escape', 'pause'], ['KeyP', 'pause'],
  ['Digit1', 'w1'], ['Digit2', 'w2'], ['Digit3', 'w3'], ['Digit4', 'w4'],
  ['Digit5', 'w5'], ['Digit6', 'w6'], ['Digit7', 'w7'],
  ['KeyQ', 'cycleWeapon'],
  ['KeyC', 'radio'],
  ['KeyZ', 'plates'],
  ['KeyX', 'fix'],
  ['KeyV', 'eyes'],
  ['KeyG', 'garage'],
  ['KeyM', 'missions'],
  ['KeyO', 'settings'],
  ['KeyH', 'photo'],
];
const KEYMAP = Object.fromEntries(KEY_ROWS);

// The shared core: held flags, one-shot edges, the shoot pulse and the
// mouse delta. Both the live keyboard input and the scripted test input
// are built on it, so a press means exactly one action on either device.
// An edge is consumed by its FIRST reader: the world runs up to 15 fixed
// steps per rendered frame, so a press that stayed readable all frame
// would fire 15 times — E would enter AND exit the car in one tap, M
// would open AND close the job list, Q would cycle every weapon.
function makeInputCore() {
  const down = {};
  const taps = {};
  // Edges pressed during the current frame: endFrame() must NOT clear
  // these, or a press that lands after this frame's reads (toggleOverlays
  // runs before the step loop) would be wiped before the next frame
  // ever sees it. They survive exactly one frame, then go stale.
  const fresh = new Set();
  let shotQueued = false;
  let mouseDelta = 0;
  const clearTaps = () => {
    for (const action of Object.keys(taps)) taps[action] = false;
  };
  const core = {
    held: down,
    edge: taps,
    wasPressed(action) {
      if (!taps[action]) return false;
      taps[action] = false;
      return true;
    },
    takeShoot() {
      const queued = shotQueued;
      shotQueued = false;
      return queued;
    },
    takeMouseDX() {
      const delta = mouseDelta;
      mouseDelta = 0;
      return delta;
    },
    endFrame() {
      for (const action of Object.keys(taps)) {
        if (!fresh.has(action)) taps[action] = false;
      }
      fresh.clear();
    },
    resetEdges() {
      clearTaps();
      fresh.clear();
    },
    setHeld(action, value) {
      down[action] = !!value;
    },
    press(action) {
      taps[action] = true;
      fresh.add(action);
    },
    release(action) {
      down[action] = false;
    },
    queueShoot() {
      shotQueued = true;
    },
    addMouseDX(dx) {
      mouseDelta += dx;
    },
  };
  return core;
}

function releaseAll(input) {
  for (const action of Object.keys(input.held)) input.held[action] = false;
}

export function createInput(canvas) {
  const input = makeInputCore();
  window.addEventListener('keydown', (event) => {
    const action = KEYMAP[event.code];
    if (action === undefined) return;
    if (!input.held[action]) input.press(action);
    input.held[action] = true;
    if (action === 'jump' || action === 'pause') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const action = KEYMAP[event.code];
    if (action !== undefined) input.held[action] = false;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) input.queueShoot();
  });
  canvas.addEventListener('mousemove', (event) => {
    input.addMouseDX(event.movementX || 0);
  });
  // Losing the window must release every key, or Rico keeps driving
  // forever when the player alt-tabs away mid-chase.
  window.addEventListener('blur', () => releaseAll(input));
  return input;
}

// A synthetic input for screenshot autopilots and tests: the same shape,
// scripted. Its mouse delta is always zero — scripted play drives the
// camera directly.
export function createScriptedInput() {
  const input = makeInputCore();
  input.takeMouseDX = () => 0;
  input.set = (action, value) => {
    input.held[action] = value;
  };
  input.clear = () => {
    releaseAll(input);
    input.resetEdges();
  };
  return input;
}
