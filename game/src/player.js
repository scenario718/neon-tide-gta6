// player.js — Mari Sol, the player character. On foot she walks and sprints
// with WASD, aims with the mouse and fires her pistol; E climbs into the
// nearest car (hers, or one she is stealing — which the law notices) and E
// again climbs out. Driving input lives here too, so the car the player
// sits in always answers the same keys.

import { clamp, dist, circleRectResolve } from './util.js';
import { moveAxes, pressed, down, mouse } from './input.js';
import { updateCarPhysics } from './vehicles.js';
import { playerShoot } from './combat.js';
import { reportCrime } from './wanted.js';
import { scarePeds } from './pedestrians.js';
import { inWater } from './city.js';
import { addShake } from './effects.js';
import { sfx } from './audio.js';

const WALK_SPEED = 155;
const SPRINT_SPEED = 238;
export const MAG_SIZE = 12;

export function createPlayer(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    radius: 10,
    hp: 100,
    maxHp: 100,
    car: null,
    ammo: MAG_SIZE,
    reloadT: 0,
    fireCd: 0,
    aimT: 0, // gun stays raised briefly after firing
    lastHurt: -99,
    bob: 0,
    stepT: 0,
  };
}

export function hurtPlayer(g, dmg) {
  const p = g.player;
  if (g.mode !== 'play') return;
  p.hp -= dmg;
  p.lastHurt = g.time;
  g.effects.damageFlash = Math.min(1, g.effects.damageFlash + 0.45);
  addShake(g.effects, 2.5);
}

function nearestCar(g, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of g.allCars) {
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

// Try to place the player beside their car when they climb out.
function exitSpot(g, car) {
  const side = Math.PI / 2;
  for (const dir of [side, -side]) {
    const x = car.x + Math.cos(car.angle + dir) * (car.radius + 14);
    const y = car.y + Math.sin(car.angle + dir) * (car.radius + 14);
    if (inWater(g.city, x, y)) continue;
    let blocked = false;
    for (const s of g.city.solids) {
      if (x > s.x - 10 && x < s.x + s.w + 10 && y > s.y - 10 && y < s.y + s.h + 10) blocked = true;
    }
    if (!blocked) return { x, y };
  }
  return { x: car.x, y: car.y + car.radius + 16 };
}

function enterCar(g, car) {
  const p = g.player;
  if (car.driver === 'traffic') {
    // The driver bails out and runs — a pedestrian appears at the door.
    const i = g.traffic.cars.indexOf(car);
    if (i >= 0) g.traffic.cars.splice(i, 1);
    scarePeds(g, car.x, car.y, 130);
  }
  if (!car.owned && !car.stolen) {
    car.stolen = true;
    reportCrime(g, 'theft', car.x, car.y);
    scarePeds(g, car.x, car.y, 170);
  }
  car.driver = 'player';
  p.car = car;
  sfx.door();
}

function exitCar(g) {
  const p = g.player;
  const car = p.car;
  const spot = exitSpot(g, car);
  p.x = spot.x;
  p.y = spot.y;
  car.driver = 'none';
  car.speed = 0;
  p.car = null;
  sfx.door();
}

export function updatePlayer(g, dt) {
  const p = g.player;
  const city = g.city;

  // Slow health regen once the shooting stops.
  if (p.hp > 0 && p.hp < p.maxHp && g.time - p.lastHurt > 6) {
    p.hp = Math.min(p.maxHp, p.hp + 3.2 * dt);
  }
  p.fireCd -= dt;
  p.aimT -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) p.ammo = MAG_SIZE;
  }

  if (p.car) {
    // Driving: arrows/WASD steer and work the pedals, handbrake on Space.
    const car = p.car;
    let throttle = 0;
    let steer = 0;
    if (down('KeyW', 'ArrowUp')) throttle = 1;
    if (down('KeyS', 'ArrowDown')) throttle = -1;
    if (down('KeyA', 'ArrowLeft')) steer = -1;
    if (down('KeyD', 'ArrowRight')) steer = 1;
    const impact = updateCarPhysics(car, throttle, steer, dt, city);
    if (down('Space')) {
      car.speed -= car.speed * 3.2 * dt;
      if (Math.abs(car.speed) > 120) g.skidHappening = car;
    }
    if (impact > 150) {
      sfx.crash(Math.min(1, impact / 320));
      addShake(g.effects, impact / 60);
      if (impact > 240) hurtPlayer(g, (impact - 240) * 0.03);
      scarePeds(g, car.x, car.y, 200);
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (pressed('KeyE') || pressed('KeyF')) exitCar(g);
    return;
  }

  // On foot.
  const axes = moveAxes();
  const sprint = down('ShiftLeft', 'ShiftRight');
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
  let mx = axes.x;
  let my = axes.y;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    p.angle = Math.atan2(my, mx);
    p.bob += dt * (sprint ? 12 : 9);
    p.stepT -= dt;
    if (p.stepT <= 0) {
      p.stepT = sprint ? 0.28 : 0.36;
      sfx.step();
    }
  }
  p.vx = mx * speed * (len > 0 ? 1 : 0);
  p.vy = my * speed * (len > 0 ? 1 : 0);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, 14, city.w - 14);
  p.y = clamp(p.y, 14, city.h - 14);

  // Buildings, containers and the sea push back.
  for (const s of city.solids) {
    if (p.x < s.x - 14 || p.x > s.x + s.w + 14 || p.y < s.y - 14 || p.y > s.y + s.h + 14) continue;
    const hit = circleRectResolve(p.x, p.y, p.radius, s);
    if (hit) {
      p.x = hit.x;
      p.y = hit.y;
    }
  }
  if (inWater(city, p.x, p.y)) {
    // Wade a step back toward shore.
    p.x -= 60 * dt * 4;
  }
  // Cars are solid to walk into.
  for (const car of g.allCars) {
    const d = dist(p.x, p.y, car.x, car.y);
    const min = car.radius + p.radius - 4;
    if (d > 0.01 && d < min) {
      p.x += ((p.x - car.x) / d) * (min - d);
      p.y += ((p.y - car.y) / d) * (min - d);
    }
  }

  // Aiming and the pistol.
  const cam = g.camera;
  const worldMouseX = cam.x + mouse.x;
  const worldMouseY = cam.y + mouse.y;
  p.aimAngle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);
  if (mouse.down) p.angle = p.aimAngle;
  if (pressed('KeyR') && p.reloadT <= 0 && p.ammo < MAG_SIZE) {
    p.reloadT = 0.9;
    sfx.reload();
  }
  if (mouse.down && p.fireCd <= 0 && p.reloadT <= 0) {
    if (p.ammo > 0) {
      p.ammo--;
      p.fireCd = 0.21;
      p.aimT = 0.6;
      playerShoot(g, p.x + Math.cos(p.aimAngle) * 13, p.y + Math.sin(p.aimAngle) * 13, p.aimAngle);
      if (p.ammo === 0) {
        p.reloadT = 0.9;
        sfx.reload();
      }
    } else {
      p.fireCd = 0.25;
      sfx.dryFire();
    }
  }

  // Climb into the nearest car.
  if (pressed('KeyE') || pressed('KeyF')) {
    const car = nearestCar(g, p.x, p.y, 56);
    if (car && !car.dead) enterCar(g, car);
  }
}

// What the E prompt should offer right now, or null.
export function interactHint(g) {
  const p = g.player;
  if (p.car) return 'E — get out';
  const car = nearestCar(g, p.x, p.y, 56);
  if (car && !car.dead) return car.owned ? 'E — drive' : 'E — steal ' + car.spec.name;
  return null;
}

export function drawPlayer(ctx, p, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  // A soft white ring at her feet, so the player reads at a glance among
  // the crowd — the same ring every game uses to say "this one is you".
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 3, 10.5, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(20,24,30,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 8, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const aiming = p.aimT > 0;
  ctx.rotate(aiming ? p.aimAngle : p.angle);
  const stride = Math.sin(p.bob) * 4;
  // Legs: dark jeans.
  ctx.fillStyle = '#2c3550';
  ctx.fillRect(-3 + stride * 0.4, -5, 6.4, 3.6);
  ctx.fillRect(-3 - stride * 0.4, 1.4, 6.4, 3.6);
  // Torso: teal shirt — Mari's colour, readable at a glance.
  ctx.fillStyle = '#12b5a5';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head with a coral cap.
  ctx.fillStyle = '#d9a06b';
  ctx.beginPath();
  ctx.arc(3.6, 0, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff6b57';
  ctx.beginPath();
  ctx.arc(4.2, 0, 3.4, -0.6, Math.PI + 0.6);
  ctx.fill();
  if (aiming) {
    // Both arms and the pistol, pointed at the mouse.
    ctx.fillStyle = '#d9a06b';
    ctx.fillRect(4, -2.4, 8, 2.2);
    ctx.fillRect(4, 0.6, 8, 2.2);
    ctx.fillStyle = '#1c1e22';
    ctx.fillRect(11, -1.6, 7, 3);
  }
  ctx.restore();
}
