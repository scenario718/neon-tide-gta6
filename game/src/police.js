// police.js — Porto Alba PD. Interceptors spawn on the avenues around the
// player as the wanted level climbs, steer to intercept, ram when the
// player drives and close in to make an arrest when the player is on foot.
// Keep still near an officer too long and the bust meter fills. At three
// stars and up, officers shoot at an on-foot suspect.

import { makeCar, updateCarPhysics, damageCar } from './vehicles.js';
import { clamp, angleDelta, dist } from './util.js';
import { V_ROADS, H_ROADS } from './city.js';
import { addTracer, spawnSparks } from './effects.js';
import { sfx } from './audio.js';
import { hurtPlayer } from './player.js';

const COPS_BY_STARS = [0, 2, 3, 5, 6, 8];

export function createPolice() {
  return { cars: [], spawnCd: 0, bustMeter: 0 };
}

export function desiredCops(stars) {
  return COPS_BY_STARS[clamp(stars, 0, 5)];
}

function spawnPoint(g) {
  const focus = g.player.car || g.player;
  for (let tries = 0; tries < 12; tries++) {
    const vertical = Math.random() < 0.5;
    let x;
    let y;
    if (vertical) {
      x = V_ROADS[Math.floor(Math.random() * V_ROADS.length)];
      y = focus.y + (Math.random() < 0.5 ? -1 : 1) * (620 + Math.random() * 260);
    } else {
      y = H_ROADS[Math.floor(Math.random() * H_ROADS.length)];
      x = focus.x + (Math.random() < 0.5 ? -1 : 1) * (620 + Math.random() * 260);
    }
    x = clamp(x, 60, 3180);
    y = clamp(y, 60, g.city.h - 60);
    if (dist(x, y, focus.x, focus.y) > 560) return { x, y };
  }
  return { x: clamp(focus.x + 700, 60, 3180), y: clamp(focus.y, 60, g.city.h - 60) };
}

function spawnCop(g) {
  const p = spawnPoint(g);
  const focus = g.player.car || g.player;
  const cop = makeCar('police', p.x, p.y, Math.atan2(focus.y - p.y, focus.x - p.x), '#20242a');
  cop.driver = 'police';
  cop.shootCd = 1 + Math.random();
  g.police.cars.push(cop);
  g.allCars.push(cop);
}

// Is a point inside any solid (building/container), inflated a little?
function blockedAt(city, x, y, pad) {
  for (const s of city.solids) {
    if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return true;
  }
  return false;
}

export function updatePolice(g, dt) {
  const police = g.police;
  const stars = g.wanted.stars;
  const focus = g.player.car || g.player;
  const live = police.cars.filter((c) => !c.dead);

  // Reinforcements roll in while the wanted level demands them.
  police.spawnCd -= dt;
  if (live.length < desiredCops(stars) && police.spawnCd <= 0) {
    spawnCop(g);
    police.spawnCd = 1.6;
  }
  // When the heat is off, distant units give up and leave the world.
  if (stars === 0) {
    for (let i = police.cars.length - 1; i >= 0; i--) {
      const cop = police.cars[i];
      if (dist(cop.x, cop.y, focus.x, focus.y) > 800) {
        police.cars.splice(i, 1);
        g.allCars.splice(g.allCars.indexOf(cop), 1);
      }
    }
  }

  for (const cop of police.cars) {
    if (cop.dead) continue;
    // Intercept: aim where the player will be, not where they are.
    const lead = clamp(dist(cop.x, cop.y, focus.x, focus.y) / 500, 0, 0.55);
    const tx = focus.x + (focus.vx || 0) * lead + Math.cos(focus.angle || 0) * (focus.speed || 0) * lead * 0.4;
    const ty = focus.y + (focus.vy || 0) * lead + Math.sin(focus.angle || 0) * (focus.speed || 0) * lead * 0.4;
    let want = Math.atan2(ty - cop.y, tx - cop.x);
    // Whisker steering: if the way ahead is a building, swing around it.
    const aheadX = cop.x + Math.cos(want) * 84;
    const aheadY = cop.y + Math.sin(want) * 84;
    if (blockedAt(g.city, aheadX, aheadY, 16)) {
      const left = want + 1.0;
      const right = want - 1.0;
      const leftBlocked = blockedAt(g.city, cop.x + Math.cos(left) * 84, cop.y + Math.sin(left) * 84, 16);
      want = leftBlocked ? right : left;
    }
    const steer = clamp(angleDelta(cop.angle, want) * 2.6, -1, 1);
    const d = dist(cop.x, cop.y, focus.x, focus.y);
    let throttle = 1;
    if (!g.player.car) {
      // On foot: close in, then hold arrest distance.
      if (d < 40) throttle = cop.speed > 8 ? -1 : 0;
      else if (d < 90) throttle = 0.45;
    } else if (d < 70) {
      throttle = 0.55; // sit on the player's bumper
    }
    const impact = updateCarPhysics(cop, throttle, steer, dt, g.city);
    if (impact > 190) sfx.crash(0.5);

    // Officers fire on an on-foot suspect at three stars or more.
    cop.shootCd -= dt;
    if (stars >= 3 && !g.player.car && d < 330 && Math.abs(cop.speed) < 60 && cop.shootCd <= 0) {
      cop.shootCd = 1.25 + Math.random() * 0.5;
      const spread = (Math.random() - 0.5) * 26;
      const hx = g.player.x + (Math.random() - 0.5) * spread;
      const hy = g.player.y + (Math.random() - 0.5) * spread;
      addTracer(g.effects, cop.x + Math.cos(cop.angle) * 26, cop.y + Math.sin(cop.angle) * 26, hx, hy, '255, 120, 90');
      sfx.shot();
      if (Math.random() < 0.62 - d / 900) {
        hurtPlayer(g, 4 + Math.random() * 4);
        spawnSparks(g.effects, g.player.x, g.player.y, 3);
      }
    }
  }

  // The bust meter: stand (or crawl) next to an officer and it fills.
  let nearest = Infinity;
  for (const cop of live) nearest = Math.min(nearest, dist(cop.x, cop.y, focus.x, focus.y));
  const focusSpeed = Math.abs(focus.speed || 0);
  const arrestRange = g.player.car ? 82 : 56;
  if (nearest < arrestRange && focusSpeed < 52 && stars > 0) {
    police.bustMeter = Math.min(1, police.bustMeter + dt / (g.player.car ? 2.6 : 1.7));
  } else {
    police.bustMeter = Math.max(0, police.bustMeter - dt / 1.4);
  }
}

export function nearestCopNorm(g) {
  const focus = g.player.car || g.player;
  let nearest = Infinity;
  for (const cop of g.police.cars) {
    if (!cop.dead) nearest = Math.min(nearest, dist(cop.x, cop.y, focus.x, focus.y));
  }
  if (nearest === Infinity) return 0;
  return clamp(1 - nearest / 640, 0, 1);
}

// A wrecked interceptor stays as a burning husk; clear the list on respawn.
export function clearPolice(g) {
  for (const cop of g.police.cars) {
    const i = g.allCars.indexOf(cop);
    if (i >= 0) g.allCars.splice(i, 1);
  }
  g.police.cars = [];
  g.police.bustMeter = 0;
}

export { damageCar };
