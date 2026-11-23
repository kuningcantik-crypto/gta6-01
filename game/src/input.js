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

export function createInput(canvas) {
  const held = {};
  const edge = {};
  let shootPulse = false;
  let mouseDX = 0;

  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (!held[action]) edge[action] = true;
    held[action] = true;
    if (action === 'jump' || action === 'pause') event.preventDefault();
  }
  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) held[action] = false;
  }
  function onMouseDown(event) {
    if (event.button === 0) shootPulse = true;
  }
  function onMouseMove(event) {
    mouseDX += event.movementX || 0;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);

  return {
    held,
    // Edge-triggered, and consumed by the FIRST reader: the world runs up
    // to 15 fixed steps per rendered frame, so a press that stayed readable
    // all frame would fire 15 times — E would enter AND exit the car in
    // one tap, M would open AND close the job list, Q would cycle through
    // every weapon. Reading once is what makes one press mean one action.
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

// A synthetic input for screenshot autopilots and tests: same shape, scripted.
export function createScriptedInput() {
  const held = {};
  const edge = {};
  let shootPulse = false;
  return {
    held,
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
      return 0;
    },
    endFrame() {
      for (const k of Object.keys(edge)) edge[k] = false;
    },
    set(action, value) {
      held[action] = value;
    },
    press(action) {
      edge[action] = true;
    },
    queueShoot() {
      shootPulse = true;
    },
    clear() {
      for (const k of Object.keys(held)) held[k] = false;
    },
  };
}
