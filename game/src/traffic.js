// traffic.js — the everyday drivers of Porto Alba. Each traffic car follows
// a loop around a city block (out on the avenues, around the block, back),
// slowing for the car ahead and for the player, honking when blocked. Cars
// too far from the player quietly rejoin a loop nearer by, so the streets
// around the player always feel lived in.

import { makeCar, CAR_TYPES, updateCarPhysics } from './vehicles.js';
import { clamp, angleDelta, dist } from './util.js';
import { sfx } from './audio.js';

const TRAFFIC_TYPES = ['sedan', 'taxi', 'hatch', 'van', 'pickup'];
const CRUISE_SPEED = 215;

// Build the driving loops: one around most blocks, offset onto the road.
export function buildLoops(city) {
  const loops = [];
  for (const block of city.blocks) {
    if (block.w < 150 || block.h < 150) continue;
    const o = 26; // lane offset from the block edge, onto the road
    const corners = [
      { x: block.x - o, y: block.y - o },
      { x: block.x + block.w + o, y: block.y - o },
      { x: block.x + block.w + o, y: block.y + block.h + o },
      { x: block.x - o, y: block.y + block.h + o },
    ];
    // Half the loops run the other way, like the far-side lanes.
    if ((block.col + block.row) % 2 === 0) corners.reverse();
    loops.push(corners);
  }
  return loops;
}

export function createTraffic(city, rng) {
  const loops = buildLoops(city);
  const cars = [];
  for (let i = 0; i < 16; i++) {
    const loop = loops[Math.floor(rng.next() * loops.length)];
    const seg = Math.floor(rng.next() * 4);
    const a = loop[seg];
    const b = loop[(seg + 1) % 4];
    const t = rng.next();
    const type = TRAFFIC_TYPES[Math.floor(rng.next() * TRAFFIC_TYPES.length)];
    const car = makeCar(type, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, Math.atan2(b.y - a.y, b.x - a.x), rng.pick(CAR_TYPES[type].colors));
    car.driver = 'traffic';
    car.loop = loop;
    car.wp = (seg + 1) % 4;
    car.cruise = CRUISE_SPEED * rng.range(0.8, 1.05);
    cars.push(car);
  }
  return { cars, loops };
}

// The car (any car) directly ahead of `car` within `gap` px, if any.
function carAhead(car, allCars, gap) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  let bestD = gap;
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * fx + dy * fy;
    if (forward < 6 || forward > bestD) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 20) {
      best = other;
      bestD = forward;
    }
  }
  return best;
}

export function updateTraffic(g, dt) {
  const { traffic, city, player } = g;
  const focus = player.car || player;
  for (const car of traffic.cars) {
    if (car.dead) continue;
    const dPlayer = dist(car.x, car.y, focus.x, focus.y);
    // Recycle far-away cars onto a loop near the player (off-screen only).
    if (dPlayer > 1150) {
      const near = traffic.loops.filter((l) => dist(l[0].x, l[0].y, focus.x, focus.y) < 800);
      if (near.length && dPlayer > 700) {
        const loop = near[Math.floor(Math.random() * near.length)];
        car.loop = loop;
        car.wp = 0;
        car.x = loop[0].x;
        car.y = loop[0].y;
        car.speed = 0;
      }
      continue;
    }
    const target = car.loop[car.wp];
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const dTarget = Math.sqrt(dx * dx + dy * dy);
    if (dTarget < 34) car.wp = (car.wp + 1) % 4;
    const wantAngle = Math.atan2(dy, dx);
    const steer = clamp(angleDelta(car.angle, wantAngle) * 2.4, -1, 1);

    let throttle = car.speed < car.cruise ? 0.75 : 0;
    const ahead = carAhead(car, g.allCars, 74);
    if (ahead) {
      const gapNow = dist(car.x, car.y, ahead.x, ahead.y);
      if (gapNow < 56) throttle = car.speed > 30 ? -1 : 0;
      else throttle = Math.min(throttle, 0.25);
      if (gapNow < 58 && car.speed < 12 && ahead.driver === 'player') {
        car.honkCd -= dt;
        if (car.honkCd <= 0) {
          car.honkCd = 2.4;
          if (dPlayer < 500) sfx.honk();
        }
      }
    }
    // Nervous drivers brake when the player flies past close by.
    if (player.car && Math.abs(player.car.speed) > 330 && dPlayer < 90) throttle = -0.6;

    updateCarPhysics(car, throttle, steer, dt, city);
  }
}
