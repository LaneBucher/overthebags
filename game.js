/* =========================================================================
   OVER THE BAGS — trench command MVP
   Vanilla JS + Canvas. No build step.
   ========================================================================= */
'use strict';

/* =========================================================================
   CONFIG — edit audio paths / balance here
   ========================================================================= */
const AUDIO_TRACKS = {
  menu:   'audio/Over The Bags Main Theme.mp3', // start menu + defeat
  prep:   'audio/Homeland.mp3',                 // prep phase, waves 1-4
  anthem: 'audio/Anthem.mp3',                   // prep before final wave + victory
  battle: 'audio/Never Before.mp3',             // active battle, waves 1-4
  armor:  'audio/March of the Tanks.mp3',       // final wave (tank assault)
};
const MUSIC_VOLUME = 0.55;
const SFX_VOLUME = 0.5;

const BALANCE = {
  startSupplies: 75,
  wireCost: 20,
  mgCost: 50,
  maxBreaches: 6,
  waveReward: [30, 35, 40, 45, 0], // base supplies per wave (+ kill bounties)
};

/* Field geometry (canvas is 900x700) */
const W = 900, H = 700;
const ENEMY_LINE = 70;      // bottom of enemy trench
const TRENCH_TOP = 530;     // front lip of player trench
const TRENCH_BOT = 648;     // rear of player trench (soldier move band)
const BREACH_Y = 676;       // enemy past this = breach
const WIRE_ZONE = { top: 270, bot: 505 };

const SOLDIER = { hp: 100, speed: 85, range: 210, fireRate: 0.85, dmg: 9 };
const MG = { range: 300, fireRate: 0.12, dmg: 6, manRadius: 60 };

const ENEMY_TYPES = {
  infantry: { hp: 55,  speed: 33, dmg: 7,  hitRate: 0.8, reward: 2,  r: 9,  wireSlow: 0.35 },
  raider:   { hp: 30,  speed: 62, dmg: 9,  hitRate: 0.6, reward: 3,  r: 8,  wireSlow: 0.35 },
  heavy:    { hp: 200, speed: 22, dmg: 14, hitRate: 1.1, reward: 6,  r: 12, wireSlow: 0.55 },
  tank:     { hp: 500, speed: 12, dmg: 0,  hitRate: 0,   reward: 20, r: 20, wireSlow: 0.85 },
};

/* Wave scripts: squads go over the top together in lines (burst = squad size) */
const WAVES = [
  { groups: [{ type: 'infantry', n: 6,  start: 1, gap: 9, burst: 3 }] },
  { groups: [{ type: 'infantry', n: 10, start: 1, gap: 10, burst: 5 },
             { type: 'raider',   n: 4,  start: 5, gap: 7,  burst: 2 }] },
  { groups: [{ type: 'infantry', n: 12, start: 1, gap: 9,  burst: 6 },
             { type: 'raider',   n: 6,  start: 4, gap: 7,  burst: 3 },
             { type: 'heavy',    n: 3,  start: 14, gap: 0, burst: 3 }] },
  { groups: [{ type: 'infantry', n: 16, start: 1, gap: 8,  burst: 8 },
             { type: 'raider',   n: 8,  start: 3, gap: 6,  burst: 4 },
             { type: 'heavy',    n: 4,  start: 10, gap: 8, burst: 2 }] },
  { groups: [{ type: 'infantry', n: 12, start: 1, gap: 8,  burst: 6 },
             { type: 'raider',   n: 8,  start: 2, gap: 6,  burst: 4 },
             { type: 'heavy',    n: 5,  start: 6, gap: 8,  burst: 3 },
             { type: 'tank',     n: 1,  start: 12, gap: 0, burst: 1 }] },
];

const CALLSIGNS = ['Sgt. Brandt', 'Cpl. Hayes', 'Pvt. Miller', 'Pvt. Okafor'];

const PRE_WAVE_MSG = [
  'Listening post reports movement across the wire. First assault expected within the hour. Dig in.',
  'They tested us. Expect them faster this time — raiders move ahead of the line.',
  'Intel warns of heavy stormtroopers in the next push. Rifles alone may not stop them.',
  'No reinforcements. HQ says hold at any cost. The next assault will be the worst yet.',
  'URGENT — enemy ARMOUR reported near the forward line. Hold this one, and we go over the bags.',
];
const POST_WAVE_MSG = [
  'Good work. Supplies have been authorized. They will be back.',
  'Line held. HQ sends its compliments — and nothing else.',
  'You need to charge soon. But not yet. Hold.',
  'One more push and they break. Make ready.',
];

/* =========================================================================
   MUSIC MANAGER
   ========================================================================= */
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
    // fade out, swap, fade in
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

/* =========================================================================
   SFX — small WebAudio synth (no sample files needed)
   ========================================================================= */
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
  boom(big = 1) {
    this.noise(0.7 * big, 320, 0.7, 0.7 * big, 'lowpass');
    this.tone(110, 28, 0.5 * big, 0.4 * big);
  },
  thud()   { this.noise(0.07, 300, 1, 0.3, 'lowpass'); },
  click()  { this.noise(0.03, 2500, 2, 0.15); },
  whistle(){ this.tone(1800, 2400, 1.4, 0.25, 'sine'); },
  build()  { this.noise(0.15, 700, 1, 0.3, 'lowpass'); },
  setMuted(m) { this.muted = m; },
};

/* =========================================================================
   STATE
   ========================================================================= */
const G = {
  state: 'MENU', // MENU | PREP | WAVE | RESULTS | CHARGE | END
  paused: false,
  wave: 0,       // index of current/next wave (0-based)
  supplies: BALANCE.startSupplies,
  breaches: 0,
  soldiers: [],
  enemies: [],
  wires: [],
  mgNest: null,
  spawnQueue: [],   // [{t, type}] sorted
  waveT: 0,
  tracers: [],
  shells: [],
  particles: [],
  ambientSmoke: [],
  selected: null,
  placing: null,    // 'wire' | 'mg' | null
  mouse: { x: 0, y: 0, inField: false },
  shake: 0,
  killsWave: 0, earnWave: 0, killsTotal: 0,
  chargeT: 0,
  ambientT: 3,
  muted: false,
  invalidFlash: null, // {x,y,t}
  moveMark: null,     // {x,y,t}
  dangerFlash: 0,     // red vignette pulse when the line is hurt
};

/* =========================================================================
   DOM
   ========================================================================= */
const $ = id => document.getElementById(id);
const canvas = $('field'), ctx = canvas.getContext('2d');
const ui = {
  menu: $('menu-screen'), root: $('game-root'),
  wave: $('stat-wave'), supplies: $('stat-supplies'), breach: $('stat-breach'),
  log: $('cmd-log'), roster: $('roster'), pips: $('wave-pips'),
  btnWire: $('btn-wire'), btnMg: $('btn-mg'), btnCancel: $('btn-cancel'),
  btnWave: $('btn-wave'), btnPause: $('btn-pause'), btnMute: $('btn-mute'),
  results: $('results-screen'), resultsTitle: $('results-title'),
  resultsBody: $('results-body'), resultsStamp: $('results-stamp'),
  btnContinue: $('btn-continue'),
  end: $('end-screen'), endKicker: $('end-kicker'), endTitle: $('end-title'), endBody: $('end-body'),
  pauseVeil: $('pause-veil'),
};

function addLog(text, warn = false, tag = 'HQ') {
  const div = document.createElement('div');
  div.className = 'log-line' + (warn ? ' log-warn' : '');
  div.innerHTML = `<span class="log-tag">${tag} //</span>${text}`;
  ui.log.appendChild(div);
  while (ui.log.children.length > 40) ui.log.removeChild(ui.log.firstChild);
  ui.log.scrollTop = ui.log.scrollHeight;
}

function buildRoster() {
  ui.roster.innerHTML = '';
  G.soldiers.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'trooper';
    el.innerHTML = `<div class="trooper-dot"></div>
      <div class="trooper-info">
        <div class="trooper-name">${s.name}</div>
        <div class="hp-bar"><div class="hp-fill"></div></div>
        <div class="trooper-status">READY</div>
      </div>`;
    el.addEventListener('click', () => { if (!s.dead) selectSoldier(s); });
    ui.roster.appendChild(el);
    s.card = {
      root: el,
      hp: el.querySelector('.hp-fill'),
      status: el.querySelector('.trooper-status'),
    };
  });
}

function updateRoster() {
  for (const s of G.soldiers) {
    const pct = Math.max(0, s.hp) / SOLDIER.hp * 100;
    s.card.hp.style.width = pct + '%';
    s.card.hp.classList.toggle('low', s.hp < 35);
    s.card.root.classList.toggle('selected', G.selected === s);
    s.card.root.classList.toggle('dead', s.dead);
    let st = 'READY';
    if (s.dead) st = 'KILLED IN ACTION';
    else if (s.moveTarget) st = 'MOVING';
    else if (s.manningMg) st = 'ON THE GUN';
    else if (s.firing > 0) st = 'FIRING';
    else if (s.hp < 35) st = 'WOUNDED';
    s.card.status.textContent = st;
  }
}

function updateHUD() {
  ui.wave.textContent = G.state === 'MENU' ? '—' : `${Math.min(G.wave + 1, 5)} / 5`;
  ui.supplies.textContent = G.supplies;
  const left = BALANCE.maxBreaches - G.breaches;
  ui.breach.textContent = '●'.repeat(left) + '○'.repeat(G.breaches);
  ui.breach.classList.toggle('danger', left <= 2);
  ui.btnWire.disabled = G.supplies < BALANCE.wireCost;
  ui.btnMg.disabled = !!G.mgNest || G.supplies < BALANCE.mgCost;
  ui.btnMg.querySelector('.build-cost').textContent = G.mgNest ? 'EMPLACED' : `${BALANCE.mgCost} SUPPLIES`;
  // wave pips
  ui.pips.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const p = document.createElement('div');
    p.className = 'pip' + (i < G.wave ? ' done' : (i === G.wave && G.state === 'WAVE' ? ' now' : ''));
    ui.pips.appendChild(p);
  }
}

/* =========================================================================
   ENTITIES
   ========================================================================= */
function makeSoldiers() {
  G.soldiers = CALLSIGNS.map((name, i) => ({
    name, x: 210 + i * 160, y: 585,
    hp: SOLDIER.hp, dead: false,
    moveTarget: null, cooldown: Math.random() * 0.5,
    firing: 0, manningMg: false, facing: -Math.PI / 2,
  }));
}

function spawnEnemy(type, x) {
  const t = ENEMY_TYPES[type];
  G.enemies.push({
    type, ...t, maxHp: t.hp,
    x: x !== undefined ? x : 70 + Math.random() * (W - 140),
    y: ENEMY_LINE - 20 - Math.random() * 30,
    wobble: Math.random() * Math.PI * 2,
    meleeT: 0, victim: null, reload: 2 + Math.random() * 2,
    dead: false, breached: false,
  });
  if (type === 'tank') {
    addLog('ARMOUR SIGHTED. All guns on the tank!', true, 'LOOKOUT');
    Sfx.boom(0.6);
    G.shake = Math.max(G.shake, 0.4);
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function nearestLivingSoldier(from, maxD = Infinity) {
  let best = null, bd = maxD;
  for (const s of G.soldiers) {
    if (s.dead) continue;
    const d = dist(from, s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function nearestEnemy(from, maxD) {
  let best = null, bd = maxD;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist(from, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function damageEnemy(e, dmg) {
  e.hp -= dmg;
  // dt-scaled chip damage (wire) only puffs occasionally, or it floods particles
  if (dmg >= 1 || Math.random() < 0.04) puff(e.x, e.y, e.type === 'tank' ? '#888578' : '#5e2f26', 3);
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    G.killsWave++; G.killsTotal++;
    G.earnWave += e.reward;
    stain(e.x, e.y, e.type === 'tank' ? 16 : 7);
    if (e.type === 'tank') {
      explode(e.x, e.y, 40, 0);
      addLog('Tank destroyed. Beautiful work.', false, 'LOOKOUT');
    }
  }
}

function damageSoldier(s, dmg) {
  if (s.dead) return;
  s.hp -= dmg;
  puff(s.x, s.y, '#6e2b22', 4);
  Sfx.thud();
  G.dangerFlash = Math.max(G.dangerFlash, 0.35);
  if (s.hp <= 0) {
    s.dead = true; s.moveTarget = null;
    if (G.selected === s) G.selected = null;
    stain(s.x, s.y, 8);
    addLog(`${s.name} is down.`, true, 'SECTION');
    if (G.soldiers.every(x => x.dead)) defeat('men');
  } else if (s.hp < 35 && s.hp + dmg >= 35) {
    addLog(`${s.name} is wounded and slowing.`, true, 'SECTION');
  }
}

function breach(e) {
  e.breached = true; e.dead = true;
  G.breaches++;
  G.shake = Math.max(G.shake, 0.35);
  G.dangerFlash = Math.max(G.dangerFlash, 0.7);
  Sfx.boom(0.5);
  addLog('They are through the line! Integrity failing.', true, 'LOOKOUT');
  updateHUD();
  if (G.breaches >= BALANCE.maxBreaches) defeat('line');
}

/* =========================================================================
   PARTICLES / EFFECTS
   ========================================================================= */
function puff(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 - 10,
      life: 0.4 + Math.random() * 0.3, max: 0.7, size: 2 + Math.random() * 3, color,
    });
  }
}
function smoke(x, y, n, big = 1) {
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x: x + (Math.random() - 0.5) * 14, y,
      vx: (Math.random() - 0.5) * 18, vy: -12 - Math.random() * 16,
      life: 1.2 + Math.random() * 1.2, max: 2.4,
      size: (5 + Math.random() * 9) * big, color: 'smoke',
    });
  }
}
function flash(x, y, ang) {
  G.particles.push({ x: x + Math.cos(ang) * 10, y: y + Math.sin(ang) * 10, vx: 0, vy: 0, life: 0.06, max: 0.06, size: 6, color: '#ffd98a' });
}
function explode(x, y, radius, dmgToSoldiers) {
  Sfx.boom(1);
  G.shake = Math.max(G.shake, 0.5);
  smoke(x, y, 10, 1.6);
  puff(x, y, '#c8b46a', 8);
  crater(x, y, radius * 0.5);
  if (dmgToSoldiers > 0) {
    for (const s of G.soldiers) {
      if (!s.dead && Math.hypot(s.x - x, s.y - y) < radius) damageSoldier(s, dmgToSoldiers);
    }
  }
}

/* Persistent ground scars drawn onto an offscreen layer */
let scarCanvas, scarCtx;
function crater(x, y, r) {
  const c = scarCtx;
  const g = c.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, 'rgba(18,15,9,.85)');
  g.addColorStop(0.7, 'rgba(30,26,16,.5)');
  g.addColorStop(1, 'rgba(30,26,16,0)');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
}
function stain(x, y, r) {
  scarCtx.fillStyle = 'rgba(48,22,16,.5)';
  scarCtx.beginPath();
  scarCtx.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, 7);
  scarCtx.fill();
}

/* =========================================================================
   GROUND (pre-rendered once)
   ========================================================================= */
let groundCanvas;
function renderGround() {
  groundCanvas = document.createElement('canvas');
  groundCanvas.width = W; groundCanvas.height = H;
  const c = groundCanvas.getContext('2d');

  // mud base
  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#2b271a');
  grad.addColorStop(0.5, '#3a3423');
  grad.addColorStop(1, '#332d1e');
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);

  // mottling
  for (let i = 0; i < 320; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(20,17,10,.10)' : 'rgba(90,80,52,.07)';
    c.beginPath();
    c.ellipse(Math.random() * W, Math.random() * H, 6 + Math.random() * 26, 4 + Math.random() * 14, Math.random() * 3, 0, 7);
    c.fill();
  }
  // old craters in no man's land
  for (let i = 0; i < 14; i++) {
    const x = 40 + Math.random() * (W - 80), y = 130 + Math.random() * 340, r = 12 + Math.random() * 22;
    const g = c.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(16,13,8,.8)');
    g.addColorStop(1, 'rgba(16,13,8,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.strokeStyle = 'rgba(105,92,58,.35)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, r * 0.7, Math.random() * 3, Math.random() * 3 + 2.5); c.stroke();
  }

  // ---- enemy trench (top) ----
  c.fillStyle = '#1d1910';
  c.fillRect(0, 0, W, ENEMY_LINE);
  sandbagRow(c, ENEMY_LINE - 4, '#4a4231', '#3c3627');
  // enemy wire line
  c.strokeStyle = '#494438';
  c.lineWidth = 1.5;
  for (const yy of [96, 104]) {
    c.beginPath();
    for (let x = 0; x <= W; x += 12) c.lineTo(x, yy + (x % 24 === 0 ? -4 : 4));
    c.stroke();
  }
  for (let x = 20; x < W; x += 60) { // posts
    c.strokeStyle = '#3a352a';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(x, 90); c.lineTo(x, 110); c.stroke();
  }

  // ---- player trench (bottom) ----
  c.fillStyle = '#221d12';
  c.fillRect(0, TRENCH_TOP, W, H - TRENCH_TOP);
  // duckboards
  c.strokeStyle = 'rgba(94,78,48,.5)';
  c.lineWidth = 2;
  for (let x = 8; x < W; x += 26) {
    c.beginPath(); c.moveTo(x, TRENCH_TOP + 22); c.lineTo(x - 4, TRENCH_BOT + 14); c.stroke();
  }
  c.strokeStyle = 'rgba(50,42,26,.8)';
  for (const yy of [TRENCH_TOP + 20, TRENCH_BOT + 16]) {
    c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke();
  }
  // parapet sandbags — "the bags"
  sandbagRow(c, TRENCH_TOP - 10, '#6b5d40', '#574c34');
  sandbagRow(c, TRENCH_TOP + 1, '#5d5138', '#4a4230');
  // rear lip
  sandbagRow(c, TRENCH_BOT + 20, '#4a4231', '#3c3627');

  // shell streaks
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * W, y = 150 + Math.random() * 300;
    c.strokeStyle = 'rgba(22,18,11,.4)';
    c.lineWidth = 2 + Math.random() * 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 60, y + 20 + Math.random() * 30); c.stroke();
  }

  // scar layer (persistent battle damage)
  scarCanvas = document.createElement('canvas');
  scarCanvas.width = W; scarCanvas.height = H;
  scarCtx = scarCanvas.getContext('2d');
}

function sandbagRow(c, y, light, dark) {
  for (let x = -6; x < W; x += 22) {
    const off = (Math.floor(x / 22) % 2) * 6;
    c.fillStyle = (Math.floor(x / 22) % 2) ? light : dark;
    c.strokeStyle = 'rgba(15,12,7,.7)';
    c.lineWidth = 1;
    roundRect(c, x + off, y - 5, 21, 11, 5);
    c.fill(); c.stroke();
  }
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* =========================================================================
   GAME FLOW
   ========================================================================= */
function startGame() {
  ui.menu.classList.remove('visible');
  ui.root.hidden = false;
  makeSoldiers();
  buildRoster();
  renderGround();
  // ambient drifting smoke
  G.ambientSmoke = Array.from({ length: 6 }, () => ({
    x: Math.random() * W, y: 130 + Math.random() * 340,
    vx: 4 + Math.random() * 8, size: 60 + Math.random() * 80, a: 0.04 + Math.random() * 0.04,
  }));
  addLog('Section, this is your trench now. Four men. Hold it.');
  addLog('Click a soldier, then click ground in the trench to move him. String wire out front. Begin the assault when ready.', false, 'ADJUTANT');
  enterPrep();
}

function enterPrep() {
  G.state = 'PREP';
  Music.play(G.wave === 4 ? 'anthem' : 'prep');
  addLog(PRE_WAVE_MSG[G.wave], G.wave >= 2);
  ui.btnWave.disabled = false;
  ui.btnWave.textContent = G.wave === 4 ? 'STAND TO — FINAL ASSAULT' : 'STAND TO — BEGIN ASSAULT';
  ui.btnWave.classList.add('hot');
  updateHUD();
}

function startWave() {
  if (G.state !== 'PREP') return;
  G.state = 'WAVE';
  G.waveT = 0; G.killsWave = 0; G.earnWave = 0;
  cancelPlacement();
  // build spawn queue: each burst is a squad advancing in a rough line
  G.spawnQueue = [];
  for (const g of WAVES[G.wave].groups) {
    const bursts = Math.ceil(g.n / g.burst);
    for (let b = 0; b < bursts; b++) {
      const inBurst = Math.min(g.burst, g.n - b * g.burst);
      const center = 130 + Math.random() * (W - 260);
      for (let i = 0; i < inBurst; i++) {
        const x = Math.max(50, Math.min(W - 50,
          center + (i - (inBurst - 1) / 2) * 44 + (Math.random() - 0.5) * 20));
        G.spawnQueue.push({ t: g.start + b * g.gap + Math.random() * 0.6, type: g.type, x });
      }
    }
  }
  G.spawnQueue.sort((a, b) => a.t - b.t);
  Music.play(G.wave === 4 ? 'armor' : 'battle');
  Sfx.whistle();
  addLog(`Assault ${G.wave + 1} beginning. Stand to!`, true, 'LOOKOUT');
  ui.btnWave.disabled = true;
  ui.btnWave.textContent = 'ASSAULT IN PROGRESS';
  ui.btnWave.classList.remove('hot');
  updateHUD();
}

function endWave() {
  G.shells.length = 0; // don't let a frozen shell detonate next wave
  const reward = BALANCE.waveReward[G.wave] + G.earnWave;
  G.supplies += reward;
  const standing = G.soldiers.filter(s => !s.dead).length;
  G.state = 'RESULTS';
  updateHUD();

  const last = G.wave === 4;
  ui.resultsStamp.textContent = last ? 'FINAL DISPATCH' : 'LINE HELD';
  ui.resultsTitle.textContent = last ? 'ALL ASSAULTS REPULSED' : `ASSAULT ${G.wave + 1} REPULSED`;
  ui.resultsBody.innerHTML = `
    <div class="tally"><span>Enemy destroyed</span><b>${G.killsWave}</b></div>
    <div class="tally"><span>Supplies authorized</span><b>+${reward}</b></div>
    <div class="tally"><span>Men standing</span><b>${standing} / 4</b></div>
    <div class="tally"><span>Line integrity</span><b>${BALANCE.maxBreaches - G.breaches} / ${BALANCE.maxBreaches}</b></div>
    <p style="margin-top:12px">${last
      ? 'The enemy line is broken. The whistle is in your hand, commander. Take the men over the bags.'
      : POST_WAVE_MSG[G.wave]}</p>`;
  ui.btnContinue.textContent = last ? 'OVER THE BAGS' : 'RETURN TO POSITIONS';
  ui.results.classList.add('visible');
  if (!last) addLog(POST_WAVE_MSG[G.wave]);
}

function continueFromResults() {
  ui.results.classList.remove('visible');
  if (G.wave === 4) { startCharge(); return; }
  G.wave++;
  enterPrep();
}

function startCharge() {
  G.state = 'CHARGE';
  G.chargeT = 0;
  Music.play('anthem');
  Sfx.whistle();
  addLog('OVER THE BAGS! CHARGE!', true, 'YOU');
  for (const s of G.soldiers) { s.moveTarget = null; s.manningMg = false; }
}

function defeat(reason) {
  if (G.state === 'END') return;
  G.state = 'END';
  Music.play('menu');
  ui.endKicker.textContent = 'SECTOR 7 · NIGHTFALL';
  ui.endTitle.textContent = 'THE LINE IS LOST';
  ui.endBody.innerHTML = reason === 'men'
    ? '<p>The last rifle has fallen silent. The trench belongs to them now.</p><p>Command will raise another section. It will not be the same.</p>'
    : '<p>Too many broke through. The line collapsed behind you, and the order came to fall back.</p><p>The trench belongs to them now.</p>';
  ui.end.classList.add('visible');
}

function victory() {
  G.state = 'END';
  ui.endKicker.textContent = 'SECTOR 7 · DAWN';
  ui.endTitle.textContent = 'OVER THE BAGS';
  ui.endBody.innerHTML =
    '<p>The whistle blew and the section went up the ladders, through the smoke, across the wire — and the enemy trench was yours before the sun cleared the mud.</p>' +
    '<p>The trench was held. The push begins. Somewhere behind the lines, a division is forming — armour, recon wings, supply convoys — and they will need commanders.</p>' +
    '<p><em>This was Sector 7. The war is wider than this.</em></p>';
  ui.end.classList.add('visible');
}

/* =========================================================================
   PLACEMENT & ORDERS
   ========================================================================= */
function selectSoldier(s) {
  cancelPlacement();
  G.selected = s;
  Sfx.click();
}

function beginPlacement(kind) {
  const cost = kind === 'wire' ? BALANCE.wireCost : BALANCE.mgCost;
  if (G.supplies < cost || (kind === 'mg' && G.mgNest)) {
    addLog('HQ denies the requisition — insufficient supplies.', true);
    return;
  }
  G.placing = kind;
  G.selected = null;
  ui.btnWire.classList.toggle('active', kind === 'wire');
  ui.btnMg.classList.toggle('active', kind === 'mg');
  ui.btnCancel.hidden = false;
}

function cancelPlacement() {
  G.placing = null;
  ui.btnWire.classList.remove('active');
  ui.btnMg.classList.remove('active');
  ui.btnCancel.hidden = true;
}

function placementValid(kind, x, y) {
  if (kind === 'wire') {
    if (y < WIRE_ZONE.top || y > WIRE_ZONE.bot || x < 50 || x > W - 50) return false;
    return !G.wires.some(w => Math.abs(w.x - x) < 85 && Math.abs(w.y - y) < 22);
  }
  return y > TRENCH_TOP + 10 && y < TRENCH_BOT && x > 40 && x < W - 40;
}

function tryPlace(x, y) {
  const kind = G.placing;
  if (!placementValid(kind, x, y)) {
    G.invalidFlash = { x, y, t: 0.5 };
    return;
  }
  if (kind === 'wire') {
    G.supplies -= BALANCE.wireCost;
    G.wires.push({ x, y, w: 90, h: 16, hp: 50, maxHp: 50 });
    addLog('Wire strung.', false, 'SECTION');
  } else {
    G.supplies -= BALANCE.mgCost;
    G.mgNest = { x, y, cooldown: 0, manned: false, target: null, ang: -Math.PI / 2, shots: 0 };
    addLog('Gun emplaced. Keep a man beside it or it stays silent.', false, 'SECTION');
    cancelPlacement();
  }
  Sfx.build();
  smoke(x, y, 3);
  if (G.placing === 'wire' && G.supplies < BALANCE.wireCost) cancelPlacement();
  updateHUD();
}

function orderMove(x, y) {
  const s = G.selected;
  if (!s || s.dead) return;
  if (y < TRENCH_TOP + 6 || y > TRENCH_BOT || x < 25 || x > W - 25) {
    G.invalidFlash = { x, y, t: 0.5 };
    return;
  }
  s.moveTarget = { x, y };
  G.moveMark = { x, y, t: 0.8 };
  Sfx.click();
}

/* =========================================================================
   UPDATE
   ========================================================================= */
function update(dt) {
  // ambient smoke always drifts
  for (const s of G.ambientSmoke) {
    s.x += s.vx * dt;
    if (s.x - s.size > W) { s.x = -s.size; s.y = 130 + Math.random() * 340; }
  }
  if (G.invalidFlash) { G.invalidFlash.t -= dt; if (G.invalidFlash.t <= 0) G.invalidFlash = null; }
  if (G.moveMark) { G.moveMark.t -= dt; if (G.moveMark.t <= 0) G.moveMark = null; }
  G.shake = Math.max(0, G.shake - dt * 1.2);
  G.dangerFlash = Math.max(0, G.dangerFlash - dt);

  updateParticles(dt);
  updateTracers(dt);

  if (G.state === 'CHARGE') { updateCharge(dt); return; }
  if (G.state !== 'WAVE' && G.state !== 'PREP') return;

  updateSoldiers(dt);

  if (G.state !== 'WAVE') return;
  G.waveT += dt;

  // spawns
  while (G.spawnQueue.length && G.spawnQueue[0].t <= G.waveT) {
    const s = G.spawnQueue.shift();
    spawnEnemy(s.type, s.x);
  }

  updateEnemies(dt);
  updateMg(dt);
  updateShells(dt);

  // distant artillery ambience
  G.ambientT -= dt;
  if (G.ambientT <= 0) {
    G.ambientT = 5 + Math.random() * 6;
    const x = Math.random() * W;
    smoke(x, 30 + Math.random() * 50, 5, 1.4);
    Sfx.noise(0.5, 200, 0.6, 0.12, 'lowpass');
  }

  // wave cleared?
  if (!G.spawnQueue.length && G.enemies.every(e => e.dead) && G.state === 'WAVE') {
    endWave();
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

function updateSoldiers(dt) {
  for (const s of G.soldiers) {
    if (s.dead) continue;
    s.firing = Math.max(0, s.firing - dt);
    const wounded = s.hp < 35;

    // movement
    if (s.moveTarget) {
      const d = dist(s, s.moveTarget);
      const spd = SOLDIER.speed * (wounded ? 0.6 : 1);
      if (d < 4) s.moveTarget = null;
      else {
        s.x += (s.moveTarget.x - s.x) / d * spd * dt;
        s.y += (s.moveTarget.y - s.y) / d * spd * dt;
      }
    }

    s.manningMg = !!(G.mgNest && dist(s, G.mgNest) < MG.manRadius);

    // firing
    s.cooldown -= dt;
    if (G.state === 'WAVE' && s.cooldown <= 0) {
      const target = nearestEnemy(s, SOLDIER.range);
      if (target) {
        s.cooldown = SOLDIER.fireRate * (wounded ? 1.5 : 1);
        s.firing = 0.3;
        s.facing = Math.atan2(target.y - s.y, target.x - s.x);
        G.tracers.push({ x1: s.x, y1: s.y - 4, x2: target.x, y2: target.y, life: 0.08 });
        flash(s.x, s.y - 4, s.facing);
        Sfx.rifle();
        damageEnemy(target, SOLDIER.dmg);
      }
    }
  }
}

function updateMg(dt) {
  const mg = G.mgNest;
  if (!mg) return;
  mg.manned = G.soldiers.some(s => !s.dead && s.manningMg);
  mg.cooldown -= dt;
  if (!mg.manned) return;
  const target = nearestEnemy(mg, MG.range);
  if (!target) return;
  mg.ang = Math.atan2(target.y - mg.y, target.x - mg.x);
  if (mg.cooldown <= 0) {
    mg.cooldown = MG.fireRate;
    mg.shots++;
    const sx = target.x + (Math.random() - 0.5) * 14;
    const sy = target.y + (Math.random() - 0.5) * 14;
    G.tracers.push({ x1: mg.x, y1: mg.y - 6, x2: sx, y2: sy, life: 0.06, mg: true });
    flash(mg.x, mg.y - 6, mg.ang);
    if (mg.shots % 2 === 0) Sfx.mg();
    damageEnemy(target, MG.dmg);
  }
}

function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.wobble += dt * 3;

    // wire check
    let speedMult = 1;
    for (const w of G.wires) {
      if (w.hp <= 0) continue;
      if (Math.abs(e.x - w.x) < w.w / 2 + e.r && Math.abs(e.y - w.y) < w.h / 2 + e.r) {
        speedMult = Math.min(speedMult, e.wireSlow);
        if (e.type === 'tank') { w.hp -= 60 * dt; } // crushed under treads
        else { damageEnemy(e, 4 * dt); w.hp -= 2 * dt; }
        if (w.hp <= 0) puff(w.x, w.y, '#4a4438', 5);
      }
    }
    G.wires = G.wires.filter(w => w.hp > 0);

    if (e.type === 'tank') { updateTank(e, dt, speedMult); continue; }

    // melee if at the trench
    if (e.y >= TRENCH_TOP - 8) {
      if (!e.victim || e.victim.dead) e.victim = nearestLivingSoldier(e, 380);
      if (e.victim) {
        const d = dist(e, e.victim);
        if (d > e.r + 12) {
          e.x += (e.victim.x - e.x) / d * e.speed * 1.2 * dt;
          e.y += (e.victim.y - e.y) / d * e.speed * 1.2 * dt;
        } else {
          e.meleeT -= dt;
          if (e.meleeT <= 0) {
            e.meleeT = e.hitRate;
            damageSoldier(e.victim, e.dmg);
          }
        }
        continue;
      }
      // nobody nearby to fight — push through
    }
    e.y += e.speed * speedMult * dt;
    e.x += Math.sin(e.wobble) * 6 * dt;
    if (e.y > BREACH_Y) breach(e);
  }
}

function updateTank(e, dt, speedMult) {
  e.y += e.speed * speedMult * dt;
  if (e.y > TRENCH_BOT) { breach(e); explode(e.x, e.y, 30, 0); return; }
  e.reload -= dt;
  const target = nearestLivingSoldier(e, 330);
  if (target && e.reload <= 0) {
    e.reload = 4;
    Sfx.boom(0.5);
    G.shake = Math.max(G.shake, 0.25);
    flash(e.x, e.y + 14, Math.PI / 2);
    G.shells.push({
      x: e.x, y: e.y + 10,
      tx: target.x + (Math.random() - 0.5) * 30, ty: target.y + (Math.random() - 0.5) * 20,
      t: 0, dur: 0.9,
    });
  }
}

function updateShells(dt) {
  for (const sh of G.shells) {
    sh.t += dt;
    if (sh.t >= sh.dur) {
      sh.done = true;
      explode(sh.tx, sh.ty, 48, 24);
    }
  }
  G.shells = G.shells.filter(s => !s.done);
}

function updateParticles(dt) {
  for (const p of G.particles) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.color === 'smoke') { p.vx *= 0.99; p.size += 8 * dt; }
  }
  G.particles = G.particles.filter(p => p.life > 0);
}
function updateTracers(dt) {
  for (const t of G.tracers) t.life -= dt;
  G.tracers = G.tracers.filter(t => t.life > 0);
}

function updateCharge(dt) {
  G.chargeT += dt;
  for (const s of G.soldiers) {
    if (s.dead) continue;
    s.y -= 70 * dt;
    if (Math.random() < dt * 2) {
      flash(s.x, s.y - 4, -Math.PI / 2);
      G.tracers.push({ x1: s.x, y1: s.y - 4, x2: s.x + (Math.random() - 0.5) * 60, y2: s.y - 200 - Math.random() * 100, life: 0.07 });
      Sfx.rifle();
    }
    if (Math.random() < dt * 3) smoke(s.x + (Math.random() - 0.5) * 40, s.y - 20, 1, 1.2);
  }
  if (Math.random() < dt * 1.5) {
    const x = Math.random() * W;
    smoke(x, 40 + Math.random() * 100, 4, 1.5);
    Sfx.boom(0.3);
    G.shake = Math.max(G.shake, 0.15);
  }
  if (G.chargeT > 4.5) victory();
}

/* =========================================================================
   RENDER
   ========================================================================= */
function render() {
  ctx.save();
  if (G.shake > 0) {
    ctx.translate((Math.random() - 0.5) * G.shake * 16, (Math.random() - 0.5) * G.shake * 16);
  }
  ctx.drawImage(groundCanvas, 0, 0);
  ctx.drawImage(scarCanvas, 0, 0);

  drawPlacementZones();
  drawWires();
  drawMg();
  drawAmbientSmoke();
  drawEnemies();
  drawSoldiers();
  drawShells();
  drawTracers();
  drawParticles();
  drawMarkers();
  drawGhost();
  ctx.restore();

  if (G.dangerFlash > 0) {
    const a = Math.min(0.4, G.dangerFlash);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(140,20,10,0)');
    g.addColorStop(1, `rgba(140,20,10,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawPlacementZones() {
  if (!G.placing) return;
  ctx.fillStyle = 'rgba(201,162,75,.08)';
  ctx.strokeStyle = 'rgba(201,162,75,.35)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1;
  if (G.placing === 'wire') {
    ctx.fillRect(50, WIRE_ZONE.top, W - 100, WIRE_ZONE.bot - WIRE_ZONE.top);
    ctx.strokeRect(50, WIRE_ZONE.top, W - 100, WIRE_ZONE.bot - WIRE_ZONE.top);
  } else {
    ctx.fillRect(40, TRENCH_TOP + 10, W - 80, TRENCH_BOT - TRENCH_TOP - 10);
    ctx.strokeRect(40, TRENCH_TOP + 10, W - 80, TRENCH_BOT - TRENCH_TOP - 10);
  }
  ctx.setLineDash([]);
}

function drawWireSprite(x, y, w, frac) {
  // posts
  ctx.strokeStyle = '#4d4636';
  ctx.lineWidth = 3;
  for (const px of [x - w / 2, x, x + w / 2]) {
    ctx.beginPath(); ctx.moveTo(px, y - 8); ctx.lineTo(px, y + 8); ctx.stroke();
  }
  // strands (fewer as it wears)
  ctx.strokeStyle = '#6a6252';
  ctx.lineWidth = 1.4;
  const strands = frac > 0.66 ? 3 : frac > 0.33 ? 2 : 1;
  for (let s = 0; s < strands; s++) {
    const yy = y - 5 + s * 5;
    ctx.beginPath();
    for (let px = x - w / 2; px <= x + w / 2; px += 8)
      ctx.lineTo(px, yy + ((px / 8) % 2 ? -2.5 : 2.5));
    ctx.stroke();
  }
}
function drawWires() {
  for (const w of G.wires) drawWireSprite(w.x, w.y, w.w, w.hp / w.maxHp);
}

function drawMg() {
  const mg = G.mgNest;
  if (!mg) return;
  // sandbag ring
  ctx.fillStyle = '#574c34';
  ctx.strokeStyle = 'rgba(15,12,7,.7)';
  for (let a = Math.PI * 0.15; a < Math.PI * 0.85; a += 0.5) {
    const bx = mg.x + Math.cos(a + Math.PI) * 18, by = mg.y + Math.sin(a + Math.PI) * 14;
    roundRect(ctx, bx - 8, by - 4, 16, 9, 4);
    ctx.fill(); ctx.stroke();
  }
  // gun
  ctx.save();
  ctx.translate(mg.x, mg.y - 4);
  ctx.rotate(mg.ang);
  ctx.fillStyle = '#22201a';
  ctx.fillRect(0, -2.5, 22, 5);
  ctx.fillRect(-6, -5, 10, 10);
  ctx.restore();
  // manned indicator
  if (!mg.manned) {
    ctx.fillStyle = 'rgba(163,60,46,.9)';
    ctx.font = '10px Staatliches, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('UNMANNED', mg.x, mg.y + 24);
  }
}

function drawAmbientSmoke() {
  for (const s of G.ambientSmoke) {
    const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.size);
    g.addColorStop(0, `rgba(120,110,88,${s.a})`);
    g.addColorStop(1, 'rgba(120,110,88,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, 7); ctx.fill();
  }
}

function drawHpBar(x, y, w, frac, color = '#7d8a4a') {
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(x - w / 2, y, w, 3);
  ctx.fillStyle = frac < 0.35 ? '#a33c2e' : color;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), 3);
}

function unitShadow(x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.7, r * 1.1, r * 0.45, 0, 0, 7); ctx.fill();
}

function drawSoldiers() {
  for (const s of G.soldiers) {
    if (s.dead) {
      // grave cross
      ctx.strokeStyle = '#4d4636';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 9); ctx.lineTo(s.x, s.y + 7);
      ctx.moveTo(s.x - 6, s.y - 3); ctx.lineTo(s.x + 6, s.y - 3);
      ctx.stroke();
      continue;
    }
    const sel = G.selected === s;
    if (sel) {
      // range ring
      ctx.strokeStyle = 'rgba(201,162,75,.25)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, SOLDIER.range, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#c9a24b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, 7); ctx.stroke();
    }
    unitShadow(s.x, s.y, 8);
    // body
    ctx.fillStyle = s.hp < 35 ? '#797a50' : '#8a8c60';
    ctx.strokeStyle = '#22221a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, 7); ctx.fill(); ctx.stroke();
    // helmet
    ctx.fillStyle = '#a3a476';
    ctx.beginPath(); ctx.ellipse(s.x, s.y - 3, 6.5, 4.5, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(240,235,200,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(s.x, s.y - 3.5, 5.5, 3.5, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    // rifle
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.facing);
    ctx.strokeStyle = '#3a3226';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(15, 3); ctx.stroke();
    ctx.restore();
    if (s.hp < SOLDIER.hp) drawHpBar(s.x, s.y - 16, 22, s.hp / SOLDIER.hp);
    if (s.manningMg) {
      ctx.fillStyle = 'rgba(201,162,75,.9)';
      ctx.font = '9px Staatliches, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MG', s.x, s.y + 18);
    }
  }
}

function drawEnemies() {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.type === 'tank') {
      ctx.save();
      ctx.translate(e.x, e.y);
      // treads
      ctx.fillStyle = '#26241c';
      ctx.fillRect(-19, -24, 8, 48);
      ctx.fillRect(11, -24, 8, 48);
      // hull
      ctx.fillStyle = '#4b4a3a';
      ctx.strokeStyle = '#1c1b14';
      ctx.lineWidth = 2;
      ctx.fillRect(-13, -20, 26, 40);
      ctx.strokeRect(-13, -20, 26, 40);
      // turret + barrel
      ctx.fillStyle = '#3d3c2f';
      ctx.beginPath(); ctx.arc(0, -2, 9, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#26241c';
      ctx.fillRect(-2.5, 2, 5, 22);
      ctx.restore();
      drawHpBar(e.x, e.y - 32, 40, e.hp / e.maxHp, '#a33c2e');
      continue;
    }
    const bob = Math.sin(e.wobble * 2) * 1.5;
    const ex = e.x + bob * 0.3;
    unitShadow(ex, e.y, e.r);
    const colors = { infantry: '#77685c', raider: '#8a7a63', heavy: '#5e564a' };
    ctx.fillStyle = colors[e.type];
    ctx.strokeStyle = '#14110c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, e.y, e.r, 0, 7); ctx.fill(); ctx.stroke();
    // helmet (pointed enemy silhouette, catches light)
    ctx.fillStyle = '#48413a';
    ctx.beginPath();
    ctx.ellipse(ex, e.y + 3, e.r * 0.72, e.r * 0.48, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,185,150,.25)';
    ctx.beginPath(); ctx.arc(ex - e.r * 0.3, e.y - e.r * 0.35, e.r * 0.3, 0, 7); ctx.fill();
    if (e.type === 'heavy') { // armor plate
      ctx.strokeStyle = '#8c8170';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ex, e.y, e.r - 3, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    if (e.type === 'raider') { // motion dashes
      ctx.strokeStyle = 'rgba(150,132,105,.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex - 12, e.y - 6); ctx.lineTo(ex - 5, e.y - 6);
      ctx.moveTo(ex - 11, e.y - 1); ctx.lineTo(ex - 5, e.y - 1); ctx.stroke();
    }
    if (e.hp < e.maxHp) drawHpBar(e.x, e.y - e.r - 8, e.r * 2.2, e.hp / e.maxHp, '#a33c2e');
  }
}

function drawShells() {
  for (const sh of G.shells) {
    const f = sh.t / sh.dur;
    const x = sh.x + (sh.tx - sh.x) * f;
    const y = sh.y + (sh.ty - sh.y) * f - Math.sin(f * Math.PI) * 60;
    // target marker
    ctx.strokeStyle = `rgba(163,60,46,${0.4 + f * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sh.tx, sh.ty, 10 * (1 - f * 0.5), 0, 7); ctx.stroke();
    // shell
    ctx.fillStyle = '#26241c';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
  }
}

function drawTracers() {
  for (const t of G.tracers) {
    ctx.strokeStyle = t.mg ? 'rgba(255,200,120,.95)' : 'rgba(255,230,170,.85)';
    ctx.lineWidth = t.mg ? 2.2 : 1.6;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
}

function drawParticles() {
  for (const p of G.particles) {
    const a = Math.max(0, p.life / p.max);
    if (p.color === 'smoke') {
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size);
      g.addColorStop(0, `rgba(140,130,105,${a * 0.35})`);
      g.addColorStop(1, 'rgba(140,130,105,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawMarkers() {
  if (G.moveMark) {
    const a = G.moveMark.t / 0.8;
    ctx.strokeStyle = `rgba(201,162,75,${a})`;
    ctx.lineWidth = 2;
    const r = 6 + (1 - a) * 10;
    ctx.beginPath(); ctx.arc(G.moveMark.x, G.moveMark.y, r, 0, 7); ctx.stroke();
  }
  if (G.invalidFlash) {
    const a = G.invalidFlash.t / 0.5;
    const { x, y } = G.invalidFlash;
    ctx.strokeStyle = `rgba(163,60,46,${a})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7);
    ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7);
    ctx.stroke();
  }
}

function drawGhost() {
  if (!G.placing || !G.mouse.inField) return;
  const { x, y } = G.mouse;
  const ok = placementValid(G.placing, x, y);
  ctx.globalAlpha = 0.6;
  if (G.placing === 'wire') {
    drawWireSprite(x, y, 90, 1);
  } else {
    ctx.fillStyle = '#574c34';
    ctx.beginPath(); ctx.arc(x, y, 16, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#22201a';
    ctx.fillRect(x - 2, y - 14, 4, 14);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ok ? 'rgba(125,138,74,.9)' : 'rgba(163,60,46,.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
}

/* =========================================================================
   INPUT
   ========================================================================= */
function fieldCoords(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) * (W / r.width),
    y: (ev.clientY - r.top) * (H / r.height),
  };
}

canvas.addEventListener('mousemove', ev => {
  const p = fieldCoords(ev);
  G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.inField = true;
});
canvas.addEventListener('mouseleave', () => { G.mouse.inField = false; });

canvas.addEventListener('click', ev => {
  if (G.state !== 'PREP' && G.state !== 'WAVE') return;
  if (G.paused) return;
  const p = fieldCoords(ev);
  if (G.placing) { tryPlace(p.x, p.y); return; }
  // pick a soldier?
  let pick = null, bd = 20;
  for (const s of G.soldiers) {
    if (s.dead) continue;
    const d = dist(p, s);
    if (d < bd) { bd = d; pick = s; }
  }
  if (pick) { selectSoldier(pick); return; }
  if (G.selected) orderMove(p.x, p.y);
});

canvas.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  if (G.placing) cancelPlacement();
  else G.selected = null;
});

document.addEventListener('keydown', ev => {
  if (G.state === 'MENU' || G.state === 'END') return;
  const k = ev.key.toLowerCase();
  if (k === 'escape') { cancelPlacement(); G.selected = null; }
  else if (k === 'p') togglePause();
  else if (k === 'm') toggleMute();
  else if (k >= '1' && k <= '4') {
    const s = G.soldiers[+k - 1];
    if (s && !s.dead) selectSoldier(s);
  }
});

function togglePause() {
  if (G.state !== 'PREP' && G.state !== 'WAVE') return;
  G.paused = !G.paused;
  ui.pauseVeil.hidden = !G.paused;
  ui.btnPause.textContent = G.paused ? 'RESUME' : 'PAUSE';
}

function toggleMute() {
  G.muted = !G.muted;
  Music.setMuted(G.muted);
  Sfx.setMuted(G.muted);
  ui.btnMute.textContent = G.muted ? 'SOUND OFF' : 'SOUND ON';
}

ui.btnPause.addEventListener('click', togglePause);
ui.btnMute.addEventListener('click', toggleMute);
ui.btnWire.addEventListener('click', () => beginPlacement('wire'));
ui.btnMg.addEventListener('click', () => beginPlacement('mg'));
ui.btnCancel.addEventListener('click', cancelPlacement);
ui.btnWave.addEventListener('click', startWave);
ui.btnContinue.addEventListener('click', continueFromResults);
$('btn-restart').addEventListener('click', () => location.reload());

/* Menu: any click starts the theme; Begin Command starts the game */
ui.menu.addEventListener('pointerdown', () => {
  Sfx.ensure();
  if (G.state === 'MENU') Music.play('menu');
}, { once: false });
$('btn-begin').addEventListener('click', () => {
  Sfx.ensure();
  startGame();
});

/* =========================================================================
   MAIN LOOP
   ========================================================================= */
Music.init();

// dev/debug hook (harmless in play; lets you inspect state from the console)
window.__otb = { G, update, startWave };

let lastT = performance.now();
let rosterTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (G.state !== 'MENU') {
    if (!G.paused) update(dt);
    render();
    rosterTimer -= dt;
    if (rosterTimer <= 0) { rosterTimer = 0.15; updateRoster(); updateHUD(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
