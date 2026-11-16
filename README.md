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

Files are renamed by role. The geoscape tracks were re-encoded to 128 kbps
MP3 (the battle tracks from the original Ogg Vorbis); "Crystal Cave" is the original file (it is already below 128 kbps).

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

### Maps and textures

* Earth textures: [Solar System Scope](https://www.solarsystemscope.com/textures/),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
* Borders, regions, cities and town names: [Natural Earth](https://www.naturalearthdata.com/)
  (public domain).
