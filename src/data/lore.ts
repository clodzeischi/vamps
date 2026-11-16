// What the Order learns about each bloodline as its intel grows: one entry
// every LORE_STEP points (the Bloodlines screen's chronicle). At 20 the
// line's history and its elder's name; at 40 the elder (their bio, from
// people.ts); then how the line works today, a secret, and at 100 where the
// elder sleeps (the lair). The 100 entry never names a city: lairs other
// than Montségur are placed when found.
import { ELDERS } from "./people";

export const LORE_STEP = 20;

export interface LoreEntry {
  /** Intel at which it's revealed. */
  at: number;
  title: string;
  text: string;
}

const elder = (id: string): LoreEntry => ({ at: 40, title: ELDERS[id]!.title, text: ELDERS[id]!.bio });

export const LORE: Record<string, LoreEntry[]> = {
  ashgrove: [
    {
      at: 20, title: "Older than the republic",
      text: "House Ashgrove came to New England with the Puritans and has never left. Its first thralls were indentured servants on a Massachusetts farm; " +
        "its first war, King Philip's, fed it for a year. In 1692, when Salem Village began to whisper about what walked at night, the house gave it " +
        "witches instead: nineteen hanged, and every one of them had seen something. Old Boston families still marry into it without knowing what they have married.",
    },
    elder("ashgrove"),
    {
      at: 60, title: "The Foundation",
      text: "The house works through the Ashgrove Foundation: hospitals, blood banks in four states, a medical school, and the networks that decide which " +
        "disappearances make the evening news. It would rather own a story than kill a witness, and it usually can.",
    },
    {
      at: 80, title: "A house divided",
      text: "Josiah's grandchildren are restless. A faction in Texas and Florida wants the house to stop hiding and rule openly; he has had two of its " +
        "leaders bricked into the family vault for saying so. The house is never more dangerous than when it is quarrelling, and never more careless.",
    },
    {
      at: 100, title: "Where the Patriarch sleeps",
      text: "He never sleeps twice in the same bed, except on the anniversary of his turning, when he goes home to the first house he built in America and " +
        "the whole line comes to guard it. Every thread we hold now runs to that house.",
    },
  ],
  huaca: [
    {
      at: 20, title: "Born of the silver mountain",
      text: "The Huaca Line was born at Potosí, where the Cerro Rico swallowed the men who mined it by the hundred thousand. A huaca is a sacred thing in Quechua: " +
        "a mountain, a spring, an ancestor who is fed and dressed and consulted. The line took the name, and the custom.",
    },
    elder("huaca"),
    {
      at: 60, title: "The concessions",
      text: "The line owns mining concessions from Colombia to Patagonia, and the private security that guards them. When men go missing underground it is " +
        "an accident, the company pays the families well, and the priest who asks too many questions is moved to another parish.",
    },
    {
      at: 80, title: "Three burials",
      text: "The Dominicans of Lima kept the records of all three burials: 1661, 1780 and 1932. Each time the ground was consecrated and the coffin lined with silver, and each " +
        "time she came out sooner. The last report, from 1932, adds one line in a shaking hand: the silver burned her. It does not say for how long.",
    },
    {
      at: 100, title: "The bundle",
      text: "Like the Inca kings, Inés is carried. When she sleeps she sleeps seated and bundled, and her household brings her food and news as if she were " +
        "awake. Wherever the bundle rests is the heart of the line, and now we know where it rests.",
    },
  ],
  carcassonne: [
    {
      at: 20, title: "The fire at Montségur",
      text: "In March 1244 the crusaders burned more than two hundred of the Cathar Perfect at the foot of Montségur. The Inquisition's register lists them by name. " +
        "It does not list the handful who walked out of the fire, because the men who wrote it never told anyone what they saw.",
    },
    elder("carcassonne"),
    {
      at: 60, title: "Lyon, Turin, Geneva",
      text: "The Perfecti do not hunt in the street like the younger lines. They own: private banks, a Swiss clinic, foundations that fund half the restorations " +
        "in southern France. Europe's goodwill is theirs to spend, and they spend it against us.",
    },
    {
      at: 80, title: "What she wants",
      text: "She does not want Europe; she has it. She wants the Church to confess: a pope at the foot of the mountain, admitting what was done there. " +
        "Every move she has made since the fire is aimed at that day, and she will not risk it to save anything else.",
    },
    {
      at: 100, title: "The hall under the mountain",
      text: "She waits on Montségur itself, in a hall the Perfect cut into the rock before the siege. The castle above it is a ruin for tourists. " +
        "The hall below has never been empty.",
    },
  ],
  sahel: [
    {
      at: 20, title: "The salt roads",
      text: "For six centuries the brood moved with the caravans. Wherever the salt went, it fed on the men who walked beside it, and the desert kept the bodies. " +
        "The camel drivers had a word for the riders who joined at night and were gone by morning. The word is still used, and nobody says why.",
    },
    elder("sahel"),
    {
      at: 60, title: "Trucks and guards",
      text: "The caravans are lorries now. The brood owns transport companies, mine security and the militias that tax the migrant routes, and it feeds " +
        "where nobody counts the dead: in the convoys, the camps, the mining towns at the end of the road.",
    },
    {
      at: 80, title: "Slow to breed",
      text: "Zahra's thralls live twice as long as any other line's, and her brood can go weeks without feeding. The other side of it: they are slow to replace. " +
        "Burn a nest of her thralls and it takes a generation to breed them again.",
    },
    {
      at: 100, title: "The salt walls",
      text: "She keeps court where her caravans always ended, behind walls of salt block in the cellars of a merchant's house, because no line of hers has ever " +
        "been found in a place that dry. We have found it.",
    },
  ],
  jade: [
    {
      at: 20, title: "The eastern road",
      text: "A Perfectus came east on the Silk Road in the thirteenth century and stayed. The Court takes its name from the imperial seal room, where its " +
        "first thralls served. It has hidden inside every Chinese state since, and outlived all of them.",
    },
    elder("jade"),
    {
      at: 60, title: "Rule by paper",
      text: "The Court rules by files: ministries, permits, registries, customs forms. Its thralls are clerks. Where it is strong, our visas are lost, " +
        "our shipments are held for inspection, and our people are followed by men who are not police.",
    },
    {
      at: 80, title: "The daily report",
      text: "Shen never meets anyone. He reads. Every thrall writes a report every day, and every report is read. A false report is the only crime the Court " +
        "punishes with death, and that is its weakness: the Court believes what is written down.",
    },
    {
      at: 100, title: "The archive",
      text: "He sleeps among his files, in an archive beneath a government building that appears on no plan. Six centuries of reports, and the man who read " +
        "them all, behind a door with no handle on the outside.",
    },
  ],
  nullarbor: [
    {
      at: 20, title: "The treeless plain",
      text: "The Kin are named for the Nullarbor, a sea of limestone with no trees and no water, where they hunted for two centuries. Stockmen, prospectors " +
        "and swagmen went missing on it for two hundred years, and the plain was blamed for every one.",
    },
    elder("nullarbor"),
    {
      at: 60, title: "Stations and pearls",
      text: "The Kin own cattle stations the size of small countries, a pearling fleet and the mining camps in between. Out there a thrall can work under the " +
        "sun for a lifetime and never see a policeman, and a man who goes missing has simply walked off.",
    },
    {
      at: 80, title: "The price of daylight",
      text: "The sun costs them all the same: they burn, slowly, and heal it in salt water. Their thralls carry sea water " +
        "in steel flasks, and none of them ever strays far from the coast for long.",
    },
    {
      at: 100, title: "The wreck-hall",
      text: "Vos sleeps in a hall built from the timbers of his own wreck, carried inland plank by plank, under a house by the sea. The ship's bell hangs over the " +
        "door. They say it rings when someone comes for him.",
    },
  ],
};

/** The entries revealed at this much intel. */
export const loreKnown = (bloodline: string, intel: number) => (LORE[bloodline] ?? []).filter((e) => intel >= e.at);
