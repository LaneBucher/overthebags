# OVER THE BAGS

A WW1-inspired trench defense game, playable in the browser. Command four soldiers,
fortify the line, survive five escalating assaults, then take your men over the bags.

No build step, no dependencies — vanilla HTML/CSS/JS + Canvas + WebAudio.

## Run it

Any static file server works. From this folder:

```
npx serve .
```

or

```
python -m http.server 8000
```

then open the printed URL (e.g. http://localhost:3000 or http://localhost:8000).

> Opening `index.html` directly from disk mostly works too, but a local server is
> recommended so the music streams reliably.

## Audio files

The five music tracks live in `audio/`:

```
audio/Over The Bags Main Theme.mp3   — menu / defeat
audio/Homeland.mp3                   — prep phase
audio/Anthem.mp3                     — prep before the final wave + victory charge
audio/Never Before.mp3               — active battle
audio/March of the Tanks.mp3         — final wave (armour assault)
```

To rename or swap tracks, edit the `AUDIO_TRACKS` object at the **top of `game.js`** —
that is the only place paths are referenced. A missing file logs a console warning and
the game continues without music. Gunfire/explosion sounds are synthesized in-browser
(no sample files needed).

## How to play

- **Click a soldier** (or press 1–4, or click their roster card) to select.
- **Click ground** in the trench to move the selected soldier.
- **Barbed wire** (20 supplies) slows and wears down enemies in no man's land.
- **MG nest** (50 supplies, one only) is your heaviest firepower — but it only
  fires while a soldier stands beside it.
- **Right-click / Esc** cancels placement or deselects. **P** pauses, **M** mutes.
- Press **STAND TO** when ready. Survive 5 assaults. Don't let 6 enemies breach
  the line, and don't lose all four men.

## What's implemented

- Full loop: menu → prep → wave → dispatch report → next wave → victory charge / defeat
- 4 named soldiers with health, movement orders, auto-fire, wounded state, death
- Barbed wire (slows + damages, wears out; tanks crush it) and a mannable MG nest
- 4 enemy types: infantry, fast raiders, armored heavies, and a shelling tank
- 5 scripted waves — squads advance in lines, escalating composition
- Supplies economy: base authorization + kill bounties per wave
- Commander message log (field telegraph) with scripted and reactive messages
- Breach / line-integrity loss condition alongside squad wipe
- Music manager keyed to game state with fades, plus synthesized SFX, mute, pause
- Screen shake, tracers, muzzle flashes, smoke, persistent craters and blood stains
- Victory "over the bags" charge sequence with campaign flavor

## Suggested next features (not implemented)

- Campaign map with multiple sectors and persistent squad veterancy
- Reinforcement/replacement soldiers between missions
- More defenses: mortar pit, sniper post, trench repair
- Enemy artillery barrages during prep that force repositioning
- The full design-doc systems as flavor becomes real: platoons, recon, supply convoys
- Save/load, difficulty settings, and a proper soundtrack toggle per track
