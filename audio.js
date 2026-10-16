'use strict';
/* echoloop audio — tiny WebAudio synth, zero assets. No-op until first user gesture. */

function createAudio() {
  var ctx = null;
  var master = null;
  var muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  function tone(f0, f1, dur, type, vol) {
    if (muted || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  return {
    play: function (name) {
      if (name === 'orb') tone(660, 990, 0.12, 'square', 0.6);
      else if (name === 'death') tone(220, 55, 0.5, 'sawtooth', 0.9);
      else if (name === 'newloop') tone(440, 440, 0.09, 'triangle', 0.5);
      else if (name === 'tick') tone(880, 880, 0.05, 'square', 0.25);
      else if (name === 'click') tone(520, 520, 0.06, 'square', 0.35);
    },
    toggleMute: function () {
      muted = !muted;
      return muted;
    },
    isMuted: function () { return muted; }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createAudio: createAudio };
}
