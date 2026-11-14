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

From [OpenGameArt.org](https://opengameart.org):

* **"No More Magic"** by [HorrorPen](https://opengameart.org/users/horrorpen),
  licensed [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  Source: https://opengameart.org/content/no-more-magic (main menu)
* **"Sirens in Darkness"** by The Cynic Project
  ([cynicmusic.com](https://cynicmusic.com) / [pixelsphere.org](https://pixelsphere.org)),
  [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
  Source: https://opengameart.org/content/sirens-in-darkness (geoscape)
* **"Crystal Cave (song18)"** by The Cynic Project
  ([cynicmusic.com](https://cynicmusic.com) / [pixelsphere.org](https://pixelsphere.org)),
  [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
  Source: https://opengameart.org/content/crystal-cave-song18 (geoscape)

The music files are unmodified, only renamed.

### Maps and textures

* Earth textures: [Solar System Scope](https://www.solarsystemscope.com/textures/),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
* Borders, regions and cities: [Natural Earth](https://www.naturalearthdata.com/)
  (public domain).
