// Cover-up operations: off-screen work that buys back secrecy.
//
// Offers arrive as a steady trickle, more often after loud incidents and when
// secrecy is low. Each costs money up front, some also tie up agents for a few
// days, and each can fail, or backfire and make things worse. An offer lapses
// if it isn't taken.
//
// HUMINT and counter-intelligence (not built yet) will feed `humintBonus`:
// more offers, and better odds on the ones taken.
import { REGIONS, regionById, type City } from "../data/regions";
import { chanceFromMargin, isSevere, judgedMargin, pickJudged, primaryStat, TIER_DIFFICULTY, TIER_REWARD, verdictLine, type JudgedTemplate, type Tier } from "./judged";
import { changeSupport } from "./economy";
import { rng, type Rng } from "./rng";
import { changeSecrecy } from "./secrecy";
import { effectWords, finishHumint, ignoredCall, isHumintTemplate } from "./humint";
import { addLog, improvementLine, isWounded, post, train, type Agent, type CoverUp, type GameState, type Place } from "./state";
import { DAY } from "./time";

/** Most offers open at once. */
export const MAX_OFFERS = 3;
/** Daily chance of a new offer with no pressure at all. */
export const BASE_OFFER_CHANCE = 0.05;
/** Share of failures that backfire: only hard and very hard jobs (and money-only offers) can. */
export const BACKFIRE_SHARE = 0.35;
export const BACKFIRE_SHARE_VERY_HARD = 0.5;
const backfireShare = (c: CoverUp) => (c.agents === 0 ? BACKFIRE_SHARE : !isSevere(c.tier) ? 0 : c.tier === "very-hard" ? BACKFIRE_SHARE_VERY_HARD : BACKFIRE_SHARE);

interface Template {
  id: string;
  title: string;
  /** Money range ($). */
  cost: [number, number];
  days: [number, number];
  agents: number;
  /** Secrecy restored on success (routine; scaled by tier). */
  gain: [number, number];
  /** Only offered when there has been recent noise. */
  needsHeat?: number;
  success: string;
  fail: string;
  backfire: string;
  /** Agents' work: readings of the situation and tiers (sim/judged.ts). */
  judged?: JudgedTemplate;
  /** Money and contacts only: the text as it stands. */
  text?: string;
}

// Hint vocabulary (docs/WEB_PORT.md, "Judged events"): faith is grief, guilt,
// fear for a soul, confession, and nerve: dread, a room something was done
// in, a voice at the door, a mind something has touched; insight is a story that shifts, an offer too
// good, a motive; tradecraft is cameras, locks, records, being watched;
// combat is hard men, muscle, threats, someone who only respects strength.
// Tiers: easy is careless or half-convinced, hard is wary or burned before,
// very hard is a professional, a crisis, someone already watching.
const TEMPLATES: Template[] = [
  {
    id: "terror",
    title: "A convenient cell, {city}",
    cost: [400_000, 650_000], days: [5, 7], agents: 1, gain: [5, 7], needsHeat: 3,
    judged: {
      text: "The authorities in {region} still have no explanation for what happened in {city}. A senior security official is open to an arrangement: the incident becomes the work of a radical cell, already dead. It needs someone of ours in the room.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "He talks freely, but his price moves every time he names it, and he keeps asking who else knows.",
          why: "He was never going to keep his side of it. Someone who could read him would have seen that in the first meeting.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "He goes to Mass, and he hasn't slept since he saw the morgue photographs. He wants to be told he is doing the right thing.",
          why: "He needed absolution more than money. Someone whose faith he could lean on might have held him.",
        },
        {
          weights: { combat: 0.7, tradecraft: 0.3 },
          hint: "His deputy leaks to the opposition, and he won't move while the deputy is talking. He wants the deputy to understand that he should stop.",
          why: "The deputy didn't frighten. It needed someone he would have believed.",
        },
      ],
      tiers: {
        routine: "",
        hard: "He has been burned by arrangements like this before, and trusts nobody.",
        "very-hard": "A journalist has called the nunciature twice already, and the minister is watching him.",
      },
    },
    success: "The minister read the statement on the evening news. A cell that never existed has taken the blame, and the story is closed.",
    fail: "The official took the money and lost his nerve. The incident stays unexplained; at least nobody is asking about us.",
    backfire: "The official recorded the meeting. Fragments leaked to a journalist, and now there are questions about a foreign religious order.",
  },
  {
    id: "evidence",
    title: "The evidence locker, {city}",
    cost: [50_000, 110_000], days: [2, 4], agents: 2, gain: [1.5, 3],
    judged: {
      text: "A shirt soaked in blood that won't test as human sits in a police evidence room in {city}. It has to be swapped for one soaked in ordinary blood before the lab picks it up.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "The room is in the basement of the central station: one door, a camera, a sign-in book.",
          why: "Getting in and out unseen was the whole job. It wanted quieter hands.",
        },
        {
          weights: { insight: 0.7, tradecraft: 0.3 },
          hint: "The clerk who keeps the room has debts and a temper, and might be open to the right conversation.",
          why: "The clerk was the way in, and we misjudged him.",
        },
        {
          weights: { combat: 0.6, tradecraft: 0.4 },
          hint: "It leaves tonight in a courier's van. The courier was robbed once last year, and now he carries a baton and isn't shy with it.",
          why: "The courier fought, and won. It needed someone who could have held him without hurting him.",
          fail: "The courier kept hold of the bag, and the sample reached the lab. We'll have to hope nobody reads the report closely.",
        },
      ],
      tiers: {
        easy: "The station is half-empty for the holidays, and everyone left in it is bored.",
        routine: "",
        hard: "Internal affairs has the building under review, and everyone in it is on their best behaviour.",
        "very-hard": "A federal team has taken over the case, and they guard their evidence like a relic.",
      },
    },
    success: "The swap went unnoticed. The lab report came back: human, type O. Case closed.",
    fail: "The sample moved before we got to it, and is now beyond reach. We'll have to hope nobody looks closely.",
    backfire: "Our people were seen, and the police are asking who wanted that shirt so badly.",
  },
  {
    id: "editor",
    title: "The story, {city}",
    cost: [120_000, 220_000], days: [2, 3], agents: 1, gain: [1.5, 3],
    judged: {
      text: "A reporter in {city} is close to a story about bodies, blood and a church order nobody has heard of. Her editor owes the diocese a favour.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "He'll want to bargain, and he'll want to be sure we aren't bluffing about what we can give him.",
          why: "He called our bluff. Someone who reads people better would have known what he'd settle for.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "He was an altar boy once. The draft frightened him more than he admits, and he hasn't slept since he read it.",
          why: "He wanted to believe it was nothing. It needed someone whose certainty he could borrow.",
        },
      ],
      tiers: {
        easy: "He thinks the story is nonsense, and is already looking for a reason to drop it.",
        routine: "",
        hard: "He is proud of his independence, and has said no to bishops before.",
        "very-hard": "The paper's owners want the story run, and he answers to them.",
      },
    },
    success: "The story was spiked. The reporter has been moved to the business desk.",
    fail: "The editor wouldn't bend. The story runs on page nine, and nobody seems to notice.",
    backfire: "The editor ran a piece about the pressure instead. \"Who is leaning on our newsroom?\"",
  },
  {
    id: "hoax",
    title: "The video, {city}",
    text: "Phone footage from {city} shows something no living man can do. Contacts in the digital-effects trade can release a dozen convincing fakes of the same clip, so that the real one is laughed off with the rest.",
    cost: [180_000, 320_000], days: [3, 5], agents: 0, gain: [2, 4],
    success: "The fakes went viral; the original drowned among them. Commenters agree it was a marketing stunt.",
    fail: "The fakes never caught on. The original is still out there, but it's losing steam on its own.",
    backfire: "A forensic blogger proved the fakes were fakes, and that the original was not. It is being shared everywhere.",
  },
  {
    id: "coroner",
    title: "The coroner, {city}",
    cost: [70_000, 140_000], days: [2, 4], agents: 1, gain: [1.5, 2.5],
    judged: {
      text: "A coroner in {city} has written \"exsanguination, cause unknown\" on a death certificate. A quiet word, and a reason, could make it a ruptured aneurysm.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "She is careful and ambitious, and wants to know what's in it for her before she'll hear the rest.",
          why: "She wanted something we never worked out. Someone who could read her would have found it.",
        },
        {
          weights: { faith: 0.8, insight: 0.2 },
          hint: "She has asked the hospital chaplain twice what could do that to a body. He had no answer for her.",
          why: "She needed an answer to the question she put to the chaplain, and we didn't give her one.",
        },
        {
          weights: { combat: 0.7, insight: 0.3 },
          hint: "The family has hired a man to make sure the certificate stays as it is. He sits outside her office every day.",
          why: "The family's man was the real problem, and he was still in the corridor when we left.",
        },
      ],
      tiers: {
        easy: "She retires next month, and would rather not have the trouble.",
        routine: "",
        hard: "She was investigated once over a report, and won't risk it again lightly.",
        "very-hard": "A detective is in her office every morning, asking about this one body.",
      },
    },
    success: "The certificate was re-filed. The family has a funeral to arrange and no questions to ask.",
    fail: "The coroner wouldn't change a word, but she has agreed to say nothing further.",
    backfire: "The coroner reported the approach to the police. A detective now has our cover name.",
  },
  {
    id: "witness",
    title: "A witness, {city}",
    cost: [20_000, 60_000], days: [1, 3], agents: 1, gain: [1, 2],
    judged: {
      text: "A woman in {city} saw what happened and is telling everyone who'll listen.",
      variants: [
        {
          weights: { faith: 1 },
          hint: "She's devout, and frightened for her soul: she wants a priest, not a policeman.",
          why: "She wanted someone who could pray with her. We sent someone who argued.",
          success: "She has stopped talking about it. She lights a candle every evening now, and sleeps better.",
        },
        {
          weights: { insight: 1 },
          hint: "Her story is a little different each time she tells it, and it gets better when there's a camera nearby.",
          why: "She was after money and attention, and we took her at her word.",
          success: "She was offered a little money and a lot of attention somewhere else. She has a new story now, about a neighbour's dog.",
        },
        {
          weights: { combat: 0.7, insight: 0.3 },
          hint: "Her boyfriend has started selling her story to anyone who pays, and he doesn't take no from anyone smaller than him.",
          why: "The boyfriend was the one talking, and he didn't believe we meant it.",
          success: "The boyfriend has found other interests. Without him, she's gone quiet.",
        },
      ],
      tiers: {
        easy: "She's already half-convinced she imagined it.",
        routine: "",
        hard: "She has stopped trusting anyone who comes to her door.",
        "very-hard": "A television crew has her number, and she has told them everything twice.",
      },
    },
    success: "She has stopped talking about it.",
    fail: "She's still talking, though fewer people are listening.",
    backfire: "She decided she was being silenced by a cult, and went to the papers with it.",
  },
  {
    id: "records",
    title: "Hospital records, {city}",
    cost: [90_000, 180_000], days: [3, 5], agents: 2, gain: [1.5, 3],
    judged: {
      text: "Admissions in {city} show a cluster of anaemia cases with the same puncture wounds. Before an epidemiologist notices, the records need to say something else.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "The files sit on the hospital's server, behind a records office that locks at nine.",
          why: "It needed someone who could be in and out of that office without anyone knowing.",
        },
        {
          weights: { faith: 0.5, insight: 0.5 },
          hint: "The head of records is a nun of the old school, who will change nothing without a reason she believes.",
          why: "She wanted the truth, or something close enough to it to confess. We gave her neither.",
          success: "Sister Agata listened for an hour, and then re-coded the cluster herself. Iron deficiency.",
        },
      ],
      tiers: {
        easy: "The hospital's systems are ten years out of date, and nobody watches them.",
        routine: "",
        hard: "The hospital was breached last year, and has paid for new security since.",
        "very-hard": "The health ministry has already asked for the files.",
      },
    },
    success: "The records now show a cluster of iron deficiency. Nothing to see.",
    fail: "The records were locked away before we could change them. We'll have to hope nobody looks.",
    backfire: "The hospital caught it, and the breach made the local news.",
  },
  {
    id: "phone",
    title: "Forty seconds, {city}",
    cost: [30_000, 80_000], days: [1, 3], agents: 1, gain: [1.5, 3],
    judged: {
      text: "A man in {city} has a phone with forty seconds on it that nobody can be allowed to see. He wants to sell it.",
      variants: [
        {
          weights: { combat: 1 },
          hint: "He collects debts for a living, and only deals with people he thinks could hurt him.",
          why: "He didn't believe we were serious. He needed to.",
        },
        {
          weights: { insight: 1 },
          hint: "He says there are copies. He keeps glancing at the phone as if it's the only one.",
          why: "There was only ever one copy. Someone who could read him would have called his bluff.",
        },
        {
          weights: { tradecraft: 0.8, combat: 0.2 },
          hint: "He keeps it in his jacket, and drinks in the same bar every night.",
          why: "Lifting it was the job, and we were seen trying.",
          success: "The phone left the bar in someone else's pocket. He thinks he lost it.",
        },
      ],
      tiers: {
        easy: "He's careless, and drunk most nights by ten.",
        routine: "",
        hard: "He has had offers before, and knows how this goes.",
        "very-hard": "He has two men with him wherever he goes, and a buyer from the papers on the line.",
      },
    },
    success: "The phone is in pieces in a skip, and he has the money and nothing to show anyone.",
    fail: "He sold it to someone else. The clip hasn't surfaced yet.",
    backfire: "The clip went up the next morning, with a note about the people who tried to buy it.",
  },
  // Nerve (Faith as the stat's other half: dread, and resistance to what a vampire leaves behind in a room or a mind).
  {
    id: "door",
    title: "The door, {city}",
    cost: [30_000, 70_000], days: [2, 4], agents: 1, gain: [1, 2],
    judged: {
      text: "A family in {city} has nailed their front door shut. Something comes to it every night after midnight and asks to be let in, and the neighbours have called the police twice about the noise. Someone of ours has to sit up with them until it stops coming.",
      variants: [
        {
          weights: { faith: 1 },
          hint: "It knows their names. Last night it spoke in the voice of their son, a month in his grave, and his mother was halfway to the door before anyone caught her.",
          why: "It needed someone who could hear that voice through the door until dawn and not get up. Ours got up.",
          success: "Our man sat with his back to the door for four nights, and prayed aloud whenever it spoke. On the fifth night it didn't come. The family has gone to her sister's.",
        },
        {
          weights: { combat: 0.7, insight: 0.3 },
          hint: "The father's brother came back from the house down the road last week, pale and very helpful, and he keeps offering to watch the door for them.",
          why: "The brother was the one opening the way. It needed someone who could put him out of that house and keep him out.",
          success: "The brother was walked out of the house and has not come back. Without someone inside to help it, the thing at the door gave up.",
        },
        {
          weights: { tradecraft: 1 },
          hint: "They want out. But something watches the house from across the street all night, and it will follow them wherever they go.",
          why: "It needed the family out of that house without being followed, and they were followed.",
          success: "The family left in a laundry van at noon, and nothing followed them. The house is empty, and nothing knocks at it now.",
        },
      ],
      tiers: {
        easy: "It comes less often now, and the family thinks it's losing interest.",
        routine: "",
        hard: "It has started at the windows too, and the youngest has stopped sleeping.",
        "very-hard": "It was in the hall last night. Nobody remembers opening the door.",
      },
    },
    success: "It has stopped coming. The police have closed the noise complaint.",
    fail: "The family fled before we could settle them. They are telling their story in another town, where nobody believes it.",
    backfire: "The mother opened the door in the end. The police found the house empty, and our agent's description in every neighbour's statement.",
  },
  {
    id: "half-taken",
    title: "The half-taken, {city}",
    cost: [20_000, 60_000], days: [2, 4], agents: 1, gain: [1, 2.5],
    judged: {
      text: "A night nurse in {city} was fed on and left alive. She remembers nothing she can describe, but she has told her doctor she knows where it sleeps, and the doctor has called the police. Someone has to sit with her first.",
      variants: [
        {
          weights: { faith: 1 },
          hint: "She smiles all the time now. She asks whoever sits with her to open the window, very sweetly, and the orderlies find themselves reaching for the latch.",
          why: "Whatever is still in her reached for ours too. It needed someone it couldn't reach.",
          success: "Our sister sat with her three nights, the window shut and a rosary between their hands. On the fourth morning she wept for the first time, and remembered nothing at all.",
        },
        {
          weights: { insight: 1 },
          hint: "It's the doctor doing the talking. He wants a paper out of her, and he leads her through the story every morning until she tells it his way.",
          why: "The doctor was the one who needed managing, and we spent our time on her.",
          success: "The doctor has been persuaded that the case belongs to someone else, and has found other patients.",
        },
        {
          weights: { tradecraft: 0.7, insight: 0.3 },
          hint: "The police take her statement on Thursday. Until then her file, and the doctor's recordings of her, sit in an office on the ward.",
          why: "It needed her file and the recordings gone before Thursday, and they were still there.",
        },
      ],
      tiers: {
        easy: "Most days she can't remember why she called anyone.",
        routine: "",
        hard: "She has stopped eating. She sits by the window all night, waiting.",
        "very-hard": "She left the ward last night and was found at three in the morning, walking north, barefoot and quite calm.",
      },
    },
    success: "She's quiet now. Her statement says she was mugged.",
    fail: "She gave the police a statement nobody could follow. It sits in a file, waiting for someone to make sense of it.",
    backfire: "She led the police to the place she meant. It was empty, but there was enough in it for them to start asking who else knew.",
  },
  {
    id: "chapel",
    title: "The chapel, {city}",
    cost: [40_000, 90_000], days: [1, 3], agents: 2, gain: [1.5, 2.5],
    judged: {
      text: "Something was done in a chapel in {city} last night, and the parish opens it for Mass on Sunday. It has to be cleaned, and what was left in the tabernacle taken away, before anyone else sees it.",
      variants: [
        {
          weights: { faith: 1 },
          hint: "The priest who found it walked out, locked the door and hasn't spoken since. The cold in there isn't the weather, and the candles won't stay lit.",
          why: "It needed people who could stay in that room long enough to finish. Ours didn't.",
          success: "They worked until dawn by torchlight, and said the prayers for a violated church over every stone. The bishop has reconsecrated it quietly, and Sunday's Mass went ahead.",
        },
        {
          weights: { tradecraft: 1 },
          hint: "The sexton locks it at six, a patrol car passes every hour, and the woman across the road has a key and a view of the door.",
          why: "It needed hands that could get in and out with what was in the tabernacle, unseen.",
        },
      ],
      tiers: {
        easy: "It's a chapel in the fields, and nobody goes near it before Sunday.",
        routine: "",
        hard: "The parish treasurer looks in on it every evening, and has noticed the smell.",
        "very-hard": "Something is still in there. A cat got in last night; it is sitting on the altar, and it hasn't moved.",
      },
    },
    success: "The chapel was clean by Saturday. The parish noticed only the bleach and the new candles.",
    fail: "We ran out of night. The parish found it on Sunday, and the diocese is calling it vandalism.",
    backfire: "The congregation found it on Sunday morning, and a photograph of the altar is on every phone in the parish.",
  },
  {
    id: "furnace",
    title: "The furnace, {city}",
    cost: [60_000, 120_000], days: [1, 3], agents: 1, gain: [1.5, 3],
    judged: {
      text: "A body in the {city} morgue has the wounds, and an autopsy booked for Monday. A crematorium will take it on Sunday night, no questions, if someone of ours gets it there.",
      variants: [
        {
          weights: { faith: 1 },
          hint: "The attendants say it moved in the drawer. It is warmer than it should be, and the driver will only take it across town if one of ours rides in the back with it.",
          why: "It moved, and ours let go of the lid. It needed someone who would have kept a hand on it the whole way.",
          success: "Our brother rode across the city with a hand flat on the lid and the psalms under his breath. It knocked twice. Then it was in the fire, and quiet.",
        },
        {
          weights: { tradecraft: 0.8, insight: 0.2 },
          hint: "There's a camera on the loading bay, and a guard who signs out everything that leaves.",
          why: "It needed the body signed out without anyone remembering who signed.",
        },
        {
          weights: { insight: 1 },
          hint: "The crematorium man says he's done this before, for other people, and his price has doubled since we first called him.",
          why: "He had never done it before, and he lost his nerve on the night. We should have seen he was lying.",
        },
      ],
      tiers: {
        easy: "It's the night shift, and the attendant hasn't asked a question in twenty years.",
        routine: "",
        hard: "The pathologist has already taken samples, and wants to see it again.",
        "very-hard": "The family has asked to see it first. The attendants say it has started to smile.",
      },
    },
    success: "The body was ash by Monday. The paperwork says the family wanted it done quickly.",
    fail: "We couldn't move it in time. The autopsy found nothing it could name, and the report says so.",
    backfire: "It didn't stay in the drawer. The morning shift found the drawer open and the bay door broken, and the police want to know who signed for it.",
  },
  {
    id: "commissioner",
    title: "A word from the bishop, {region}",
    text: "The bishop of a diocese in {region} plays cards with the police commissioner. A donation to his restoration fund, and the investigations that touch on us could be quietly consolidated and shelved.",
    cost: [150_000, 260_000], days: [4, 6], agents: 0, gain: [1.5, 3],
    success: "Three open files were consolidated into one, and that one is gathering dust.",
    fail: "The commissioner was polite and did nothing.",
    backfire: "The commissioner mentioned the bishop's request to his deputy, who is not a churchgoer.",
  },
];

const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

/** Placeholder for HUMINT/CI investment: more offers and better odds. */
export function humintBonus(_s: GameState): number {
  return 0;
}

/** The chance a cover-up succeeds, with these agents. */
export function coverUpChance(s: GameState, c: CoverUp, agents: readonly Agent[]): number {
  let p: number;
  if (c.agents === 0) p = 0.6;
  else {
    if (!agents.length) return 0;
    p = chanceFromMargin(judgedMargin(agents, c.weights ?? { [c.stat]: 1 }, c.tier, c.difficulty));
  }
  return Math.min(0.95, Math.max(0.05, p + humintBonus(s)));
}

/** Agents free for off-screen work: at any base, not deployed, not wounded. */
export const coverUpAgents = (s: GameState) => s.agents.filter((a) => !a.deployed && !isWounded(s, a));

export function coverUpBlocker(s: GameState, c: CoverUp, agentIds: string[]): string | null {
  if (s.gameOver) return "The campaign is over.";
  if (s.openWar) return "There is nothing left to cover up.";
  if (c.startedAt) return "Already under way.";
  if (c.expiresAt <= s.time) return "The chance has passed.";
  if (s.funds < c.cost) return "Not enough funds.";
  if (agentIds.length !== c.agents) return c.agents === 1 ? "Choose one agent." : `Choose ${c.agents} agents.`;
  const free = new Set(coverUpAgents(s).map((a) => a.id));
  if (agentIds.some((id) => !free.has(id))) return "One of those agents isn't available.";
  return null;
}

export function startCoverUp(s: GameState, id: string, agentIds: string[]): string | null {
  const c = s.coverUps.find((x) => x.id === id);
  if (!c) return "That offer is gone.";
  const why = coverUpBlocker(s, c, agentIds);
  if (why) return why;
  s.funds -= c.cost;
  c.agentIds = [...agentIds];
  c.startedAt = s.time;
  c.doneAt = s.time + c.days * DAY;
  for (const a of s.agents) if (agentIds.includes(a.id)) a.deployed = true;
  addLog(s, `${covertLabel(c)} under way: ${c.title}.`);
  return null;
}

/** Secrecy lost calling off a covert action under way: loose ends, people who saw something. */
export const ABORT_SECRECY = 1;

/** Calls off a cover-up under way: the money is spent, the agents come home,
 *  a little secrecy is lost, and there is no roll (no failure, no backfire). */
export function abortCoverUp(s: GameState, id: string): string | null {
  const c = s.coverUps.find((x) => x.id === id);
  if (!c || !c.startedAt) return "That cover-up isn't under way.";
  s.coverUps = s.coverUps.filter((x) => x !== c);
  const bases = s.installations.filter((i) => i.kind === "base");
  for (const a of s.agents)
    if (c.agentIds.includes(a.id)) {
      a.deployed = false;
      if (!bases.some((b) => b.id === a.baseId) && bases[0]) a.baseId = bases[0].id;
    }
  changeSecrecy(s, -ABORT_SECRECY, `called off: ${c.title}`, c);
  return null;
}

export function declineCoverUp(s: GameState, id: string) {
  const c = s.coverUps.find((x) => x.id === id);
  if (!c || c.startedAt) return;
  s.coverUps = s.coverUps.filter((x) => x !== c);
  addLog(s, `Declined: ${c.title}.`);
}

function someCity(regionId: string, r: Rng): City | null {
  const region = regionById(regionId);
  if (!region?.cities.length) return null;
  return r.pick(region.cities.slice(0, 5));
}

/** Where the next offer is: the last incident if things are hot, else somewhere we operate. */
function offerPlace(s: GameState, r: Rng): Place | null {
  if (s.lastIncident && s.heat >= 1.5 && r.chance(0.75)) return s.lastIncident;
  const ours = [...new Set(s.installations.map((i) => i.regionId))];
  const regionId = ours.length && r.chance(0.6) ? r.pick(ours) : r.pick(REGIONS.filter((x) => x.cities.length)).id;
  const city = someCity(regionId, r);
  if (!city) return null;
  return { regionId, city: city.name, pos: { lat: city.lat + r.real(-0.15, 0.15), lon: city.lon + r.real(-0.15, 0.15) } };
}

function offer(s: GameState) {
  const r = rng(s);
  const where = offerPlace(s, r);
  if (!where) return;
  const options = TEMPLATES.filter((t) => s.heat >= (t.needsHeat ?? 0) && !s.coverUps.some((c) => c.template === t.id && c.regionId === where.regionId));
  if (!options.length) return;
  const t = r.pick(options);
  const region = regionById(where.regionId)!;
  const fill = (x: string) => x.replaceAll("{city}", where.city).replaceAll("{region}", region.name);
  const round = (n: number, to: number) => Math.round(n / to) * to;
  const judged = t.judged ? pickJudged(t.judged, r) : null;
  const weights = judged ? t.judged!.variants[judged.variant]!.weights : { tradecraft: 1 };
  const tier: Tier = judged?.tier ?? "routine";
  const c: CoverUp = {
    id: `cover-${s.nextId++}`,
    template: t.id,
    title: fill(t.title),
    text: fill(judged?.text ?? t.text ?? ""),
    regionId: where.regionId,
    city: where.city,
    pos: { ...where.pos },
    offeredAt: s.time,
    expiresAt: s.time + r.real(3, 6) * DAY,
    cost: round(r.real(t.cost[0], t.cost[1]), 10_000),
    days: r.int(t.days[0], t.days[1]),
    agents: t.agents,
    stat: primaryStat(weights),
    difficulty: TIER_DIFFICULTY[tier],
    ...(judged ? { tier, variant: judged.variant, weights: { ...weights } } : {}),
    gain: Math.round(r.real(t.gain[0], t.gain[1]) * TIER_REWARD[tier] * 2) / 2,
    agentIds: [],
    startedAt: 0,
    doneAt: 0,
  };
  s.coverUps.push(c);
  post(s, { kind: "coverup", title: `Cover-up: ${c.title}`, body: c.text, regionId: c.regionId, pos: c.pos, refId: c.id, effects: coverUpTerms(c) });
}

const AGENT_WORDS = ["no agents", "one agent", "two agents", "three agents"];

/** "$120,000 · 3 days · one agent · Secrecy +2.5 if it works" */
export function coverUpTerms(c: CoverUp): string {
  const days = `${c.days} day${c.days === 1 ? "" : "s"}`;
  return [`$${c.cost.toLocaleString("en-US")}`, days, AGENT_WORDS[c.agents] ?? `${c.agents} agents`, `${coverUpReward(c)} if it works`].join(" · ");
}

/** "Cover-up", "Asset call", "Disinformation". */
export const covertLabel = (c: CoverUp) => (c.kind === "call" ? "Asset call" : c.kind === "disinfo" ? "Disinformation" : "Cover-up");

/** What success brings, in a few words. */
export const coverUpReward = (c: CoverUp) => (c.effect ? effectWords(c.effect, c.tier) : `Secrecy +${c.gain}`);

function finish(s: GameState, c: CoverUp) {
  if (c.kind === "call" || c.kind === "disinfo") return finishHumint(s, c);
  const r = rng(s);
  const t = templateById(c.template);
  const agents = s.agents.filter((a) => c.agentIds.includes(a.id));
  const p = coverUpChance(s, c, agents);
  const roll = r.next();
  const result = roll < p ? "success" : r.chance(backfireShare(c)) ? "backfire" : "fail";
  const variant = c.variant !== undefined ? t?.judged?.variants[c.variant] : undefined;
  s.coverUps = s.coverUps.filter((x) => x !== c);

  // Agents come home; their base may be gone.
  const improved: string[] = [];
  const bases = s.installations.filter((i) => i.kind === "base");
  for (const a of agents) {
    a.deployed = false;
    if (!bases.some((b) => b.id === a.baseId) && bases[0]) a.baseId = bases[0].id;
    const line = improvementLine(a, { [c.stat]: train(a, c.stat, result === "success" ? r.int(1, 2) : r.int(0, 1)) });
    if (line) improved.push(line);
    a.missions++;
  }

  const effects: string[] = [];
  const regionName = regionById(c.regionId)?.name ?? c.regionId;
  let body: string;
  if (result === "success") {
    changeSecrecy(s, c.gain, c.title);
    effects.push(`Secrecy +${c.gain}`);
    body = variant?.success ?? t?.success ?? "It worked.";
  } else if (result === "fail") {
    body = variant?.fail ?? t?.fail ?? "It didn't work.";
    effects.push("No change");
  } else {
    const loss = Math.round(c.gain * 0.5 * 2) / 2;
    changeSecrecy(s, -loss, `${c.title} backfired`, c);
    changeSupport(s, c.regionId, -0.2);
    effects.push(`Secrecy −${loss}`, `Support in ${regionName} −0.20`);
    body = variant?.backfire ?? t?.backfire ?? "It went wrong.";
  }
  if (result !== "success" && variant) body += `\n\n${verdictLine(agents, variant, c.tier, c.difficulty, r)}`;
  const words = { success: "Covered up", fail: "Cover-up failed", backfire: "Cover-up backfired" } as const;
  post(s, {
    kind: "coverup-result",
    title: `${words[result]}: ${c.title}`,
    body,
    regionId: c.regionId,
    pos: c.pos,
    effects: effects.join(" · "),
    improved,
  });
  addLog(s, `${words[result]}: ${c.title}.`, result === "success" ? "good" : result === "backfire" ? "bad" : "neutral");
}

/** Daily chance of a new offer: a steady trickle, more after noise and when secrecy is low. */
export function offerChance(s: GameState): number {
  const heat = Math.min(0.2, s.heat * 0.025);
  const low = Math.max(0, (60 - s.secrecy) / 60) * 0.1;
  return BASE_OFFER_CHANCE + heat + low + humintBonus(s) * 0.5;
}

export function hourlyCoverUps(s: GameState) {
  for (const c of [...s.coverUps]) {
    if (c.startedAt && c.doneAt <= s.time) finish(s, c);
    else if (!c.startedAt && c.expiresAt <= s.time) {
      s.coverUps = s.coverUps.filter((x) => x !== c);
      if (c.kind === "call") ignoredCall(s, c);
      else addLog(s, `The chance passed: ${c.title}.`);
    }
  }
}

export function dailyCoverUps(s: GameState) {
  const r = rng(s);
  s.heat *= 0.85;
  if (s.heat < 0.05) s.heat = 0;
  if (s.openWar) return;
  const open = s.coverUps.filter((c) => !c.startedAt).length;
  if (open < MAX_OFFERS && r.chance(offerChance(s))) offer(s);
}

export const isCoverUpTemplate = (id: string) => !!templateById(id) || isHumintTemplate(id);
