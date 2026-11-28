# Vamps

A strategy game of the secret war against vampires, in the tradition of the
1994 X-COM. You run the **Ordo Potestatis Vera**, a secret branch of the
Inquisition inside the Vatican, from a 3D geoscape: build SIGINT stations and
Operational Bases, chase leads, dispatch teams, and keep the war hidden for
as long as you can.

**Play:** https://clodzeischi.github.io/vamps/ (desktop browser)

Built with TypeScript, Three.js and React (Vite). Saves live in the browser
and can be exported to a file to continue on another computer.

## Development

```sh
npm install
npm run dev     # local server
npm test        # simulation tests
npm run build   # production build in dist/
```

Every push to `main` deploys to GitHub Pages. The design and plan of work are
in [docs/WEB_PORT.md](docs/WEB_PORT.md).

## Credits

### Music

From [OpenGameArt.org](https://opengameart.org), by The Cynic Project
([cynicmusic.com](https://cynicmusic.com) / [pixelsphere.org](https://pixelsphere.org)),
[CC0](https://creativecommons.org/publicdomain/zero/1.0/):

* **"Crystal Cave (song18)"**: main menu (`menu.mp3`).
  Source: https://opengameart.org/content/crystal-cave-song18
* **"Sirens in Darkness"**: geoscape (`geo1.mp3`).
  Source: https://opengameart.org/content/sirens-in-darkness
* **"Another August"**: geoscape (`geo2.mp3`).
  Source: https://opengameart.org/content/another-august

Also from OpenGameArt, for battles (Skirmish and missions):

* **"Background space track"** by yd, the track "My Very Own Dead Ship"
  (`stealth1.mp3`), [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
  Source: https://opengameart.org/content/background-space-track
* **"Creepy Forest (F)"** by Augmentality (Brandon Morris) (`stealth2.mp3`),
  dual-licensed CC0 or OGA-BY 3.0; used under CC0, credited anyway.
  Source: https://opengameart.org/content/creepy-forest-f
* **"Imminent Threat"** by Matthew Pablo ([matthewpablo.com](http://www.matthewpablo.com)),
  from the "Imminent Threat Collection": combat, once the enemy is alerted
  (`battle1.mp3`), [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  Source: https://opengameart.org/content/imminent-threat-collection
* **"Dramatic Action"** by HorrorPen: combat, after "Imminent Threat"
  (`battle2.mp3`), [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  Source: https://opengameart.org/content/dramatic-action
* **"Epic Boss Battle"** by Juhani Junkala: the boss track, once an elder is
  alerted (`boss1.mp3`), [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
  Source: https://opengameart.org/content/epic-boss-battle

Files are renamed by role and re-encoded to 128 kbps MP3 ("Crystal Cave" at
96 kbps, its original being below 128), each turned up or down to one
loudness so no track jumps out.

### Sound effects

In `public/assets/sfx/`, trimmed, loudness-matched and encoded as MP3,
renamed by role. Both from [OpenGameArt.org](https://opengameart.org),
[CC0](https://creativecommons.org/publicdomain/zero/1.0/):

* **"Zippo Click Sound"** by dawith: button clicks (`click.mp3`).
  Source: https://opengameart.org/content/zippo-click-sound
* **"Atmospheric Interaction Sound Pack"** (the sounds of the game Krank) by
  legoluft. Source: https://opengameart.org/content/atmospheric-interaction-sound-pack
  * `space/link.wav`: something complete (`complete.mp3`)
  * `water/magnet_action.wav`: vampire activity (`vampire.mp3`)
  * `industry/magnet_action.wav`: cover-up offer (`coverup.mp3`)
  * `water/exit.wav`: end-of-month report (`monthly.mp3`)
  * `water/magnet_start.wav`: SIGINT/HUMINT lead (`lead.mp3`)

From [Pixabay](https://pixabay.com), under the
[Pixabay Content License](https://pixabay.com/service/license-summary/) (free
for games, no credit required; credited anyway):

* **"Helicopter Sound 8D"** by dragon-studio: the helicopter flying off as a
  battle begins (`helicopter.mp3`, the first 6.5 s, faded out from 4 s). Pixabay id 372463.
* **"Birds Chirping Ambiance"** by freesound_community: birds by day in town
  and country (`birds.flac`). Source: https://pixabay.com/sound-effects/birds-chirping-ambiance-26052/
* **"Abstract Crickets"** by blender_abstract: crickets at night in town and
  country (`crickets.flac`). Source: https://pixabay.com/sound-effects/abstract-crickets-395138/
* **"Light Rain Ambient"** by soundsforyou: rain wherever it falls
  (`rain.flac`, a 29 s slice of the 9 min recording).
  Source: https://pixabay.com/sound-effects/light-rain-ambient-114354/
* **"Street Ambience Traffic"** by yuk1to: traffic in the city, faint in town
  streets (`traffic.flac`, a 36 s slice). Source: https://pixabay.com/sound-effects/street-ambience-traffic-410714/
* **"Wind Sounds"** by dragon-studio: wind over the country in winter
  (`wind.flac`). Source: https://pixabay.com/sound-effects/wind-sounds-429228/

Gunfire, cut, mono and matched in loudness (`shot-*.mp3`, `burst-*.mp3`,
`reload.mp3`). From Pixabay, under the Pixabay Content License:

* **"Pistol Shot"** by universfield: the pistol and the SMG (`shot-pistol`).
  Source: https://pixabay.com/sound-effects/pistol-shot-278821/
* **"Shotgun Blast"** by universfield: the semi-auto shotgun
  (`shot-shotgun-semi`). Source: https://pixabay.com/sound-effects/shotgun-blast-352038/
* **"Silenced Sniper Rifle"** by freesound_community: its first shot the
  suppressed pistol, its second the suppressed carbine (`shot-pistol-sd`,
  `shot-rifle-sd`). Source: https://pixabay.com/sound-effects/silenced-sniper-rifle-105895/
* **"M249 Sound Effects"** by sovetsky_rastov72: the M249's burst, cut to
  six rounds (`burst-m249`), and a single shot from it that is the M110's
  (`shot-m110`).
  Source: https://pixabay.com/sound-effects/m249-sound-effects-244559/
* **"Gun Shoot"** by u_2n07b18i8q: the M240B's burst, and a round from it
  for reaction fire from either machine gun (`burst-m240b`, `shot-m240b`). Source: https://pixabay.com/sound-effects/gun-shoot-512969/
* **"Pistol Cock"** by freesound_community: reloading (`reload`).
  Source: https://pixabay.com/sound-effects/pistol-cock-6014/
* **"Epic Cinematic Explosion"** by universfield: a grenade going off
  (`explosion-grenade`). Source: https://pixabay.com/sound-effects/epic-cinematic-explosion-454857/
* **"Explosion FX"** by soundreality: a rocket's explosion (`explosion-rocket`).
  Source: https://pixabay.com/sound-effects/explosion-fx-343683/
* **"Rocket Launch"** by freesound_community: a rocket launcher firing, the
  first of its three launches (`rocket-launch`).
  Source: https://pixabay.com/sound-effects/rocket-launch-76003/
* **"Knife Killing Sound"** by randomahhaccount, sliced: four stabs for the
  knife (`knife-1`–`knife-4`), the tearing slash for claws (`claws`), the
  swish for a blow that misses (`swish`), the thud for a body falling
  (`thud`).
  Source: https://pixabay.com/sound-effects/knife-killing-sound-332841/
* **"Bang"** by dragon-studio: the UV and smoke grenades bursting (`bang`).
  Source: https://pixabay.com/sound-effects/bang-487680/
* **"Glass Breaking"** by dragon-studio: a window's pane shattering
  (`glass-small`). Source: https://pixabay.com/sound-effects/glass-breaking-386153/
* **"Glass Breaking"** by dragon-studio: a glass door or a glass wall
  shattering (`glass-large`). Source: https://pixabay.com/sound-effects/glass-breaking-504033/
* **"Wooden Crate Smash 4"** by yodguard: a wooden door blown in
  (`door-smash`). Source: https://pixabay.com/sound-effects/wooden-crate-smash-4-387903/

And from [OpenGameArt.org](https://opengameart.org), sounds (c) by **Michel
Baradari** ([apollo-music.de](https://apollo-music.de)),
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/): its "pistol" is
our carbine (`shot-rifle`), its "rifle" our pump shotgun with the rack
(`shot-shotgun-pump`).

The loops are made the same way: trimmed, cut where the end best matches the
start, crossfaded, mono, loudness-matched to each other; WAV so they loop
without a gap.

### Maps and textures

* Earth textures: [Solar System Scope](https://www.solarsystemscope.com/textures/),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
* Borders, regions, cities and town names: [Natural Earth](https://www.naturalearthdata.com/)
  (public domain).
