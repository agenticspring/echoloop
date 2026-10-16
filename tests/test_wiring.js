'use strict';
/* Wiring / automated playtest for echoloop.
 * Loads the REAL browser files (game.js, audio.js, main.js) in a vm sandbox
 * with stubbed DOM/canvas, then drives the actual game loop with scripted
 * input: keyboard, touch joystick, taps. Run: node --test tests/
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var DIR = path.join(__dirname, '..');

function makeCtxStub() {
  return new Proxy({}, {
    get: function (t, p) {
      if (p === 'canvas') return {};
      return function () {};
    },
    set: function () { return true; }
  });
}

function makeEl(id, ctxStub) {
  var classes = new Set();
  var handlers = {};
  return {
    _id: id,
    _classes: classes,
    _handlers: handlers,
    style: {},
    textContent: '',
    width: 960,
    height: 600,
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); }
    },
    addEventListener: function (ev, fn) { handlers[ev] = fn; },
    getContext: function () { return ctxStub; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 960, height: 600 }; },
    setPointerCapture: function () {}
  };
}

function boot() {
  var ctxStub = makeCtxStub();
  var els = {};
  var winHandlers = {};
  var rafCb = null;
  var store = {};
  var sandbox = {
    console: console,
    document: {
      hidden: false,
      _handlers: {},
      getElementById: function (id) {
        if (!els[id]) els[id] = makeEl(id, ctxStub);
        return els[id];
      },
      addEventListener: function (ev, fn) { this._handlers[ev] = fn; },
      createElement: function () { return makeEl('dyn', ctxStub); }
    },
    window: {
      _handlers: winHandlers,
      addEventListener: function (ev, fn) { winHandlers[ev] = fn; }
    },
    requestAnimationFrame: function (cb) { rafCb = cb; },
    cancelAnimationFrame: function () {},
    localStorage: {
      getItem: function (k) { return store[k] || null; },
      setItem: function (k, v) { store[k] = String(v); }
    }
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  ['game.js', 'audio.js', 'main.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
  });
  return { sb: sandbox, els: els, winHandlers: winHandlers, store: store };
}

function key(h, k, down) {
  (down ? h.keydown : h.keyup).call(null, { key: k, preventDefault: function () {} });
}

test('boot: title screen, no exceptions over idle frames', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  assert.ok(api, '__echoloop exposed');
  assert.equal(api.game.state, 'title');
  assert.ok(b.els['ov-title']._classes.size === 0, 'title overlay visible');
  for (var i = 0; i < 30; i++) api.frame(16.7);
  assert.equal(api.game.state, 'title');
});

test('playtest: start, move with keyboard, collect orb, score HUD updates', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  var g = api.game;
  key(b.winHandlers, ' ', true); key(b.winHandlers, ' ', false);
  assert.equal(g.state, 'playing');
  assert.ok(b.els['ov-title']._classes.has('hidden'), 'title hidden after start');
  var x0 = g.player.x;
  key(b.winHandlers, 'ArrowRight', true);
  for (var i = 0; i < 120; i++) api.frame(16.7);
  key(b.winHandlers, 'ArrowRight', false);
  assert.ok(g.player.x > x0 + 200, 'player moved right, x=' + g.player.x);
  // drop an orb on the player and collect it
  g.orbs.push({ x: g.player.x, y: g.player.y, r: 9, born: 0 });
  var s0 = g.score;
  api.frame(16.7);
  assert.ok(g.score > s0 + 50, 'orb collected, score=' + g.score);
  assert.equal(g.combo, 2);
  assert.ok(/^[0-9]+$/.test(b.els['hud-score'].textContent), 'HUD score numeric');
  assert.ok(b.els['hud-combo'].textContent === 'x2', 'HUD combo=x2');
});

test('playtest: ghost kills -> game over overlay -> restart via R', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  var g = api.game;
  key(b.winHandlers, ' ', true); key(b.winHandlers, ' ', false);
  var p = g.player;
  g.ghosts.push({ path: [{ x: p.x, y: p.y }], i: 0, r: 12, bornLoop: 0 });
  api.frame(16.7);
  assert.equal(g.state, 'gameover');
  assert.ok(!b.els['ov-over']._classes.has('hidden'), 'game-over overlay shown');
  assert.ok(b.els['over-cause'].textContent.length > 0, 'death cause shown');
  key(b.winHandlers, 'r', true); key(b.winHandlers, 'r', false);
  assert.equal(g.state, 'playing');
  assert.equal(g.score, 0);
  assert.ok(b.els['ov-over']._classes.has('hidden'), 'overlay hidden after restart');
});

test('playtest: pause freezes simulation, resume continues', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  var g = api.game;
  key(b.winHandlers, ' ', true); key(b.winHandlers, ' ', false);
  key(b.winHandlers, 'p', true); key(b.winHandlers, 'p', false);
  assert.equal(g.state, 'paused');
  assert.ok(!b.els['ov-pause']._classes.has('hidden'), 'pause overlay shown');
  var t0 = g.timeMs, x0 = g.player.x;
  key(b.winHandlers, 'ArrowRight', true);
  for (var i = 0; i < 60; i++) api.frame(16.7);
  assert.equal(g.timeMs, t0, 'time frozen while paused');
  assert.equal(g.player.x, x0, 'player frozen while paused');
  key(b.winHandlers, 'ArrowRight', false);
  key(b.winHandlers, 'p', true); key(b.winHandlers, 'p', false);
  assert.equal(g.state, 'playing');
});

test('playtest: touch joystick steers the player', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  var g = api.game;
  key(b.winHandlers, ' ', true); key(b.winHandlers, ' ', false);
  var cv = b.els['game'];
  var x0 = g.player.x;
  cv._handlers['pointerdown']({ pointerId: 7, clientX: 480, clientY: 300 });
  cv._handlers['pointermove']({ pointerId: 7, clientX: 540, clientY: 300 });
  for (var i = 0; i < 60; i++) api.frame(16.7);
  assert.ok(g.player.x > x0 + 100, 'joystick moved player right, x=' + g.player.x);
  cv._handlers['pointerup']({ pointerId: 7, clientX: 540, clientY: 300 });
  var x1 = g.player.x;
  for (var j = 0; j < 30; j++) api.frame(16.7);
  assert.equal(g.player.x, x1, 'player stops after joystick release');
});

test('playtest: tap restarts from game-over screen', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  var g = api.game;
  key(b.winHandlers, ' ', true); key(b.winHandlers, ' ', false);
  g.die('test tap');
  api.frame(16.7);
  assert.equal(g.state, 'gameover');
  api.tap();
  assert.equal(g.state, 'playing');
});

test('playtest: mute toggle and full loop spawn without errors', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  var g = api.game;
  key(b.winHandlers, 'm', true); key(b.winHandlers, 'm', false);
  assert.equal(b.els['btn-mute'].textContent, '🔇');
  key(b.winHandlers, 'm', true); key(b.winHandlers, 'm', false);
  assert.equal(b.els['btn-mute'].textContent, '🔊');
  // survive a full 12s loop with evasive movement; ghost must spawn
  key(b.winHandlers, ' ', true); key(b.winHandlers, ' ', false);
  var dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  var di = 0;
  key(b.winHandlers, dirs[0], true);
  for (var f = 0; f < 12 * 60 + 30; f++) {
    if (f % 90 === 0) {
      key(b.winHandlers, dirs[di % 4], false);
      di++;
      key(b.winHandlers, dirs[di % 4], true);
    }
    api.frame(16.7);
    if (g.state !== 'playing') break;
  }
  key(b.winHandlers, dirs[di % 4], false);
  assert.ok(g.loopCount >= 1, 'at least one loop completed, loopCount=' + g.loopCount);
  assert.ok(g.ghosts.length >= 1 || g.state === 'gameover',
    'ghost spawned (or player died trying — both are real paths)');
});

test('best score persists to localStorage on death', function () {
  var b = boot();
  var api = b.sb.window.__echoloop;
  var g = api.game;
  key(b.winHandlers, ' ', true); key(b.winHandlers, ' ', false);
  g.score = 1234;
  g.die('test');
  api.frame(16.7);
  assert.equal(b.store['echoloop_best'], '1234');
  assert.ok(b.els['over-best'].textContent.indexOf('1234') !== -1);
});
