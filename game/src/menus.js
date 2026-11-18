// menus.js — the screens around the game: the start screen with the story
// and controls, pause, and the busted / wasted cards. Buttons are laid out
// here and their rectangles are left in g.ui.buttons for main.js to hit-test
// against mouse clicks.

import { mouse } from './input.js';
import { money } from './util.js';

function button(ctx, g, id, x, y, w, h, label, primary) {
  const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  ctx.fillStyle = primary
    ? hover ? '#ffb03a' : '#f08c1e'
    : hover ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = primary ? '#23180a' : '#fff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 6);
  ctx.textAlign = 'left';
  g.ui.buttons.push({ id, x, y, w, h });
  return hover;
}

function sunsetBackdrop(ctx, viewW, viewH) {
  const grad = ctx.createLinearGradient(0, 0, 0, viewH);
  grad.addColorStop(0, 'rgba(24, 16, 48, 0.82)');
  grad.addColorStop(0.55, 'rgba(120, 40, 70, 0.72)');
  grad.addColorStop(1, 'rgba(240, 140, 40, 0.66)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);
  // Sun low over the water.
  ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
  ctx.beginPath();
  ctx.arc(viewW * 0.72, viewH * 0.62, 64, 0, Math.PI * 2);
  ctx.fill();
  // Skyline silhouette.
  ctx.fillStyle = 'rgba(16, 12, 30, 0.85)';
  const base = viewH * 0.86;
  const towers = [0.04, 0.1, 0.16, 0.24, 0.31, 0.4, 0.47, 0.55, 0.63, 0.78, 0.86, 0.93];
  const heights = [70, 120, 90, 150, 105, 180, 95, 130, 80, 110, 75, 95];
  for (let i = 0; i < towers.length; i++) {
    const w = viewW * 0.055;
    ctx.fillRect(viewW * towers[i], base - heights[i] * (viewH / 800), w, heights[i] * (viewH / 800));
  }
  ctx.fillRect(0, base, viewW, viewH - base);
}

export function drawStartScreen(ctx, g, viewW, viewH) {
  sunsetBackdrop(ctx, viewW, viewH);
  g.ui.buttons = [];
  const cx = viewW * 0.30;
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('P O R T O   A L B A', cx - 150, viewH * 0.20);
  ctx.fillStyle = '#fff';
  ctx.font = '900 74px system-ui, sans-serif';
  ctx.fillText('NEON TIDE', cx - 152, viewH * 0.20 + 66);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const story = [
    'Mari Sol delivers packages by day and drives by night.',
    'Fixer Dom Paz has four jobs that will make her a legend —',
    'or a cautionary tale. Steal, run, and never stop for the law.',
  ];
  story.forEach((line, i) => ctx.fillText(line, cx - 150, viewH * 0.20 + 104 + i * 24));

  const bw = 250;
  const bx = cx - 150;
  let by = viewH * 0.20 + 210;
  if (g.hasSaveFile) {
    button(ctx, g, 'continue', bx, by, bw, 46, 'CONTINUE — ' + money(g.save.cash), true);
    by += 58;
    button(ctx, g, 'new', bx, by, bw, 46, 'NEW GAME', false);
  } else {
    button(ctx, g, 'new', bx, by, bw, 46, 'START DRIVING', true);
  }

  // Controls card.
  const cardX = viewW * 0.62;
  const cardY = viewH * 0.20;
  ctx.fillStyle = 'rgba(10, 12, 20, 0.55)';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, 300, 252, 10);
  ctx.fill();
  ctx.fillStyle = '#ffcf3d';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText('CONTROLS', cardX + 20, cardY + 30);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '13.5px system-ui, sans-serif';
  const controls = [
    'WASD / arrows — walk & drive',
    'Shift — sprint        Space — handbrake',
    'E — enter / leave a car',
    'Mouse — aim, click — shoot',
    'R — reload            P / Esc — pause',
    '',
    'Follow the gold marker. Earn cash.',
    'Five stars is a very bad day.',
  ];
  controls.forEach((line, i) => ctx.fillText(line, cardX + 20, cardY + 58 + i * 22));
}

export function drawPause(ctx, g, viewW, viewH) {
  ctx.fillStyle = 'rgba(10, 12, 20, 0.62)';
  ctx.fillRect(0, 0, viewW, viewH);
  g.ui.buttons = [];
  ctx.fillStyle = '#fff';
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', viewW / 2, viewH * 0.34);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Cash ' + money(g.cash) + ' · Jobs done ' + g.save.missionsDone + ' · Lifetime ' + money(g.save.totalEarned), viewW / 2, viewH * 0.34 + 34);
  ctx.textAlign = 'left';
  const bw = 230;
  const bx = viewW / 2 - bw / 2;
  button(ctx, g, 'resume', bx, viewH * 0.46, bw, 46, 'RESUME', true);
  button(ctx, g, 'restart', bx, viewH * 0.46 + 58, bw, 46, 'RESTART DAY', false);
  button(ctx, g, 'quit', bx, viewH * 0.46 + 116, bw, 46, 'QUIT TO TITLE', false);
}

function drawEndCard(ctx, g, viewW, viewH, title, color, lines, buttonLabel) {
  ctx.fillStyle = 'rgba(8, 8, 12, 0.66)';
  ctx.fillRect(0, 0, viewW, viewH);
  g.ui.buttons = [];
  ctx.fillStyle = color;
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, viewW / 2, viewH * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '16px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, viewW / 2, viewH * 0.4 + 40 + i * 24));
  ctx.textAlign = 'left';
  button(ctx, g, 'respawn', viewW / 2 - 110, viewH * 0.4 + 40 + lines.length * 24 + 18, 220, 46, buttonLabel, true);
}

export function drawBusted(ctx, g, viewW, viewH) {
  drawEndCard(ctx, g, viewW, viewH, 'BUSTED', '#4d7cff', [
    'Porto Alba PD got their hands on you.',
    'Fine paid: ' + money(g.lastFine || 0) + ' · The jobs will wait.',
  ], 'BACK ON THE STREET');
}

export function drawWasted(ctx, g, viewW, viewH) {
  drawEndCard(ctx, g, viewW, viewH, 'WASTED', '#ff5040', [
    'You wake up at Porto Alba General.',
    'Medical bill: ' + money(g.lastFine || 0) + ' · Take it slower out there.',
  ], 'LEAVE HOSPITAL');
}
