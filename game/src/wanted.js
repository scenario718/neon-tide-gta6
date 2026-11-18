// wanted.js — Porto Alba's wanted level. Crimes add "heat"; enough heat
// earns stars (one to five). Witnessed crimes count in full — a pedestrian
// or officer nearby — while unwitnessed ones mostly slip by. Stay out of
// police sight and the heat drains away, star by star.

import { dist } from './util.js';

const STAR_THRESHOLDS = [1, 60, 135, 225, 340];

const CRIME_HEAT = {
  theft: 42, // stealing a car
  hitPed: 55, // knocking a pedestrian down with a car
  hitCar: 16, // smashing into traffic
  hitCop: 70, // ramming a police car
  shot: 24, // firing a gun where people can hear
  hurtPed: 65, // shooting a pedestrian
  copDown: 95, // wrecking a police car
};

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    seenNow: false,
    unseenFor: 0, // seconds since a police car last had eyes on the player
    floor: 0, // missions can hold the wanted level at a minimum
  };
}

export function starsForHeat(heat) {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (heat >= t) stars++;
  return stars;
}

function witnessed(g, x, y, kind) {
  if (kind === 'hitCop' || kind === 'copDown') return true;
  for (const cop of g.police.cars) {
    if (dist(cop.x, cop.y, x, y) < 520) return true;
  }
  const radius = kind === 'shot' ? 320 : 250;
  for (const ped of g.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < radius) return true;
  }
  return false;
}

// Report a crime at a place. Returns true when it was witnessed (and so
// counted in full) so callers can show the "seen!" flash.
export function reportCrime(g, kind, x, y) {
  const base = CRIME_HEAT[kind] || 10;
  const seen = witnessed(g, x, y, kind);
  g.wanted.heat += seen ? base : Math.round(base * 0.2);
  if (seen) g.wanted.unseenFor = 0;
  return seen;
}

export function updateWanted(g, dt) {
  const w = g.wanted;
  const focus = g.player.car || g.player;
  w.seenNow = false;
  for (const cop of g.police.cars) {
    if (!cop.dead && dist(cop.x, cop.y, focus.x, focus.y) < 470) {
      w.seenNow = true;
      break;
    }
  }
  if (w.seenNow) {
    w.unseenFor = 0;
  } else {
    w.unseenFor += dt;
    if (w.unseenFor > 6 && w.heat > 0) {
      w.heat = Math.max(0, w.heat - dt * 7);
    }
  }
  w.stars = Math.max(starsForHeat(w.heat), w.floor);
}

export function clearWanted(g) {
  g.wanted.heat = 0;
  g.wanted.stars = 0;
  g.wanted.floor = 0;
  g.wanted.unseenFor = 0;
}

export function setWantedFloor(g, stars) {
  g.wanted.floor = stars;
  if (stars > 0 && g.wanted.heat < STAR_THRESHOLDS[stars - 1]) {
    g.wanted.heat = STAR_THRESHOLDS[stars - 1];
  }
}
