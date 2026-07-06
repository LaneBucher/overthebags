# OVER THE BAGS

A WW1-inspired trench command campaign, playable in the browser. Muster a section,
equip your men, fortify the line, call the guns, and carry the survivors through
three brutal sectors - then take them over the bags.

No build step, no dependencies - vanilla HTML/CSS/JS + Canvas + WebAudio.

## Run it

Any static file server works. From this folder:

```
npx serve .
```

or

```
python -m http.server 8000
```

then open the printed URL. (Opening `index.html` directly mostly works too, but a
local server streams the music more reliably.)

## Files

```
index.html    - all screens
styles.css    - field-command UI theme
config.js     - EVERY tuning value: sectors, waves, loadouts, enemies, costs, difficulty
audio.js      - music manager + synthesized SFX
campaign.js   - campaign state, save/load, roster, map & muster screens
game.js       - the battle engine
audio/        - the five music tracks
```

## Audio files

The five tracks live in `audio/` and are mapped in `AUDIO_TRACKS` at the top of
`config.js` - the only place paths are referenced:

```
Over The Bags Main Theme.mp3  - menu + campaign map
Homeland.mp3                  - muster + prep phase
Anthem.mp3                    - prep before an armour wave, victory
Never Before.mp3              - active battle
March of the Tanks.mp3        - waves with tanks
```

A missing file logs a console warning and the game continues without it. Gunfire and
shells are synthesized in-browser; no sample files needed.

## The campaign

Three sectors on the map, unlocked in order. Between missions you return to the map
with your surviving roster, then **muster** before the next operation.

1. **Sector 7 - The Mud Line.** Balanced introduction. Wire, MG, the basics.
2. **Saint Orane Road.** Raider-heavy, flanking pressure on both edges, and enemy
   field guns shell your trench between assaults - move when the red markers appear.
3. **Batterie Ridge.** Heavy infantry in mass and repeated armour. Bring veterans
   and barrages. Winning it ends the campaign - over the bags.

**Save/load** is automatic (localStorage): New Campaign, Continue Campaign, and
Reset Campaign live on the main menu. Battle progress itself isn't saved mid-mission;
quitting a battle resumes the campaign from before the operation.

**Difficulty** (chosen at New Campaign): Recruit / Regular / Veteran - scales enemy
health and speed, supplies, manpower, requisition rewards, breach limit, and enemy
shelling damage.

## Resources

- **Supplies** - mission-scoped. Earned each wave; spent on wire, emplacements,
  trench repair, and air recon.
- **Manpower** - campaign-scoped. Recruits replacements (25) and pays for deploying
  a 5th/6th man (15 each). Earned by completing missions. Run dry and losses get scary;
  if the section is nearly wiped and broke, HQ scrapes up an emergency draft.
- **Requisition (RP)** - campaign-scoped, awarded for mission results (base + no
  deaths + line integrity + difficulty). Spent at muster on supplies, manpower,
  the field hospital, artillery charges, and MG ammunition.

## The section

Up to 10 living soldiers on the roster; deploy up to 6 per mission (4 free).
Each soldier persists: health, status (fit / wounded / dead), kills, missions, XP.
Survivors gain XP (kills capped per mission); levels - Green → Seasoned → Veteran -
add damage, fire rate, and a little health. Wounded men start weaker unless healed
(field hospital, a medic, or a mission's rest in reserve). The dead are gone.

**Loadouts** (assigned at muster, one per soldier):

- **Rifleman** - the balanced default.
- **Bayonet Trooper** - short range, takes less melee damage and butchers anything
  that reaches the bags. Anti-breach.
- **Medic** - weak rifle; heals nearby men, faster between assaults.
- **Scout** - longest rifle reach; air recon is cheaper while he's on the line.
- **Grenadier** - weak rifle, lobs a grenade at clustered enemies on a cooldown.

## Support & fortifications

- **Barbed wire** (20) - slows and wears down attackers; tanks crush it.
- **MG nest** (50, one) - the heaviest firepower, but only fires with a man beside it.
- **Mortar pit** (70, one) - automatically shells bunched attackers in no man's land.
- **Sniper post** (45, one) - slow, long-range kills; prioritizes raiders and heavies.
- **Trench repair** (30, prep only) - restores 1 line integrity.
- **Planned barrage** (1 RP per charge at muster, max 3 held) - during battle, click
  the button, then click no man's land: five shells arrive after a short delay with
  honest scatter. Devastating, limited, and on a cooldown.
- **Air recon** (25 supplies, 15 with a scout; prep only) - reveals the coming wave's
  composition, main approach, and any armour.

## Controls

- Click a soldier (or press 1–6, or click the roster card) to select; click trench
  ground to move him. Right-click / Esc deselects or cancels placement.
- Fortification and support buttons show costs and states; placement shows valid zones.
- **P** pause · **M** mute · music starts on your first click.

## What's implemented

- 3-sector campaign with map, briefings, threat profiles, and locked/completed states
- Persistent roster with XP/veterancy, wounds, deaths, and green replacements
- Manpower + requisition economies with a between-mission muster/requisition screen
- 5 soldier loadouts with real battlefield behaviors
- Planned artillery barrages, air recon (scout-discounted), mortar pit, sniper post,
  trench repair
- Enemy prep-phase bombardment with fair, dodgeable warnings (sectors 2–3)
- 3 difficulty settings touching enemy stats, economy, and breach limit
- localStorage save / continue / reset
- Everything from the original MVP: wave combat, wire, MG nest, commander telegraph,
  music state machine, synthesized SFX, pause/mute, screen shake, the charge finale

## Future work (not implemented)

- A withdraw/abort-mission option mid-battle
- Named enemy regiments and per-sector visual variants for the battlefield
- More loadouts (machine-gunner crew bonus), squad traits, morale
- A second campaign chapter; branching sector choices
- Sound-effect samples to replace the synthesized gunfire
