// combat.js — gunfire. The player's pistol throws fast projectiles with a
// tracer look; bullets spark off buildings, dent cars and put pedestrians
// down. Firing is loud: it scares everyone nearby and, if witnessed, the
// police hear about it (wanted.js decides).

import { dist } from './util.js';
import { damageCar } from './vehicles.js';
import { spawnSparks, addTracer } from './effects.js';
import { scarePeds } from './pedestrians.js';
import { reportCrime } from './wanted.js';
import { sfx } from './audio.js';

const BULLET_SPEED = 980;
const BULLET_DAMAGE = 7;

export function createBullets() {
  return [];
}

// The player fires one round from (x, y) along `angle`.
export function playerShoot(g, x, y, angle) {
  const spread = (Math.random() - 0.5) * 0.045;
  const a = angle + spread;
  g.bullets.push({
    x, y,
    px: x, py: y,
    vx: Math.cos(a) * BULLET_SPEED,
    vy: Math.sin(a) * BULLET_SPEED,
    life: 0.85,
  });
  spawnSparks(g.effects, x + Math.cos(a) * 8, y + Math.sin(a) * 8, 2);
  sfx.shot();
  scarePeds(g, x, y, 300);
  reportCrime(g, 'shot', x, y);
}

function hitBuilding(g, x, y) {
  for (const s of g.city.solids) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
  }
  return false;
}

export function updateBullets(g, dt) {
  const bullets = g.bullets;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    if (b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }
    // Two substeps so a fast round cannot tunnel through a car.
    let dead = false;
    for (let step = 0; step < 2 && !dead; step++) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt * 0.5;
      b.y += b.vy * dt * 0.5;
      if (hitBuilding(g, b.x, b.y)) {
        spawnSparks(g.effects, b.x, b.y, 4);
        dead = true;
        break;
      }
      for (const car of g.allCars) {
        if (dist(b.x, b.y, car.x, car.y) < car.radius) {
          const wasDead = car.dead;
          damageCar(car, BULLET_DAMAGE);
          spawnSparks(g.effects, b.x, b.y, 5);
          sfx.hit();
          if (car.driver === 'police' && car.dead && !wasDead) {
            reportCrime(g, 'copDown', car.x, car.y);
          }
          dead = true;
          break;
        }
      }
      if (dead) break;
      for (const ped of g.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 10) {
          ped.state = 'down';
          ped.downT = 0;
          reportCrime(g, 'hurtPed', ped.x, ped.y);
          scarePeds(g, ped.x, ped.y, 260);
          sfx.hit();
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      addTracer(g.effects, b.px, b.py, b.x, b.y);
      bullets.splice(i, 1);
    }
  }
}

export function drawBullets(ctx, g) {
  ctx.strokeStyle = 'rgba(255, 226, 140, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of g.bullets) {
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}
