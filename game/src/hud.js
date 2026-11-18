// hud.js — everything drawn over the world: health and cash, the wanted
// stars, the objective line with its distance and timer, story banners, the
// "press E" prompt, the bust meter, a speedometer, and the minimap — a
// little Porto Alba with roads, water, police, the player and the gold
// objective marker.

import { clamp, dist, money, clockText } from './util.js';
import { WATER_X, SAND_X, V_ROADS, H_ROADS } from './city.js';
import { currentObjective } from './missions.js';
import { interactHint } from './player.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(12, 16, 22, 0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
}

function drawStar(ctx, cx, cy, r, filled, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffcf3d' : 'rgba(255, 255, 255, 0.25)';
  ctx.fill();
  ctx.restore();
}

function drawMinimap(ctx, g, x, y, w, h) {
  const city = g.city;
  const sx = w / city.w;
  const sy = h / city.h;
  panel(ctx, x - 6, y - 6, w + 12, h + 12);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.clip();
  ctx.fillStyle = '#7d8a72';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e6d3a3';
  ctx.fillRect(x + SAND_X * sx, y, (WATER_X - SAND_X) * sx, h);
  ctx.fillStyle = '#1d7fa8';
  ctx.fillRect(x + WATER_X * sx, y, (city.w - WATER_X) * sx, h);
  // Roads.
  ctx.strokeStyle = 'rgba(40, 42, 48, 0.85)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const rx of V_ROADS) {
    ctx.moveTo(x + rx * sx, y);
    ctx.lineTo(x + rx * sx, y + h);
  }
  for (const ry of H_ROADS) {
    ctx.moveTo(x, y + ry * sy);
    ctx.lineTo(x + Math.min(city.w, SAND_X + 60) * sx, y + ry * sy);
  }
  ctx.stroke();
  // The pier.
  ctx.strokeStyle = '#9a7648';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + city.pier.x * sx, y + (city.pier.y + city.pier.h / 2) * sy);
  ctx.lineTo(x + (city.pier.x + city.pier.w) * sx, y + (city.pier.y + city.pier.h / 2) * sy);
  ctx.stroke();
  // Cash stashes.
  ctx.fillStyle = '#39d353';
  for (const s of g.stashes) {
    if (!s.taken) ctx.fillRect(x + s.x * sx - 1.4, y + s.y * sy - 1.4, 2.8, 2.8);
  }
  // Police, flashing.
  const phase = Math.floor(g.time * 3) % 2 === 0;
  for (const cop of g.police.cars) {
    if (cop.dead) continue;
    ctx.fillStyle = phase ? '#ff5040' : '#4d7cff';
    ctx.beginPath();
    ctx.arc(x + cop.x * sx, y + cop.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Objective.
  const obj = currentObjective(g);
  if (obj) {
    const pulse = 3.6 + Math.sin(g.time * 4) * 1.1;
    ctx.fillStyle = '#ffcf3d';
    ctx.beginPath();
    ctx.arc(x + clamp(obj.x, 0, city.w) * sx, y + clamp(obj.y, 0, city.h) * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Player arrow.
  const p = g.player;
  const px = x + p.x * sx;
  const py = y + p.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -3.6);
  ctx.lineTo(-4.4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PORTO ALBA', x + 2, y + h + 16);
}

export function drawHUD(ctx, g, viewW, viewH) {
  const p = g.player;
  const t = g.time;
  ctx.textAlign = 'left';

  // --- top-left: health, cash, ammo ---
  panel(ctx, 14, 14, 208, p.car ? 64 : 88);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('MARI SOL', 26, 34);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(26, 42, 150, 10);
  const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = hpFrac > 0.45 ? '#57d977' : hpFrac > 0.22 ? '#ffb03a' : '#ff5040';
  ctx.fillRect(26, 42, 150 * hpFrac, 10);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(money(g.cash), 26, 74);
  if (!p.car) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px system-ui, sans-serif';
    const ammoText = p.reloadT > 0 ? 'PISTOL — RELOADING…' : 'PISTOL  ' + p.ammo + ' / 12';
    ctx.fillText(ammoText, 120, 74);
    ctx.fillText('R — reload', 26, 92 - 0); // sits inside the taller panel
  }

  // --- top-right: wanted stars + district ---
  const stars = g.wanted.stars;
  const decaying = stars > 0 && !g.wanted.seenNow && g.wanted.unseenFor > 6;
  const alpha = decaying ? (Math.floor(t * 3) % 2 === 0 ? 0.35 : 1) : 1;
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, viewW - 34 - i * 34, 36, 14, i < stars, alpha);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(g.districtName || '', viewW - 20, 66);
  ctx.textAlign = 'left';

  // --- story banner, top centre ---
  const m = g.missions;
  if (m.bannerT > 0 && m.bannerText) {
    const bw = Math.min(620, viewW - 300);
    const bx = (viewW - bw) / 2;
    const fade = clamp(m.bannerT / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    panel(ctx, bx, 16, bw, m.bannerSub ? 58 : 42);
    ctx.fillStyle = '#fff';
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.bannerText, viewW / 2, 40, bw - 30);
    if (m.bannerSub) {
      ctx.fillStyle = '#ffcf3d';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(m.bannerSub.toUpperCase(), viewW / 2, 60, bw - 30);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // --- minimap, bottom-left ---
  drawMinimap(ctx, g, 20, viewH - 170, 196, 142);

  // --- speedometer, bottom-right ---
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.32);
    panel(ctx, viewW - 168, viewH - 84, 154, 70);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(kmh + '', viewW - 52, viewH - 44);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('km/h', viewW - 24, viewH - 44);
    ctx.fillText(p.car.spec.name, viewW - 24, viewH - 26);
    // Car condition.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(viewW - 156, viewH - 34, 60, 5);
    ctx.fillStyle = '#7fc4ff';
    ctx.fillRect(viewW - 156, viewH - 34, 60 * clamp(p.car.hp / p.car.maxHp, 0, 1), 5);
    ctx.textAlign = 'left';
  }

  // --- objective, bottom centre ---
  const obj = currentObjective(g);
  if (obj) {
    const focus = p.car || p;
    const d = Math.max(0, Math.round(dist(focus.x, focus.y, obj.x, obj.y) / 10));
    let line = obj.text + '   ·   ' + d + ' m';
    const active = g.missions.active;
    if (active) {
      const step = active.def.steps[active.step];
      const timerLeft = step.timer ? active.stepTimer : active.def.timer ? active.timerLeft : null;
      if (timerLeft !== null && timerLeft !== undefined) line += '   ·   ' + clockText(timerLeft);
    }
    ctx.font = 'bold 14px system-ui, sans-serif';
    const tw = ctx.measureText(line).width + 44;
    const ox = (viewW - tw) / 2;
    panel(ctx, ox, viewH - 56, tw, 40);
    ctx.fillStyle = '#ffcf3d';
    ctx.beginPath();
    ctx.arc(ox + 20, viewH - 36, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(line, ox + 34, viewH - 30);
    if (active) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(active.def.title.toUpperCase() + ' — ' + active.def.giver.toUpperCase(), ox + 34, viewH - 44 + 0);
    }
  }

  // --- interaction prompt ---
  const hint = g.mode === 'play' ? interactHint(g) : null;
  if (hint) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    const tw = ctx.measureText(hint).width + 30;
    const px = (viewW - tw) / 2;
    panel(ctx, px, viewH - 104, tw, 30);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(hint, viewW / 2, viewH - 84);
    ctx.textAlign = 'left';
  }

  // --- bust meter ---
  if (g.police.bustMeter > 0.02 && g.mode === 'play') {
    const bw = 240;
    const bx = (viewW - bw) / 2;
    const by = viewH * 0.62;
    ctx.fillStyle = 'rgba(12,16,22,0.7)';
    ctx.beginPath();
    ctx.roundRect(bx - 8, by - 24, bw + 16, 52, 9);
    ctx.fill();
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', viewW / 2, by - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(bx, by + 4, bw, 10);
    ctx.fillStyle = '#ff5040';
    ctx.fillRect(bx, by + 4, bw * g.police.bustMeter, 10);
    ctx.textAlign = 'left';
  }
}
