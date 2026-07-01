/* =========================================================================
   OVER THE BAGS — audio: music manager + synthesized SFX (no sample files)
   ========================================================================= */
'use strict';

const Music = {
  el: new Audio(),
  current: null,
  muted: false,
  fadeTimer: null,
  init() {
    this.el.loop = true;
    this.el.volume = MUSIC_VOLUME;
    this.el.addEventListener('error', () => {
      console.warn('[music] failed to load:', this.el.src, '— continuing without it');
    });
  },
  play(name) {
    if (name === this.current) return;
    this.current = name;
    const src = AUDIO_TRACKS[name];
    if (!src) return;
    clearInterval(this.fadeTimer);
    const el = this.el, target = this.muted ? 0 : MUSIC_VOLUME;
    const swap = () => {
      el.src = src;
      el.volume = 0;
      el.play().catch(() => {}); // autoplay guard; user gesture arrives eventually
      this.fadeTimer = setInterval(() => {
        el.volume = Math.min(target, el.volume + 0.05);
        if (el.volume >= target) clearInterval(this.fadeTimer);
      }, 60);
    };
    if (el.src && !el.paused) {
      this.fadeTimer = setInterval(() => {
        el.volume = Math.max(0, el.volume - 0.08);
        if (el.volume <= 0) { clearInterval(this.fadeTimer); swap(); }
      }, 50);
    } else swap();
  },
  setMuted(m) {
    this.muted = m;
    clearInterval(this.fadeTimer);
    this.el.volume = m ? 0 : MUSIC_VOLUME;
  },
};

const Sfx = {
  ctx: null, gain: null, muted: false,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = SFX_VOLUME;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },
  noise(dur, freq, q, vol, type = 'bandpass') {
    if (this.muted || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.gain);
    src.start();
  },
  tone(f0, f1, dur, vol, type = 'sine') {
    if (this.muted || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.gain);
    o.start(); o.stop(t + dur);
  },
  rifle()  { this.noise(0.09, 1600, 1.2, 0.5); this.tone(220, 60, 0.06, 0.12, 'square'); },
  mg()     { this.noise(0.05, 1900, 1.5, 0.32); },
  sniper() { this.noise(0.14, 1100, 1.0, 0.55); this.tone(180, 40, 0.1, 0.15, 'square'); },
  boom(big = 1) {
    this.noise(0.7 * big, 320, 0.7, 0.7 * big, 'lowpass');
    this.tone(110, 28, 0.5 * big, 0.4 * big);
  },
  thud()   { this.noise(0.07, 300, 1, 0.3, 'lowpass'); },
  click()  { this.noise(0.03, 2500, 2, 0.15); },
  whistle(){ this.tone(1800, 2400, 1.4, 0.25, 'sine'); },
  shellIncoming() { this.tone(2600, 700, 1.6, 0.18, 'sine'); },   // falling whistle
  build()  { this.noise(0.15, 700, 1, 0.3, 'lowpass'); },
  setMuted(m) { this.muted = m; },
};
