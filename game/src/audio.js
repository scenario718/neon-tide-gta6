// audio.js — every sound in Neon Tide is synthesised with WebAudio: a low
// engine hum that follows the player's speed, a two-tone siren that swells
// as police close in, and short noise/oscillator blips for shots, crashes,
// horns and cash. There are no audio files. Browsers only allow audio after
// a user gesture, so the context is created lazily and every call is safe
// when audio is not running yet (menus, screenshots).

let ctx = null;
let master = null;
let engineOsc = null;
let engineFilter = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenFlip = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function ready() {
  return ctx !== null && ctx.state === 'running';
}

// A short oscillator blip with an pitch envelope — the building block for
// most one-shot effects.
function blip(freqFrom, freqTo, dur, type, vol) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A burst of filtered noise — shots, crashes, splashes.
function noiseBurst(dur, vol, filterFreq, type = 'lowpass') {
  if (!ready()) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

export const sfx = {
  shot() {
    noiseBurst(0.11, 0.5, 2600, 'highpass');
    blip(220, 60, 0.08, 'square', 0.25);
  },
  dryFire() {
    blip(1200, 900, 0.03, 'square', 0.08);
  },
  reload() {
    blip(500, 300, 0.06, 'square', 0.12);
    setTimeout(() => blip(700, 500, 0.05, 'square', 0.12), 90);
  },
  hit() {
    noiseBurst(0.07, 0.3, 900);
  },
  crash(strength = 1) {
    noiseBurst(0.22, Math.min(0.7, 0.25 + strength * 0.3), 500);
    blip(120, 40, 0.2, 'sawtooth', 0.2);
  },
  honk() {
    blip(370, 340, 0.16, 'square', 0.12);
    blip(466, 430, 0.16, 'square', 0.08);
  },
  cash() {
    blip(880, 880, 0.07, 'sine', 0.2);
    setTimeout(() => blip(1318, 1318, 0.12, 'sine', 0.2), 70);
  },
  pickup() {
    blip(520, 880, 0.12, 'triangle', 0.22);
  },
  door() {
    noiseBurst(0.06, 0.2, 700);
    blip(180, 120, 0.07, 'square', 0.1);
  },
  splash() {
    noiseBurst(0.3, 0.3, 1200);
  },
  step() {
    noiseBurst(0.03, 0.05, 600);
  },
  uiMove() {
    blip(660, 660, 0.04, 'sine', 0.1);
  },
  uiPick() {
    blip(520, 780, 0.09, 'sine', 0.16);
  },
  busted() {
    blip(392, 392, 0.16, 'triangle', 0.22);
    setTimeout(() => blip(311, 311, 0.16, 'triangle', 0.22), 170);
    setTimeout(() => blip(233, 233, 0.34, 'triangle', 0.22), 340);
  },
  wasted() {
    blip(330, 55, 0.8, 'sawtooth', 0.2);
  },
  missionDone() {
    blip(523, 523, 0.1, 'triangle', 0.2);
    setTimeout(() => blip(659, 659, 0.1, 'triangle', 0.2), 100);
    setTimeout(() => blip(784, 784, 0.2, 'triangle', 0.22), 200);
  },
};

// The engine is a sawtooth through a lowpass, started when the player gets
// into a car and pitched by speed. Kept quiet so it sits under the action.
function startEngine() {
  if (!ready() || engineOsc) return;
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 300;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0.0;
  engineOsc.connect(engineFilter).connect(engineGain).connect(master);
  engineOsc.start();
}

function stopEngine() {
  if (!engineOsc) return;
  try {
    engineOsc.stop();
  } catch { /* already stopped */ }
  engineOsc = null;
  engineGain = null;
  engineFilter = null;
}

// The siren is one oscillator flipping between two tones, gained by how
// close the nearest police car is.
function startSiren() {
  if (!ready() || sirenOsc) return;
  sirenOsc = ctx.createOscillator();
  sirenOsc.type = 'triangle';
  sirenOsc.frequency.value = 700;
  sirenGain = ctx.createGain();
  sirenGain.gain.value = 0.0;
  sirenOsc.connect(sirenGain).connect(master);
  sirenOsc.start();
  let high = false;
  sirenFlip = setInterval(() => {
    if (!sirenOsc) return;
    high = !high;
    sirenOsc.frequency.setValueAtTime(high ? 950 : 700, ctx.currentTime);
  }, 380);
}

function stopSiren() {
  if (sirenFlip) clearInterval(sirenFlip);
  sirenFlip = null;
  if (!sirenOsc) return;
  try {
    sirenOsc.stop();
  } catch { /* already stopped */ }
  sirenOsc = null;
  sirenGain = null;
}

// Called every frame from the main loop: speed 0..1 for the engine,
// nearestCop 0..1 (1 = a police car is right on top of the player).
export function updateAudio(speedNorm, driving, nearestCop) {
  if (!ready()) return;
  if (driving) {
    startEngine();
    if (engineOsc) {
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(50 + speedNorm * 130, t, 0.06);
      engineFilter.frequency.setTargetAtTime(240 + speedNorm * 900, t, 0.06);
      engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.06, t, 0.08);
    }
  } else {
    stopEngine();
  }
  if (nearestCop > 0.02) {
    startSiren();
    if (sirenGain) sirenGain.gain.setTargetAtTime(nearestCop * 0.11, ctx.currentTime, 0.1);
  } else {
    stopSiren();
  }
}
