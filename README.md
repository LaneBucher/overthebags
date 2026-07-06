# OVER THE BAGS

A WW1-inspired trench command campaign, playable in the browser. Muster a
section, fortify the line, call support, and carry survivors through three
sectors.

No build step, no dependencies: vanilla HTML/CSS/JS, Canvas, and WebAudio.

## Run

From this folder:

```sh
python -m http.server 8000
```

Open the printed URL. Opening `index.html` directly mostly works too, but a
local server streams the music more reliably.

## Files

```text
index.html    - screens and controls
styles.css    - UI theme
config.js     - tuning, sectors, waves, loadouts, enemies, costs
audio.js      - music manager and synthesized SFX
campaign.js   - save/load, roster, map, muster
game.js       - battle engine
audio/        - music tracks
```

## Audio

The five MP3 tracks live in `audio/` and are mapped in `AUDIO_TRACKS` at the
top of `config.js`. Missing music logs a warning and the game keeps running.
Gunfire and shells are synthesized in the browser.

## Campaign

Three sectors unlock in order:

1. **Sector 7 - The Mud Line.** Balanced intro: wire, MG, basic assaults.
2. **Saint Orane Road.** Raider-heavy flanking and prep-phase shelling.
3. **Batterie Ridge.** Heavy infantry, repeated armour, and the finale.

Save/load is automatic through `localStorage`. Battle progress is not saved
mid-mission; leaving a battle resumes from before that operation.

Difficulty options are Recruit, Regular, and Veteran. They scale enemy stats,
economy, breach limit, and shelling damage.

## Systems

- **Supplies** - mission money for wire, emplacements, repair, and recon.
- **Manpower** - campaign pool for replacements and extra deployed soldiers.
- **Requisition (RP)** - campaign rewards spent at muster.
- **Roster** - up to 10 living soldiers; deploy up to 6 per mission.
- **XP** - survivors progress from Green -> Seasoned -> Veteran.

Loadouts:

- **Rifleman** - balanced default.
- **Bayonet Trooper** - short range, strong at stopping breaches.
- **Medic** - weak rifle, heals nearby men.
- **Scout** - longer range, cheaper air recon.
- **Grenadier** - weak rifle, throws grenades at clusters.

Support:

- **Barbed wire** - slows and damages attackers; tanks crush it.
- **MG nest** - heavy firepower when a soldier is beside it.
- **Mortar pit** - shells clustered attackers.
- **Sniper post** - prioritizes raiders and heavy infantry.
- **Trench repair** - restores 1 line integrity in prep.
- **Planned barrage** - limited artillery charges called during battle.
- **Air recon** - reveals the next wave's composition and approach.

## Controls

- Click a soldier, roster card, or press `1`-`6` to select.
- Click trench ground to move the selected soldier.
- Right-click or `Esc` cancels selection or placement.
- `P` pauses.
- `M` mutes.
