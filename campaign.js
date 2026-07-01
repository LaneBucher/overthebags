/* =========================================================================
   OVER THE BAGS — campaign: persistent state, save/load, roster,
   and the menu / map / muster screens. Battle lives in game.js.
   ========================================================================= */
'use strict';

const SAVE_KEY = 'otb_campaign_v1';

const Camp = {
  state: null,
  selectedSector: 0,
  deployedIds: new Set(),

  /* ---------------- state / persistence ---------------- */
  freshState(difficulty) {
    let nextId = 1;
    const roster = NAME_POOL.slice(0, 4).map(name => ({
      id: nextId++, name, hp: 100, status: 'active', xp: 0, kills: 0, missions: 0, loadout: 'rifleman',
    }));
    return {
      v: 1, difficulty, nextId,
      completed: [false, false, false],
      roster, manpower: 50, rp: 2,
      artCharges: 0, boostSupplies: 0, mgAmmo: false,
    };
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); }
    catch (e) { console.warn('[save] failed:', e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.roster)) return null;
      return Object.assign(this.freshState(s.difficulty || 'regular'), s);
    } catch (e) { return null; }
  },
  hasSave() { return !!localStorage.getItem(SAVE_KEY); },
  reset() { localStorage.removeItem(SAVE_KEY); this.state = null; },
  diff() { return DIFFICULTY[this.state.difficulty] || DIFFICULTY.regular; },

  /* ---------------- roster helpers ---------------- */
  levelOf(s) {
    let lvl = 0;
    for (let i = XP_LEVELS.length - 1; i >= 0; i--) if (s.xp >= XP_LEVELS[i]) { lvl = i; break; }
    return lvl;
  },
  living() { return this.state.roster.filter(s => s.status !== 'dead'); },
  recruit() {
    const st = this.state;
    if (this.living().length >= BALANCE.rosterMax || st.manpower < BALANCE.recruitCost) return false;
    st.manpower -= BALANCE.recruitCost;
    const used = new Set(st.roster.filter(s => s.status !== 'dead').map(s => s.name));
    const name = NAME_POOL.find(n => !used.has(n)) || ('Pvt. Replacement ' + st.nextId);
    st.roster.push({ id: st.nextId++, name, hp: 100, status: 'active', xp: 0, kills: 0, missions: 0, loadout: 'rifleman' });
    this.save();
    return true;
  },
  /* if the section is nearly wiped and broke, HQ scrapes up replacements */
  emergencyDraft() {
    const st = this.state;
    const fieldable = this.living().length;
    const canAfford = Math.floor(st.manpower / BALANCE.recruitCost);
    if (fieldable + canAfford < 2) {
      st.manpower += BALANCE.recruitCost * 2;
      this.save();
      return true;
    }
    return false;
  },

  /* ---------------- mission results (called from game.js) ---------------- */
  finishMission(report) {
    const st = this.state, d = this.diff();
    let deaths = 0;
    for (const r of report.perSoldier) {
      const s = st.roster.find(x => x.id === r.id);
      if (!s) continue;
      s.missions++;
      s.kills += r.kills;
      s.xp += Math.min(25, r.kills) * XP_KILL; // capped so the MG gunner isn't a veteran overnight
      if (r.dead) { s.status = 'dead'; s.hp = 0; deaths++; }
      else {
        s.hp = Math.max(1, Math.round(r.hpFrac * 100));
        s.xp += report.won ? XP_MISSION : Math.floor(XP_MISSION / 2);
        s.status = s.hp < BALANCE.woundedBelow ? 'wounded' : 'active';
      }
    }
    // reserves rest and recover
    const deployedIds = new Set(report.perSoldier.map(r => r.id));
    for (const s of st.roster) {
      if (s.status === 'dead' || deployedIds.has(s.id)) continue;
      s.hp = Math.min(100, s.hp + BALANCE.restHeal);
      s.status = s.hp < BALANCE.woundedBelow ? 'wounded' : 'active';
    }

    let rpGain = 0, manGain = 0;
    if (report.won) {
      st.completed[report.sectorIdx] = true;
      rpGain = RP_BASE + (deaths === 0 ? 1 : 0)
        + (report.breachesLeft >= report.breachLimit / 2 ? 1 : 0)
        + d.rpBonus;
      manGain = Math.round(SECTORS[report.sectorIdx].rewardManpower * d.manpower);
      st.rp += rpGain;
      st.manpower += manGain;
    }
    this.save();
    return { deaths, rpGain, manGain };
  },

  /* ---------------- screens ---------------- */
  showScreen(id) {
    for (const sid of ['menu-screen', 'campaign-screen', 'muster-screen'])
      document.getElementById(sid).classList.toggle('visible', sid === id);
    document.getElementById('game-root').hidden = (id !== 'battle');
  },

  toMenu() {
    this.showScreen('menu-screen');
    document.getElementById('btn-continue').hidden = !this.hasSave();
    document.getElementById('btn-reset').hidden = !this.hasSave();
    document.getElementById('diff-row').hidden = true;
  },

  startNew(difficulty) {
    this.state = this.freshState(difficulty);
    this.save();
    this.toMap();
  },

  toMap() {
    this.showScreen('campaign-screen');
    Music.play('menu');
    // first unlocked & uncompleted sector selected by default
    this.selectedSector = this.state.completed.findIndex(c => !c);
    if (this.selectedSector < 0) this.selectedSector = SECTORS.length - 1;
    this.renderMap();
  },

  isUnlocked(i) { return i === 0 || this.state.completed[i - 1]; },

  renderMap() {
    const st = this.state;
    document.getElementById('camp-manpower').textContent = st.manpower;
    document.getElementById('camp-rp').textContent = st.rp;
    document.getElementById('camp-diff').textContent = this.diff().name.toUpperCase();

    const pins = document.getElementById('map-pins');
    pins.innerHTML = '';
    SECTORS.forEach((sec, i) => {
      const unlocked = this.isUnlocked(i);
      const el = document.createElement('div');
      el.className = 'map-pin'
        + (st.completed[i] ? ' pin-done' : unlocked ? ' pin-open' : ' pin-locked')
        + (i === this.selectedSector ? ' pin-selected' : '');
      el.style.left = sec.pin.x + '%';
      el.style.top = sec.pin.y + '%';
      el.innerHTML = `<div class="pin-marker"></div><div class="pin-label">${sec.name.split('—')[0].trim()}</div>`;
      if (unlocked) el.addEventListener('click', () => { this.selectedSector = i; this.renderMap(); });
      pins.appendChild(el);
    });
    this.renderBriefing();
  },

  renderBriefing() {
    const i = this.selectedSector, sec = SECTORS[i];
    const unlocked = this.isUnlocked(i), done = this.state.completed[i];
    document.getElementById('brief-name').textContent = sec.name;
    document.getElementById('brief-pips').textContent =
      '◆'.repeat(sec.diffPips) + '◇'.repeat(3 - sec.diffPips);
    document.getElementById('brief-status').textContent =
      done ? 'SECTOR SECURED' : unlocked ? 'ORDERS ACTIVE' : 'LOCKED — SECURE THE PREVIOUS SECTOR';
    document.getElementById('brief-status').className = 'brief-status ' + (done ? 'st-done' : unlocked ? 'st-open' : 'st-locked');
    document.getElementById('brief-text').textContent = unlocked ? sec.briefing : 'No orders. The line has not advanced this far.';
    document.getElementById('brief-threat').textContent = unlocked ? sec.threat : '—';
    document.getElementById('brief-approach').textContent = unlocked ? sec.approach : '—';
    const btn = document.getElementById('btn-muster');
    btn.disabled = !unlocked;
    btn.textContent = done ? 'REINFORCE THE SECTOR' : 'MUSTER THE SECTION';
  },

  /* ---------------- muster (roster + requisitions) ---------------- */
  toMuster() {
    Music.play('prep');
    const drafted = this.emergencyDraft();
    // default deployment: healthiest living soldiers, up to 4
    this.deployedIds = new Set(
      this.living().sort((a, b) => b.hp - a.hp).slice(0, 4).map(s => s.id));
    this.showScreen('muster-screen');
    this.renderMuster();
    if (drafted) this.setMusterNote('Command has scraped the depots for replacements. Recruit before you deploy.');
  },

  setMusterNote(text) { document.getElementById('deploy-note').textContent = text; },

  deploySlotCost() {
    const extra = Math.max(0, this.deployedIds.size - 4);
    return extra * BALANCE.deploySlotCost;
  },

  renderMuster() {
    const st = this.state, sec = SECTORS[this.selectedSector];
    document.getElementById('muster-title').textContent = 'MUSTER — ' + sec.name;
    document.getElementById('muster-manpower').textContent = st.manpower;
    document.getElementById('muster-rp').textContent = st.rp;
    document.getElementById('muster-charges').textContent = st.artCharges;
    document.getElementById('muster-supplies').textContent =
      Math.round(sec.startSupplies * this.diff().supplies) + st.boostSupplies;

    /* roster list */
    const list = document.getElementById('roster-list');
    list.innerHTML = '';
    const shown = [...st.roster].sort((a, b) => (a.status === 'dead') - (b.status === 'dead'));
    for (const s of shown) {
      const lvl = this.levelOf(s);
      const row = document.createElement('div');
      row.className = 'muster-row' + (s.status === 'dead' ? ' dead' : '');
      const deployed = this.deployedIds.has(s.id);
      row.innerHTML = `
        <label class="m-deploy"><input type="checkbox" ${deployed ? 'checked' : ''} ${s.status === 'dead' ? 'disabled' : ''}></label>
        <div class="m-info">
          <div class="m-name">${s.name} <span class="m-lvl lvl-${lvl}">${LEVEL_NAMES[lvl]}</span></div>
          <div class="hp-bar"><div class="hp-fill ${s.hp < BALANCE.woundedBelow ? 'low' : ''}" style="width:${s.hp}%"></div></div>
          <div class="m-status">${s.status === 'dead' ? 'KILLED IN ACTION' : s.status === 'wounded' ? `WOUNDED — ${s.hp}%` : `FIT — ${s.hp}%`}
            &middot; ${s.kills} kills &middot; ${s.missions} ops</div>
        </div>
        <select class="m-loadout" ${s.status === 'dead' ? 'disabled' : ''}>
          ${Object.entries(LOADOUTS).map(([k, l]) =>
            `<option value="${k}" ${s.loadout === k ? 'selected' : ''}>${l.name}</option>`).join('')}
        </select>`;
      const cb = row.querySelector('input');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (this.deployedIds.size >= BALANCE.deployMax) {
            cb.checked = false;
            this.setMusterNote(`No more than ${BALANCE.deployMax} men can hold this frontage.`);
            return;
          }
          this.deployedIds.add(s.id);
        } else this.deployedIds.delete(s.id);
        this.renderMuster();
      });
      const sel = row.querySelector('.m-loadout');
      sel.addEventListener('change', () => {
        s.loadout = sel.value;
        this.save();
        this.setMusterNote(LOADOUTS[s.loadout].desc);
      });
      list.appendChild(row);
    }

    /* recruit */
    const btnRec = document.getElementById('btn-recruit');
    btnRec.disabled = this.living().length >= BALANCE.rosterMax || st.manpower < BALANCE.recruitCost;
    btnRec.querySelector('.build-cost').textContent =
      this.living().length >= BALANCE.rosterMax ? 'SECTION FULL' : `${BALANCE.recruitCost} MANPOWER`;

    /* requisition shop */
    const shop = document.getElementById('req-list');
    shop.innerHTML = '';
    for (const item of REQ_SHOP) {
      const wounded = st.roster.some(s => s.status === 'wounded');
      let disabled = st.rp < item.cost;
      if (item.id === 'artillery' && st.artCharges >= ARTILLERY.maxCharges) disabled = true;
      if (item.id === 'hospital' && !wounded) disabled = true;
      if (item.id === 'mgammo' && st.mgAmmo) disabled = true;
      const btn = document.createElement('button');
      btn.className = 'btn btn-build';
      btn.disabled = disabled;
      btn.innerHTML = `<span class="build-name">${item.name}</span><span class="build-cost">${item.cost} RP — ${item.desc}</span>`;
      btn.addEventListener('click', () => { this.buyReq(item.id); });
      shop.appendChild(btn);
    }

    /* deploy summary + begin button */
    const cost = this.deploySlotCost();
    const n = this.deployedIds.size;
    document.getElementById('deploy-summary').textContent =
      `${n} deploying` + (cost ? ` — extra frontage costs ${cost} manpower` : ' — four deploy free');
    const begin = document.getElementById('btn-begin-op');
    begin.disabled = n === 0 || cost > st.manpower;
    begin.textContent = cost > st.manpower ? 'INSUFFICIENT MANPOWER' : 'BEGIN THE OPERATION';
  },

  buyReq(id) {
    const st = this.state;
    const item = REQ_SHOP.find(i => i.id === id);
    if (!item || st.rp < item.cost) return;
    st.rp -= item.cost;
    if (id === 'supplies') st.boostSupplies += 60;
    else if (id === 'manpower') st.manpower += 25;
    else if (id === 'hospital') {
      for (const s of st.roster) if (s.status === 'wounded') { s.hp = 100; s.status = 'active'; }
      this.setMusterNote('The field hospital works through the night. Every man patched.');
    }
    else if (id === 'artillery') st.artCharges++;
    else if (id === 'mgammo') st.mgAmmo = true;
    this.save();
    this.renderMuster();
  },

  beginOperation() {
    const st = this.state;
    const cost = this.deploySlotCost();
    if (this.deployedIds.size === 0 || cost > st.manpower) return;
    st.manpower -= cost;
    const deployed = st.roster.filter(s => this.deployedIds.has(s.id) && s.status !== 'dead');
    // consume one-shot boosts
    const bonusSupplies = st.boostSupplies; st.boostSupplies = 0;
    const mgAmmo = st.mgAmmo; st.mgAmmo = false;
    this.save();
    window.startMission(this.selectedSector, deployed, { bonusSupplies, mgAmmo });
  },
};

/* ---------------- wire up static buttons ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  $('btn-new').addEventListener('click', () => {
    Sfx.ensure(); Music.play('menu');
    $('diff-row').hidden = false;
  });
  for (const b of document.querySelectorAll('#diff-row .btn-diff')) {
    b.addEventListener('click', () => { Sfx.ensure(); Camp.startNew(b.dataset.diff); });
  }
  $('btn-continue').addEventListener('click', () => {
    Sfx.ensure();
    const s = Camp.load();
    if (s) { Camp.state = s; Camp.toMap(); }
    else Camp.toMenu();
  });
  $('btn-reset').addEventListener('click', () => {
    if (confirm('Burn the campaign records and start over?')) { Camp.reset(); Camp.toMenu(); }
  });
  $('btn-muster').addEventListener('click', () => Camp.toMuster());
  $('btn-back-map').addEventListener('click', () => Camp.toMap());
  $('btn-recruit').addEventListener('click', () => { Camp.recruit(); Camp.renderMuster(); });
  $('btn-begin-op').addEventListener('click', () => Camp.beginOperation());

  /* menu music on first interaction anywhere on the menu */
  $('menu-screen').addEventListener('pointerdown', () => {
    Sfx.ensure();
    if ($('menu-screen').classList.contains('visible')) Music.play('menu');
  });

  Camp.toMenu();
});

window.Camp = Camp;
