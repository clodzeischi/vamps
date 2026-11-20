// The people behind the dispatches: the Order's cardinal, who hands the player
// its work, and the eldest of each bloodline (docs/WEB_PORT.md 2c).
// Portraits live in public/assets/portraits (480×600 JPEG, 4:5, head and
// shoulders). A person without one gets a framed placeholder.

import type { SceneId } from "../sim/state";

export interface Person {
  id: string;
  name: string;
  /** Short form for captions ("Cardinal Valsecchi"). */
  short: string;
  title: string;
  /** File in public/assets/portraits, if we have one. */
  portrait?: string;
}

export const CARDINAL: Person = {
  id: "cardinal",
  name: "Cardinal Ettore Valsecchi",
  short: "Cardinal Valsecchi",
  title: "Prefect of the Ordo Potestatis Vera",
  portrait: "cardinal.jpg",
};

export interface Elder extends Person {
  bloodline: string;
  /** What the Order knows of them, once it knows enough (intel 50). */
  bio: string;
  /** What they say when we find their lair. */
  reveal: string;
  /** For generating a matching portrait (docs/WEB_PORT.md 2c). */
  prompt: string;
}

/** The eldest of each line: the one who sleeps in its lair. */
export const ELDERS: Record<string, Elder> = {
  ashgrove: {
    id: "ashgrove", bloodline: "ashgrove",
    name: "Josiah Ashgrove", short: "Josiah Ashgrove", title: "The Patriarch of House Ashgrove",
    portrait: "ashgrove.jpg",
    bio:
      "A deacon from Bristol, turned in 1636 by a Perfectus hiding among the Separatists, and on a ship to Massachusetts Bay within the year. " +
      "He has owned land, then railroads, then newspapers. Today he is the quiet chairman of the Ashgrove Foundation, and the friend of every " +
      "governor who ever needed a hospital wing. He has never lost an argument in public.",
    reveal: "You have found the house. Wipe your feet. I have buried better men than you in its garden, and they were all very sure of themselves too.",
    prompt: "an elegant old-money American patriarch, apparent age 60, silver hair swept back, clean-shaven, thin smile, charcoal three-piece suit and a mourning pin, in a wood-panelled Boston library at night",
  },
  huaca: {
    id: "huaca", bloodline: "huaca",
    name: "Inés Quispe Sisa", short: "Inés Quispe Sisa", title: "The Silver Widow of the Huaca Line",
    portrait: "ines.jpg",
    bio:
      "Born in Potosí around 1590 to an Inca noblewoman and a Spanish mine-owner, turned by a Perfectus who came over with the silver fleets. " +
      "The Church has buried her three times. Her money is in mining, and her people are wherever the mines are.",
    reveal: "Three times your Church put me in the ground. Come and try a fourth. Bring your priests. I remember all their names.",
    prompt: "a regal Andean woman, apparent age 40, high cheekbones, black hair braided with silver thread, dark embroidered colonial-era dress under a modern black coat, a silver tupu pin, candlelit adobe chapel with gold leaf behind her",
  },
  carcassonne: {
    id: "carcassonne", bloodline: "carcassonne",
    name: "Agnes of Toulouse", short: "Agnes", title: "The Last Perfect, mistress of the Serpenta Sigil",
    portrait: "agnes.jpg",
    bio:
      "A weaver's daughter from Toulouse who took the consolamentum at nineteen and preached in the hill towns of the Lauragais for twenty years " +
      "before the siege. Every other bloodline descends from the handful who came down the mountain with her, and she has outlived them all. " +
      "She does not raise her voice, she does not hurry, and no one has ever seen her feed. She has hated the Church for eight hundred years, patiently.",
    reveal: "So you found Montségur. I have been waiting there since your Church lit the fire. Come up the mountain, children. It is a long climb, and I will be at the top.",
    prompt: "",
  },
  sahel: {
    id: "sahel", bloodline: "sahel",
    name: "Zahra of Taoudenni", short: "Zahra", title: "The Salt Queen of the Sahel Brood",
    portrait: "zahra.jpg",
    bio:
      "She ran salt caravans out of Taoudenni in the 1340s, when salt was worth its weight in gold, and was turned on the road to Timbuktu. " +
      "She breeds her thralls the way she once bred camels: for endurance. Her brood owns transport, mines and the men who guard them, " +
      "from the Maghreb to the Cape.",
    reveal: "The desert has buried empires, little priests. It will not even notice you.",
    prompt: "a commanding Saharan woman, apparent age 45, dark skin, indigo veil drawn back from her face, silver and amber jewellery, a heavy indigo robe, standing in a lamplit desert fortress of salt-block walls at night",
  },
  jade: {
    id: "jade", bloodline: "jade",
    name: "Shen Wuyou", short: "Shen Wuyou", title: "The Chancellor of the Jade Court",
    portrait: "shen.jpg",
    bio:
      "A secretary of the Ming emperors' secret police in the 1570s, turned by a Perfectus who had come east on the Silk Road three centuries before. " +
      "He has served nine dynasties and governments since, never once under his own name. The Jade Court is the hardest of the six to see, " +
      "because he built it to be.",
    reveal: "I have read every report you ever filed about me. They were very thorough. I corrected the spelling.",
    prompt: "a gaunt, composed East Asian man, apparent age 55, close-cropped grey hair, round wire glasses, a black Mandarin-collar suit, a jade ring, seated in a dim modern office with a Ming scroll painting and city lights behind him",
  },
  nullarbor: {
    id: "nullarbor", bloodline: "nullarbor",
    name: "Cornelis Vos", short: "Cornelis Vos", title: "The Wreck-Lord of the Nullarbor Kin",
    portrait: "vos.jpg",
    bio:
      "An under-merchant of the Dutch East India Company, wrecked on the coast of New Holland in 1641 with a Perfectus in irons below decks. " +
      "Of the hundred and ninety aboard, only Vos was ever seen again. Forty years under the southern sun burned the weakness out of him: " +
      "his line takes daylight better than any other. He owns stations, ports and pearling fleets.",
    reveal: "The sun out here kills ordinary men in an afternoon. I have walked in it for three hundred years. You'll want a hat.",
    prompt: "a weathered, sun-scarred Dutch sea captain, apparent age 50, pale grey eyes, close-trimmed red-grey beard, a modern linen shirt under an old VOC officer's coat, standing on a jetty at dusk with a red desert coastline behind him",
  },
};

/** Pictures for how a lead came in, shown in place of the cardinal's portrait
 *  (he still passes it on). A scene without a file falls back to him. */
export const SCENES: Record<SceneId, { file?: string; caption: string }> = {
  sigint: { file: "sigint.jpg", caption: "SIGINT intercept" },
  humint: { file: "humint.jpg", caption: "HUMINT" },
  // How a team got in: our jet drops it in free fall, a helicopter sets down on a roof, a hired flight lands at an airport.
  freefall: { file: "arrive-freefall.jpg", caption: "Free fall" },
  rooftop: { file: "arrive-rooftop.jpg", caption: "Rooftop landing" },
  passport: { file: "arrive-passport.jpg", caption: "Passport control" },
};

/** Who speaks in a dispatch (GameEvent.speaker): the cardinal or a bloodline's elder. */
export const personById = (id: string | undefined): Person | undefined => (id === CARDINAL.id ? CARDINAL : id ? ELDERS[id] : undefined);

/** We learn who leads a line as we learn about it: their name at this much intel, their story at the next. */
export const ELDER_NAME_INTEL = 20;
export const ELDER_BIO_INTEL = 40;
