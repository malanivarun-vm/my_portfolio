// Road Fighter '84 — portfolio easter egg. Single-file ES module, no dependencies.
// Faithful gameplay per docs/superpowers/specs/2026-06-11-roadfighter-easter-egg-design.md

export const CONFIG = {
  W: 420, H: 640,                  // logical canvas size
  roadLeft: 90, roadRight: 330,
  laneCenters: [120, 180, 240, 300],
  maxSpeed: 400,                   // km/h
  accel: 140,                      // km/h gained per second while accelerating
  coast: 110,                      // km/h lost per second when released
  pxPerKmh: 2.0,                   // scroll px/s per km/h of player speed
  steerAccel: 900,                 // lateral acceleration px/s²
  steerMax: 240,                   // max lateral speed px/s
  steerDamp: 8,                    // lateral damping per second with no input
  carW: 34, carH: 50,              // collision boxes (smaller than sprites)
  truckW: 40, truckH: 104,
  bonusW: 30, bonusH: 44,
  fuelMax: 100,
  fuelDrain: 1.5,                  // per second — ~66s base run (tuned harder)
  fuelBonus: 30,
  spinDriftSpeed: 170,             // px/s lateral skid during spin-out
  spinRecoverHold: 0.22,           // seconds of counter-steer to recover
  crashPause: 1.6,                 // seconds before respawn
  respawnInvuln: 1.5,              // seconds of post-respawn immunity
  overtakeBonus: 50,
  rampKm: 10,                      // distance at which difficulty maxes out (tuned harder)
};

export const SPRITES = {
  player: { x: 238, y: 2,   w: 70, h: 100 },
  yellow: { x: 136, y: 372, w: 76, h: 96 },
  blue:   { x: 192, y: 238, w: 70, h: 104 },
  red:    { x: 283, y: 284, w: 74, h: 104 },
  truck:  { x: 128, y: 2,   w: 84, h: 216 },
  bonus:  { x: 303, y: 144, w: 54, h: 80 },
};

export class PlayerCar {
  constructor() {
    this.x = (CONFIG.roadLeft + CONFIG.roadRight) / 2;
    this.y = CONFIG.H - 110;
    this.vx = 0;
    this.speed = 0;            // km/h
    this.fuel = CONFIG.fuelMax;
    this.state = 'normal';     // 'normal' | 'spin' | 'crashed'
    this.spinDir = 0;
    this.spinTime = 0;
    this.recoverTimer = 0;
    this.crashTimer = 0;
    this.invuln = 0;
    this.w = CONFIG.carW;
    this.h = CONFIG.carH;
  }

  update(dt, input) {
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.state === 'normal') {
      if (input.accel) this.speed = Math.min(CONFIG.maxSpeed, this.speed + CONFIG.accel * dt);
      else this.speed = Math.max(0, this.speed - CONFIG.coast * dt);
      this.steer(dt, input);
    } else if (this.state === 'spin') {
      this.spinTime += dt;
      this.speed = Math.max(60, this.speed - 120 * dt);
      this.x += this.spinDir * CONFIG.spinDriftSpeed * dt;
      const counter = this.spinDir === 1 ? input.left : input.right;
      if (counter) {
        this.recoverTimer += dt;
        if (this.recoverTimer >= CONFIG.spinRecoverHold) { this.state = 'normal'; this.vx = 0; }
      } else {
        this.recoverTimer = 0;
      }
      if (this.x <= CONFIG.roadLeft + this.w / 2 || this.x >= CONFIG.roadRight - this.w / 2) {
        this.explode();
      }
    } else if (this.state === 'crashed') {
      this.speed = 0;
      this.crashTimer -= dt;
      if (this.crashTimer <= 0) this.respawn();
    }
  }

  startSpin(dir) {
    if (this.state !== 'normal' || this.invuln > 0) return;
    this.state = 'spin';
    this.spinDir = dir || 1;
    this.spinTime = 0;
    this.recoverTimer = 0;
    this.vx = 0;
  }

  explode() {
    this.state = 'crashed';
    this.crashTimer = CONFIG.crashPause;
  }

  respawn() {
    this.state = 'normal';
    this.x = (CONFIG.roadLeft + CONFIG.roadRight) / 2;
    this.vx = 0;
    this.speed = 0;
    this.spinTime = 0;
    this.invuln = CONFIG.respawnInvuln;
  }

  steer(dt, input) {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      this.vx = Math.max(-CONFIG.steerMax,
        Math.min(CONFIG.steerMax, this.vx + dir * CONFIG.steerAccel * dt));
    } else {
      this.vx -= this.vx * Math.min(1, CONFIG.steerDamp * dt);
    }
    this.x += this.vx * dt;
    const lo = CONFIG.roadLeft + this.w / 2;
    const hi = CONFIG.roadRight - this.w / 2;
    if (this.x < lo) { this.x = lo; this.vx = 0; }
    if (this.x > hi) { this.x = hi; this.vx = 0; }
  }
}

const VEHICLE_STATS = {
  yellow: { speed: 160, w: CONFIG.carW,   h: CONFIG.carH },
  blue:   { speed: 185, w: CONFIG.carW,   h: CONFIG.carH },
  truck:  { speed: 95,  w: CONFIG.truckW, h: CONFIG.truckH },
  bonus:  { speed: 175, w: CONFIG.bonusW, h: CONFIG.bonusH },
};

export class Traffic {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.cars = [];
    this.spawnTimer = 1.2;
    this.bonusCooldown = 12;
  }

  ramp(distanceKm) { return Math.min(1, distanceKm / CONFIG.rampKm); }

  spawnInterval(ramp) { return 1.1 - 0.85 * ramp; }

  // RNG call order: (1) bonus roll iff bonusCooldown <= 0, (2) type roll, (3) lane roll.
  spawnOne(ramp) {
    let type;
    if (this.bonusCooldown <= 0 && this.rng() < 0.12) {
      type = 'bonus';
      this.bonusCooldown = 18;
    } else {
      const r = this.rng();
      const blueShare = 0.15 + 0.30 * ramp;
      type = r < 0.15 ? 'truck' : r < 0.15 + blueShare ? 'blue' : 'yellow';
    }
    const s = VEHICLE_STATS[type];
    const lane = CONFIG.laneCenters[Math.min(3, Math.floor(this.rng() * 4))];
    return { type, x: lane, y: -s.h, w: s.w, h: s.h, speed: s.speed,
             passed: false, zigTimer: 0.6, targetX: lane };
  }

  update(dt, player, distanceKm, onOvertake) {
    const ramp = this.ramp(distanceKm);
    this.bonusCooldown -= dt;

    // Spawning scales with player speed — no traffic while parked.
    this.spawnTimer -= dt * Math.min(1, player.speed / 200);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval(ramp);
      const v = this.spawnOne(ramp);
      const blocked = this.cars.some(c => c.y < 80 && Math.abs(c.x - v.x) < 55);
      if (!blocked) this.cars.push(v);
    }

    const playerPx = player.speed * CONFIG.pxPerKmh;
    for (const c of this.cars) {
      c.y += (playerPx - c.speed * CONFIG.pxPerKmh) * dt;
      if (c.type === 'blue') {
        c.zigTimer -= dt;
        if (c.zigTimer <= 0) {
          c.zigTimer = 0.8 + this.rng() * 0.8;
          const cutIn = 0.35 + 0.40 * ramp;
          c.targetX = this.rng() < cutIn
            ? player.x
            : CONFIG.laneCenters[Math.min(3, Math.floor(this.rng() * 4))];
        }
        const zigSpeed = 60 + 90 * ramp;
        const d = c.targetX - c.x;
        c.x += Math.sign(d) * Math.min(Math.abs(d), zigSpeed * dt);
        c.x = Math.max(CONFIG.roadLeft + c.w / 2, Math.min(CONFIG.roadRight - c.w / 2, c.x));
      }
      if (!c.passed && c.type !== 'bonus' && c.y > player.y) {
        c.passed = true;
        onOvertake();
      }
    }
    this.cars = this.cars.filter(c => c.y < CONFIG.H + 200 && c.y > -420);
  }
}

export function rectsOverlap(a, b, shrink = 5) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w - shrink * 2 &&
         Math.abs(a.y - b.y) * 2 < a.h + b.h - shrink * 2;
}

export function checkCollision(player, cars) {
  if (player.state === 'crashed' || player.invuln > 0) return null;
  for (const c of cars) if (rectsOverlap(player, c)) return c;
  return null;
}

// Storage access is wrapped: localStorage throws SecurityError in Safari private
// mode / sandboxed iframes / disabled cookies. Failure = no persistence, never a crash.
function safeGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* persistence unavailable */ }
}

export class Game {
  // sfx: optional { spin, crash, pickup, gameover } callbacks — wired to AudioFX in the browser.
  constructor({ sfx = {}, storage } = {}) {
    this.sfx = sfx;
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.state = 'menu'; // 'menu' | 'playing' | 'gameover'
    this.highScore = Number(safeGet(this.storage, 'rf84_highscore') ?? 0) || 0;
    this.reset();
  }

  reset() {
    this.player = new PlayerCar();
    this.traffic = new Traffic();
    this.distanceKm = 0;
    this.overtakes = 0;
    this.scrollPx = 0;
  }

  get score() {
    return Math.floor(this.distanceKm * 100) + this.overtakes * CONFIG.overtakeBonus;
  }

  start() {
    this.reset();
    this.state = 'playing';
  }

  update(dt, input) {
    if (this.state !== 'playing') return;
    const stateBefore = this.player.state;
    this.player.update(dt, input);
    if (stateBefore === 'spin' && this.player.state === 'crashed') this.sfx.crash?.();

    this.distanceKm += this.player.speed * dt / 3600;
    this.scrollPx += this.player.speed * CONFIG.pxPerKmh * dt;
    this.traffic.update(dt, this.player, this.distanceKm, () => { this.overtakes++; });

    const hit = checkCollision(this.player, this.traffic.cars);
    if (hit) {
      if (hit.type === 'bonus') {
        this.player.fuel = Math.min(CONFIG.fuelMax, this.player.fuel + CONFIG.fuelBonus);
        this.traffic.cars.splice(this.traffic.cars.indexOf(hit), 1);
        this.sfx.pickup?.();
      } else if (hit.type === 'truck' || this.player.state === 'spin') {
        this.player.explode();
        this.sfx.crash?.();
      } else {
        this.player.startSpin(Math.sign(this.player.x - hit.x) || 1);
        this.sfx.spin?.();
      }
    }

    this.player.fuel -= CONFIG.fuelDrain * dt;
    if (this.player.fuel <= 0) {
      this.player.fuel = 0;
      this.state = 'gameover';
      if (this.score > this.highScore) {
        this.highScore = this.score;
        safeSet(this.storage, 'rf84_highscore', String(this.highScore));
      }
      this.sfx.gameover?.();
    }
  }
}

// ---- Browser-only from here ----

const STYLE_ID = 'rf84-style';
const CSS = `
#rf84-overlay { position: fixed; inset: 0; z-index: 2147483000; background: #0b0e14;
  display: flex; align-items: center; justify-content: center; touch-action: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
#rf84-overlay canvas { height: 100%; max-height: 100vh; max-width: 100vw;
  aspect-ratio: 420 / 640; image-rendering: auto; display: block; }
#rf84-overlay .rf84-btn { position: absolute; top: 14px; width: 44px; height: 44px;
  border: 1px solid #3a4256; border-radius: 10px; background: #161b26; color: #e7ecf5;
  font-size: 18px; cursor: pointer; line-height: 1; }
#rf84-overlay .rf84-close { right: 14px; }
#rf84-overlay .rf84-mute  { right: 68px; }
#rf84-overlay .rf84-touch { position: absolute; inset: auto 0 0 0; height: 30%;
  display: none; }
#rf84-overlay.rf84-is-touch .rf84-touch { display: block; }
#rf84-overlay .rf84-zone { position: absolute; bottom: 0; height: 100%; width: 38%;
  opacity: 0.001; }
#rf84-overlay .rf84-zone-l { left: 0; } #rf84-overlay .rf84-zone-r { left: 38%; }
#rf84-overlay .rf84-gas { position: absolute; right: 14px; bottom: 24px; width: 76px;
  height: 76px; border-radius: 50%; border: 1px solid #3a4256; background: #161b26;
  color: #e7ecf5; font-size: 13px; }
`;

class Overlay {
  constructor() {
    this.ac = new AbortController();
    this.prevOverflow = document.body.style.overflow;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    this.style = style;

    this.root = document.createElement('div');
    this.root.id = 'rf84-overlay';
    const isTouch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    if (isTouch) this.root.classList.add('rf84-is-touch');
    this.root.innerHTML = `
      <canvas width="${CONFIG.W}" height="${CONFIG.H}"></canvas>
      <button class="rf84-btn rf84-close" aria-label="Close game">✕</button>
      <button class="rf84-btn rf84-mute" aria-label="Toggle sound">🔊</button>
      <div class="rf84-touch">
        <div class="rf84-zone rf84-zone-l"></div>
        <div class="rf84-zone rf84-zone-r"></div>
        <button class="rf84-gas">GAS</button>
      </div>`;
    this.canvas = this.root.querySelector('canvas');
    document.body.appendChild(this.root);
    document.body.style.overflow = 'hidden';
    this.root.addEventListener('touchmove', e => e.preventDefault(),
      { passive: false, signal: this.ac.signal });
  }

  close() {
    this.ac.abort();
    this.root.remove();
    this.style.remove();
    document.body.style.overflow = this.prevOverflow;
  }
}

class InputHandler {
  constructor(overlay, signal) {
    this.keys = { left: false, right: false, accel: false };
    const map = (code) => ({
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'accel', KeyW: 'accel', Space: 'accel',
    })[code];
    window.addEventListener('keydown', e => {
      const k = map(e.code);
      if (k) { this.keys[k] = true; e.preventDefault(); }
    }, { signal });
    window.addEventListener('keyup', e => {
      const k = map(e.code);
      if (k) this.keys[k] = false;
    }, { signal });
    window.addEventListener('blur',
      () => { this.keys.left = this.keys.right = this.keys.accel = false; }, { signal });

    const bind = (sel, key) => {
      const el = overlay.root.querySelector(sel);
      const on = e => { e.preventDefault(); this.keys[key] = true; };
      const off = () => { this.keys[key] = false; };
      el.addEventListener('pointerdown', on, { signal });
      el.addEventListener('pointerup', off, { signal });
      el.addEventListener('pointercancel', off, { signal });
      el.addEventListener('pointerleave', off, { signal });
    };
    bind('.rf84-zone-l', 'left');
    bind('.rf84-zone-r', 'right');
    bind('.rf84-gas', 'accel');
  }
}

// Chroma-key extraction: the sheet is a scene, so sprites sit on road/grass.
// Sample the 4 corner colors of each region and knock out matching pixels.
function extractSprite(img, r) {
  const c = document.createElement('canvas');
  c.width = r.w; c.height = r.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const d = ctx.getImageData(0, 0, r.w, r.h);
  const p = d.data;
  const idx = [0, (r.w - 1) * 4, (r.h - 1) * r.w * 4, (r.w * r.h - 1) * 4];
  const bgs = idx.map(i => [p[i], p[i + 1], p[i + 2]]);
  const tol = 40;
  for (let i = 0; i < p.length; i += 4) {
    for (const [br, bg, bb] of bgs) {
      const dr = p[i] - br, dg = p[i + 1] - bg, db = p[i + 2] - bb;
      if (dr * dr + dg * dg + db * db < tol * tol) { p[i + 3] = 0; break; }
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

async function loadSprites(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const out = {};
  for (const [k, r] of Object.entries(SPRITES)) out[k] = extractSprite(img, r);
  return out;
}

class Renderer {
  constructor(canvas, sprites, isTouch) {
    this.ctx = canvas.getContext('2d');
    this.sprites = sprites;
    this.isTouch = isTouch;
    this.particles = [];
    this.lastPlayerState = 'normal';
  }

  spawnExplosion(x, y) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 180;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.5,
        color: ['#ff8c42', '#ffd23f', '#e84545', '#9aa0aa'][i % 4] });
    }
  }

  drawSprite(key, x, y, w, h, rot = 0) {
    const s = this.sprites[key];
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(s, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  draw(game, dt) {
    const { ctx } = this;
    const { W, H, roadLeft, roadRight } = CONFIG;
    const scroll = game.scrollPx;

    // Grass with scrolling stripes + simple deterministic trees
    ctx.fillStyle = '#3f9e4d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3a9347';
    const stripe = 64, off = scroll % (stripe * 2);
    for (let y = -stripe * 2 + off; y < H; y += stripe * 2) ctx.fillRect(0, y, W, stripe);
    const treeRow = 110;
    for (let wy = Math.floor((scroll) / treeRow) * treeRow;
         wy < scroll + H + treeRow; wy += treeRow) {
      const sy = H - (wy - scroll);
      if (sy < -40 || sy > H + 40) continue;
      const h32 = (wy * 2654435761 >>> 0) % 100;
      if (h32 < 55) {
        const lx = h32 % 2 ? 40 : W - 40;
        ctx.fillStyle = '#2c7a38';
        ctx.beginPath(); ctx.arc(lx, sy, 16 + (h32 % 9), 0, Math.PI * 2); ctx.fill();
      }
    }

    // Road + edges + scrolling lane dashes
    ctx.fillStyle = '#454a54';
    ctx.fillRect(roadLeft, 0, roadRight - roadLeft, H);
    ctx.fillStyle = '#e7ecf5';
    ctx.fillRect(roadLeft - 4, 0, 4, H);
    ctx.fillRect(roadRight, 0, 4, H);
    const dashLen = 26, dashGap = 22, period = dashLen + dashGap;
    const dashOff = scroll % period;
    ctx.fillStyle = '#c9d1de';
    for (const lx of [150, 210, 270]) {
      for (let y = -period + dashOff; y < H; y += period) ctx.fillRect(lx - 2, y, 4, dashLen);
    }

    // Traffic
    const spriteKey = { yellow: 'yellow', blue: 'blue', truck: 'truck', bonus: 'bonus' };
    for (const c of game.traffic.cars) {
      this.drawSprite(spriteKey[c.type], c.x, c.y, c.w + 10, c.h + 10);
    }

    // Player (rotates during spin, blinks during invuln, hidden while crashed)
    const p = game.player;
    if (p.state === 'crashed' && this.lastPlayerState !== 'crashed') {
      this.spawnExplosion(p.x, p.y);
    }
    this.lastPlayerState = p.state;
    if (p.state !== 'crashed' && (p.invuln <= 0 || Math.floor(p.invuln * 10) % 2 === 0)) {
      const rot = p.state === 'spin' ? p.spinDir * p.spinTime * 9 : p.vx / CONFIG.steerMax * 0.18;
      this.drawSprite('player', p.x, p.y, p.w + 12, p.h + 14, rot);
    }

    // Particles
    this.particles = this.particles.filter(pt => (pt.life -= dt) > 0);
    for (const pt of this.particles) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      ctx.globalAlpha = Math.min(1, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    this.drawHud(game);
    if (game.state === 'menu') this.drawCard('ROAD FIGHTER \'84 REMASTERED',
      [`HIGH SCORE ${game.highScore}`, '', this.isTouch ? 'TAP TO START' : 'PRESS SPACE TO START']);
    if (game.state === 'gameover') this.drawCard('GAME OVER',
      [`SCORE ${game.score}`, `HIGH SCORE ${game.highScore}`, '',
       this.isTouch ? 'TAP TO DRIVE AGAIN' : 'SPACE — DRIVE AGAIN']);
  }

  drawHud(game) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(11,14,20,0.55)';
    ctx.fillRect(0, 0, CONFIG.W, 58);
    ctx.fillStyle = '#e7ecf5';
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(game.player.speed)} km/h`, 14, 24);
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE ${game.score}`, CONFIG.W - 14, 24);
    // Fuel bar with FUEL label (nod to the original)
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText('FUEL', 14, 46);
    const ratio = game.player.fuel / CONFIG.fuelMax;
    ctx.strokeStyle = '#e7ecf5';
    ctx.strokeRect(54, 36, 140, 12);
    ctx.fillStyle = ratio > 0.3 ? '#5dd97c' : '#e84545';
    ctx.fillRect(56, 38, 136 * Math.max(0, ratio), 8);
    ctx.textAlign = 'left';
  }

  drawCard(title, lines) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(11,14,20,0.78)';
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
    ctx.fillStyle = '#e7ecf5';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px ui-monospace, monospace';
    ctx.fillText(title, CONFIG.W / 2, CONFIG.H / 2 - 60);
    ctx.font = '16px ui-monospace, monospace';
    lines.forEach((l, i) => ctx.fillText(l, CONFIG.W / 2, CONFIG.H / 2 - 10 + i * 28));
    ctx.textAlign = 'left';
  }
}

// Debug view (?sprites): every extracted sprite on magenta — any background
// remnant or clipped edge is immediately visible.
function drawSpriteDebug(ctx, sprites) {
  ctx.fillStyle = '#d36';
  ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
  ctx.font = '12px monospace';
  let x = 10, y = 10, colW = 0;
  for (const [k, s] of Object.entries(sprites)) {
    if (y + s.height > CONFIG.H - 20) { x += colW + 60; y = 10; colW = 0; }
    ctx.drawImage(s, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${k} ${s.width}x${s.height}`, x + s.width + 6, y + 14);
    colW = Math.max(colW, s.width);
    y += s.height + 10;
  }
}

class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Must be called from a user-gesture handler (autoplay policy).
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speedRatio) {
    if (!this.ctx) return;
    this.engineOsc.frequency.setTargetAtTime(45 + speedRatio * 170, this.ctx.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(speedRatio > 0.01 ? 0.035 : 0, this.ctx.currentTime, 0.08);
  }

  beep(freq, dur = 0.1, type = 'square', delay = 0, vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  noise(dur = 0.35, vol = 0.25) {
    if (!this.ctx) return;
    const n = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }

  spin()     { this.noise(0.18, 0.15); }
  crash()    { this.noise(0.45, 0.3); this.beep(70, 0.4, 'sine', 0, 0.3); }
  pickup()   { this.beep(880, 0.08); this.beep(1320, 0.12, 'square', 0.09); }
  gameover() { [392, 330, 262, 196].forEach((f, i) => this.beep(f, 0.22, 'triangle', i * 0.18)); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    return this.muted;
  }

  dispose() {
    this.ctx?.close();
    this.ctx = null;
  }
}

let rf84Active = false;

export default async function openRoadFighter({ debugSprites = false } = {}) {
  if (rf84Active) return;
  rf84Active = true;

  const overlay = new Overlay();
  const signal = overlay.ac.signal;
  const ctx = overlay.canvas.getContext('2d');
  const isTouch = overlay.root.classList.contains('rf84-is-touch');
  const audio = new AudioFX();
  let raf = 0;

  const close = () => {
    cancelAnimationFrame(raf);
    audio.dispose();
    overlay.close();
    rf84Active = false;
  };
  overlay.root.querySelector('.rf84-close')
    .addEventListener('click', close, { signal });
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') close();
    if (e.code === 'KeyM') updateMute(audio.toggleMute());
  }, { signal });
  const muteBtn = overlay.root.querySelector('.rf84-mute');
  const updateMute = (m) => { muteBtn.textContent = m ? '🔇' : '🔊'; };
  muteBtn.addEventListener('click',
    () => { audio.unlock(); updateMute(audio.toggleMute()); }, { signal });

  // Loading state
  ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
  ctx.fillStyle = '#e7ecf5'; ctx.font = '16px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.fillText('LOADING…', CONFIG.W / 2, CONFIG.H / 2);

  let sprites;
  try {
    sprites = await loadSprites(new URL('./cars.png', import.meta.url));
  } catch {
    ctx.fillText('Failed to load — tap ✕ and try again', CONFIG.W / 2, CONFIG.H / 2 + 30);
    rf84Active = false; // never brick the teaser; ✕ still tears down the overlay
    return;
  }

  if (debugSprites) { drawSpriteDebug(ctx, sprites); return; }

  const input = new InputHandler(overlay, signal);
  const game = new Game({ sfx: {
    spin: () => audio.spin(), crash: () => audio.crash(),
    pickup: () => audio.pickup(), gameover: () => audio.gameover(),
  } });
  const renderer = new Renderer(overlay.canvas, sprites, isTouch);

  // Start / restart on accelerate press (key or GAS) or canvas tap; also unlocks audio.
  const tryStart = () => {
    audio.unlock();
    if (game.state !== 'playing') game.start();
  };
  overlay.canvas.addEventListener('pointerdown', tryStart, { signal });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && game.state !== 'playing') tryStart();
  }, { signal });
  overlay.root.querySelector('.rf84-gas')
    .addEventListener('pointerdown', () => audio.unlock(), { signal });

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    game.update(dt, input.keys);
    audio.setEngine(game.state === 'playing' ? game.player.speed / CONFIG.maxSpeed : 0);
    renderer.draw(game, dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
