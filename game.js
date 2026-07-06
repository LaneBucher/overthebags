/* =========================================================================
   OVER THE BAGS - battle engine.
   Campaign flow lives in campaign.js; data/tuning in config.js.
   ========================================================================= */
'use strict';

/* =========================================================================
   BATTLE STATE
   ========================================================================= */
const G = {
  state: 'IDLE', // IDLE | PREP | WAVE | RESULTS | CHARGE | DONE
  paused: false,
  sectorIdx: 0,
  sector: null,
  diffc: null,          // difficulty preset
  wave: 0,              // index into sector.waves
  supplies: 0,
  breaches: 0,
  breachLimit: 6,
  soldiers: [],
  enemies: [],
  wires: [],
  mgNest: null,
  mgAmmo: false,        // requisitioned belt surplus (+dmg this mission)
  mortar: null,
  sniperPost: null,
  spawnPlan: [],        // pre-generated at prep so recon can read it
  spawnQueue: [],
  waveT: 0,
  prepT: 0,
  reconUsed: false,
  shelling: null,       // enemy prep bombardment {phase, t, targets}
  arty: { cd: 0 },      // player barrage cooldown (charges live in Camp.state)
  incoming: [],         // friendly shells falling {x,y,t}
  grenades: [],
  tracers: [],
  shells: [],           // tank shells
  particles: [],
  ambientSmoke: [],
  selected: null,
  placing: null,        // 'wire' | 'mg' | 'mortar' | 'sniper' | 'arty'
  mouse: { x: 0, y: 0, inField: false },
  shake: 0,
  killsWave: 0, earnWave: 0,
  chargeT: 0,
  ambientT: 3,
  muted: false,
  invalidFlash: null,
  moveMark: null,
  dangerFlash: 0,
};

/* =========================================================================
   DOM
   ========================================================================= */
const $id = id => document.getElementById(id);
const canvas = $id('field'), ctx = canvas.getContext('2d');
const ui = {
  wave: $id('stat-wave'), supplies: $id('stat-supplies'), breach: $id('stat-breach'),
  sectorName: $id('stat-sector'),
  log: $id('cmd-log'), roster: $id('roster'), pips: $id('wave-pips'),
  btnWire: $id('btn-wire'), btnMg: $id('btn-mg'), btnMortar: $id('btn-mortar'),
  btnSniper: $id('btn-sniper'), btnCancel: $id('btn-cancel'),
  btnArty: $id('btn-arty'), artyCost: $id('arty-cost'),
  btnRecon: $id('btn-recon'), reconCost: $id('recon-cost'),
  btnRepair: $id('btn-repair'),
  btnWave: $id('btn-wave'), btnPause: $id('btn-pause'), btnMute: $id('btn-mute'),
  objective: $id('objective'),
  results: $id('results-screen'), resultsTitle: $id('results-title'),
  resultsBody: $id('results-body'), resultsStamp: $id('results-stamp'),
  btnContinueWave: $id('btn-continue-wave'),
  mission: $id('mission-screen'), missionStamp: $id('mission-stamp'),
  missionTitle: $id('mission-title'), missionBody: $id('mission-body'),
  btnMissionContinue: $id('btn-mission-continue'),
  end: $id('end-screen'), endKicker: $id('end-kicker'), endTitle: $id('end-title'), endBody: $id('end-body'),
  btnEndContinue: $id('btn-end-continue'),
  pauseVeil: $id('pause-veil'),
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
    el.innerHTML = `<div class="trooper-dot" style="background:${LOADOUTS[s.loadout].color}"></div>
      <div class="trooper-info">
        <div class="trooper-name">${i + 1}. ${s.name} <span class="trooper-role">${LOADOUTS[s.loadout].tag}</span></div>
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
    const pct = Math.max(0, s.hp) / s.maxHp * 100;
    s.card.hp.style.width = pct + '%';
    s.card.hp.classList.toggle('low', s.hp < s.maxHp * 0.35);
    s.card.root.classList.toggle('selected', G.selected === s);
    s.card.root.classList.toggle('dead', s.dead);
    let st = 'READY';
    if (s.dead) st = 'KILLED IN ACTION';
    else if (s.moveTarget) st = 'MOVING';
    else if (s.manningMg) st = 'ON THE GUN';
    else if (s.firing > 0) st = 'FIRING';
    else if (s.hp < s.maxHp * 0.35) st = 'WOUNDED';
    s.card.status.textContent = st;
  }
}

function updateHUD() {
  const st = Camp.state;
  ui.sectorName.textContent = G.sector ? G.sector.name.split('-')[0].trim() : '-';
  ui.wave.textContent = G.sector ? `${Math.min(G.wave + 1, G.sector.waves.length)} / ${G.sector.waves.length}` : '-';
  ui.supplies.textContent = G.supplies;
  const left = Math.max(0, G.breachLimit - G.breaches);
  ui.breach.textContent = '●'.repeat(left) + '○'.repeat(G.breaches);
  ui.breach.classList.toggle('danger', left <= 2);

  const inPlay = G.state === 'PREP' || G.state === 'WAVE';
  ui.btnWire.disabled = !inPlay || G.supplies < BALANCE.wireCost;
  ui.btnMg.disabled = !inPlay || !!G.mgNest || G.supplies < BALANCE.mgCost;
  ui.btnMg.querySelector('.build-cost').textContent = G.mgNest ? 'EMPLACED' : `${BALANCE.mgCost} SUPPLIES`;
  ui.btnMortar.disabled = !inPlay || !!G.mortar || G.supplies < BALANCE.mortarCost;
  ui.btnMortar.querySelector('.build-cost').textContent = G.mortar ? 'EMPLACED' : `${BALANCE.mortarCost} SUPPLIES`;
  ui.btnSniper.disabled = !inPlay || !!G.sniperPost || G.supplies < BALANCE.sniperCost;
  ui.btnSniper.querySelector('.build-cost').textContent = G.sniperPost ? 'EMPLACED' : `${BALANCE.sniperCost} SUPPLIES`;

  // support
  const charges = st ? st.artCharges : 0;
  ui.btnArty.disabled = G.state !== 'WAVE' || charges <= 0 || G.arty.cd > 0;
  ui.artyCost.textContent = charges <= 0 ? 'NO CHARGES HELD'
    : G.arty.cd > 0 ? `RELAYING ORDERS… (${Math.ceil(G.arty.cd)}s)`
    : `${charges} CHARGE${charges > 1 ? 'S' : ''} HELD - CLICK, THEN TARGET`;
  const rCost = reconPrice();
  ui.btnRecon.disabled = G.state !== 'PREP' || G.reconUsed || G.supplies < rCost;
  ui.reconCost.textContent = G.reconUsed ? 'SORTIE FLOWN' : `${rCost} SUPPLIES - REVEAL THE NEXT ASSAULT`;
  ui.btnRepair.disabled = G.state !== 'PREP' || G.breaches <= 0 || G.supplies < BALANCE.repairCost;

  // wave pips
  ui.pips.innerHTML = '';
  const n = G.sector ? G.sector.waves.length : 5;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'pip' + (i < G.wave ? ' done' : (i === G.wave && G.state === 'WAVE' ? ' now' : ''));
    ui.pips.appendChild(p);
  }
}

function reconPrice() {
  const scoutUp = G.soldiers.some(s => !s.dead && s.loadout === 'scout');
  return scoutUp ? BALANCE.reconCostScout : BALANCE.reconCost;
}

/* =========================================================================
   MISSION SETUP (called from campaign.js)
   ========================================================================= */
window.startMission = function (sectorIdx, deployedRoster, opts) {
  G.sectorIdx = sectorIdx;
  G.sector = SECTORS[sectorIdx];
  G.diffc = Camp.diff();
  G.wave = 0;
  G.supplies = Math.round(G.sector.startSupplies * G.diffc.supplies) + (opts.bonusSupplies || 0);
  G.breaches = 0;
  G.breachLimit = Math.max(2, BALANCE.maxBreaches + G.diffc.breachMod);
  G.enemies = []; G.wires = []; G.mgNest = null; G.mortar = null; G.sniperPost = null;
  G.mgAmmo = !!opts.mgAmmo;
  G.incoming = []; G.grenades = []; G.tracers = []; G.shells = []; G.particles = [];
  G.selected = null; G.placing = null; G.arty.cd = 0;
  G.killsWave = 0; G.earnWave = 0; G.shake = 0; G.dangerFlash = 0; G.paused = false;
  ui.pauseVeil.hidden = true;
  ui.btnPause.textContent = 'PAUSE';

  G.soldiers = deployedRoster.map((r, i) => makeBattleSoldier(r, i, deployedRoster.length));
  Camp.showScreen('battle');
  buildRoster();
  renderGround();
  G.ambientSmoke = Array.from({ length: 6 }, () => ({
    x: Math.random() * W, y: 130 + Math.random() * 340,
    vx: 4 + Math.random() * 8, size: 60 + Math.random() * 80, a: 0.04 + Math.random() * 0.04,
  }));
  ui.log.innerHTML = '';
  ui.objective.textContent = `Hold the line. Survive ${G.sector.waves.length} assaults.`;
  addLog(`${G.sector.name}. ${G.soldiers.length} men on the fire step. Hold it.`);
  if (G.mgAmmo) addLog('Surplus MG belts came up with the ration party. The gun will hit harder.', false, 'ADJUTANT');
  enterPrep();
};

function makeBattleSoldier(r, i, count) {
  const lo = LOADOUTS[r.loadout] || LOADOUTS.rifleman;
  const lvl = Camp.levelOf(r);
  const stats = Object.assign({}, SOLDIER, lo.stats);
  const maxHp = SOLDIER.hp + lvl * LEVEL_HP;
  const spread = Math.min(560, 120 * count);
  return {
    rosterId: r.id, name: r.name, loadout: r.loadout, level: lvl,
    x: W / 2 - spread / 2 + (count > 1 ? i * (spread / (count - 1)) : 0), y: 585,
    maxHp, hp: Math.max(10, Math.round(r.hp / 100 * maxHp)),
    range: stats.range, speed: stats.speed,
    fireRate: stats.fireRate * (1 - LEVEL_FIRERATE * lvl),
    dmg: stats.dmg + LEVEL_DMG * lvl,
    dead: false, moveTarget: null, cooldown: Math.random() * 0.5,
    firing: 0, manningMg: false, facing: -Math.PI / 2,
    kills: 0, meleeCd: 0, grenCd: 3 + Math.random() * 3,
  };
}

/* =========================================================================
   ENTITY HELPERS
   ========================================================================= */
function spawnEnemy(type, x) {
  const t = ENEMY_TYPES[type];
  G.enemies.push({
    type, ...t, maxHp: 0,
    hp: Math.round(t.hp * G.diffc.enemyHp),
    speed: t.speed * G.diffc.enemySpd,
    x: x !== undefined ? x : 70 + Math.random() * (W - 140),
    y: ENEMY_LINE - 20 - Math.random() * 30,
    wobble: Math.random() * Math.PI * 2,
    meleeT: 0, victim: null, reload: 2 + Math.random() * 2,
    dead: false, breached: false,
  });
  const e = G.enemies[G.enemies.length - 1];
  e.maxHp = e.hp;
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

function damageEnemy(e, dmg, killer) {
  if (e.dead) return;
  e.hp -= dmg;
  // dt-scaled chip damage (wire) only puffs occasionally, or it floods particles
  if (dmg >= 1 || Math.random() < 0.04) puff(e.x, e.y, e.type === 'tank' ? '#888578' : '#5e2f26', 3);
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    G.killsWave++;
    G.earnWave += e.reward;
    if (killer) killer.kills++;
    stain(e.x, e.y, e.type === 'tank' ? 16 : 7);
    if (e.type === 'tank') {
      explode(e.x, e.y, 40, 0);
      addLog('Tank destroyed. Beautiful work.', false, 'LOOKOUT');
    }
  }
}

function damageSoldier(s, dmg, attacker) {
  if (s.dead) return;
  if (attacker && s.loadout === 'bayonet') dmg *= LOADOUTS.bayonet.meleeResist;
  s.hp -= dmg;
  puff(s.x, s.y, '#6e2b22', 4);
  Sfx.thud();
  G.dangerFlash = Math.max(G.dangerFlash, 0.35);
  if (s.hp <= 0) {
    s.dead = true; s.moveTarget = null;
    if (G.selected === s) G.selected = null;
    stain(s.x, s.y, 8);
    addLog(`${s.name} is down.`, true, 'SECTION');
    if (G.soldiers.every(x => x.dead)) missionEnd(false, 'men');
  } else if (s.hp < s.maxHp * 0.35 && s.hp + dmg >= s.maxHp * 0.35) {
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
  if (G.breaches >= G.breachLimit) missionEnd(false, 'line');
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
function explodeVsEnemies(x, y, radius, dmg, damageWire) {
  Sfx.boom(0.9);
  G.shake = Math.max(G.shake, 0.4);
  smoke(x, y, 8, 1.4);
  puff(x, y, '#c8b46a', 7);
  crater(x, y, radius * 0.45);
  for (const e of G.enemies) {
    if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius + e.r) damageEnemy(e, dmg);
  }
  if (damageWire) {
    for (const w of G.wires) {
      if (Math.hypot(w.x - x, w.y - y) < radius + w.w / 2) w.hp -= dmg * 0.5;
    }
    G.wires = G.wires.filter(w => w.hp > 0);
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
   GROUND (pre-rendered once per mission)
   ========================================================================= */
let groundCanvas;
function renderGround() {
  groundCanvas = document.createElement('canvas');
  groundCanvas.width = W; groundCanvas.height = H;
  const c = groundCanvas.getContext('2d');

  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#2b271a');
  grad.addColorStop(0.5, '#3a3423');
  grad.addColorStop(1, '#332d1e');
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);

  for (let i = 0; i < 320; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(20,17,10,.10)' : 'rgba(90,80,52,.07)';
    c.beginPath();
    c.ellipse(Math.random() * W, Math.random() * H, 6 + Math.random() * 26, 4 + Math.random() * 14, Math.random() * 3, 0, 7);
    c.fill();
  }
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

  // enemy trench
  c.fillStyle = '#1d1910';
  c.fillRect(0, 0, W, ENEMY_LINE);
  sandbagRow(c, ENEMY_LINE - 4, '#4a4231', '#3c3627');
  c.strokeStyle = '#494438';
  c.lineWidth = 1.5;
  for (const yy of [96, 104]) {
    c.beginPath();
    for (let x = 0; x <= W; x += 12) c.lineTo(x, yy + (x % 24 === 0 ? -4 : 4));
    c.stroke();
  }
  for (let x = 20; x < W; x += 60) {
    c.strokeStyle = '#3a352a';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(x, 90); c.lineTo(x, 110); c.stroke();
  }

  // player trench
  c.fillStyle = '#221d12';
  c.fillRect(0, TRENCH_TOP, W, H - TRENCH_TOP);
  c.strokeStyle = 'rgba(94,78,48,.5)';
  c.lineWidth = 2;
  for (let x = 8; x < W; x += 26) {
    c.beginPath(); c.moveTo(x, TRENCH_TOP + 22); c.lineTo(x - 4, TRENCH_BOT + 14); c.stroke();
  }
  c.strokeStyle = 'rgba(50,42,26,.8)';
  for (const yy of [TRENCH_TOP + 20, TRENCH_BOT + 16]) {
    c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke();
  }
  sandbagRow(c, TRENCH_TOP - 10, '#6b5d40', '#574c34');
  sandbagRow(c, TRENCH_TOP + 1, '#5d5138', '#4a4230');
  sandbagRow(c, TRENCH_BOT + 20, '#4a4231', '#3c3627');

  for (let i = 0; i < 8; i++) {
    const x = Math.random() * W, y = 150 + Math.random() * 300;
    c.strokeStyle = 'rgba(22,18,11,.4)';
    c.lineWidth = 2 + Math.random() * 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 60, y + 20 + Math.random() * 30); c.stroke();
  }

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
   WAVE FLOW
   ========================================================================= */
function buildSpawnPlan(waveDef) {
  const plan = [];
  for (const g of waveDef.groups) {
    const bursts = Math.ceil(g.n / g.burst);
    for (let b = 0; b < bursts; b++) {
      const inBurst = Math.min(g.burst, g.n - b * g.burst);
      let center;
      if (g.lane === 'edges') center = (b % 2 === 0) ? 110 + Math.random() * 130 : W - 110 - Math.random() * 130;
      else if (g.lane === 'left') center = 110 + Math.random() * 200;
      else if (g.lane === 'right') center = W - 110 - Math.random() * 200;
      else center = 130 + Math.random() * (W - 260);
      for (let i = 0; i < inBurst; i++) {
        const x = Math.max(50, Math.min(W - 50,
          center + (i - (inBurst - 1) / 2) * 44 + (Math.random() - 0.5) * 20));
        plan.push({ t: g.start + b * g.gap + Math.random() * 0.6, type: g.type, x });
      }
    }
  }
  plan.sort((a, b) => a.t - b.t);
  return plan;
}
function planHasTank(plan) { return plan.some(p => p.type === 'tank'); }

function enterPrep() {
  G.state = 'PREP';
  G.prepT = 0;
  G.reconUsed = false;
  const waveDef = G.sector.waves[G.wave];
  G.spawnPlan = buildSpawnPlan(waveDef);
  Music.play(planHasTank(G.spawnPlan) ? 'anthem' : 'prep');
  addLog(G.sector.preMsg[G.wave] || 'Stand ready.', G.wave >= 2);

  // enemy bombardment of the trench before this assault?
  G.shelling = null;
  if (waveDef.prepShell) {
    G.shelling = { phase: 'wait', t: PREP_SHELL.warnDelay, shells: waveDef.prepShell.shells, targets: [] };
    addLog('Enemy field guns registering on our trench - be ready to MOVE.', true, 'LOOKOUT');
  }

  const last = G.wave === G.sector.waves.length - 1;
  ui.btnWave.disabled = false;
  ui.btnWave.textContent = last ? 'STAND TO - FINAL ASSAULT' : 'STAND TO - BEGIN ASSAULT';
  ui.btnWave.classList.add('hot');
  updateHUD();
}

function startWave() {
  if (G.state !== 'PREP') return;
  G.state = 'WAVE';
  G.waveT = 0; G.killsWave = 0; G.earnWave = 0;
  if (G.placing !== 'arty') cancelPlacement();
  G.spawnQueue = G.spawnPlan.slice();
  Music.play(planHasTank(G.spawnPlan) ? 'armor' : 'battle');
  Sfx.whistle();
  addLog(`Assault ${G.wave + 1} beginning. Stand to!`, true, 'LOOKOUT');
  ui.btnWave.disabled = true;
  ui.btnWave.textContent = 'ASSAULT IN PROGRESS';
  ui.btnWave.classList.remove('hot');
  updateHUD();
}

function endWave() {
  G.shells.length = 0; // don't let a frozen tank shell detonate next wave
  const reward = Math.round((25 + G.wave * 5) * G.diffc.supplies) + G.earnWave;
  G.supplies += reward;
  const standing = G.soldiers.filter(s => !s.dead).length;
  const last = G.wave === G.sector.waves.length - 1;

  if (last) { missionEnd(true); return; }

  G.state = 'RESULTS';
  updateHUD();
  ui.resultsStamp.textContent = 'LINE HELD';
  ui.resultsTitle.textContent = `ASSAULT ${G.wave + 1} REPULSED`;
  ui.resultsBody.innerHTML = `
    <div class="tally"><span>Enemy destroyed</span><b>${G.killsWave}</b></div>
    <div class="tally"><span>Supplies authorized</span><b>+${reward}</b></div>
    <div class="tally"><span>Men standing</span><b>${standing} / ${G.soldiers.length}</b></div>
    <div class="tally"><span>Line integrity</span><b>${Math.max(0, G.breachLimit - G.breaches)} / ${G.breachLimit}</b></div>
    <p style="margin-top:12px">${G.sector.postMsg[G.wave] || 'Hold fast.'}</p>`;
  ui.results.classList.add('visible');
  addLog(G.sector.postMsg[G.wave] || 'Hold fast.');
}

/* =========================================================================
   MISSION END → campaign
   ========================================================================= */
function battleReport(won) {
  return {
    sectorIdx: G.sectorIdx,
    won,
    perSoldier: G.soldiers.map(s => ({
      id: s.rosterId, kills: s.kills, dead: s.dead, hpFrac: Math.max(0, s.hp) / s.maxHp,
    })),
    breachesLeft: Math.max(0, G.breachLimit - G.breaches),
    breachLimit: G.breachLimit,
  };
}

function missionEnd(won, reason) {
  if (G.state === 'DONE' || G.state === 'CHARGE') return;
  const finale = won && G.sectorIdx === SECTORS.length - 1;
  const res = Camp.finishMission(battleReport(won));
  if (finale) {
    // final sector: dispatch paper, then the charge
    G.state = 'RESULTS';
    ui.resultsStamp.textContent = 'FINAL DISPATCH';
    ui.resultsTitle.textContent = 'THE GUNS FALL SILENT';
    ui.resultsBody.innerHTML =
      missionTallies(won, res) +
      `<p style="margin-top:12px">The last assault is broken on the wire. The whistle is in your hand, commander. Take the men up the ridge - over the bags.</p>`;
    ui.btnContinueWave.textContent = 'OVER THE BAGS';
    ui.results.classList.add('visible');
    return;
  }
  G.state = 'DONE';
  const dead = G.soldiers.filter(s => s.dead);
  ui.missionStamp.textContent = won ? 'SECTOR SECURED' : 'DRIVEN BACK';
  ui.missionTitle.textContent = won ? G.sector.name.split('-')[0].trim() + ' HELD' : 'THE LINE IS LOST';
  ui.missionBody.innerHTML = missionTallies(won, res) +
    (won
      ? `<p style="margin-top:12px">${dead.length ? 'The roll is read at dawn. ' + dead.map(s => s.name).join(', ') + ' will not answer.' : 'Every man walks back down the communication trench. Remarkable.'}</p>`
      : `<p style="margin-top:12px">${reason === 'men'
          ? 'The last rifle fell silent and the trench was theirs. The survivors of the section reform behind the line.'
          : 'Too many broke through and the order came to fall back. The sector remains contested.'}
         Reform the section and try again - the war does not wait.</p>`);
  ui.mission.classList.add('visible');
  Music.play(won ? 'anthem' : 'menu');
}

function missionTallies(won, res) {
  const standing = G.soldiers.filter(s => !s.dead).length;
  let t = `
    <div class="tally"><span>Outcome</span><b>${won ? 'OBJECTIVE HELD' : 'WITHDRAWAL'}</b></div>
    <div class="tally"><span>Men returning</span><b>${standing} / ${G.soldiers.length}</b></div>`;
  for (const s of G.soldiers)
    t += `<div class="tally"><span>${s.name}${s.dead ? ' †' : ''}</span><b>${s.kills} kills${s.dead ? ' - KIA' : ''}</b></div>`;
  if (won) t += `
    <div class="tally"><span>Requisition awarded</span><b>+${res.rpGain} RP</b></div>
    <div class="tally"><span>Manpower awarded</span><b>+${res.manGain}</b></div>`;
  return t;
}

function startCharge() {
  G.state = 'CHARGE';
  G.chargeT = 0;
  Music.play('anthem');
  Sfx.whistle();
  addLog('OVER THE BAGS! CHARGE!', true, 'YOU');
  for (const s of G.soldiers) { s.moveTarget = null; s.manningMg = false; }
}

function campaignVictory() {
  G.state = 'DONE';
  ui.endKicker.textContent = 'BATTERIE RIDGE · DAWN';
  ui.endTitle.textContent = 'OVER THE BAGS';
  const vets = Camp.state.roster.filter(s => s.status !== 'dead' && Camp.levelOf(s) >= 2).length;
  const lost = Camp.state.roster.filter(s => s.status === 'dead').length;
  ui.endBody.innerHTML =
    '<p>The whistle blew and the section went up the ladders, through the smoke, past the burning armour - and the guns on the ridge fell silent, one by one, for good.</p>' +
    `<p>Three sectors held. ${lost ? lost + ' name' + (lost > 1 ? 's' : '') + ' on the roll of honour.' : 'Not one man left behind.'} ${vets ? vets + ' veteran' + (vets > 1 ? 's' : '') + ' walking back down the hill.' : ''}</p>` +
    '<p><em>The war is wider than this. But tonight, this part of it is yours.</em></p>';
  ui.end.classList.add('visible');
}

/* =========================================================================
   PLACEMENT, SUPPORT & ORDERS
   ========================================================================= */
function selectSoldier(s) {
  cancelPlacement();
  G.selected = s;
  Sfx.click();
}

const PLACE_COST = { wire: () => BALANCE.wireCost, mg: () => BALANCE.mgCost, mortar: () => BALANCE.mortarCost, sniper: () => BALANCE.sniperCost };

function beginPlacement(kind) {
  if (kind !== 'arty') {
    if (G.supplies < PLACE_COST[kind]()) { addLog('HQ denies the requisition - insufficient supplies.', true); return; }
    if ((kind === 'mg' && G.mgNest) || (kind === 'mortar' && G.mortar) || (kind === 'sniper' && G.sniperPost)) return;
  }
  G.placing = kind;
  G.selected = null;
  ui.btnWire.classList.toggle('active', kind === 'wire');
  ui.btnMg.classList.toggle('active', kind === 'mg');
  ui.btnMortar.classList.toggle('active', kind === 'mortar');
  ui.btnSniper.classList.toggle('active', kind === 'sniper');
  ui.btnArty.classList.toggle('active', kind === 'arty');
  ui.btnCancel.hidden = false;
  if (kind === 'arty') addLog('Battery standing by. Give the coordinates.', false, 'GUNNERS');
}

function cancelPlacement() {
  G.placing = null;
  for (const b of [ui.btnWire, ui.btnMg, ui.btnMortar, ui.btnSniper, ui.btnArty]) b.classList.remove('active');
  ui.btnCancel.hidden = true;
}

function placementValid(kind, x, y) {
  if (kind === 'wire') {
    if (y < WIRE_ZONE.top || y > WIRE_ZONE.bot || x < 50 || x > W - 50) return false;
    return !G.wires.some(w => Math.abs(w.x - x) < 85 && Math.abs(w.y - y) < 22);
  }
  if (kind === 'arty') return y > 120 && y < ARTILLERY.maxY && x > 40 && x < W - 40;
  return y > TRENCH_TOP + 10 && y < TRENCH_BOT && x > 40 && x < W - 40;
}

function tryPlace(x, y) {
  const kind = G.placing;
  if (!placementValid(kind, x, y)) {
    G.invalidFlash = { x, y, t: 0.5 };
    return;
  }
  if (kind === 'arty') { fireBarrage(x, y); cancelPlacement(); updateHUD(); return; }
  G.supplies -= PLACE_COST[kind]();
  if (kind === 'wire') {
    G.wires.push({ x, y, w: 90, h: 16, hp: 50, maxHp: 50 });
    addLog('Wire strung.', false, 'SECTION');
  } else if (kind === 'mg') {
    G.mgNest = { x, y, cooldown: 0, manned: false, ang: -Math.PI / 2, shots: 0 };
    addLog('Gun emplaced. Keep a man beside it or it stays silent.', false, 'SECTION');
    cancelPlacement();
  } else if (kind === 'mortar') {
    G.mortar = { x, y, cd: 2 };
    addLog('Mortar pit dug. It will range on any bunched attack.', false, 'SECTION');
    cancelPlacement();
  } else if (kind === 'sniper') {
    G.sniperPost = { x, y, cd: 1 };
    addLog('Sniper post manned. He picks his own targets.', false, 'SECTION');
    cancelPlacement();
  }
  Sfx.build();
  smoke(x, y, 3);
  if (G.placing === 'wire' && G.supplies < BALANCE.wireCost) cancelPlacement();
  updateHUD();
}

function fireBarrage(x, y) {
  const st = Camp.state;
  if (st.artCharges <= 0 || G.arty.cd > 0 || G.state !== 'WAVE') return;
  st.artCharges--;
  Camp.save();
  G.arty.cd = ARTILLERY.cooldown;
  Sfx.shellIncoming();
  addLog('Barrage inbound. Heads down.', true, 'GUNNERS');
  for (let i = 0; i < ARTILLERY.shells; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * ARTILLERY.scatter;
    G.incoming.push({
      x: Math.max(30, Math.min(W - 30, x + Math.cos(a) * r)),
      y: Math.min(510, Math.max(90, y + Math.sin(a) * r)),
      t: ARTILLERY.delay + i * 0.22,
    });
  }
}

function useRecon() {
  if (G.state !== 'PREP' || G.reconUsed) return;
  const cost = reconPrice();
  if (G.supplies < cost) return;
  G.supplies -= cost;
  G.reconUsed = true;
  const counts = {};
  const third = [0, 0, 0];
  for (const p of G.spawnPlan) {
    counts[p.type] = (counts[p.type] || 0) + 1;
    third[Math.min(2, Math.floor(p.x / (W / 3)))]++;
  }
  const laneIdx = third.indexOf(Math.max(...third));
  const lane = ['LEFT approach', 'CENTRE ground', 'RIGHT approach'][laneIdx];
  const parts = Object.entries(counts)
    .filter(([t]) => t !== 'tank')
    .map(([t, n]) => `${n} ${ENEMY_TYPES[t].label}`);
  addLog(`Sortie over the lines: ${parts.join(', ')} forming up. Main thrust expected on the ${lane}.`, false, 'RECON');
  if (counts.tank) addLog(`ARMOUR CONFIRMED - ${counts.tank} vehicle${counts.tank > 1 ? 's' : ''} moving up with the assault.`, true, 'RECON');
  else addLog('No armour observed.', false, 'RECON');
  Sfx.click();
  updateHUD();
}

function useRepair() {
  if (G.state !== 'PREP' || G.breaches <= 0 || G.supplies < BALANCE.repairCost) return;
  G.supplies -= BALANCE.repairCost;
  G.breaches--;
  Sfx.build();
  addLog('Working party rebuilds the parapet. Line integrity restored.', false, 'SECTION');
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
  for (const s of G.ambientSmoke) {
    s.x += s.vx * dt;
    if (s.x - s.size > W) { s.x = -s.size; s.y = 130 + Math.random() * 340; }
  }
  if (G.invalidFlash) { G.invalidFlash.t -= dt; if (G.invalidFlash.t <= 0) G.invalidFlash = null; }
  if (G.moveMark) { G.moveMark.t -= dt; if (G.moveMark.t <= 0) G.moveMark = null; }
  G.shake = Math.max(0, G.shake - dt * 1.2);
  G.dangerFlash = Math.max(0, G.dangerFlash - dt);
  G.arty.cd = Math.max(0, G.arty.cd - dt);

  updateParticles(dt);
  updateTracers(dt);

  if (G.state === 'CHARGE') { updateCharge(dt); return; }
  if (G.state !== 'WAVE' && G.state !== 'PREP') return;

  updateShelling(dt);
  updateSoldiers(dt);
  updateIncoming(dt);
  updateGrenades(dt);

  if (G.state !== 'WAVE') { G.prepT += dt; return; }
  G.waveT += dt;

  while (G.spawnQueue.length && G.spawnQueue[0].t <= G.waveT) {
    const s = G.spawnQueue.shift();
    spawnEnemy(s.type, s.x);
  }

  updateEnemies(dt);
  updateMg(dt);
  updateMortar(dt);
  updateSniper(dt);
  updateShells(dt);

  G.ambientT -= dt;
  if (G.ambientT <= 0) {
    G.ambientT = 5 + Math.random() * 6;
    const x = Math.random() * W;
    smoke(x, 30 + Math.random() * 50, 5, 1.4);
    Sfx.noise(0.5, 200, 0.6, 0.12, 'lowpass');
  }

  if (!G.spawnQueue.length && G.enemies.every(e => e.dead) && !G.incoming.length && G.state === 'WAVE') {
    endWave();
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

/* enemy pre-assault bombardment: warn → markers → impact */
function updateShelling(dt) {
  const sh = G.shelling;
  if (!sh || sh.phase === 'done') return;
  sh.t -= dt;
  if (sh.phase === 'wait' && sh.t <= 0) {
    sh.phase = 'warn';
    sh.t = PREP_SHELL.fuse;
    sh.targets = [];
    const living = G.soldiers.filter(s => !s.dead);
    for (let i = 0; i < sh.shells; i++) {
      const near = living[i % Math.max(1, living.length)];
      const bx = near ? near.x + (Math.random() - 0.5) * 80 : 60 + Math.random() * (W - 120);
      const by = near ? near.y + (Math.random() - 0.5) * 50 : 560 + Math.random() * 80;
      sh.targets.push({
        x: Math.max(40, Math.min(W - 40, bx)),
        y: Math.max(TRENCH_TOP - 5, Math.min(TRENCH_BOT + 15, by)),
      });
    }
    Sfx.shellIncoming();
    addLog('INCOMING! Clear the marked ground!', true, 'LOOKOUT');
  } else if (sh.phase === 'warn' && sh.t <= 0) {
    sh.phase = 'done';
    for (const t of sh.targets) {
      explode(t.x, t.y, PREP_SHELL.radius, Math.round(PREP_SHELL.dmg * G.diffc.shellDmg));
    }
    addLog('Shelling has lifted. Reform the line.', false, 'LOOKOUT');
  }
}

function updateSoldiers(dt) {
  for (const s of G.soldiers) {
    if (s.dead) continue;
    s.firing = Math.max(0, s.firing - dt);
    const wounded = s.hp < s.maxHp * 0.35;

    if (s.moveTarget) {
      const d = dist(s, s.moveTarget);
      const spd = s.speed * (wounded ? 0.6 : 1);
      if (d < 4) s.moveTarget = null;
      else {
        s.x += (s.moveTarget.x - s.x) / d * spd * dt;
        s.y += (s.moveTarget.y - s.y) / d * spd * dt;
      }
    }

    s.manningMg = !!(G.mgNest && dist(s, G.mgNest) < MG.manRadius);

    // medic: patch nearby men (faster when the guns are quiet)
    if (s.loadout === 'medic') {
      const lo = LOADOUTS.medic;
      const rate = lo.healPerSec * (G.state === 'PREP' ? lo.healPrepMult : 1) * dt;
      for (const o of G.soldiers) {
        if (o.dead || o === s) continue;
        if (dist(s, o) < lo.healRadius && o.hp < o.maxHp) {
          o.hp = Math.min(o.maxHp, o.hp + rate);
          if (Math.random() < dt * 1.5) puff(o.x, o.y - 8, '#cfc3a0', 1);
        }
      }
      if (s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + rate * 0.5);
    }

    // bayonet trooper: cuts down anyone in reach
    if (s.loadout === 'bayonet') {
      s.meleeCd -= dt;
      if (s.meleeCd <= 0) {
        const close = nearestEnemy(s, 24);
        if (close && close.type !== 'tank') {
          s.meleeCd = LOADOUTS.bayonet.meleeRate;
          damageEnemy(close, LOADOUTS.bayonet.meleeDmg, s);
          puff(close.x, close.y, '#5e2f26', 4);
          Sfx.thud();
        }
      }
    }

    // grenadier: bomb the clusters
    if (s.loadout === 'grenadier' && G.state === 'WAVE') {
      s.grenCd -= dt;
      if (s.grenCd <= 0) {
        const lo = LOADOUTS.grenadier;
        let target = null;
        for (const e of G.enemies) {
          if (e.dead || dist(s, e) > lo.grenadeRange) continue;
          let n = 0;
          for (const o of G.enemies) if (!o.dead && dist(e, o) < 55) n++;
          if (n >= lo.grenadeMinCluster && (!target || n > target.n)) target = { e, n };
        }
        if (target) {
          s.grenCd = lo.grenadeCd;
          G.grenades.push({ x: s.x, y: s.y - 4, tx: target.e.x, ty: target.e.y, t: 0, dur: 0.9, owner: s });
          s.facing = Math.atan2(target.e.y - s.y, target.e.x - s.x);
          Sfx.click();
        }
      }
    }

    // rifle
    s.cooldown -= dt;
    if (G.state === 'WAVE' && s.cooldown <= 0) {
      const target = nearestEnemy(s, s.range);
      if (target) {
        s.cooldown = s.fireRate * (wounded ? 1.5 : 1);
        s.firing = 0.3;
        s.facing = Math.atan2(target.y - s.y, target.x - s.x);
        G.tracers.push({ x1: s.x, y1: s.y - 4, x2: target.x, y2: target.y, life: 0.08 });
        flash(s.x, s.y - 4, s.facing);
        Sfx.rifle();
        damageEnemy(target, s.dmg, s);
      }
    }
  }
}

function updateMg(dt) {
  const mg = G.mgNest;
  if (!mg) return;
  mg.gunner = null;
  let gd = MG.manRadius;
  for (const s of G.soldiers) {
    if (s.dead || !s.manningMg) continue;
    const d = dist(s, mg);
    if (d < gd) { gd = d; mg.gunner = s; }
  }
  mg.manned = !!mg.gunner;
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
    damageEnemy(target, MG.dmg + (G.mgAmmo ? 2 : 0), mg.gunner);
  }
}

function updateMortar(dt) {
  const m = G.mortar;
  if (!m) return;
  m.cd -= dt;
  if (m.cd > 0) return;
  // find the thickest cluster in range, away from our own trench
  let target = null;
  for (const e of G.enemies) {
    if (e.dead || e.y > 505 || dist(m, e) > MORTAR.range) continue;
    let n = 0;
    for (const o of G.enemies) if (!o.dead && dist(e, o) < 55) n++;
    if (n >= MORTAR.minCluster && (!target || n > target.n)) target = { e, n };
  }
  if (!target) return;
  m.cd = MORTAR.cooldown;
  Sfx.tone(300, 900, 0.25, 0.2, 'sine'); // hollow thoomp
  smoke(m.x, m.y - 6, 2);
  G.incoming.push({
    x: target.e.x + (Math.random() - 0.5) * 26,
    y: target.e.y + (Math.random() - 0.5) * 26,
    t: MORTAR.flight, mortar: true,
  });
}

function updateSniper(dt) {
  const sp = G.sniperPost;
  if (!sp) return;
  sp.cd -= dt;
  if (sp.cd > 0) return;
  let target = null;
  for (const type of SNIPER.priority) {
    let bd = SNIPER.range;
    for (const e of G.enemies) {
      if (e.dead || e.type !== type) continue;
      const d = dist(sp, e);
      if (d < bd) { bd = d; target = e; }
    }
    if (target) break;
  }
  if (!target) return;
  sp.cd = SNIPER.cooldown;
  G.tracers.push({ x1: sp.x, y1: sp.y - 6, x2: target.x, y2: target.y, life: 0.12, sniper: true });
  flash(sp.x, sp.y - 6, Math.atan2(target.y - sp.y, target.x - sp.x));
  Sfx.sniper();
  damageEnemy(target, SNIPER.dmg);
}

/* friendly shells (barrage + mortar) falling */
function updateIncoming(dt) {
  for (const sh of G.incoming) {
    sh.t -= dt;
    if (sh.t <= 0) {
      sh.done = true;
      explodeVsEnemies(sh.x, sh.y, sh.mortar ? MORTAR.radius : ARTILLERY.radius,
        sh.mortar ? MORTAR.dmg : ARTILLERY.dmg, !sh.mortar);
    }
  }
  G.incoming = G.incoming.filter(s => !s.done);
}

function updateGrenades(dt) {
  for (const g of G.grenades) {
    g.t += dt;
    if (g.t >= g.dur) {
      g.done = true;
      const lo = LOADOUTS.grenadier;
      Sfx.boom(0.55);
      G.shake = Math.max(G.shake, 0.2);
      smoke(g.tx, g.ty, 4, 1);
      puff(g.tx, g.ty, '#c8b46a', 5);
      for (const e of G.enemies) {
        if (!e.dead && Math.hypot(e.x - g.tx, e.y - g.ty) < lo.grenadeRadius + e.r)
          damageEnemy(e, lo.grenadeDmg, g.owner);
      }
    }
  }
  G.grenades = G.grenades.filter(g => !g.done);
}

function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.wobble += dt * 3;

    let speedMult = 1;
    for (const w of G.wires) {
      if (w.hp <= 0) continue;
      if (Math.abs(e.x - w.x) < w.w / 2 + e.r && Math.abs(e.y - w.y) < w.h / 2 + e.r) {
        speedMult = Math.min(speedMult, e.wireSlow);
        if (e.type === 'tank') { w.hp -= 60 * dt; }
        else { damageEnemy(e, 4 * dt); w.hp -= 2 * dt; }
        if (w.hp <= 0) puff(w.x, w.y, '#4a4438', 5);
      }
    }
    G.wires = G.wires.filter(w => w.hp > 0);

    if (e.type === 'tank') { updateTank(e, dt, speedMult); continue; }

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
            damageSoldier(e.victim, e.dmg, e);
          }
        }
        continue;
      }
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
  if (G.chargeT > 4.5) campaignVictory();
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
  drawMortarPit();
  drawSniperPost();
  drawAmbientSmoke();
  drawShellWarnings();
  drawEnemies();
  drawSoldiers();
  drawShells();
  drawIncoming();
  drawGrenades();
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
  const brass = G.placing !== 'arty';
  ctx.fillStyle = brass ? 'rgba(201,162,75,.08)' : 'rgba(163,60,46,.07)';
  ctx.strokeStyle = brass ? 'rgba(201,162,75,.35)' : 'rgba(163,60,46,.4)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1;
  let x, y, w, h;
  if (G.placing === 'wire') { x = 50; y = WIRE_ZONE.top; w = W - 100; h = WIRE_ZONE.bot - WIRE_ZONE.top; }
  else if (G.placing === 'arty') { x = 40; y = 120; w = W - 80; h = ARTILLERY.maxY - 120; }
  else { x = 40; y = TRENCH_TOP + 10; w = W - 80; h = TRENCH_BOT - TRENCH_TOP - 10; }
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

function drawWireSprite(x, y, w, frac) {
  ctx.strokeStyle = '#4d4636';
  ctx.lineWidth = 3;
  for (const px of [x - w / 2, x, x + w / 2]) {
    ctx.beginPath(); ctx.moveTo(px, y - 8); ctx.lineTo(px, y + 8); ctx.stroke();
  }
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

function sandbagArc(x, y) {
  ctx.fillStyle = '#574c34';
  ctx.strokeStyle = 'rgba(15,12,7,.7)';
  for (let a = Math.PI * 0.15; a < Math.PI * 0.85; a += 0.5) {
    const bx = x + Math.cos(a + Math.PI) * 18, by = y + Math.sin(a + Math.PI) * 14;
    roundRect(ctx, bx - 8, by - 4, 16, 9, 4);
    ctx.fill(); ctx.stroke();
  }
}

function drawMg() {
  const mg = G.mgNest;
  if (!mg) return;
  sandbagArc(mg.x, mg.y);
  ctx.save();
  ctx.translate(mg.x, mg.y - 4);
  ctx.rotate(mg.ang);
  ctx.fillStyle = '#22201a';
  ctx.fillRect(0, -2.5, 22, 5);
  ctx.fillRect(-6, -5, 10, 10);
  ctx.restore();
  if (!mg.manned) {
    ctx.fillStyle = 'rgba(163,60,46,.9)';
    ctx.font = '10px Staatliches, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('UNMANNED', mg.x, mg.y + 24);
  }
}

function drawMortarPit() {
  const m = G.mortar;
  if (!m) return;
  ctx.fillStyle = '#2a2517';
  ctx.beginPath(); ctx.arc(m.x, m.y, 13, 0, 7); ctx.fill();
  ctx.strokeStyle = '#574c34';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(m.x, m.y, 14, 0, 7); ctx.stroke();
  // tube
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(-Math.PI / 3);
  ctx.fillStyle = '#1d1b14';
  ctx.fillRect(-2.5, -16, 5, 16);
  ctx.restore();
  ctx.fillStyle = '#3a3226';
  ctx.fillRect(m.x - 5, m.y + 2, 10, 3);
}

function drawSniperPost() {
  const sp = G.sniperPost;
  if (!sp) return;
  sandbagArc(sp.x, sp.y);
  // long rifle
  ctx.save();
  ctx.translate(sp.x, sp.y - 5);
  ctx.rotate(-Math.PI / 2 + Math.sin(performance.now() / 900) * 0.15);
  ctx.strokeStyle = '#26221a';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(26, 0); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#8a8c60';
  ctx.beginPath(); ctx.arc(sp.x, sp.y - 2, 5, 0, 7); ctx.fill();
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

/* enemy shelling warnings + friendly barrage markers */
function drawShellWarnings() {
  const sh = G.shelling;
  if (sh && sh.phase === 'warn') {
    const pulse = 0.55 + Math.sin(performance.now() / 110) * 0.25;
    for (const t of sh.targets) {
      ctx.strokeStyle = `rgba(180,40,25,${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(t.x, t.y, PREP_SHELL.radius, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(t.x - 6, t.y); ctx.lineTo(t.x + 6, t.y);
      ctx.moveTo(t.x, t.y - 6); ctx.lineTo(t.x, t.y + 6);
      ctx.stroke();
    }
  }
  // friendly barrage target flare
  for (const inc of G.incoming) {
    if (inc.mortar) continue;
    const pulse = 0.4 + Math.sin(performance.now() / 90) * 0.2;
    ctx.strokeStyle = `rgba(201,162,75,${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(inc.x, inc.y, 10, 0, 7); ctx.stroke();
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
      ctx.strokeStyle = 'rgba(201,162,75,.25)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.range, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#c9a24b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, 7); ctx.stroke();
    }
    unitShadow(s.x, s.y, 8);
    const wounded = s.hp < s.maxHp * 0.35;
    ctx.fillStyle = wounded ? '#797a50' : '#8a8c60';
    ctx.strokeStyle = '#22221a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a3a476';
    ctx.beginPath(); ctx.ellipse(s.x, s.y - 3, 6.5, 4.5, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(240,235,200,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(s.x, s.y - 3.5, 5.5, 3.5, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    // role pip
    ctx.fillStyle = LOADOUTS[s.loadout].color;
    ctx.strokeStyle = '#14110c';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(s.x + 6.5, s.y + 4, 3, 0, 7); ctx.fill(); ctx.stroke();
    // veteran chevron
    if (s.level > 0) {
      ctx.strokeStyle = s.level >= 2 ? '#c9a24b' : '#a3a476';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x - 4, s.y + 12); ctx.lineTo(s.x, s.y + 9); ctx.lineTo(s.x + 4, s.y + 12);
      ctx.stroke();
    }
    // rifle
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.facing);
    ctx.strokeStyle = '#3a3226';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(15, 3); ctx.stroke();
    ctx.restore();
    if (s.hp < s.maxHp) drawHpBar(s.x, s.y - 16, 22, s.hp / s.maxHp);
    if (s.manningMg) {
      ctx.fillStyle = 'rgba(201,162,75,.9)';
      ctx.font = '9px Staatliches, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MG', s.x, s.y + 21);
    }
  }
}

function drawEnemies() {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.type === 'tank') {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#26241c';
      ctx.fillRect(-19, -24, 8, 48);
      ctx.fillRect(11, -24, 8, 48);
      ctx.fillStyle = '#4b4a3a';
      ctx.strokeStyle = '#1c1b14';
      ctx.lineWidth = 2;
      ctx.fillRect(-13, -20, 26, 40);
      ctx.strokeRect(-13, -20, 26, 40);
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
    ctx.fillStyle = '#48413a';
    ctx.beginPath();
    ctx.ellipse(ex, e.y + 3, e.r * 0.72, e.r * 0.48, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,185,150,.25)';
    ctx.beginPath(); ctx.arc(ex - e.r * 0.3, e.y - e.r * 0.35, e.r * 0.3, 0, 7); ctx.fill();
    if (e.type === 'heavy') {
      ctx.strokeStyle = '#8c8170';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ex, e.y, e.r - 3, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    if (e.type === 'raider') {
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
    ctx.strokeStyle = `rgba(163,60,46,${0.4 + f * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sh.tx, sh.ty, 10 * (1 - f * 0.5), 0, 7); ctx.stroke();
    ctx.fillStyle = '#26241c';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
  }
}

function drawIncoming() {
  // falling friendly shells: brief streak just before impact
  for (const sh of G.incoming) {
    if (sh.t < 0.35) {
      const f = sh.t / 0.35;
      ctx.strokeStyle = `rgba(230,215,170,${0.7 * (1 - f)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sh.x + 10 * f, sh.y - 70 * f);
      ctx.lineTo(sh.x, sh.y);
      ctx.stroke();
    }
  }
}

function drawGrenades() {
  for (const g of G.grenades) {
    const f = g.t / g.dur;
    const x = g.x + (g.tx - g.x) * f;
    const y = g.y + (g.ty - g.y) * f - Math.sin(f * Math.PI) * 40;
    ctx.fillStyle = '#2c2a20';
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
  }
}

function drawTracers() {
  for (const t of G.tracers) {
    ctx.strokeStyle = t.sniper ? 'rgba(255,245,200,1)' : t.mg ? 'rgba(255,200,120,.95)' : 'rgba(255,230,170,.85)';
    ctx.lineWidth = t.sniper ? 1.4 : t.mg ? 2.2 : 1.6;
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
  if (G.placing === 'wire') drawWireSprite(x, y, 90, 1);
  else if (G.placing === 'arty') {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? 'rgba(201,162,75,.9)' : 'rgba(163,60,46,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, ARTILLERY.radius + ARTILLERY.scatter * 0.6, 0, 7); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
    ctx.stroke();
    return;
  }
  else if (G.placing === 'mortar') {
    ctx.fillStyle = '#2a2517';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill();
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
  if (G.state !== 'PREP' && G.state !== 'WAVE') return;
  const k = ev.key.toLowerCase();
  if (k === 'escape') { cancelPlacement(); G.selected = null; }
  else if (k === 'p') togglePause();
  else if (k === 'm') toggleMute();
  else if (k >= '1' && k <= '6') {
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
ui.btnMortar.addEventListener('click', () => beginPlacement('mortar'));
ui.btnSniper.addEventListener('click', () => beginPlacement('sniper'));
ui.btnArty.addEventListener('click', () => beginPlacement('arty'));
ui.btnRecon.addEventListener('click', useRecon);
ui.btnRepair.addEventListener('click', useRepair);
ui.btnCancel.addEventListener('click', cancelPlacement);
ui.btnWave.addEventListener('click', startWave);
ui.btnContinueWave.addEventListener('click', () => {
  ui.results.classList.remove('visible');
  if (G.state === 'RESULTS' && G.wave === G.sector.waves.length - 1) { startCharge(); return; }
  G.wave++;
  enterPrep();
});
ui.btnMissionContinue.addEventListener('click', () => {
  ui.mission.classList.remove('visible');
  Camp.toMap();
});
ui.btnEndContinue.addEventListener('click', () => {
  ui.end.classList.remove('visible');
  Camp.toMap();
});

/* =========================================================================
   MAIN LOOP
   ========================================================================= */
Music.init();

let lastT = performance.now();
let rosterTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const active = G.state !== 'IDLE' && !$id('game-root').hidden;
  if (active) {
    if (!G.paused) update(dt);
    render();
    rosterTimer -= dt;
    if (rosterTimer <= 0) { rosterTimer = 0.15; updateRoster(); updateHUD(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
