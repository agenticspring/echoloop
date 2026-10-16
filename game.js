'use strict';
/* echoloop — pure game logic.
 * No DOM, no canvas, no Audio. Runs in Node (for tests) and in the browser.
 * The game: top-down arena survival. Every LOOP_MS the game spawns a GHOST
 * that replays your exact movement from the last loop. Touch a ghost = death.
 * Collect orbs to score. Survive as long as you can.
 */

var STEP_MS = 1000 / 60;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function dist(ax, ay, bx, by) {
  var dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function Game(opts) {
  opts = opts || {};
  this.w = opts.width || 960;
  this.h = opts.height || 600;
  this.loopMs = opts.loopMs || 12000;
  this.maxOrbs = opts.maxOrbs || 5;
  this.orbEveryMs = opts.orbEveryMs || 2200;
  this.ghostMaxAgeLoops = opts.ghostMaxAgeLoops || 3;
  this.playerSpeed = opts.playerSpeed || 270;
  this.reset();
}

Game.prototype.reset = function () {
  this.state = 'title'; // title | playing | paused | gameover
  this.timeMs = 0;
  this.score = 0;
  this.combo = 1;
  this.loopT = 0;
  this.loopCount = 0;
  this.player = { x: this.w / 2, y: this.h / 2, r: 12, vx: 0, vy: 0, trail: [] };
  this.input = { x: 0, y: 0 };
  this.recording = [];
  this.ghosts = [];
  this.orbs = [];
  this.particles = [];
  this.events = [];
  this.orbT = 0;
  this.acc = 0;
  this.shake = 0;
  this.deathCause = null;
  this.lastTickSecond = -1;
};

Game.prototype.start = function () {
  this.reset();
  this.state = 'playing';
  this.events.push({ t: 'start' });
};

Game.prototype.togglePause = function () {
  if (this.state === 'playing') {
    this.state = 'paused';
    this.events.push({ t: 'pause' });
  } else if (this.state === 'paused') {
    this.state = 'playing';
    this.events.push({ t: 'resume' });
  }
};

/* x,y in [-1,1]; normalized + clamped so diagonal isn't faster */
Game.prototype.setInput = function (x, y) {
  var m = Math.sqrt(x * x + y * y);
  if (m > 1) { x /= m; y /= m; }
  this.input.x = x;
  this.input.y = y;
};

/* Fixed-timestep driver. Call every rAF with real dt in ms. */
Game.prototype.update = function (dtMs) {
  if (!(dtMs >= 0)) dtMs = 16.7;
  // shake must decay in every state: after death the sim no longer steps,
  // but update() still runs each frame — never let the screen shake forever.
  if (this.shake > 0) this.shake = Math.max(0, this.shake - dtMs / 16);
  if (this.state !== 'playing') return;
  this.acc += Math.min(dtMs, 250);
  var n = 0;
  while (this.acc >= STEP_MS && n < 5) {
    this.step();
    this.acc -= STEP_MS;
    n++;
  }
  if (n === 5) this.acc = 0;
};

Game.prototype.step = function () {
  var p = this.player;
  this.timeMs += STEP_MS;
  this.score += (STEP_MS / 1000) * 10;

  // --- movement ---
  p.vx = this.input.x * this.playerSpeed;
  p.vy = this.input.y * this.playerSpeed;
  p.x = clamp(p.x + p.vx * (STEP_MS / 1000), p.r, this.w - p.r);
  p.y = clamp(p.y + p.vy * (STEP_MS / 1000), p.r, this.h - p.r);
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > 24) p.trail.shift();
  this.recording.push({ x: p.x, y: p.y });

  // --- loop timer: spawn a ghost of your last loop ---
  this.loopT += STEP_MS;
  var remaining = this.loopMs - this.loopT;
  if (remaining <= 3000 && remaining > 0) {
    var s = Math.ceil(remaining / 1000);
    if (s !== this.lastTickSecond) { this.lastTickSecond = s; this.events.push({ t: 'tick' }); }
  }
  if (this.loopT >= this.loopMs) this.endLoop();

  // --- orbs ---
  this.orbT += STEP_MS;
  if (this.orbT >= this.orbEveryMs && this.orbs.length < this.maxOrbs) {
    this.orbT = 0;
    this.spawnOrb();
  }
  this.collectOrbs();

  // --- ghosts: replay, expire, collide ---
  var i, g;
  for (i = this.ghosts.length - 1; i >= 0; i--) {
    g = this.ghosts[i];
    if (this.loopCount - g.bornLoop > this.ghostMaxAgeLoops) {
      this.events.push({ t: 'ghostfade', x: ghostPos(g).x, y: ghostPos(g).y });
      this.ghosts.splice(i, 1);
      continue;
    }
    g.i++;
    var gp = ghostPos(g);
    if (dist(p.x, p.y, gp.x, gp.y) < p.r + g.r) {
      this.die('Caught by your past self (loop ' + (g.bornLoop + 1) + ' ghost)');
      return;
    }
  }

  // --- particles (visual data only) ---
  for (i = this.particles.length - 1; i >= 0; i--) {
    var pt = this.particles[i];
    pt.life -= STEP_MS;
    pt.x += pt.vx * (STEP_MS / 1000);
    pt.y += pt.vy * (STEP_MS / 1000);
    if (pt.life <= 0) this.particles.splice(i, 1);
  }
  if (this.shake > 0) this.shake = Math.max(0, this.shake - STEP_MS / 16);
};

Game.prototype.endLoop = function () {
  if (this.recording.length > 30) {
    this.ghosts.push({ path: this.recording, i: 0, r: 12, bornLoop: this.loopCount });
    this.events.push({ t: 'newloop', n: this.loopCount + 1 });
  }
  this.loopCount++;
  this.loopT = 0;
  this.lastTickSecond = -1;
  this.recording = [];
};

Game.prototype.spawnOrb = function () {
  var p = this.player, x = 0, y = 0, ok = false;
  for (var tries = 0; tries < 20; tries++) {
    x = 30 + Math.random() * (this.w - 60);
    y = 30 + Math.random() * (this.h - 60);
    if (dist(x, y, p.x, p.y) >= 140) { ok = true; break; }
  }
  if (!ok) return;
  this.orbs.push({ x: x, y: y, r: 9, born: this.timeMs });
};

Game.prototype.collectOrbs = function () {
  var p = this.player;
  for (var i = this.orbs.length - 1; i >= 0; i--) {
    var o = this.orbs[i];
    if (dist(p.x, p.y, o.x, o.y) < p.r + o.r) {
      this.score += 100 * this.combo;
      this.combo = Math.min(this.combo + 1, 8);
      this.events.push({ t: 'orb', x: o.x, y: o.y });
      this.burst(o.x, o.y, '#6ef3a5', 14);
      this.orbs.splice(i, 1);
    }
  }
};

Game.prototype.burst = function (x, y, color, n) {
  for (var k = 0; k < n; k++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 60 + Math.random() * 160;
    this.particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 350 + Math.random() * 350, color: color
    });
  }
};

Game.prototype.die = function (cause) {
  this.state = 'gameover';
  this.deathCause = cause;
  this.shake = 16;
  this.burst(this.player.x, this.player.y, '#ff5b6e', 40);
  this.events.push({ t: 'death' });
};

function ghostPos(g) {
  return g.path[g.i % g.path.length];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game: Game, STEP_MS: STEP_MS, ghostPos: ghostPos, dist: dist, clamp: clamp };
}
