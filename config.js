/* =========================================================================
   OVER THE BAGS - config: every tuning value and data table lives here.
   ========================================================================= */
'use strict';

/* ---------------- audio ---------------- */
const AUDIO_TRACKS = {
  menu:   'audio/Over The Bags Main Theme.mp3', // menu + campaign map
  prep:   'audio/Homeland.mp3',                 // prep phase / muster
  anthem: 'audio/Anthem.mp3',                   // prep before an armour wave, victory
  battle: 'audio/Never Before.mp3',             // active battle
  armor:  'audio/March of the Tanks.mp3',       // waves with tanks
};
const MUSIC_VOLUME = 0.55;
const SFX_VOLUME = 0.5;

/* ---------------- battlefield geometry (canvas 900x700) ---------------- */
const W = 900, H = 700;
const ENEMY_LINE = 70;
const TRENCH_TOP = 530;
const TRENCH_BOT = 648;
const BREACH_Y = 676;
const WIRE_ZONE = { top: 270, bot: 505 };

/* ---------------- core balance ---------------- */
const BALANCE = {
  wireCost: 20,
  mgCost: 50,
  mortarCost: 70,
  sniperCost: 45,
  repairCost: 30,
  reconCost: 25,
  reconCostScout: 15,     // when a scout is deployed and alive
  maxBreaches: 6,         // modified by difficulty
  deploySlotCost: 15,     // manpower per soldier beyond the 4th
  recruitCost: 25,        // manpower for a green replacement
  rosterMax: 10,
  deployMax: 6,
  restHeal: 25,           // hp recovered between missions automatically
  woundedBelow: 50,       // end a mission under this hp -> WOUNDED status
};

/* ---------------- soldiers, XP, loadouts ---------------- */
const SOLDIER = { hp: 100, speed: 85, range: 210, fireRate: 0.85, dmg: 9 };
const MG = { range: 300, fireRate: 0.12, dmg: 6, manRadius: 60 };

/* xp thresholds per level; level grants +dmg and faster fire */
const XP_LEVELS = [0, 25, 60];               // Green, Seasoned, Veteran
const LEVEL_NAMES = ['GREEN', 'SEASONED', 'VETERAN'];
const LEVEL_DMG = 1;                          // +dmg per level
const LEVEL_FIRERATE = 0.07;                  // fire delay reduced 7% per level
const LEVEL_HP = 8;                           // +max hp per level
const XP_MISSION = 12;                        // survive a mission
const XP_KILL = 1;

const LOADOUTS = {
  rifleman: {
    name: 'Rifleman', tag: 'RFL', color: '#8a8c60',
    desc: 'The standing default. Balanced range and rate of fire. Reliable anywhere on the line.',
    stats: {},                                // pure baseline
  },
  bayonet: {
    name: 'Bayonet Trooper', tag: 'BYT', color: '#9c8a52',
    desc: 'Shorter reach with the rifle, but murderous up close. Takes less melee damage and cuts down anyone who reaches the bags. Post him where they break through.',
    stats: { range: 150, dmg: 8 },
    meleeResist: 0.65,                        // takes 65% of melee damage
    meleeDmg: 16, meleeRate: 0.8,             // swings back at attackers
  },
  medic: {
    name: 'Medic', tag: 'MED', color: '#b0a184',
    desc: 'Light combat power, but patches men nearby - faster when the guns are quiet. Keeps a wounded section on its feet.',
    stats: { range: 180, dmg: 6 },
    healPerSec: 3, healRadius: 90, healPrepMult: 2,
  },
  scout: {
    name: 'Scout', tag: 'SCT', color: '#7f9077',
    desc: 'Sharp eyes and a longer reach. Air recon costs less while a scout is on the line, and his rifle finds targets sooner.',
    stats: { range: 260, dmg: 8, fireRate: 0.75 },
  },
  grenadier: {
    name: 'Grenadier', tag: 'GRN', color: '#a3703c',
    desc: 'Carries a satchel of bombs. Lobs a grenade at clustered enemies on a slow fuse-and-throw cycle. Weak rifle otherwise.',
    stats: { range: 170, dmg: 7 },
    grenadeCd: 8, grenadeRange: 210, grenadeRadius: 46, grenadeDmg: 26, grenadeMinCluster: 2,
  },
};

const NAME_POOL = [
  'Sgt. Brandt', 'Cpl. Hayes', 'Pvt. Miller', 'Pvt. Okafor',
  'Pvt. Whitlow', 'Cpl. Dane', 'Pvt. Iyer', 'Pvt. Kowalski',
  'Pvt. Moreau', 'Cpl. Ash', 'Pvt. Sung', 'Pvt. Beckett',
  'Pvt. Ferro', 'Pvt. Ngata', 'Cpl. Voss', 'Pvt. Lindqvist',
];

/* ---------------- enemies ---------------- */
const ENEMY_TYPES = {
  infantry: { hp: 55,  speed: 33, dmg: 7,  hitRate: 0.8, reward: 2,  r: 9,  wireSlow: 0.35, label: 'infantry' },
  raider:   { hp: 30,  speed: 62, dmg: 9,  hitRate: 0.6, reward: 3,  r: 8,  wireSlow: 0.35, label: 'raiders' },
  heavy:    { hp: 200, speed: 22, dmg: 14, hitRate: 1.1, reward: 6,  r: 12, wireSlow: 0.55, label: 'heavy infantry' },
  tank:     { hp: 500, speed: 12, dmg: 0,  hitRate: 0,   reward: 20, r: 20, wireSlow: 0.85, label: 'armour' },
};

/* ---------------- support: player artillery, mortar, sniper ---------------- */
const ARTILLERY = {
  chargeCostRP: 1, maxCharges: 3,
  shells: 5, delay: 2.0, scatter: 65, radius: 48, dmg: 60,
  cooldown: 8,
  maxY: 500,               // can only be called onto no man's land
};
const MORTAR = {
  range: 460, cooldown: 5.5, flight: 1.6, radius: 44, dmg: 32, minCluster: 2,
};
const SNIPER = {
  range: 430, cooldown: 2.6, dmg: 34,
  priority: ['raider', 'heavy', 'infantry'],   // never targets tanks
};

/* ---------------- enemy prep-phase shelling ---------------- */
const PREP_SHELL = {
  warnDelay: 3,     // seconds after prep begins before markers appear
  fuse: 3.5,        // seconds markers show before impact
  radius: 55, dmg: 28,
};

/* ---------------- difficulty ---------------- */
const DIFFICULTY = {
  recruit: { name: 'Recruit',  enemyHp: 0.85, enemySpd: 0.92, supplies: 1.25, manpower: 1.3,
             breachMod: +2, rpBonus: 0, shellDmg: 0.7,
             blurb: 'For learning the trade. The enemy is slower to arrive and easier to stop.' },
  regular: { name: 'Regular',  enemyHp: 1, enemySpd: 1, supplies: 1, manpower: 1,
             breachMod: 0, rpBonus: 0, shellDmg: 1,
             blurb: 'The war as it is. Losses will happen. Intended experience.' },
  veteran: { name: 'Veteran',  enemyHp: 1.15, enemySpd: 1.05, supplies: 0.85, manpower: 0.85,
             breachMod: -2, rpBonus: 1, shellDmg: 1.2,
             blurb: 'Thin supplies, a fragile line, a determined enemy. Fair, but merciless.' },
};

/* ---------------- requisition shop (spent at the muster screen) ---------------- */
const REQ_SHOP = [
  { id: 'supplies',  name: 'Supply Requisition',  cost: 1, desc: '+60 supplies for the coming operation.' },
  { id: 'manpower',  name: 'Replacement Draft',   cost: 1, desc: '+25 manpower to the sector pool.' },
  { id: 'hospital',  name: 'Field Hospital',      cost: 1, desc: 'Every wounded man patched to full health.' },
  { id: 'artillery', name: 'Artillery Charge',    cost: 1, desc: 'One planned barrage, called during battle. Carries over. Max 3 held.' },
  { id: 'mgammo',    name: 'MG Ammunition',       cost: 1, desc: 'Belt-fed surplus: the MG nest hits harder next operation.' },
];

/* ---------------- sectors / campaign ----------------
   Wave groups: n enemies, arriving in squads of `burst`, first at `start`s,
   next squad every `gap`s. lane: 'left' | 'right' | 'edges' biases spawn x.
   prepShell: enemy shelling of YOUR trench during the prep before that wave. */
const SECTORS = [
  {
    id: 's7', name: 'SECTOR 7 - THE MUD LINE',
    pin: { x: 22, y: 62 },
    briefing: 'A quiet stretch of the line, about to stop being quiet. Hold the trench through five assaults and the road behind stays ours.',
    threat: 'Balanced infantry assaults. One armoured vehicle reported in reserve.',
    approach: 'String wire early, keep the machine gun crewed, and hold your men together.',
    diffPips: 1,
    startSupplies: 75,
    rewardManpower: 20,
    waves: [
      { groups: [{ type: 'infantry', n: 6,  start: 1, gap: 9,  burst: 3 }] },
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
    ],
    preMsg: [
      'Listening post reports movement across the wire. First assault expected within the hour. Dig in.',
      'They tested us. Expect them faster this time - raiders move ahead of the line.',
      'Intel warns of heavy stormtroopers in the next push. Rifles alone may not stop them.',
      'No reinforcements. HQ says hold at any cost. The next assault will be the worst yet.',
      'URGENT - enemy ARMOUR reported near the forward line. Stop it here.',
    ],
    postMsg: [
      'Good work. Supplies have been authorized. They will be back.',
      'Line held. HQ sends its compliments - and nothing else.',
      'You need to hold a while longer. Make it count.',
      'One more push and they break. Make ready.',
    ],
  },
  {
    id: 'orane', name: 'SAINT ORANE ROAD',
    pin: { x: 50, y: 40 },
    briefing: 'A sunken road the enemy wants back. Their raiding parties move fast and come around the shoulders of the line. Watch your flanks and count your men - replacements are scarce out here.',
    threat: 'Raider-heavy. Persistent flanking on both edges. Enemy field guns range your trench between assaults.',
    approach: 'Wire the flanks, keep a fast rifle loose to plug gaps, and move when the shelling markers appear.',
    diffPips: 2,
    startSupplies: 65,
    rewardManpower: 25,
    waves: [
      { groups: [{ type: 'infantry', n: 6,  start: 1, gap: 9, burst: 3 },
                 { type: 'raider',   n: 4,  start: 4, gap: 8, burst: 2, lane: 'edges' }] },
      { groups: [{ type: 'raider',   n: 8,  start: 1, gap: 7, burst: 4, lane: 'edges' },
                 { type: 'infantry', n: 6,  start: 5, gap: 9, burst: 3 }] },
      { prepShell: { shells: 3 },
        groups: [{ type: 'raider',   n: 10, start: 1, gap: 6, burst: 5, lane: 'edges' },
                 { type: 'infantry', n: 8,  start: 4, gap: 8, burst: 4 },
                 { type: 'heavy',    n: 2,  start: 14, gap: 0, burst: 2 }] },
      { prepShell: { shells: 4 },
        groups: [{ type: 'raider',   n: 12, start: 1, gap: 6, burst: 4, lane: 'edges' },
                 { type: 'infantry', n: 8,  start: 3, gap: 8, burst: 4 },
                 { type: 'heavy',    n: 3,  start: 10, gap: 7, burst: 3 }] },
      { prepShell: { shells: 4 },
        groups: [{ type: 'raider',   n: 14, start: 1, gap: 5, burst: 7, lane: 'edges' },
                 { type: 'infantry', n: 8,  start: 4, gap: 7, burst: 4 },
                 { type: 'heavy',    n: 4,  start: 8, gap: 8, burst: 2 }] },
    ],
    preMsg: [
      'The road must hold. Raiding parties reported moving up both hedgerows.',
      'They are probing the shoulders of the line. Do not bunch up in the centre.',
      'Field guns have our range. When the markers fall, MOVE.',
      'Half their raiders are dead. The other half are coming anyway.',
      'Final push forming. Everything they have left, on both flanks at once.',
    ],
    postMsg: [
      'Road intact. Keep your men spread and your eyes open.',
      'HQ notes your losses. Replacements are not coming tonight.',
      'Good shooting. Their guns will answer for it - stay loose.',
      'They are running out of men faster than you are. Barely.',
    ],
  },
  {
    id: 'batterie', name: 'BATTERIE RIDGE',
    pin: { x: 78, y: 58 },
    briefing: 'The gun batteries on this ridge have hammered the whole sector for a month. Tonight they are defended by everything the enemy can walk, drive, or drag up the slope. Take the assault, break it, and the ridge is ours. This is the one, commander.',
    threat: 'Heavy infantry in mass, repeated armour, constant shelling between assaults.',
    approach: 'Bring your veterans. Buy every barrage HQ will sell you and spend them on the heavy squads. Keep a medic breathing.',
    diffPips: 3,
    startSupplies: 90,
    rewardManpower: 30,
    waves: [
      { groups: [{ type: 'infantry', n: 10, start: 1, gap: 8, burst: 5 },
                 { type: 'heavy',    n: 3,  start: 10, gap: 0, burst: 3 }] },
      { prepShell: { shells: 4 },
        groups: [{ type: 'infantry', n: 10, start: 1, gap: 8, burst: 5 },
                 { type: 'raider',   n: 6,  start: 3, gap: 7, burst: 3, lane: 'edges' },
                 { type: 'heavy',    n: 4,  start: 9, gap: 8, burst: 2 }] },
      { prepShell: { shells: 4 },
        groups: [{ type: 'infantry', n: 8,  start: 1, gap: 8, burst: 4 },
                 { type: 'heavy',    n: 4,  start: 6, gap: 10, burst: 2 },
                 { type: 'tank',     n: 1,  start: 14, gap: 0, burst: 1 }] },
      { prepShell: { shells: 5 },
        groups: [{ type: 'infantry', n: 10, start: 1, gap: 7, burst: 5 },
                 { type: 'raider',   n: 6,  start: 3, gap: 6, burst: 3, lane: 'edges' },
                 { type: 'heavy',    n: 4,  start: 8, gap: 9, burst: 2 },
                 { type: 'tank',     n: 1,  start: 16, gap: 0, burst: 1 }] },
      { prepShell: { shells: 5 },
        groups: [{ type: 'infantry', n: 8,  start: 1, gap: 7, burst: 4 },
                 { type: 'raider',   n: 6,  start: 4, gap: 6, burst: 3, lane: 'edges' },
                 { type: 'heavy',    n: 5,  start: 6, gap: 9, burst: 3 },
                 { type: 'tank',     n: 2,  start: 12, gap: 16, burst: 1 }] },
    ],
    preMsg: [
      'The ridge is awake. Heavy squads forming on the slope - they know we are coming for the guns.',
      'Their batteries are firing over open sights now. Keep moving between assaults.',
      'ARMOUR on the slope. More behind it. Spend your barrages well.',
      'HQ asks if you can hold. Tell them yes and make it true.',
      'This is the last of them. Break this assault and the guns fall silent for good.',
    ],
    postMsg: [
      'First assault broken on the wire. The ridge shudders.',
      'Still standing. The batteries sound almost nervous.',
      'Armour burning on the slope. Beautiful.',
      'One more. One more and we go up the hill instead.',
    ],
  },
];

/* base requisition points awarded for completing a mission */
const RP_BASE = 2;           // +1 no deaths, +1 line integrity kept above half, +difficulty bonus
