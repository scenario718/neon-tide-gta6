// missions.js — the story of Neon Tide, in four jobs, plus free-roam cash
// stashes. Mari Sol, a bike courier with a talent for driving, takes work
// from fixer Dom Paz: a crate run, a stolen roadster, a singer's escape and
// one last high-tide score. Each mission is a list of steps (drive here,
// steal that, deliver this) with a marker, an objective line and a cash
// reward; progress is saved between sessions.

import { dist } from './util.js';
import { makeCar } from './vehicles.js';
import { setWantedFloor, clearWanted } from './wanted.js';
import { floatText } from './effects.js';
import { writeSave } from './save.js';
import { sfx } from './audio.js';
import { money } from './util.js';

// Build the mission definitions against the city's named locations.
export function createMissions(city) {
  const L = city.locations;
  return [
    {
      id: 'first-light',
      title: 'First Light Run',
      giver: 'Dom Paz',
      start: L.garageDoor,
      reward: 250,
      intro: [
        'Dom: Mari Sol! You drive, I pay. Simple.',
        'Dom: A crate waits at Pier 9 Storage. Bring it to Alba Tower.',
        'Dom: And Mari — the crate does not exist. Understand?',
      ],
      steps: [
        { kind: 'driveTo', x: L.docksPickup.x, y: L.docksPickup.y, text: 'Pick up the crate at Pier 9 Storage' },
        { kind: 'driveTo', x: L.officeDoor.x, y: L.officeDoor.y, text: 'Deliver the crate to Alba Tower' },
      ],
    },
    {
      id: 'borrowed-sunshine',
      title: 'Borrowed Sunshine',
      giver: 'Dom Paz',
      start: L.beachHotel,
      reward: 400,
      intro: [
        'Dom: A yellow Solstice Roadster sits outside Hotel Brisa.',
        'Dom: Its owner owes me. The car is the payment.',
        'Dom: Bring it to my garage. Try not to be seen.',
      ],
      spawnCar: { type: 'convertible', x: 2900, y: 900, angle: Math.PI / 2 },
      steps: [
        { kind: 'steal', text: 'Steal the yellow Solstice Roadster' },
        { kind: 'deliverCar', x: L.garageDoor.x, y: L.garageDoor.y, text: "Take the Solstice to Dom's Garage" },
      ],
    },
    {
      id: 'veras-exit',
      title: "Vera's Exit",
      giver: 'Vera Lark',
      start: L.beachHotel,
      reward: 600,
      intro: [
        'Vera: You are the driver Dom promised? Good.',
        'Vera: My manager sold my contract to men with guns.',
        'Vera: Get me to the boat at the pier. Do not stop for anyone.',
      ],
      steps: [
        { kind: 'pickup', x: L.beachHotel.x, y: L.beachHotel.y, text: 'Pick up Vera outside Hotel Brisa (in a car)' },
        { kind: 'driveTo', x: L.pierEnd.x, y: L.pierEnd.y, text: 'Get Vera to the boat at the end of the pier', timer: 150, floor: 2 },
      ],
    },
    {
      id: 'high-tide',
      title: 'High Tide',
      giver: 'Dom Paz',
      start: L.docksPickup,
      reward: 1200,
      intro: [
        'Dom: Last job, Mari. Three drops, one tide.',
        'Dom: Cash is stashed downtown, at the docks, on the beach.',
        'Dom: Collect it all and reach the boat. Then we are ghosts.',
      ],
      steps: [
        { kind: 'collect', x: 1350, y: 1330, text: 'Collect the downtown drop' },
        { kind: 'collect', x: 700, y: 2400, text: 'Collect the docks drop' },
        { kind: 'collect', x: 3120, y: 1500, text: 'Collect the beach drop' },
        { kind: 'driveTo', x: L.pierEnd.x, y: L.pierEnd.y, text: 'Reach the boat at the end of the pier', floor: 3 },
      ],
      timer: 300,
    },
  ];
}

export function createMissionState() {
  return {
    active: null, // { def, step, timerLeft, car }
    bannerQueue: [],
    bannerT: 0,
    bannerText: '',
    bannerSub: '',
  };
}

function banner(g, text, sub = '', hold = 3.4) {
  g.missions.bannerQueue.push({ text, sub, hold });
}

export function startMission(g, def) {
  const m = g.missions;
  m.active = { def, step: 0, timerLeft: def.timer || 0, car: null };
  for (const line of def.intro) banner(g, line, def.title, 3.2);
  if (def.spawnCar) {
    const s = def.spawnCar;
    const car = makeCar(s.type, s.x, s.y, s.angle);
    car.missionCar = true;
    m.active.car = car;
    g.allCars.push(car);
    g.parkedCars.push(car);
  }
  sfx.uiPick();
}

function endMission(g, success, reason = '') {
  const m = g.missions;
  const def = m.active.def;
  if (m.active.car && def.id === 'borrowed-sunshine' && !success) {
    // Reset the roadster for another attempt.
    const s = def.spawnCar;
    m.active.car.x = s.x;
    m.active.car.y = s.y;
    m.active.car.angle = s.angle;
    m.active.car.speed = 0;
    if (m.active.car.driver === 'player') g.player.car = null;
    m.active.car.driver = 'none';
  }
  if (m.active.car && !success && def.id !== 'borrowed-sunshine') {
    const i = g.allCars.indexOf(m.active.car);
    if (i >= 0) g.allCars.splice(i, 1);
    const j = g.parkedCars.indexOf(m.active.car);
    if (j >= 0) g.parkedCars.splice(j, 1);
  }
  clearWanted(g);
  m.active = null;
  if (success) {
    g.cash += def.reward;
    g.save.cash = g.cash;
    g.save.totalEarned += def.reward;
    g.save.missionsDone += 1;
    g.save.missionIndex += 1;
    if (def.id === 'high-tide') {
      g.save.storyDone = true;
      banner(g, 'Mari owns the tide now.', 'STORY COMPLETE — Porto Alba is yours to roam', 6);
    } else {
      banner(g, def.title + ' — complete', '+' + money(def.reward), 4);
    }
    floatText(g.effects, g.player.x, g.player.y - 30, '+' + money(def.reward));
    sfx.missionDone();
    writeSave(g.save);
  } else {
    banner(g, 'Mission failed', reason || 'Try again from the gold marker', 3.6);
  }
}

// The world point the HUD should point at right now.
export function currentObjective(g) {
  const m = g.missions;
  if (m.active) {
    const step = m.active.def.steps[m.active.step];
    if (step.kind === 'steal' && m.active.car) {
      return { x: m.active.car.x, y: m.active.car.y, text: step.text, mission: m.active.def };
    }
    return { x: step.x, y: step.y, text: step.text, mission: m.active.def };
  }
  if (!g.save.storyDone && g.save.missionIndex < g.missionDefs.length) {
    const def = g.missionDefs[g.save.missionIndex];
    return { x: def.start.x, y: def.start.y, text: 'New job: ' + def.title + ' — ' + def.giver, mission: null, isStart: true };
  }
  return null;
}

function stepReached(g, step) {
  const focus = g.player.car || g.player;
  return dist(focus.x, focus.y, step.x, step.y) < 64;
}

export function updateMissions(g, dt) {
  const m = g.missions;
  // Banner queue: one message at a time, fading through.
  if (m.bannerT > 0) m.bannerT -= dt;
  if (m.bannerT <= 0 && m.bannerQueue.length) {
    const next = m.bannerQueue.shift();
    m.bannerText = next.text;
    m.bannerSub = next.sub;
    m.bannerT = next.hold;
  }

  if (!m.active) {
    // Standing on a gold start marker begins the next job.
    if (!g.save.storyDone && g.save.missionIndex < g.missionDefs.length) {
      const def = g.missionDefs[g.save.missionIndex];
      const focus = g.player.car || g.player;
      if (dist(focus.x, focus.y, def.start.x, def.start.y) < 58) {
        startMission(g, def);
      }
    }
    return;
  }

  const active = m.active;
  const step = active.def.steps[active.step];

  // Mission-wide and per-step timers.
  if (active.def.timer) {
    active.timerLeft -= dt;
    if (active.timerLeft <= 0) {
      endMission(g, false, 'Out of time');
      return;
    }
  }
  if (step.timer && active.stepTimer === undefined) active.stepTimer = step.timer;
  if (step.timer) {
    active.stepTimer -= dt;
    if (active.stepTimer <= 0) {
      endMission(g, false, 'Out of time');
      return;
    }
  }
  if (step.floor) setWantedFloor(g, step.floor);

  let done = false;
  switch (step.kind) {
    case 'goto':
      done = stepReached(g, step);
      break;
    case 'driveTo':
      done = !!g.player.car && stepReached(g, step);
      break;
    case 'pickup':
      done = !!g.player.car && stepReached(g, step);
      if (done) banner(g, 'Vera: Drive. DRIVE!', active.def.title, 2.6);
      break;
    case 'collect':
      done = stepReached(g, step);
      if (done) {
        sfx.pickup();
        banner(g, 'Drop collected', active.def.title, 2);
      }
      break;
    case 'steal':
      done = g.player.car === active.car;
      if (done) banner(g, 'Dom: That is the one. Bring it home.', active.def.title, 2.6);
      break;
    case 'deliverCar':
      done = g.player.car === active.car && stepReached(g, step);
      if (done && active.car) {
        active.car.owned = true; // Dom keeps it; it is "yours" now, no more heat
      }
      break;
  }
  if (done) {
    active.step += 1;
    active.stepTimer = undefined;
    sfx.pickup();
    if (active.step >= active.def.steps.length) {
      endMission(g, true);
    }
  }
}

// Free-roam cash stashes: little bundles tucked around the city that
// respawn a while after they are grabbed.
export function createStashes(city, rng) {
  const stashes = [];
  for (let i = 0; i < 12; i++) {
    const block = city.blocks[Math.floor(rng.next() * city.blocks.length)];
    stashes.push({
      x: block.x + 20 + rng.next() * (block.w - 40),
      y: block.y + 20 + rng.next() * (block.h - 40),
      value: rng.int(25, 60),
      taken: false,
      respawnT: 0,
    });
  }
  return stashes;
}

export function updateStashes(g, dt) {
  const focus = g.player.car || g.player;
  for (const s of g.stashes) {
    if (s.taken) {
      s.respawnT -= dt;
      if (s.respawnT <= 0) s.taken = false;
      continue;
    }
    if (dist(focus.x, focus.y, s.x, s.y) < 34) {
      s.taken = true;
      s.respawnT = 120;
      g.cash += s.value;
      g.save.cash = g.cash;
      g.save.totalEarned += s.value;
      floatText(g.effects, s.x, s.y - 16, '+' + money(s.value));
      sfx.cash();
      writeSave(g.save);
    }
  }
}
