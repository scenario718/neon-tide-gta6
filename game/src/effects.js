// effects.js — the juice: smoke, sparks, splashes and fire particles, skid
// marks that fade off the asphalt, floating cash text, bullet tracers, and
// the camera shake / damage flash state the renderer reads.

export function createEffects() {
  return {
    particles: [],
    skids: [], // {x1,y1,x2,y2,life}
    texts: [], // {x,y,vy,life,text,color}
    tracers: [], // {x1,y1,x2,y2,life,color}
    shake: 0,
    damageFlash: 0,
  };
}

function addParticle(fx, p) {
  if (fx.particles.length > 420) fx.particles.shift();
  fx.particles.push(p);
}

export function spawnSmoke(fx, x, y, n = 1, dark = false) {
  for (let i = 0; i < n; i++) {
    addParticle(fx, {
      kind: 'smoke',
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 14,
      vy: -18 - Math.random() * 22,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.9,
      size: 5 + Math.random() * 7,
      color: dark ? '40, 38, 36' : '210, 210, 208',
    });
  }
}

export function spawnFire(fx, x, y, n = 2) {
  for (let i = 0; i < n; i++) {
    addParticle(fx, {
      kind: 'fire',
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 14,
      vx: (Math.random() - 0.5) * 10,
      vy: -26 - Math.random() * 26,
      life: 0,
      maxLife: 0.4 + Math.random() * 0.4,
      size: 6 + Math.random() * 8,
      color: Math.random() < 0.5 ? '255, 140, 30' : '255, 200, 60',
    });
  }
}

export function spawnSparks(fx, x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 170;
    addParticle(fx, {
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      maxLife: 0.18 + Math.random() * 0.22,
      size: 1.6,
      color: '255, 214, 110',
    });
  }
}

export function spawnSplash(fx, x, y, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 90;
    addParticle(fx, {
      kind: 'splash',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      maxLife: 0.3 + Math.random() * 0.3,
      size: 2.2,
      color: '150, 220, 240',
    });
  }
}

export function addSkid(fx, x1, y1, x2, y2) {
  fx.skids.push({ x1, y1, x2, y2, life: 1 });
  if (fx.skids.length > 700) fx.skids.splice(0, fx.skids.length - 700);
}

export function floatText(fx, x, y, text, color = '#7be495') {
  fx.texts.push({ x, y, vy: -34, life: 1.4, text, color });
}

export function addTracer(fx, x1, y1, x2, y2, color = '255, 230, 150') {
  fx.tracers.push({ x1, y1, x2, y2, life: 0.07, color });
}

export function addShake(fx, amount) {
  fx.shake = Math.min(14, fx.shake + amount);
}

export function updateEffects(fx, dt) {
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      fx.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'spark' || p.kind === 'splash') {
      p.vx *= 1 - 3 * dt;
      p.vy *= 1 - 3 * dt;
    }
  }
  for (let i = fx.skids.length - 1; i >= 0; i--) {
    fx.skids[i].life -= dt * 0.03;
    if (fx.skids[i].life <= 0) fx.skids.splice(i, 1);
  }
  for (let i = fx.texts.length - 1; i >= 0; i--) {
    const t = fx.texts[i];
    t.life -= dt;
    t.y += t.vy * dt;
    if (t.life <= 0) fx.texts.splice(i, 1);
  }
  for (let i = fx.tracers.length - 1; i >= 0; i--) {
    fx.tracers[i].life -= dt;
    if (fx.tracers[i].life <= 0) fx.tracers.splice(i, 1);
  }
  fx.shake = Math.max(0, fx.shake - dt * 26);
  fx.damageFlash = Math.max(0, fx.damageFlash - dt * 1.8);
}

// World-space drawing: skid marks under everything, particles and floating
// text above. Tracers are drawn by the renderer between the two passes.
export function drawSkids(ctx, fx) {
  ctx.lineCap = 'round';
  for (const s of fx.skids) {
    ctx.strokeStyle = `rgba(24, 24, 28, ${0.34 * s.life})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

export function drawParticles(ctx, fx) {
  for (const p of fx.particles) {
    const t = p.life / p.maxLife;
    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(${p.color}, ${0.4 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + t * 1.3), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'fire') {
      ctx.fillStyle = `rgba(${p.color}, ${0.85 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(${p.color}, ${1 - t})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawTracers(ctx, fx) {
  for (const t of fx.tracers) {
    ctx.strokeStyle = `rgba(${t.color}, 0.85)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
}

export function drawTexts(ctx, fx) {
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const t of fx.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
