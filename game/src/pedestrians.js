// pedestrians.js — the people of Porto Alba. They stroll the sidewalk loop
// around their block, chat in pairs, and run screaming when something
// dangerous happens near them: a gunshot, a crash, a car mounting the
// pavement. A pedestrian hit by a fast car goes down and stays down.

import { clamp, dist } from './util.js';
import { inWater } from './city.js';

const SHIRTS = ['#e2574c', '#4c8de2', '#57b06a', '#e2b13c', '#9a6ad8', '#e28bb0', '#4fb8b0', '#f0ead8'];
const SKINS = ['#f2c9a0', '#d9a06b', '#a06a3c', '#7a4a28', '#f7d7b5'];
const PANTS = ['#33415c', '#5c4a33', '#3c3c3c', '#715c8a', '#2e5e4e'];

let nextPedId = 1;

export function createPedestrians(city, rng) {
  const peds = [];
  for (let i = 0; i < 30; i++) {
    const loop = city.sidewalkLoops[Math.floor(rng.next() * city.sidewalkLoops.length)];
    const seg = Math.floor(rng.next() * 4);
    const a = loop[seg];
    const b = loop[(seg + 1) % 4];
    const t = rng.next();
    peds.push({
      id: nextPedId++,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      loop,
      wp: (seg + 1) % 4,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      speed: 0,
      walkSpeed: rng.range(38, 62),
      state: 'walk', // 'walk' | 'flee' | 'down'
      panic: 0,
      threatX: 0,
      threatY: 0,
      shirt: SHIRTS[i % SHIRTS.length],
      skin: SKINS[Math.floor(rng.next() * SKINS.length)],
      pants: PANTS[Math.floor(rng.next() * PANTS.length)],
      bob: rng.range(0, Math.PI * 2),
      downT: 0,
    });
  }
  return peds;
}

// Something scary happened at (x, y): nearby pedestrians panic and run.
export function scarePeds(g, x, y, radius) {
  for (const ped of g.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.panic = 5;
      ped.threatX = x;
      ped.threatY = y;
    }
  }
}

export function updatePedestrians(g, dt) {
  const { city, player } = g;
  for (const ped of g.peds) {
    if (ped.state === 'down') {
      ped.downT += dt;
      continue;
    }
    let tx;
    let ty;
    let speed = ped.walkSpeed;
    if (ped.state === 'flee') {
      ped.panic -= dt;
      if (ped.panic <= 0) {
        ped.state = 'walk';
      } else {
        // Run directly away from the threat.
        const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
        tx = ped.x + Math.cos(away) * 120;
        ty = ped.y + Math.sin(away) * 120;
        speed = 168;
      }
    }
    if (ped.state === 'walk') {
      const target = ped.loop[ped.wp];
      tx = target.x;
      ty = target.y;
      if (dist(ped.x, ped.y, tx, ty) < 8) {
        ped.wp = (ped.wp + 1) % 4;
        continue;
      }
    }
    const want = Math.atan2(ty - ped.y, tx - ped.x);
    let delta = want - ped.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    ped.angle += clamp(delta, -6 * dt, 6 * dt);
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    // Pedestrians keep out of buildings and the sea.
    let blocked = inWater(city, nx, ny);
    if (!blocked) {
      for (const s of city.solids) {
        if (nx > s.x - 8 && nx < s.x + s.w + 8 && ny > s.y - 8 && ny < s.y + s.h + 8) {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) {
      ped.x = nx;
      ped.y = ny;
      ped.speed = speed;
      ped.bob += dt * (speed > 100 ? 13 : 8);
    } else {
      ped.speed = 0;
      if (ped.state === 'flee') ped.angle += 2.4 * dt; // spin away from the wall
    }
    // A car bearing down on them is its own scare.
    const focus = player.car;
    if (focus && Math.abs(focus.speed) > 200 && dist(ped.x, ped.y, focus.x, focus.y) < 110) {
      ped.state = 'flee';
      ped.panic = Math.max(ped.panic, 2.5);
      ped.threatX = focus.x;
      ped.threatY = focus.y;
    }
  }
}

export function drawPedestrian(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    // Lying where they fell.
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(20,24,30,0.25)';
    ctx.fillRect(-11, -4, 22, 9);
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-2, -3, 12, 6);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-11, -4, 9, 8);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(-14, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bobY = Math.sin(ped.bob) * 1.4;
  ctx.fillStyle = 'rgba(20,24,30,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 7, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ped.angle);
  // Legs (alternating stride), body, head.
  const stride = Math.sin(ped.bob) * 4;
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-3 + stride * 0.4, -4.6, 6, 3.4);
  ctx.fillRect(-3 - stride * 0.4, 1.2, 6, 3.4);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.ellipse(0, bobY * 0.3, 6.4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(3.4, bobY * 0.3, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (ped.state === 'flee') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', ped.x, ped.y - 14);
  }
}
