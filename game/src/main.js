// main.js — Neon Tide's entry point. Builds the world and the game state,
// runs the loop, wires the systems together (player, traffic, police,
// wanted, missions, combat, effects), handles car-to-car and car-to-person
// collisions, the busted/wasted flow, menus and buttons, and the ?scene=
// setups the screenshots are taken from.

import { makeRng, clamp, dist, angleDelta } from './util.js';
import { initInput, pressed, mouse, endFrameInput } from './input.js';
import { initAudio, updateAudio, sfx } from './audio.js';
import { buildCity, districtAt } from './city.js';
import { makeCar, placeParkedCars, collideCars, updateCarPhysics } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPedestrians, updatePedestrians, scarePeds } from './pedestrians.js';
import { createPlayer, updatePlayer, hurtPlayer } from './player.js';
import { createWanted, updateWanted, clearWanted, reportCrime } from './wanted.js';
import { createPolice, updatePolice, nearestCopNorm, clearPolice } from './police.js';
import { createBullets, updateBullets } from './combat.js';
import { createEffects, updateEffects, spawnSmoke, spawnFire, addSkid, addShake } from './effects.js';
import { createMissions, createMissionState, updateMissions, createStashes, updateStashes, startMission } from './missions.js';
import { loadSave, defaultSave, writeSave, clearSave, hasSave, setSavingEnabled } from './save.js';
import { createCamera, updateCamera, snapCamera, drawWorld } from './render.js';
import { drawHUD } from './hud.js';
import { drawStartScreen, drawPause, drawBusted, drawWasted } from './menus.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

window.__errors = [];
window.addEventListener('error', (ev) => {
  window.__errors.push(String(ev.message || ev.error));
});

function viewSize() {
  return { w: canvas.width, h: canvas.height };
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();
initInput(canvas);

const DISTRICT_NAMES = {
  downtown: 'Downtown',
  midtown: 'Midtown',
  suburbs: 'The Suburbs',
  docks: 'The Docks',
  beach: 'Marina Beach',
  ocean: 'The Ocean',
};

// Build a fresh world + state. Deterministic: one seed for every run.
function buildWorld(save) {
  const rng = makeRng(20261117);
  const city = buildCity(rng);
  const player = createPlayer(city.locations.playerStart.x, city.locations.playerStart.y);
  const parkedCars = placeParkedCars(city, rng);
  // Mari's own sedan, parked outside her place. Never a crime to drive it.
  const herCar = makeCar('sedan', 420, 762, Math.PI / 2, '#3e6fb0');
  herCar.owned = true;
  parkedCars.push(herCar);
  const traffic = createTraffic(city, rng);
  const g = {
    mode: 'menu',
    time: 0,
    city,
    player,
    parkedCars,
    traffic,
    peds: createPedestrians(city, rng),
    police: createPolice(),
    wanted: createWanted(),
    missions: createMissionState(),
    missionDefs: createMissions(city),
    stashes: createStashes(city, rng),
    bullets: createBullets(),
    effects: createEffects(),
    camera: createCamera(),
    ui: { buttons: [] },
    save,
    cash: save.cash,
    hasSaveFile: hasSave(),
    districtName: 'The Suburbs',
    lastFine: 0,
    sceneMode: false,
    skidHappening: null,
  };
  g.allCars = [...parkedCars, ...traffic.cars];
  return g;
}

let g = buildWorld(loadSave() || defaultSave());
window.__neontide = g;

function startRun(fresh) {
  if (fresh) clearSave();
  const save = fresh ? defaultSave() : loadSave() || defaultSave();
  if (fresh) writeSave(save);
  g = buildWorld(save);
  g.mode = 'play';
  window.__neontide = g;
  const { w, h } = viewSize();
  snapCamera(g, w, h);
  initAudio();
  sfx.uiPick();
}

function respawn() {
  const p = g.player;
  if (p.car) {
    p.car.driver = 'none';
    p.car = null;
  }
  clearPolice(g);
  clearWanted(g);
  p.hp = p.maxHp;
  p.ammo = 12;
  if (g.mode === 'busted') {
    p.x = g.city.locations.hideout.x;
    p.y = g.city.locations.hideout.y;
  } else {
    p.x = g.city.locations.hospitalDoor.x;
    p.y = g.city.locations.hospitalDoor.y;
  }
  g.mode = 'play';
  const { w, h } = viewSize();
  snapCamera(g, w, h);
}

function doBusted() {
  const fine = Math.min(g.cash, Math.max(50, Math.round(g.cash * 0.15)));
  g.cash -= fine;
  g.save.cash = g.cash;
  g.lastFine = fine;
  writeSave(g.save);
  g.mode = 'busted';
  sfx.busted();
}

function doWasted() {
  const fine = Math.min(g.cash, Math.max(40, Math.round(g.cash * 0.1)));
  g.cash -= fine;
  g.save.cash = g.cash;
  g.lastFine = fine;
  writeSave(g.save);
  g.mode = 'wasted';
  sfx.wasted();
}

function handleButtons() {
  if (!mouse.clicked) return;
  for (const b of g.ui.buttons) {
    if (mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) {
      initAudio();
      if (b.id === 'new') startRun(true);
      else if (b.id === 'continue') startRun(false);
      else if (b.id === 'resume') g.mode = 'play';
      else if (b.id === 'restart') startRun(false);
      else if (b.id === 'quit') {
        g = buildWorld(loadSave() || defaultSave());
        window.__neontide = g;
      } else if (b.id === 'respawn') respawn();
      return;
    }
  }
}

// Cars meeting cars, cars meeting people, and the smoke of damage.
function updateCollisions(dt) {
  const cars = g.allCars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.dead && b.dead) continue;
      if (Math.abs(a.x - b.x) > 90 || Math.abs(a.y - b.y) > 90) continue;
      const rel = collideCars(a, b);
      if (rel > 165 && (a.driver === 'player' || b.driver === 'player')) {
        sfx.crash(Math.min(1, rel / 340));
        addShake(g.effects, rel / 55);
        scarePeds(g, (a.x + b.x) / 2, (a.y + b.y) / 2, 210);
        const other = a.driver === 'player' ? b : a;
        if (other.driver === 'police') reportCrime(g, 'hitCop', other.x, other.y);
        else if (other.driver === 'traffic') reportCrime(g, 'hitCar', other.x, other.y);
      } else if (rel > 200) {
        scarePeds(g, (a.x + b.x) / 2, (a.y + b.y) / 2, 170);
      }
    }
  }
  // Cars vs pedestrians, and cars vs the player on foot.
  for (const car of cars) {
    if (Math.abs(car.speed) < 65) continue;
    for (const ped of g.peds) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < car.radius + 5) {
        ped.state = 'down';
        ped.downT = 0;
        car.speed *= 0.8;
        scarePeds(g, ped.x, ped.y, 230);
        if (car.driver === 'player') {
          reportCrime(g, 'hitPed', ped.x, ped.y);
          sfx.crash(0.35);
          addShake(g.effects, 3);
        }
      }
    }
    const p = g.player;
    if (!p.car && car.driver !== 'player' && Math.abs(car.speed) > 85) {
      if (dist(car.x, car.y, p.x, p.y) < car.radius + 7 && g.time - p.lastHurt > 0.9) {
        hurtPlayer(g, 11);
        const d = Math.max(1, dist(car.x, car.y, p.x, p.y));
        p.x += ((p.x - car.x) / d) * 22;
        p.y += ((p.y - car.y) / d) * 22;
        sfx.crash(0.4);
      }
    }
  }
  // Damage smoke and wreck fires.
  for (const car of cars) {
    car.smokeAcc += dt;
    if (car.dead) {
      if (car.smokeAcc > 0.12) {
        car.smokeAcc = 0;
        spawnFire(g.effects, car.x, car.y, 2);
        spawnSmoke(g.effects, car.x, car.y, 1, true);
      }
    } else if (car.hp < car.maxHp * 0.35 && car.smokeAcc > 0.16) {
      car.smokeAcc = 0;
      spawnSmoke(g.effects, car.x + Math.cos(car.angle) * 16, car.y + Math.sin(car.angle) * 16, 1, true);
    }
    // Skid marks when a fast car is thrown sideways.
    const rearX = car.x - Math.cos(car.angle) * car.w * 0.32;
    const rearY = car.y - Math.sin(car.angle) * car.w * 0.32;
    const sliding = Math.abs(car.speed) > 190 && Math.abs(car.steerVis) > 0.3;
    if ((sliding || g.skidHappening === car) && car._skidX !== undefined) {
      addSkid(g.effects, car._skidX, car._skidY, rearX, rearY);
    }
    car._skidX = rearX;
    car._skidY = rearY;
  }
  // The player's own car burning out from under them.
  if (g.player.car && g.player.car.dead) {
    const car = g.player.car;
    car.driver = 'none';
    g.player.car = null;
    g.player.x = car.x + car.radius + 16;
    g.player.y = car.y;
    hurtPlayer(g, 12);
  }
}

// Screenshot scenes have no driver at the keyboard, so the player's car
// follows a waypoint route with the real physics — traffic, police and the
// wanted system all react to it exactly as they would to a human driver.
function driveSceneCar(g, dt) {
  const drive = g.sceneDrive;
  const car = g.player.car;
  if (!car || car.dead) return;
  const wp = drive.waypoints[drive.index];
  if (dist(car.x, car.y, wp.x, wp.y) < 72) {
    drive.index++;
    if (drive.index >= drive.waypoints.length) {
      if (drive.loop) drive.index = 0;
      else drive.done = true;
    }
  }
  let throttle = 0;
  let steer = 0;
  if (!drive.done) {
    const target = drive.waypoints[Math.min(drive.index, drive.waypoints.length - 1)];
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    const delta = angleDelta(car.angle, want);
    steer = clamp(delta * 2.4, -1, 1);
    throttle = car.speed < drive.target ? 0.85 : 0;
    if (Math.abs(delta) > 1.9 && car.speed > 60) throttle = -1;
  } else if (car.speed > 10) {
    throttle = -1;
  }
  updateCarPhysics(car, throttle, steer, dt, g.city);
  g.player.x = car.x;
  g.player.y = car.y;
  g.player.angle = car.angle;
}

function updatePlay(dt) {
  if (g.sceneMode && g.sceneDrive && g.player.car) driveSceneCar(g, dt);
  else updatePlayer(g, dt);
  updateTraffic(g, dt);
  updatePolice(g, dt);
  updateWanted(g, dt);
  updatePedestrians(g, dt);
  updateBullets(g, dt);
  updateCollisions(dt);
  updateMissions(g, dt);
  updateStashes(g, dt);
  if (g.police.bustMeter >= 1) {
    doBusted();
    return;
  }
  if (g.player.hp <= 0) {
    doWasted();
    return;
  }
  const focus = g.player.car || g.player;
  g.districtName = DISTRICT_NAMES[districtAt(g.city, focus.x, focus.y)] || 'Porto Alba';
  const speedNorm = g.player.car ? clamp(Math.abs(g.player.car.speed) / g.player.car.spec.topSpeed, 0, 1) : 0;
  updateAudio(speedNorm, !!g.player.car, g.wanted.stars > 0 ? nearestCopNorm(g) : 0);
}

// Deterministic set-ups for the screenshots: real systems, arranged.
function applyScene(name) {
  setSavingEnabled(false);
  g = buildWorld(defaultSave());
  g.sceneMode = true;
  g.mode = 'play';
  window.__neontide = g;
  const put = (car, x, y, angle, speed) => {
    car.x = x;
    car.y = y;
    car.angle = angle;
    car.speed = speed;
    return car;
  };
  const trafficNear = (x, y, angle) => {
    // Pull one traffic car out of circulation and park it in the shot.
    const car = g.traffic.cars.pop();
    put(car, x, y, angle, 0);
    return car;
  };
  const addCop = (x, y, angle) => {
    const cop = makeCar('police', x, y, angle, '#20242a');
    cop.driver = 'police';
    cop.shootCd = 2;
    g.police.cars.push(cop);
    g.allCars.push(cop);
    return cop;
  };
  if (name === 'drive') {
    const def = g.missionDefs[0];
    startMission(g, def);
    const car = g.parkedCars[g.parkedCars.length - 1];
    car.driver = 'player';
    g.player.car = car;
    put(car, 1300, 1020, 0, 285);
    g.player.x = car.x;
    g.player.y = car.y;
    g.wanted.heat = 100; // two stars
    g.sceneDrive = {
      waypoints: [
        { x: 2840, y: 1020 }, { x: 2900, y: 1600 }, { x: 2900, y: 2120 },
        { x: 1720, y: 2180 }, { x: 1660, y: 1100 }, { x: 1560, y: 1020 },
      ],
      index: 0, target: 278, loop: true, done: false,
    };
    addCop(1010, 1020, 0);
    trafficNear(1980, 975, 0);
    trafficNear(2240, 1065, Math.PI);
  } else if (name === 'chase') {
    const car = makeCar('sports', 2900, 430, Math.PI / 2, '#d8232a');
    car.owned = true;
    car.driver = 'player';
    g.allCars.push(car);
    g.player.car = car;
    g.player.x = car.x;
    g.player.y = car.y;
    car.speed = 395;
    g.wanted.heat = 300; // four stars
    g.sceneDrive = {
      waypoints: [
        { x: 2900, y: 2100 }, { x: 1720, y: 2180 }, { x: 1660, y: 1100 }, { x: 2840, y: 1020 },
      ],
      index: 0, target: 372, loop: true, done: false,
    };
    addCop(2900, 300, Math.PI / 2);
    addCop(2900, 175, Math.PI / 2);
    trafficNear(2868, 1180, -Math.PI / 2);
  } else if (name === 'mission') {
    g.save.missionIndex = 2;
    const def = g.missionDefs[2];
    startMission(g, def);
    g.missions.active.step = 1;
    g.missions.active.stepTimer = 132;
    const car = g.parkedCars[g.parkedCars.length - 1];
    car.driver = 'player';
    g.player.car = car;
    put(car, 2900, 1240, Math.PI / 2, 265);
    g.player.x = car.x;
    g.player.y = car.y;
    g.wanted.heat = 100;
    g.sceneDrive = {
      waypoints: [{ x: 2900, y: 2100 }, { x: 3120, y: 2245 }, { x: 3480, y: 2310 }],
      index: 0, target: 248, loop: false, done: false,
    };
    addCop(2900, 1005, Math.PI / 2);
  } else if (name === 'onfoot') {
    g.save.missionIndex = 1;
    g.player.x = 3145;
    g.player.y = 1245;
    g.player.angle = Math.PI;
    const roadster = makeCar('convertible', 3045, 1290, 0.5);
    g.allCars.push(roadster);
    g.parkedCars.push(roadster);
    // A few people enjoying the beach, spread out along the sand.
    const spots = [[3060, 1140], [3200, 1360], [3090, 1420]];
    for (let i = 0; i < spots.length; i++) {
      const ped = g.peds[i];
      ped.x = spots[i][0];
      ped.y = spots[i][1];
      ped.state = 'walk';
    }
  }
  const { w, h } = viewSize();
  snapCamera(g, w, h);
}

const params = new URLSearchParams(window.location.search);
if (params.get('scene')) applyScene(params.get('scene'));

let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  const { w, h } = viewSize();
  g.time += dt;

  if (g.mode === 'menu') {
    // Slow drift over the city behind the title.
    g.camera.x = clamp(g.camera.x + dt * 14, 0, g.city.w - w);
    g.camera.y = 620 + Math.sin(g.time * 0.05) * 160;
    updatePedestrians(g, dt);
    updateTraffic(g, dt);
    updateEffects(g.effects, dt);
    drawWorld(ctx, g, w, h);
    drawStartScreen(ctx, g, w, h);
    if (pressed('Enter')) startRun(g.hasSaveFile ? false : true);
  } else if (g.mode === 'pause') {
    drawWorld(ctx, g, w, h);
    drawHUD(ctx, g, w, h);
    drawPause(ctx, g, w, h);
    if (pressed('Escape') || pressed('KeyP')) g.mode = 'play';
  } else if (g.mode === 'busted' || g.mode === 'wasted') {
    drawWorld(ctx, g, w, h);
    if (g.mode === 'busted') drawBusted(ctx, g, w, h);
    else drawWasted(ctx, g, w, h);
    if (pressed('Enter')) respawn();
  } else {
    updatePlay(dt);
    updateEffects(g.effects, dt);
    updateCamera(g, dt, w, h);
    drawWorld(ctx, g, w, h);
    drawHUD(ctx, g, w, h);
    if (pressed('Escape') || pressed('KeyP')) g.mode = 'pause';
  }
  handleButtons();
  endFrameInput();
}
requestAnimationFrame(frame);
