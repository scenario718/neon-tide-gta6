// render.js — draws Porto Alba and everything in it, and owns the camera.
// The camera follows the player with a little look-ahead at speed, so the
// road ahead is visible when driving fast. The world is drawn in layers:
// ground and water, roads, buildings and props, skid marks, people, cars,
// then effects. Sunny, flat, pastel — a postcard of a city with a dark side.

import { clamp, damp } from './util.js';
import { WATER_X, SAND_X, V_ROADS, H_ROADS, ROAD_W, shade } from './city.js';
import { drawCar } from './vehicles.js';
import { drawPedestrian } from './pedestrians.js';
import { drawPlayer } from './player.js';
import { drawBullets } from './combat.js';
import { drawSkids, drawParticles, drawTracers, drawTexts } from './effects.js';
import { currentObjective } from './missions.js';

const GROUND_COLORS = {
  downtown: '#c3c7c9',
  midtown: '#cfc9b8',
  suburbs: '#a9c79b',
  beach: '#ecd9a8',
  docks: '#b3a48f',
};

export function createCamera() {
  return { x: 0, y: 0 };
}

export function updateCamera(g, dt, viewW, viewH) {
  const cam = g.camera;
  const focus = g.player.car || g.player;
  const speed = g.player.car ? Math.abs(g.player.car.speed) : 0;
  const look = clamp(speed * 0.38, 0, 190);
  const tx = focus.x + Math.cos(focus.angle || 0) * look - viewW / 2;
  const ty = focus.y + Math.sin(focus.angle || 0) * look - viewH / 2;
  const rate = g.player.car ? 5.2 : 7.5;
  cam.x += (tx - cam.x) * damp(rate, dt);
  cam.y += (ty - cam.y) * damp(rate, dt);
  cam.x = clamp(cam.x, 0, Math.max(0, g.city.w - viewW));
  cam.y = clamp(cam.y, 0, Math.max(0, g.city.h - viewH));
}

// Snap the camera straight onto the player (scene setups, respawns).
export function snapCamera(g, viewW, viewH) {
  const focus = g.player.car || g.player;
  g.camera.x = clamp(focus.x - viewW / 2, 0, Math.max(0, g.city.w - viewW));
  g.camera.y = clamp(focus.y - viewH / 2, 0, Math.max(0, g.city.h - viewH));
}

function drawGround(ctx, city, t, vx, vy, vw, vh) {
  // Base: asphalt under everything (the roads show where blocks do not).
  ctx.fillStyle = '#565b60';
  ctx.fillRect(vx, vy, vw, vh);
  // Ocean and beach down the east edge.
  if (vx + vw > SAND_X) {
    ctx.fillStyle = '#ecd9a8';
    ctx.fillRect(SAND_X, vy, WATER_X - SAND_X, vh);
    const grad = ctx.createLinearGradient(WATER_X, 0, city.w, 0);
    grad.addColorStop(0, '#3ec6c6');
    grad.addColorStop(0.25, '#25a8c4');
    grad.addColorStop(1, '#15779e');
    ctx.fillStyle = grad;
    ctx.fillRect(WATER_X, vy, city.w - WATER_X, vh);
    // Animated wavelets.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = Math.floor(vy / 64) * 64; y < vy + vh; y += 64) {
      for (let x = WATER_X + 30; x < city.w - 20; x += 110) {
        const wob = Math.sin(t * 1.4 + (x + y) * 0.05) * 6;
        ctx.moveTo(x + wob, y);
        ctx.quadraticCurveTo(x + 14 + wob, y - 5, x + 28 + wob, y);
      }
    }
    ctx.stroke();
    // Foam at the shoreline.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let y = Math.floor(vy / 90) * 90; y < vy + vh; y += 90) {
      const wob = Math.sin(t * 1.1 + y * 0.07) * 5;
      ctx.fillRect(WATER_X - 3 + wob, y, 7, 42);
    }
  }
  // Blocks: sidewalk rim, then the district ground inside.
  for (const b of city.blocks) {
    if (b.x > vx + vw || b.x + b.w < vx || b.y > vy + vh || b.y + b.h < vy) continue;
    ctx.fillStyle = '#ddd9cd';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = GROUND_COLORS[b.district] || '#cfc9b8';
    ctx.fillRect(b.x + 15, b.y + 15, b.w - 30, b.h - 30);
  }
  // District names painted large on the ground.
  ctx.fillStyle = 'rgba(60, 64, 70, 0.14)';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DOWNTOWN', 1660, 940);
  ctx.fillText('THE DOCKS', 1500, 2500);
  ctx.fillText('SUBURBS', 500, 1560);
  ctx.save();
  ctx.translate(3140, 1300);
  ctx.rotate(Math.PI / 2);
  ctx.fillText('MARINA BEACH', 0, 0);
  ctx.restore();
}

function drawRoads(ctx, city, vx, vy, vw, vh) {
  // Lane dashes.
  ctx.strokeStyle = 'rgba(245, 240, 210, 0.75)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (const x of V_ROADS) {
    if (x < vx - 10 || x > vx + vw + 10) continue;
    ctx.moveTo(x, Math.max(0, vy));
    ctx.lineTo(x, Math.min(city.h, vy + vh));
  }
  for (const y of H_ROADS) {
    if (y < vy - 10 || y > vy + vh + 10) continue;
    ctx.moveTo(Math.max(0, vx), y);
    ctx.lineTo(Math.min(SAND_X + 60, vx + vw), y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(240, 240, 240, 0.55)';
  for (const x of V_ROADS) {
    for (const y of H_ROADS) {
      if (x < vx - 80 || x > vx + vw + 80 || y < vy - 80 || y > vy + vh + 80) continue;
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(x + i * 17 - 5, y - ROAD_W / 2 - 14, 10, 10);
        ctx.fillRect(x + i * 17 - 5, y + ROAD_W / 2 + 4, 10, 10);
        ctx.fillRect(x - ROAD_W / 2 - 14, y + i * 17 - 5, 10, 10);
        ctx.fillRect(x + ROAD_W / 2 + 4, y + i * 17 - 5, 10, 10);
      }
    }
  }
}

function drawBuilding(ctx, b, t) {
  const lift = b.floors >= 8 ? 9 : b.floors >= 3 ? 5 : 3;
  // Shadow, cast to the south-east.
  ctx.fillStyle = 'rgba(25, 30, 38, 0.22)';
  ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
  // South face with a strip of windows — the building's "height".
  ctx.fillStyle = shade(b.wall, -18);
  ctx.fillRect(b.x, b.y + b.h - lift, b.w, lift + 4);
  ctx.fillStyle = 'rgba(230, 240, 250, 0.65)';
  const cols = Math.floor(b.w / 17);
  for (let i = 0; i < cols; i++) {
    if ((i * 7 + b.floors) % 3 !== 0) ctx.fillRect(b.x + 6 + i * 17, b.y + b.h - lift + 2, 8, 2.4);
  }
  // Roof: a parapet edge and a lighter inner panel, toned per building so
  // neighbouring towers do not read as one slab.
  const toneShift = ((Math.floor(b.x) * 7 + Math.floor(b.y) * 13) % 3 - 1) * 9;
  ctx.fillStyle = shade(b.roof, toneShift);
  ctx.fillRect(b.x, b.y, b.w, b.h - lift);
  ctx.fillStyle = shade(b.roof, toneShift + 17);
  ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - lift - 12);
  ctx.strokeStyle = shade(b.wall, -40);
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - lift - 2);
  // Rooftop clutter on taller buildings: AC units and a water tank.
  if (b.floors >= 3) {
    ctx.fillStyle = 'rgba(90, 96, 104, 0.8)';
    ctx.fillRect(b.x + b.w * 0.18, b.y + b.h * 0.2, 15, 11);
    ctx.fillRect(b.x + b.w * 0.66, b.y + b.h * 0.52, 12, 9);
  }
  if (b.floors >= 10) {
    ctx.fillStyle = 'rgba(70, 76, 84, 0.85)';
    ctx.beginPath();
    ctx.arc(b.x + b.w * 0.78, b.y + b.h * 0.24, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.name) {
    ctx.fillStyle = 'rgba(30, 34, 40, 0.55)';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2);
  }
}

function drawPalm(ctx, palm, t) {
  const sway = Math.sin(t * 0.9 + palm.sway) * 0.06;
  ctx.fillStyle = 'rgba(25, 30, 38, 0.2)';
  ctx.beginPath();
  ctx.ellipse(palm.x + 3, palm.y + 4, 9 * palm.s, 4 * palm.s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e8b57';
  ctx.lineWidth = 3 * palm.s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + sway + palm.sway;
    ctx.moveTo(palm.x, palm.y);
    ctx.quadraticCurveTo(
      palm.x + Math.cos(a) * 11 * palm.s,
      palm.y + Math.sin(a) * 11 * palm.s - 3,
      palm.x + Math.cos(a) * 17 * palm.s,
      palm.y + Math.sin(a) * 17 * palm.s + 3,
    );
  }
  ctx.stroke();
  ctx.fillStyle = '#7a5a34';
  ctx.beginPath();
  ctx.arc(palm.x, palm.y, 3 * palm.s, 0, Math.PI * 2);
  ctx.fill();
}

function drawProps(ctx, city, vx, vy, vw, vh) {
  for (const c of city.containers) {
    if (c.x > vx + vw || c.x + c.w < vx || c.y > vy + vh || c.y + c.h < vy) continue;
    ctx.fillStyle = 'rgba(25,30,38,0.2)';
    ctx.fillRect(c.x + 3, c.y + 4, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let x = c.x + 8; x < c.x + c.w; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, c.y + 2);
      ctx.lineTo(x, c.y + c.h - 2);
      ctx.stroke();
    }
  }
  // The pier: planks over the water, posts, and Dom's boat at the end.
  const p = city.pier;
  ctx.fillStyle = '#9a7648';
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = 'rgba(70, 50, 25, 0.5)';
  ctx.lineWidth = 1.4;
  for (let x = p.x + 12; x < p.x + p.w; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, p.y + 2);
    ctx.lineTo(x, p.y + p.h - 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#6e5326';
  for (let x = p.x + 8; x < p.x + p.w; x += 44) {
    ctx.fillRect(x, p.y - 4, 5, 5);
    ctx.fillRect(x, p.y + p.h - 1, 5, 5);
  }
  // The getaway boat.
  const bx = p.x + p.w - 66;
  const by = p.y + p.h + 16;
  ctx.fillStyle = 'rgba(25,30,38,0.25)';
  ctx.beginPath();
  ctx.ellipse(bx + 24, by + 10, 34, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f0e6';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + 52, by);
  ctx.lineTo(bx + 42, by + 13);
  ctx.lineTo(bx + 8, by + 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c23b2e';
  ctx.fillRect(bx + 18, by - 6, 16, 7);
}

function drawObjectiveMarker(ctx, g, t) {
  const obj = currentObjective(g);
  if (!obj) return;
  const pulse = 1 + Math.sin(t * 4) * 0.12;
  // A pillar of gold light so the target reads from streets away.
  const grad = ctx.createLinearGradient(0, obj.y - 190, 0, obj.y);
  grad.addColorStop(0, 'rgba(255, 205, 60, 0)');
  grad.addColorStop(1, 'rgba(255, 205, 60, 0.4)');
  ctx.fillStyle = grad;
  ctx.fillRect(obj.x - 13, obj.y - 190, 26, 190);
  ctx.strokeStyle = '#ffcf3d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffcf3d';
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawStashes(ctx, g, t) {
  for (const s of g.stashes) {
    if (s.taken) continue;
    const bob = Math.sin(t * 3 + s.x) * 2;
    ctx.fillStyle = 'rgba(25, 30, 38, 0.25)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 5, 9, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f9e5f';
    ctx.fillRect(s.x - 8, s.y - 6 + bob, 16, 10);
    ctx.fillStyle = '#eafff0';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', s.x, s.y + 3 + bob);
  }
}

export function drawWorld(ctx, g, viewW, viewH) {
  const cam = g.camera;
  const t = g.time;
  const shakeX = g.effects.shake ? (Math.random() - 0.5) * g.effects.shake : 0;
  const shakeY = g.effects.shake ? (Math.random() - 0.5) * g.effects.shake : 0;
  const vx = cam.x - shakeX;
  const vy = cam.y - shakeY;

  ctx.save();
  ctx.translate(-vx, -vy);
  drawGround(ctx, g.city, t, vx - 40, vy - 40, viewW + 80, viewH + 80);
  drawRoads(ctx, g.city, vx - 40, vy - 40, viewW + 80, viewH + 80);
  drawSkids(ctx, g.effects);
  drawProps(ctx, g.city, vx - 40, vy - 40, viewW + 80, viewH + 80);
  for (const b of g.city.buildings) {
    if (b.x > vx + viewW + 60 || b.x + b.w < vx - 60 || b.y > vy + viewH + 60 || b.y + b.h < vy - 60) continue;
    drawBuilding(ctx, b, t);
  }
  for (const palm of g.city.palms) {
    if (palm.x < vx - 40 || palm.x > vx + viewW + 40 || palm.y < vy - 40 || palm.y > vy + viewH + 40) continue;
    drawPalm(ctx, palm, t);
  }
  for (const lamp of g.city.lamps) {
    if (lamp.x < vx || lamp.x > vx + viewW || lamp.y < vy || lamp.y > vy + viewH) continue;
    ctx.fillStyle = '#8b9299';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  drawStashes(ctx, g, t);
  drawObjectiveMarker(ctx, g, t);
  for (const ped of g.peds) drawPedestrian(ctx, ped);
  // Cars: parked and traffic first, police and the player's ride on top.
  const sorted = [...g.allCars].sort((a, b) => a.y - b.y);
  for (const car of sorted) drawCar(ctx, car, t);
  if (!g.player.car) drawPlayer(ctx, g.player, t);
  drawBullets(ctx, g);
  drawParticles(ctx, g.effects);
  drawTracers(ctx, g.effects);
  drawTexts(ctx, g.effects);
  ctx.restore();

  // Warm sunlight wash + gentle vignette (screen space).
  const sun = ctx.createLinearGradient(0, 0, viewW, viewH);
  sun.addColorStop(0, 'rgba(255, 190, 90, 0.07)');
  sun.addColorStop(1, 'rgba(40, 90, 160, 0.05)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, viewW, viewH);
  if (g.effects.damageFlash > 0) {
    ctx.fillStyle = `rgba(200, 30, 30, ${g.effects.damageFlash * 0.28})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
}
