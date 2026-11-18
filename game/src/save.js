// save.js — progression saved in the browser's localStorage: cash, how far
// the story has advanced, and lifetime earnings. A save survives reloads;
// "New Game" wipes it. Nothing here touches the network.

const KEY = 'neontide-save-v1';

// Screenshot scenes run with saving disabled so a staged set-up can never
// overwrite the player's real progress.
let savingEnabled = true;

export function setSavingEnabled(value) {
  savingEnabled = value;
}

export function defaultSave() {
  return {
    cash: 120,
    missionIndex: 0, // next story mission to offer
    storyDone: false,
    totalEarned: 0,
    missionsDone: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return Object.assign(defaultSave(), data);
  } catch {
    return null;
  }
}

export function writeSave(data) {
  if (!savingEnabled) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or storage full: the game simply runs unsaved.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export function hasSave() {
  return loadSave() !== null;
}
