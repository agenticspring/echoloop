'use strict';
/* Unit tests for echoloop pure game logic (game.js). Run: node --test tests/ */
var test = require('node:test');
var assert = require('node:assert/strict');
var mod = require('../game.js');
var Game = mod.Game;
var STEP_MS = mod.STEP_MS;

function fresh(opts) {
  var g = new Game(opts || { loopMs: 3000, orbEveryMs: 60000 });
  g.start();
  g.events.length = 0;
  return g;
}
function steps(g, n) { for (var i = 0; i < n; i++) g.step(); }
function secs(g, s) { steps(g, Math.round(s * 1000 / STEP_MS)); }

test('state machine: title -> playing -> paused -> playing -> gameover -> restart', function () {
  var g = new Game();
  assert.equal(g.state, 'title');
  g.togglePause(); // no-op on title
  assert.equal(g.state, 'title');
  g.start();
  assert.equal(g.state, 'playing');
  g.togglePause();
  assert.equal(g.state, 'paused');
  g.togglePause();
  assert.equal(g.state, 'playing');
  g.die('test');
  assert.equal(g.state, 'gameover');
  assert.equal(g.deathCause, 'test');
  g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.score, 0);
  assert.equal(g.ghosts.length, 0);
});

test('movement: input moves player at configured speed', function () {
  var g = fresh();
  var x0 = g.player.x;
  g.setInput(1, 0);
  secs(g, 1);
  assert.ok(Math.abs(g.player.x - (x0 + g.playerSpeed)) < 2, 'moved ~speed*1s, got ' + g.player.x);
  g.setInput(0, 0);
  var x1 = g.player.x;
  secs(g, 0.5);
  assert.equal(g.player.x, x1);
});

test('input is normalized: diagonal not faster than axis', function () {
  var g = fresh();
  g.setInput(1, 1);
  secs(g, 1);
  var d = Math.hypot(g.player.x - g.w / 2, g.player.y - g.h / 2);
  assert.ok(Math.abs(d - g.playerSpeed) < 3, 'diag dist ~speed, got ' + d);
});

test('player clamped inside arena', function () {
  var g = fresh();
  g.setInput(-1, -1);
  secs(g, 10);
  assert.ok(g.player.x >= g.player.r && g.player.y >= g.player.r);
  assert.ok(g.player.x <= g.w - g.player.r && g.player.y <= g.h - g.player.r);
});

test('paused: update() does nothing', function () {
  var g = fresh();
  g.setInput(1, 0);
  g.togglePause();
  var x0 = g.player.x, t0 = g.timeMs;
  g.update(1000);
  assert.equal(g.player.x, x0);
  assert.equal(g.timeMs, t0);
});

test('survival score accrues ~10 pts/sec', function () {
  var g = fresh();
  secs(g, 5);
  assert.ok(g.score >= 49 && g.score <= 51, 'score=' + g.score);
});

test('orb collection: score += 100*combo, combo increments (capped)', function () {
  var g = fresh();
  var p = g.player;
  g.orbs.push({ x: p.x, y: p.y, r: 9, born: 0 });
  var s0 = g.score;
  g.step();
  assert.equal(g.orbs.length, 0);
  assert.ok(Math.abs(g.score - (s0 + 100 + 10 / 60)) < 0.01, 'score=' + g.score);
  assert.equal(g.combo, 2);
  g.orbs.push({ x: p.x, y: p.y, r: 9, born: 0 });
  g.step();
  assert.equal(g.combo, 3);
  g.combo = 8;
  g.orbs.push({ x: p.x, y: p.y, r: 9, born: 0 });
  g.step();
  assert.equal(g.combo, 8, 'combo capped at 8');
});

test('orb spawn: inside bounds and >=140px from player', function () {
  var g = fresh();
  for (var k = 0; k < 30; k++) {
    g.spawnOrb();
    var o = g.orbs[g.orbs.length - 1];
    assert.ok(o.x >= 30 && o.x <= g.w - 30 && o.y >= 30 && o.y <= g.h - 30);
    assert.ok(mod.dist(o.x, o.y, g.player.x, g.player.y) >= 140);
  }
});

test('loop end spawns ghost replaying recorded path', function () {
  var g = fresh({ loopMs: 2000, orbEveryMs: 60000 });
  g.setInput(1, 0);
  secs(g, 2.05);
  assert.equal(g.ghosts.length, 1);
  assert.equal(g.loopCount, 1);
  var gh = g.ghosts[0];
  assert.ok(gh.path.length >= 110 && gh.path.length <= 130, 'path len=' + gh.path.length);
  var ev = g.events.filter(function (e) { return e.t === 'newloop'; });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].n, 1);
});

test('ghost replays path from the start and advances', function () {
  var g = fresh({ loopMs: 2000, orbEveryMs: 60000 });
  g.setInput(1, 0);
  secs(g, 2.05);
  var gh = g.ghosts[0];
  var p0 = mod.ghostPos(gh);
  var expected = gh.path[gh.i % gh.path.length];
  assert.ok(Math.abs(p0.x - expected.x) < 0.001 && Math.abs(p0.y - expected.y) < 0.001,
    'ghostPos follows replay index');
  var i0 = gh.i;
  secs(g, 1);
  assert.ok(gh.i > i0, 'ghost index advances');
});

test('ghost wraps around path endlessly until expiry', function () {
  var g = fresh({ loopMs: 1200, orbEveryMs: 60000, ghostMaxAgeLoops: 99 });
  g.setInput(1, 0);
  secs(g, 1.25);
  var gh = g.ghosts[0];
  var len = gh.path.length;
  gh.i = len - 2;
  g.step(); g.step(); g.step();
  assert.ok(gh.i >= len, 'i=' + gh.i);
  var p = mod.ghostPos(gh); // must not throw / be undefined
  assert.ok(typeof p.x === 'number' && typeof p.y === 'number');
});

test('touching a ghost kills the player', function () {
  var g = fresh({ loopMs: 60000, orbEveryMs: 60000 });
  g.setInput(0, 0);
  secs(g, 0.5);
  var p = g.player;
  g.ghosts.push({ path: [{ x: p.x, y: p.y }], i: 0, r: 12, bornLoop: 0 });
  g.step();
  assert.equal(g.state, 'gameover');
  assert.ok(g.deathCause.indexOf('past self') !== -1);
  assert.equal(g.shake, 16);
});

test('old ghosts dissolve after ghostMaxAgeLoops full loops', function () {
  var g = fresh({ loopMs: 60000, orbEveryMs: 60000, ghostMaxAgeLoops: 2 });
  // craft ghosts directly, parked far from the player (480,300)
  function mkGhost(bornLoop) {
    var path = [];
    for (var k = 0; k < 60; k++) path.push({ x: 60, y: 60 });
    return { path: path, i: 0, r: 12, bornLoop: bornLoop };
  }
  g.ghosts.push(mkGhost(0), mkGhost(1));
  g.loopCount = 3; // as if 3 loops have elapsed since ghost 0 was born
  g.step();
  assert.equal(g.ghosts.length, 1, 'oldest ghost dissolved');
  assert.equal(g.ghosts[0].bornLoop, 1);
  var fades = g.events.filter(function (e) { return e.t === 'ghostfade'; });
  assert.equal(fades.length, 1);
  assert.equal(g.state, 'playing', 'no accidental death');
});

test('no ghost spawned when recording too short', function () {
  var g = fresh({ loopMs: 1000, orbEveryMs: 60000 });
  g.recording = [{ x: 1, y: 2 }];
  g.loopT = 999;
  g.step();
  assert.equal(g.ghosts.length, 0);
  assert.equal(g.loopCount, 1);
});

test('tick events fire in last 3 seconds of loop', function () {
  var g = fresh({ loopMs: 5000, orbEveryMs: 60000 });
  secs(g, 4.9);
  var ticks = g.events.filter(function (e) { return e.t === 'tick'; });
  assert.ok(ticks.length >= 2 && ticks.length <= 3, 'ticks=' + ticks.length);
});

test('update() fixed timestep: large dt does not spiral', function () {
  var g = fresh();
  g.setInput(1, 0);
  g.update(5000); // clamped internally
  assert.ok(g.timeMs <= 1000, 'timeMs=' + g.timeMs);
  assert.equal(g.state, 'playing');
});

test('events queue carries orb/death payloads for the renderer', function () {
  var g = fresh();
  g.orbs.push({ x: g.player.x, y: g.player.y, r: 9, born: 0 });
  g.step();
  var orb = g.events.filter(function (e) { return e.t === 'orb'; });
  assert.equal(orb.length, 1);
  assert.ok(typeof orb[0].x === 'number');
  g.ghosts.push({ path: [{ x: g.player.x, y: g.player.y }], i: 0, r: 12, bornLoop: 0 });
  g.step();
  var death = g.events.filter(function (e) { return e.t === 'death'; });
  assert.equal(death.length, 1);
});

test('restart clears ghosts, orbs, score, combo', function () {
  var g = fresh({ loopMs: 1000, orbEveryMs: 100 });
  g.setInput(1, 0);
  secs(g, 2.5);
  assert.ok(g.ghosts.length >= 1);
  assert.ok(g.score > 0);
  g.start();
  assert.equal(g.ghosts.length, 0);
  assert.equal(g.orbs.length, 0);
  assert.equal(g.score, 0);
  assert.equal(g.combo, 1);
  assert.equal(g.loopCount, 0);
});
