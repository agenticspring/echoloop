'use strict';
/* echoloop — renderer, input (keyboard + touch joystick), HUD, overlays.
 * Requires game.js (Game) and audio.js (createAudio) loaded before this file.
 */
(function () {
  var W = 960, H = 600;

  function el(id) { return document.getElementById(id); }

  var canvas = el('game');
  var ctx = canvas.getContext('2d');
  var game = new Game({ width: W, height: H });
  var audio = createAudio();

  var ui = {
    score: el('hud-score'),
    best: el('hud-best'),
    combo: el('hud-combo'),
    loopbar: el('loopbar-fill'),
    loopnum: el('hud-loop'),
    title: el('ov-title'),
    over: el('ov-over'),
    pause: el('ov-pause'),
    overScore: el('over-score'),
    overBest: el('over-best'),
    overCause: el('over-cause'),
    btnPause: el('btn-pause'),
    btnMute: el('btn-mute')
  };

  var keys = {};
  var floaters = []; // {x,y,text,life,color}
  var best = 0;
  try {
    best = parseInt(localStorage.getItem('echoloop_best') || '0', 10) || 0;
  } catch (e) { best = 0; }

  // ---------- input ----------
  function keyVector() {
    var x = 0, y = 0;
    if (keys.ArrowLeft || keys.KeyA) x -= 1;
    if (keys.ArrowRight || keys.KeyD) x += 1;
    if (keys.ArrowUp || keys.KeyW) y -= 1;
    if (keys.ArrowDown || keys.KeyS) y += 1;
    return { x: x, y: y };
  }

  var joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  var tapCandidate = null;

  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (W / r.width),
      y: (ev.clientY - r.top) * (H / r.height)
    };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    var p = canvasPos(ev);
    if (game.state === 'title' || game.state === 'gameover') {
      tapCandidate = { x: p.x, y: p.y, t: Date.now(), id: ev.pointerId };
      return;
    }
    if (game.state !== 'playing') return;
    joy.active = true;
    joy.id = ev.pointerId;
    joy.ox = p.x; joy.oy = p.y; joy.x = 0; joy.y = 0;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (!joy.active || ev.pointerId !== joy.id) return;
    var p = canvasPos(ev);
    var dx = (p.x - joy.ox) / 60, dy = (p.y - joy.oy) / 60;
    var m = Math.sqrt(dx * dx + dy * dy);
    if (m > 1) { dx /= m; dy /= m; }
    joy.x = dx; joy.y = dy;
    if (tapCandidate && tapCandidate.id === ev.pointerId) {
      if (Math.abs(p.x - tapCandidate.x) > 12 || Math.abs(p.y - tapCandidate.y) > 12) tapCandidate = null;
    }
  });

  function endPointer(ev) {
    if (tapCandidate && tapCandidate.id === ev.pointerId) {
      tapCandidate = null;
      onTap();
    }
    if (joy.active && ev.pointerId === joy.id) {
      joy.active = false; joy.x = 0; joy.y = 0;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function onTap() {
    if (game.state === 'title' || game.state === 'gameover') {
      audio.play('click');
      game.start();
      syncOverlays();
    }
  }

  var GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

  function onKeyDown(ev) {
    var k = ev.key === ' ' ? 'Space' : ev.key;
    if (GAME_KEYS.indexOf(k) !== -1 && ev.preventDefault) ev.preventDefault();
    keys[k] = true;
    if (k === 'Space') {
      if (game.state === 'title' || game.state === 'gameover') {
        audio.play('click');
        game.start();
        syncOverlays();
      }
    } else if (k === 'r' || k === 'R') {
      if (game.state === 'gameover' || game.state === 'paused') {
        audio.play('click');
        game.start();
        syncOverlays();
      }
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      game.togglePause();
      syncOverlays();
    } else if (k === 'm' || k === 'M') {
      toggleMute();
    }
  }
  function onKeyUp(ev) {
    var k = ev.key === ' ' ? 'Space' : ev.key;
    keys[k] = false;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === 'playing') {
      game.togglePause();
      syncOverlays();
    }
  });

  function toggleMute() {
    var m = audio.toggleMute();
    ui.btnMute.textContent = m ? '🔇' : '🔊';
  }
  ui.btnMute.addEventListener('click', function () { toggleMute(); });
  ui.btnPause.addEventListener('click', function () {
    game.togglePause();
    syncOverlays();
  });

  // ---------- overlays / HUD ----------
  function show(node, on) {
    if (!node || !node.classList) return;
    if (on) node.classList.remove('hidden');
    else node.classList.add('hidden');
  }
  function syncOverlays() {
    show(ui.title, game.state === 'title');
    show(ui.pause, game.state === 'paused');
    show(ui.over, game.state === 'gameover');
    ui.btnPause.textContent = game.state === 'paused' ? '▶' : '⏸';
  }

  function refreshHud() {
    ui.score.textContent = String(Math.floor(game.score));
    ui.best.textContent = String(Math.max(best, Math.floor(game.score)));
    ui.combo.textContent = 'x' + game.combo;
    ui.loopnum.textContent = 'LOOP ' + (game.loopCount + 1);
    var frac = 1 - game.loopT / game.loopMs;
    ui.loopbar.style.width = (frac * 100).toFixed(1) + '%';
    ui.loopbar.style.background = frac < 0.25 ? '#ff5b6e' : '#4dd8ff';
  }

  function onDeath() {
    var s = Math.floor(game.score);
    var isBest = s > best;
    if (isBest) {
      best = s;
      try { localStorage.setItem('echoloop_best', String(best)); } catch (e) {}
    }
    ui.overScore.textContent = String(s);
    ui.overBest.textContent = String(best) + (isBest ? ' — NEW BEST!' : '');
    ui.overCause.textContent = game.deathCause || '';
    syncOverlays();
  }

  function consumeEvents() {
    var evs = game.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'orb') {
        audio.play('orb');
        floaters.push({ x: e.x, y: e.y - 14, text: '+' + (100 * Math.max(1, game.combo - 1)), life: 800, color: '#6ef3a5' });
      } else if (e.t === 'death') {
        audio.play('death');
        onDeath();
      } else if (e.t === 'newloop') {
        audio.play('newloop');
        floaters.push({ x: W / 2, y: 90, text: 'LOOP ' + e.n + ' — YOUR GHOST AWAKENS', life: 1600, color: '#ff5b6e' });
      } else if (e.t === 'tick') {
        audio.play('tick');
      } else if (e.t === 'ghostfade') {
        floaters.push({ x: e.x, y: e.y, text: 'ghost faded', life: 900, color: '#8a93a6' });
      }
    }
    evs.length = 0;
  }

  // ---------- render ----------
  function drawGrid() {
    ctx.strokeStyle = '#0d1526';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (var y = 0; y <= H; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
  }

  function circle(x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function render(dt) {
    ctx.save();
    if (game.shake > 0) {
      ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
    }
    ctx.fillStyle = '#05070f';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    drawGrid();

    // danger vignette in last 3s of loop
    var remaining = game.loopMs - game.loopT;
    if (game.state === 'playing' && remaining < 3000) {
      var a = 0.25 + 0.25 * Math.sin(game.timeMs / 130);
      ctx.strokeStyle = 'rgba(255,91,110,' + a.toFixed(3) + ')';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, W - 6, H - 6);
    }

    // orbs
    var i, o;
    for (i = 0; i < game.orbs.length; i++) {
      o = game.orbs[i];
      var pr = o.r + Math.sin((game.timeMs - o.born) / 240) * 2;
      ctx.shadowColor = '#6ef3a5';
      ctx.shadowBlur = 16;
      circle(o.x, o.y, pr, '#6ef3a5');
      ctx.shadowBlur = 0;
      circle(o.x, o.y, pr * 0.45, '#d8ffe9');
    }

    // ghosts
    for (i = 0; i < game.ghosts.length; i++) {
      var gh = game.ghosts[i];
      ctx.strokeStyle = 'rgba(255,91,110,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (var k = 0; k < gh.path.length; k += 6) {
        var q = gh.path[k];
        if (k === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      var gp = gh.path[gh.i % gh.path.length];
      ctx.shadowColor = '#ff5b6e';
      ctx.shadowBlur = 18;
      circle(gp.x, gp.y, gh.r, 'rgba(255,91,110,0.75)');
      ctx.shadowBlur = 0;
      circle(gp.x, gp.y, gh.r * 0.4, '#ffd9de');
    }

    // player trail
    var tr = game.player.trail;
    if (tr.length > 1) {
      ctx.strokeStyle = 'rgba(77,216,255,0.5)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (i = 0; i < tr.length; i++) {
        if (i === 0) ctx.moveTo(tr[i].x, tr[i].y);
        else ctx.lineTo(tr[i].x, tr[i].y);
      }
      ctx.stroke();
    }

    // player ship (triangle facing velocity)
    var p = game.player;
    var ang = Math.atan2(p.vy, p.vx);
    if (p.vx === 0 && p.vy === 0) ang = -Math.PI / 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.shadowColor = '#4dd8ff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fillStyle = '#4dd8ff';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // particles
    for (i = 0; i < game.particles.length; i++) {
      var pt = game.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / 700);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // floaters
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px system-ui, sans-serif';
    for (i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life -= dt;
      f.y -= dt * 0.03;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life / 500);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // touch joystick visual
    if (joy.active) {
      ctx.strokeStyle = 'rgba(77,216,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 44, 0, Math.PI * 2);
      ctx.stroke();
      circle(joy.ox + joy.x * 44, joy.oy + joy.y * 44, 18, 'rgba(77,216,255,0.7)');
    }

    ctx.restore();
  }

  // ---------- main loop ----------
  var last = 0;
  function frame(dt) {
    if (!(dt >= 0)) dt = 16.7;
    var v = keyVector();
    if (joy.active) { v.x = joy.x; v.y = joy.y; }
    game.setInput(v.x, v.y);
    game.update(dt);
    consumeEvents();
    render(dt);
    refreshHud();
  }

  function raf(t) {
    var dt = t - last;
    last = t;
    frame(dt);
    requestAnimationFrame(raf);
  }

  syncOverlays();
  refreshHud();
  requestAnimationFrame(function (t) { last = t; raf(t); });

  // exposed for automated testing
  if (typeof window !== 'undefined') {
    window.__echoloop = {
      game: game,
      frame: frame,
      keyDown: onKeyDown,
      keyUp: onKeyUp,
      tap: onTap,
      syncOverlays: syncOverlays
    };
  }
})();
