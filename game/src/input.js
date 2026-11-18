// input.js — keyboard and mouse state for Neon Tide. Other systems read the
// exported `keys` set and `mouse` object; edge-triggered presses are tracked
// per frame so "press E to enter" fires once, not sixty times a second.

export const keys = new Set();
const pressedThisFrame = new Set();

export const mouse = {
  x: 0,
  y: 0,
  down: false,
  clicked: false, // left button went down this frame
};

const GAME_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyR', 'KeyP',
  'ShiftLeft', 'ShiftRight', 'Enter', 'Escape',
]);

export function initInput(canvas) {
  window.addEventListener('keydown', (ev) => {
    if (GAME_CODES.has(ev.code)) ev.preventDefault();
    if (!ev.repeat) pressedThisFrame.add(ev.code);
    keys.add(ev.code);
  });
  window.addEventListener('keyup', (ev) => {
    keys.delete(ev.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (ev) => {
    // A click also reports where the pointer is, so a first action that is
    // a click (no prior move over the canvas) still lands on its button.
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
    if (ev.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

// True only on the frame the key first went down.
export function pressed(code) {
  return pressedThisFrame.has(code);
}

export function down(...codes) {
  return codes.some((c) => keys.has(c));
}

// Called at the very end of each frame by the main loop.
export function endFrameInput() {
  pressedThisFrame.clear();
  mouse.clicked = false;
}

// Movement axes from WASD or the arrow keys: x/y in -1..1, not normalised
// (callers normalise so diagonals are not faster).
export function moveAxes() {
  let x = 0;
  let y = 0;
  if (down('KeyA', 'ArrowLeft')) x -= 1;
  if (down('KeyD', 'ArrowRight')) x += 1;
  if (down('KeyW', 'ArrowUp')) y -= 1;
  if (down('KeyS', 'ArrowDown')) y += 1;
  return { x, y };
}
