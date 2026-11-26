// What an asset can be asked to do (docs/design/covert.md): the calls and disinformation offered, each with the hints that tell the player who to send.
import { type JudgedTemplate } from "./judged";
import { type CovertEffect } from "../core/state";
import { type AssetKind } from "./humint";

export interface HumintTemplate {
  id: string;
  kind: "call" | "disinfo";
  effect: CovertEffect;
  title: string;
  cost: [number, number];
  days: [number, number];
  judged: JudgedTemplate;
  /** Only through these kinds of asset (default: any). */
  through?: AssetKind[];
  success: string;
  /** A failure on an easy or routine job: the asset stays, shaken. */
  shaken: string;
  /** A failure on a hard job: the asset is burned. */
  fail: string;
  catastrophe: string;
}

// {name} the asset, {role} who they are, {city}, {region}, {bloodline} the target.
// Hints follow the vocabulary in sim/campaign/coverups.ts.
export const HUMINT_TEMPLATES: HumintTemplate[] = [
  {
    id: "call-money",
    kind: "call",
    effect: "steady",
    cost: [10_000, 30_000],
    days: [1, 2],
    title: "{name} wants more money",
    judged: {
      text: "{name}, our {role} in {city}, says the risk has gone up and so should the fee.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "They mention the new car twice, and the risk not at all.",
          laity: true,
          why: "It was never about the risk. Someone who could read them would have seen it.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "They have started going to Mass again, and asking whether what they do for us is a sin.",
          laity: true,
          why: "They needed to hear that it wasn't. We talked about money.",
          success:
            "An hour in a side chapel, and no envelope. {name} is still ours, at the old fee.",
        },
        {
          weights: { combat: 0.7, insight: 0.3 },
          hint: "Someone has been leaning on them for a cut, and they want it to stop.",
          why: "The man leaning on them is still leaning. It needed someone he'd have stepped back from.",
          success:
            "The man who wanted a cut has decided he doesn't. {name} is still ours, at the old fee.",
        },
      ],
      tiers: {
        easy: "They'd settle for being taken seriously.",
        routine: "",
        hard: "They have another buyer, or say they do.",
        "very-hard": "They have already met the other side, once.",
      },
    },
    success: "A long lunch and an envelope. {name} is still ours, at the old fee.",
    shaken:
      "{name} took the envelope and grumbled. They're still ours, for now, and not happy about it.",
    fail: "{name} took the envelope and stopped answering the phone. We have to assume they are gone.",
    catastrophe:
      "{name} went to the police with everything, including the names of everyone else we run in {region}.",
  },
  {
    id: "call-followed",
    kind: "call",
    effect: "lead",
    cost: [5_000, 20_000],
    days: [1, 3],
    title: "{name} thinks they're being followed",
    judged: {
      text: "{name} has seen the same car three nights running outside their door in {city}.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "It parks somewhere different each night, but always with a view of the door.",
          why: "We were seen watching. It needed someone who can disappear on a street.",
        },
        {
          weights: { insight: 0.8, faith: 0.2 },
          hint: "{name} is calling every hour, wants a bodyguard, and has been drinking.",
          why: "They needed calming, not guarding, and we didn't see it.",
          success:
            "There was a car, once. The rest was nerves, and {name} is steadier now. Talking it through, they remembered the one thing that mattered: where the car went.",
        },
        {
          weights: { combat: 0.7, tradecraft: 0.3 },
          hint: "Last night the driver got out and tried their door.",
          why: "The driver was waiting for us, and he was the stronger.",
        },
      ],
      tiers: {
        easy: "The watcher smokes with the window down: he isn't trying hard.",
        routine: "",
        hard: "Whoever it is has done this before.",
        "very-hard": "There are two cars now, and they change shifts like professionals.",
      },
    },
    success: "{name} was right. The watcher was a thrall, and he led us home.",
    shaken: "We didn't catch the watcher, but he hasn't been back. {name} jumps at every car now.",
    fail: "Our operator was spotted. {name} is blown, and has gone to ground.",
    catastrophe:
      "The watcher saw our operator, followed them in turn, and rolled up everything we have in {region}.",
  },
  {
    id: "call-cousin",
    kind: "call",
    effect: "intel",
    cost: [10_000, 25_000],
    days: [2, 3],
    title: "{name}'s cousin wants in",
    judged: {
      text: "{name} has a cousin who works nights at a freight depot in {city} and has seen things. {name} wants us to meet him. Nobody has vetted him.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "He talks too readily, and he asked {name} how much the Church pays.",
          why: "He was selling, and we were buying blind.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "He hasn't slept since he saw what was in the containers, and he crosses himself when he talks about it.",
          why: "He needed someone who could hear it without flinching.",
        },
        {
          weights: { tradecraft: 0.7, insight: 0.3 },
          hint: "The depot has cameras everywhere, and his shift boss watches him.",
          why: "The meeting was seen. It needed someone who knows how to make a meeting unseen.",
        },
      ],
      tiers: {
        easy: "He is desperate to tell someone.",
        routine: "",
        hard: "He has told two people already, and neither is ours.",
        "very-hard": "The depot is theirs, from the gate to the loading bays.",
      },
    },
    success: "The cousin is real, frightened, and full of useful detail.",
    shaken: "The cousin got cold feet and won't meet again. {name} is embarrassed, but still ours.",
    fail: "The cousin talked to the wrong people about the meeting. {name} is burned with him.",
    catastrophe:
      "The cousin belonged to them. He knew {name}, and {name} knew the others in {region}.",
  },
  {
    id: "call-tonight",
    kind: "call",
    effect: "lead",
    cost: [5_000, 15_000],
    days: [1, 1],
    title: "{name} needs a meeting tonight",
    judged: {
      text: "A coded call from {name} in {city}: something has happened, and it can't be said on the phone.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "They want to meet at the station at midnight, where the police make their rounds.",
          why: "The meeting needed someone who could get there, and away, unseen.",
        },
        {
          weights: { combat: 0.8, faith: 0.2 },
          hint: "There is shouting in the background before the line drops.",
          why: "Whoever was shouting was still there when we arrived, and we weren't ready for them.",
        },
        {
          weights: { faith: 0.8, insight: 0.2 },
          hint: "They are whispering, and they keep saying they saw its face.",
          why: "They had seen one of them, and needed someone who wouldn't break when they described it.",
        },
      ],
      tiers: {
        easy: "They sound more excited than afraid.",
        routine: "",
        hard: "They name a meeting place they've never used before.",
        "very-hard": "They say they can't be sure the line is clean, and hang up.",
      },
    },
    success: "Something had happened, and now we know where.",
    shaken:
      "The meeting went badly, and {name} couldn't say much that made sense. They're still ours.",
    fail: "Our operator was late, and {name} was gone. We don't know if they ran or were taken.",
    catastrophe:
      "It was a trap, and {name} had walked into it first. They had our other names in {region} by morning.",
  },
  {
    id: "call-sell",
    kind: "call",
    effect: "intel",
    cost: [40_000, 80_000],
    days: [2, 4],
    through: ["access", "pr", "informant"],
    title: "{name} has something to sell",
    judged: {
      text: "{name} has copied a file in {city} that they swear is worth a great deal of money.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "They won't let us see it before we pay, and the price keeps changing.",
          why: "The file was never what they said. Someone sharper would have known before the money changed hands.",
        },
        {
          weights: { tradecraft: 0.7, insight: 0.3 },
          hint: "They copied it in a hurry, from an office with cameras.",
          why: "The copy left a trail, and we followed it straight back in.",
        },
      ],
      tiers: {
        easy: "They're nervous, and want it off their hands.",
        routine: "",
        hard: "Someone else has been asking about the same file.",
        "very-hard": "The file came from the bloodline's own lawyers, and they count their papers.",
      },
    },
    success: "The file is genuine. Worth every cent.",
    shaken: "The file was worthless, and we didn't buy it. {name} is sulking, but still ours.",
    fail: "The file was a fake, and someone knew {name} had made it. {name} is finished.",
    catastrophe:
      "The file was bait, and asking about it burned {name} and everyone near them in {region}.",
  },
  {
    id: "call-enough",
    kind: "call",
    effect: "cheaper",
    cost: [5_000, 15_000],
    days: [1, 2],
    title: "{name} has had enough",
    judged: {
      text: "{name} wants out.",
      variants: [
        {
          weights: { faith: 1 },
          hint: "They have been to confession for the first time in years, and haven't stopped thinking about it since.",
          laity: true,
          why: "They needed to be told that what they do is good. We couldn't make them believe it.",
        },
        {
          weights: { insight: 0.8, tradecraft: 0.2 },
          hint: "They say it's their family. They've also been seen twice with a man nobody knows.",
          why: "It wasn't the family. We didn't see it.",
        },
        {
          weights: { combat: 0.6, faith: 0.4 },
          hint: "Someone spoke to their daughter at the school gates, and said their name.",
          laity: true,
          why: "They needed to know someone would stand between them and it. We didn't convince them.",
        },
      ],
      tiers: {
        easy: "They want to be talked round.",
        routine: "",
        hard: "They have already packed.",
        "very-hard": "They have already told their family everything.",
      },
    },
    success: "{name} stays, and for less: they want this to end as much as we do.",
    shaken: "{name} stays, for now, but they've stopped returning calls the same day.",
    fail: "{name} couldn't be talked round, and is out.",
    catastrophe:
      "{name} told their family everything, and the family told the papers. Our network in {region} is finished.",
  },
  {
    id: "dis-trail",
    kind: "disinfo",
    effect: "false-trail",
    cost: [80_000, 150_000],
    days: [4, 7],
    through: ["informant", "access"],
    title: "A false trail for {bloodline}, {region}",
    judged: {
      text: "Through {name}, our {role} in {city}, we can feed {bloodline} a story: that we are closing in, from the wrong direction. They will move, and wait, and we will know where.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "The story has to reach one of their go-betweens, a lawyer who believes nothing he can't check.",
          why: "The lawyer didn't believe it. We misjudged what he'd swallow.",
        },
        {
          weights: { tradecraft: 1 },
          hint: "It has to be planted: papers left where their people search, on a phone line we know they tap.",
          why: "The plant was clumsy, and they saw the hand behind it.",
        },
      ],
      tiers: {
        routine: "",
        hard: "They have been fooled once before, and are watching for it.",
        "very-hard": "Their elder checks every story twice, in person.",
      },
    },
    success:
      "{bloodline} believed it. They have gone quiet in {region}, and what they kept here is where we said it would be.",
    shaken: "{bloodline} didn't bite, and doesn't seem to know who tried. {name} is still ours.",
    fail: "{bloodline} smelled it, and traced the story back to {name}. {name} is burned.",
    catastrophe: "{bloodline} traced the story back through {name} to everyone we run in {region}.",
  },
  {
    id: "dis-counter",
    kind: "disinfo",
    effect: "counter-story",
    cost: [60_000, 120_000],
    days: [3, 5],
    through: ["pr"],
    title: "Kill the story, {region}",
    judged: {
      text: "The bloodlines' campaign in {region} has worked. {name}, our {role} in {city}, can plant the other side of it: the money behind it, and who it serves.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "It needs an editor who will run it, and he will have to be persuaded it's true.",
          why: "The editor didn't believe us. Someone who could read him would have known what he needed to see.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "The campaign was against the Church itself, and the parishes of {region} want an answer from someone who believes it.",
          why: "The answer needed conviction behind it, and ours didn't carry.",
        },
      ],
      tiers: {
        easy: "The campaign has already started to sour on its own.",
        routine: "",
        hard: "The campaign's backers are local, and well liked.",
        "very-hard": "Half the press in {region} took their money.",
      },
    },
    success: "The counter-story ran everywhere. Opinion in {region} has swung back.",
    shaken: "Nobody ran it, and nobody remembers who asked. {name} is still ours.",
    fail: "Nobody ran it, and the people who were asked remember who asked. {name} is burned.",
    catastrophe:
      "It ran, with {name}'s name on it, and the names of everyone else we have in {region}.",
  },
  {
    id: "dis-bait",
    kind: "disinfo",
    effect: "bait",
    cost: [100_000, 180_000],
    days: [5, 8],
    title: "Bait for {bloodline}, {city}",
    judged: {
      text: "{name} can let it slip, in the right ears in {city}, that the Order has something {bloodline} wants back. Whoever comes for it will show us where they come from.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "Whoever comes will be careful, and the streets around the drop are narrow and quiet.",
          why: "They saw the tail. It needed someone who can follow without being followed.",
        },
        {
          weights: { combat: 0.7, tradecraft: 0.3 },
          hint: "Whoever comes will come in numbers, and won't leave without it.",
          why: "They came in numbers, and we couldn't hold them long enough to follow.",
        },
      ],
      tiers: {
        routine: "",
        hard: "They'll send someone who has done this before.",
        "very-hard": "They'll send one of their own, not a thrall.",
      },
    },
    success:
      "They came for it, and we followed them home. We know a great deal more about {bloodline}.",
    shaken:
      "Nobody took the bait, and nobody seems to have noticed who set it. {name} is still ours.",
    fail: "Nobody took the bait, but someone noticed who set it. {name} is burned.",
    catastrophe: "They took the bait, and {name}, and through {name} everyone we have in {region}.",
  },
];

export const isHumintTemplate = (id: string) => HUMINT_TEMPLATES.some((t) => t.id === id);
export const humintTemplate = (id: string) => HUMINT_TEMPLATES.find((t) => t.id === id);
