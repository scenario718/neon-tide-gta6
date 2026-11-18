// vehicles.js — everything about cars in Neon Tide: the model catalogue,
// the arcade driving physics, collision with the city, parked cars waiting
// to be borrowed, and how a car is drawn (body, glass, wheels, damage).

import { clamp, angleDelta, circleRectResolve, dist } from './util.js';
import { shade } from './city.js';

// Top speed in px/s, accel in px/s^2. Sizes are the drawn footprint.
export const CAR_TYPES = {
  sedan: { name: 'Marina Sedan', topSpeed: 340, accel: 260, grip: 3.4, hp: 100, w: 48, h: 24, colors: ['#b0483e', '#3e6fb0', '#c0c4c8', '#3a3f44', '#7a9e43', '#d8d3c3'] },
  taxi: { name: 'Alba Cab', topSpeed: 330, accel: 250, grip: 3.4, hp: 100, w: 48, h: 24, colors: ['#f2b21a'] },
  hatch: { name: 'Pico Hatch', topSpeed: 300, accel: 280, grip: 3.8, hp: 80, w: 42, h: 22, colors: ['#e2713a', '#4fa3a5', '#d84f78', '#e8e3d3'] },
  sports: { name: 'Vireo GT', topSpeed: 470, accel: 380, grip: 3.0, hp: 90, w: 50, h: 24, colors: ['#d8232a', '#23272e', '#f2f0e6', '#1a56a8'] },
  convertible: { name: 'Solstice Roadster', topSpeed: 430, accel: 350, grip: 3.1, hp: 85, w: 50, h: 24, colors: ['#ffd21f'], openTop: true },
  van: { name: 'Cargo Van', topSpeed: 290, accel: 210, grip: 2.8, hp: 140, w: 54, h: 26, colors: ['#e8e8e6', '#8a97a5', '#5b7a99'] },
  pickup: { name: 'Dune Pickup', topSpeed: 320, accel: 240, grip: 3.0, hp: 120, w: 52, h: 25, colors: ['#96762f', '#546e7a', '#a33b2e'] },
  police: { name: 'Interceptor', topSpeed: 430, accel: 340, grip: 3.3, hp: 160, w: 50, h: 25, colors: ['#20242a'] },
};

let nextCarId = 1;

export function makeCar(type, x, y, angle, color) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type,
    spec,
    x, y, angle,
    speed: 0,
    steerVis: 0, // front-wheel angle, for drawing
    w: spec.w,
    h: spec.h,
    radius: spec.w * 0.46,
    color: color || spec.colors[0],
    hp: spec.hp,
    maxHp: spec.hp,
    dead: false,
    driver: 'none', // 'none' (parked) | 'traffic' | 'police' | 'player'
    honkCd: 0,
    smokeAcc: 0,
    skidAcc: 0,
    flashT: 0, // police light-bar phase
  };
}

// Arcade car physics: throttle -1..1 (negative = brake/reverse), steer -1..1.
// Returns the impact speed if the car slammed a building this step, else 0.
export function updateCarPhysics(car, throttle, steer, dt, city) {
  if (car.dead) {
    car.speed = 0;
    return 0;
  }
  const spec = car.spec;
  const reversing = throttle < 0 && car.speed < 10;
  if (throttle > 0) {
    car.speed += spec.accel * throttle * dt * (1 - Math.max(0, car.speed) / (spec.topSpeed * 1.15));
  } else if (throttle < 0) {
    if (car.speed > 20) car.speed -= 520 * dt; // brakes
    else car.speed = Math.max(-spec.topSpeed * 0.38, car.speed - spec.accel * 0.7 * dt);
  }
  // Rolling drag and tyre friction.
  car.speed -= car.speed * 0.55 * dt;
  if (throttle === 0 && Math.abs(car.speed) < 4) car.speed = 0;

  const speedRatio = clamp(car.speed / spec.topSpeed, -1, 1);
  const steerAuthority = clamp(Math.abs(car.speed) / 90, 0, 1) * (Math.abs(car.speed) > 300 ? 0.72 : 1);
  car.angle += steer * spec.grip * steerAuthority * dt * Math.sign(car.speed || 1) * (reversing ? -1 : 1) * (1 - Math.abs(speedRatio) * 0.35);
  car.steerVis += ((steer * 0.5) - car.steerVis) * Math.min(1, dt * 10);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // World bounds and the ocean: cars stop at the water's edge (and the pier).
  car.x = clamp(car.x, 24, city.w - 24);
  car.y = clamp(car.y, 24, city.h - 24);
  if (car.x > 3220 && !(car.y > city.pier.y - 6 && car.y < city.pier.y + city.pier.h + 6)) {
    car.x = 3220;
    if (car.speed > 60) car.speed = 60;
  }

  // Buildings and containers: circle vs rect, bounce out and bleed speed.
  let impact = 0;
  for (const solid of city.solids) {
    if (car.x < solid.x - 40 || car.x > solid.x + solid.w + 40 || car.y < solid.y - 40 || car.y > solid.y + solid.h + 40) continue;
    const hit = circleRectResolve(car.x, car.y, car.radius, solid);
    if (hit) {
      const closing = -(Math.cos(car.angle) * hit.nx + Math.sin(car.angle) * hit.ny) * car.speed;
      car.x = hit.x;
      car.y = hit.y;
      if (closing > 40) {
        impact = Math.max(impact, closing);
        damageCar(car, closing * 0.045);
      }
      car.speed *= closing > 10 ? -0.25 : 0.6;
    }
  }
  return impact;
}

export function damageCar(car, amount) {
  if (car.dead) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    car.speed = 0;
  }
}

// Two cars bump: separate them and trade a little speed and paint.
export function collideCars(a, b) {
  const d = dist(a.x, a.y, b.x, b.y);
  const min = a.radius + b.radius - 4;
  if (d === 0 || d >= min) return 0;
  const nx = (b.x - a.x) / d;
  const ny = (b.y - a.y) / d;
  const overlap = (min - d) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const relSpeed = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
  const trade = (a.speed - b.speed) * 0.35;
  a.speed -= trade;
  b.speed += trade;
  if (relSpeed > 120) {
    damageCar(a, relSpeed * 0.02);
    damageCar(b, relSpeed * 0.02);
  }
  return relSpeed;
}

// Parked cars along the block edges, noses to the kerb roads, ready to steal.
export function placeParkedCars(city, rng) {
  const cars = [];
  const spots = [];
  for (const block of city.blocks) {
    if (block.district === 'docks') continue;
    // Along the block's south edge (facing the road below) and east edge.
    const southCount = rng.int(0, 2);
    for (let i = 0; i < southCount; i++) {
      spots.push({
        x: block.x + 40 + rng.next() * (block.w - 80),
        y: block.y + block.h + 24,
        angle: 0,
      });
    }
    if (rng.chance(0.6)) {
      spots.push({
        x: block.x + block.w + 24,
        y: block.y + 40 + rng.next() * (block.h - 80),
        angle: Math.PI / 2,
      });
    }
  }
  const types = ['sedan', 'hatch', 'taxi', 'van', 'pickup', 'sports'];
  for (const spot of spots) {
    if (spot.x > 3030) continue; // keep the beach clear
    const type = rng.pick(types);
    const spec = CAR_TYPES[type];
    cars.push(makeCar(type, spot.x, spot.y, spot.angle, rng.pick(spec.colors)));
  }
  return cars;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draws a car centred on its position, nose pointing along +angle.
export function drawCar(ctx, car, t) {
  const { w, h } = car;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(20, 24, 30, 0.28)';
  roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, 7);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#14161a';
  const ww = 9;
  const wh = 5;
  const wx = w / 2 - 12;
  const wy = h / 2 - 1;
  for (const [x, y, front] of [[-wx, -wy, false], [-wx, wy, false], [wx, -wy, true], [wx, wy, true]]) {
    ctx.save();
    ctx.translate(x, y);
    if (front) ctx.rotate(car.steerVis);
    ctx.fillRect(-ww / 2, -wh / 2, ww, wh + 2);
    ctx.restore();
  }
  // Body.
  const body = car.dead ? '#3a3a3c' : car.color;
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h / 2, w, h, 7);
  ctx.fill();
  ctx.fillStyle = shade(car.dead ? '#444444' : car.color, 22);
  roundRect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 5);
  ctx.fill();
  if (car.type === 'police') {
    // White doors and a flashing light bar.
    ctx.fillStyle = '#e8ecf0';
    ctx.fillRect(-8, -h / 2 + 2, 17, h - 4);
    const phase = Math.floor(t * 3 + car.id) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#5a1a1a';
    ctx.fillRect(-4, -6, 8, 5);
    ctx.fillStyle = phase ? '#274bdb' : '#3061ff';
    ctx.fillRect(-4, 1, 8, 5);
  } else if (car.spec.openTop) {
    // Open roadster: seats and a folded top instead of a roof.
    ctx.fillStyle = '#5a4632';
    roundRect(ctx, -12, -h / 2 + 4, 20, h - 8, 4);
    ctx.fill();
    ctx.fillStyle = '#2c2f36';
    ctx.fillRect(-4, -h / 2 + 5, 5, 6);
    ctx.fillRect(-4, h / 2 - 11, 5, 6);
  } else if (car.type === 'van' || car.type === 'pickup') {
    ctx.fillStyle = '#22262c';
    roundRect(ctx, w / 2 - 16, -h / 2 + 3, 9, h - 6, 2);
    ctx.fill();
    if (car.type === 'pickup') {
      ctx.fillStyle = shade(car.color, -34);
      ctx.fillRect(-w / 2 + 3, -h / 2 + 3, 16, h - 6);
    }
  } else {
    // Glasshouse: windshield, roof, rear window.
    ctx.fillStyle = '#26313d';
    roundRect(ctx, -w / 2 + 9, -h / 2 + 3, w - 20, h - 6, 4);
    ctx.fill();
    ctx.fillStyle = shade(car.color, 8);
    roundRect(ctx, -9, -h / 2 + 4, 17, h - 8, 3);
    ctx.fill();
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20242a';
    ctx.fillRect(-4, -4, 9, 8);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 6px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0.5, 2);
  }
  // Headlights and tail lights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(w / 2 - 2, -h / 2 + 3, 2, 4);
  ctx.fillRect(w / 2 - 2, h / 2 - 7, 2, 4);
  ctx.fillStyle = '#c22f2f';
  ctx.fillRect(-w / 2, -h / 2 + 3, 2, 4);
  ctx.fillRect(-w / 2, h / 2 - 7, 2, 4);
  // Damage: dents darken the body as hp falls.
  if (!car.dead && car.hp < car.maxHp * 0.55) {
    ctx.fillStyle = 'rgba(30, 28, 26, 0.35)';
    roundRect(ctx, -w / 2 + 4, -h / 2 + 3, 12, h - 6, 3);
    ctx.fill();
  }
  ctx.restore();
}
