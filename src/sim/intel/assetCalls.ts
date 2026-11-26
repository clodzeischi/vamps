// Asset calls and disinformation: covert actions offered like cover-ups
// (sim/campaign/coverups.ts runs them; the Covert actions screen lists them).
// Each runs through an asset, takes one operator and a few days, and ends in
// a tradecraft roll: a failure burns the asset, a catastrophe every asset we
// have in the region. Calling one off costs a little secrecy and no roll. A
// call nobody answers may burn the asset anyway.
import { BLOODLINES, bloodlineById } from "../../data/bloodlines";
import { regionById } from "../../data/regions";
import { isDestroyed } from "../campaign/bloodlines";
import { changeSupport, neutralAnchor } from "../economy/economy";
import { isSevere, pickJudged, TIER_REWARD, verdictLine } from "./judged";
import { surfaceLead } from "./operations";
import { rng, type Rng } from "../core/rng";
import { changeSecrecy } from "../campaign/secrecy";
import {
  addLog,
  post,
  type Agent,
  type CoverUp,
  type CovertResult,
  type GameState,
} from "../core/state";
import { addClues, revealNest } from "./networks";
import { DAY } from "../core/time";
import {
  type Asset,
  CALL_RATE,
  CLERGY,
  effectWords,
  removeAsset,
  IGNORED_BURN,
  ASSET_KINDS,
  CATASTROPHE_SHARE_VERY_HARD,
  CATASTROPHE_SHARE,
  FALSE_TRAIL_DAYS,
  COUNTER_STORY_SUPPORT,
} from "./humint";
import { type HumintTemplate, HUMINT_TEMPLATES, humintTemplate } from "./humintTemplates";

/** A living bloodline at work in a region: one whose homeland it is, or one with an operation there. */
function bloodlineIn(s: GameState, regionId: string, r: Rng): string | null {
  const home = BLOODLINES.filter(
    (b) => !isDestroyed(s, b.id) && b.homeRegions.includes(regionId),
  ).map((b) => b.id);
  const active = s.operations.filter((o) => o.regionId === regionId).map((o) => o.bloodline);
  const all = [...new Set([...home, ...active])];
  return all.length ? r.pick(all) : null;
}

export function callChance(s: GameState, a: Asset): number {
  const homeland = BLOODLINES.some(
    (b) => !isDestroyed(s, b.id) && b.homeRegions.includes(a.regionId),
  );
  return CALL_RATE * (homeland ? 1.5 : 1) * (1 + Math.max(0, (50 - s.secrecy) / 50));
}

/** The calls or offers this asset could bring now: placed to do it, and with something to aim at. */
export function humintOptions(
  s: GameState,
  a: Asset,
  kind: "call" | "disinfo",
  r: Rng,
): HumintTemplate[] {
  const bloodline = bloodlineIn(s, a.regionId, r);
  const eroded = (s.regions[a.regionId]?.support ?? 0) < neutralAnchor(a.regionId) - 0.3;
  return HUMINT_TEMPLATES.filter((t) => {
    if (t.kind !== kind) return false;
    if (t.through && !t.through.includes(a.kind)) return false;
    if (t.effect === "counter-story") return eroded;
    if (t.effect === "false-trail" || t.effect === "bait") return !!bloodline;
    return true;
  });
}

export function offerHumint(s: GameState, a: Asset, kind: "call" | "disinfo") {
  const r = rng(s);
  const bloodline = bloodlineIn(s, a.regionId, r);
  const options = humintOptions(s, a, kind, r);
  if (!options.length) return;
  const t = r.pick(options);
  const region = regionById(a.regionId)!;
  const bl = bloodlineById(bloodline);
  const fill = (x: string) => fillHumint(x, a, region.name, bl?.name);
  const round = (n: number) => Math.round(n / 5_000) * 5_000;
  const lay = !CLERGY.test(a.role);
  const judged = pickJudged(t.judged, r, (v) => lay || !v.laity);
  const weights = t.judged.variants[judged.variant]!.weights;
  const c: CoverUp = {
    id: `covert-${s.nextId++}`,
    template: t.id,
    title: fill(t.title),
    text: fill(judged.text),
    regionId: a.regionId,
    city: a.city,
    pos: { ...a.pos },
    offeredAt: s.time,
    expiresAt: s.time + (kind === "call" ? r.real(2, 4) : r.real(3, 6)) * DAY,
    cost: round(r.real(t.cost[0], t.cost[1])),
    days: r.int(t.days[0], t.days[1]),
    agents: 1,
    tier: judged.tier,
    variant: judged.variant,
    weights: { ...weights },
    gain: 0,
    agentIds: [],
    startedAt: 0,
    doneAt: 0,
    kind,
    assetId: a.id,
    effect: t.effect,
    ...(bloodline && (t.effect === "false-trail" || t.effect === "bait" || t.effect === "intel")
      ? { bloodline }
      : {}),
  };
  s.coverUps.push(c);
  post(s, {
    kind: "coverup",
    heading: kind === "call" ? "An agent calls" : "Disinformation",
    title: c.title,
    body: c.text + (kind === "call" ? "\n\nIgnore it, and we may lose them anyway." : ""),
    regionId: c.regionId,
    pos: c.pos,
    refId: c.id,
    effects: `$${c.cost.toLocaleString("en-US")} · ${c.days} day${c.days === 1 ? "" : "s"} · one operator · ${effectWords(t.effect, judged.tier)} if it works`,
  });
}

function fillHumint(x: string, a: Asset, region: string, bloodline?: string) {
  return x
    .replaceAll("{name}", a.name)
    .replaceAll("{role}", a.role)
    .replaceAll("{city}", a.city)
    .replaceAll("{region}", region)
    .replaceAll("{bloodline}", bloodline ?? "the bloodline");
}

/** Burns an asset (or, in a catastrophe, everyone we run in its region). Returns who was lost. */
function burn(s: GameState, a: Asset, everyone: boolean): Asset[] {
  const lost = everyone ? s.assets.filter((x) => x.regionId === a.regionId) : [a];
  for (const x of lost) removeAsset(s, x);
  return lost;
}

/** A call nobody answered. */
export function ignoredCall(s: GameState, c: CoverUp) {
  const a = s.assets.find((x) => x.id === c.assetId);
  if (!a) return;
  if (!rng(s).chance(IGNORED_BURN)) {
    addLog(s, `Nobody answered ${a.name}'s call. They are still with us, for now.`);
    return;
  }
  burn(s, a, false);
  post(s, {
    kind: "coverup-result",
    heading: "An agent is lost",
    title: `${a.name} is gone`,
    body: `Nobody answered when ${a.name}, our ${a.role} in ${a.city}, called. They stopped calling.`,
    regionId: a.regionId,
    pos: a.pos,
    effects: `${ASSET_KINDS[a.kind].name} agent lost`,
  });
}

/** An asset call or disinformation offer's roll (sim/campaign/coverups.ts runs the job). Easy and routine failures
 *  leave the asset shaken; hard ones burn it, and some burn the network. Without its asset, it fails. */
export function rollHumint(s: GameState, c: CoverUp, p: number, r: Rng): CovertResult {
  if (!s.assets.some((x) => x.id === c.assetId)) return "fail";
  if (r.next() < p) return "success";
  if (!isSevere(c.tier)) return "shaken";
  return r.chance(c.tier === "very-hard" ? CATASTROPHE_SHARE_VERY_HARD : CATASTROPHE_SHARE)
    ? "catastrophe"
    : "fail";
}

/** What an asset job's result does: its debrief and effects (the verdict on a failure included). */
export function settleHumint(
  s: GameState,
  c: CoverUp,
  result: CovertResult,
  agents: readonly Agent[],
  r: Rng,
): { body: string; effects: string[] } {
  const t = humintTemplate(c.template);
  const a = s.assets.find((x) => x.id === c.assetId);
  if (!a)
    return { body: "The agent it depended on is gone. There was nothing to do.", effects: [] };
  const region = regionById(c.regionId)?.name ?? c.regionId;
  const bl = bloodlineById(c.bloodline);
  const fill = (x: string) => fillHumint(x, a, region, bl?.name);
  const variant = c.variant !== undefined ? t?.judged.variants[c.variant] : undefined;
  const effects: string[] = [];
  let body: string;
  if (result === "success") {
    body = fill(variant?.success ?? t?.success ?? "It worked.");
    effects.push(...applyEffect(s, c, a));
  } else if (result === "shaken") {
    body = fill(t?.shaken ?? "It didn't work, but they are still with us.");
    effects.push(`${a.name} stays, shaken`);
  } else {
    const lost = burn(s, a, result === "catastrophe");
    if (result === "catastrophe") changeSecrecy(s, -2, `our network in ${region} is blown`, c);
    body = fill(
      result === "catastrophe"
        ? (t?.catastrophe ?? "Everything went wrong.")
        : (t?.fail ?? "It didn't work."),
    );
    effects.push(
      lost.length > 1 ? `${lost.length} agents in ${region} burned` : `${a.name} burned`,
    );
    if (result === "catastrophe") effects.push("Secrecy −2");
  }
  if (result !== "success" && variant)
    body += `\n\n${fill(verdictLine(agents, variant, c.tier, r))}`;
  return { body, effects };
}

function applyEffect(s: GameState, c: CoverUp, a: Asset): string[] {
  const region = regionById(c.regionId)?.name ?? c.regionId;
  const bl = c.bloodline ?? bloodlineIn(s, c.regionId, rng(s));
  const name = (id: string | null) => bloodlineById(id)?.name ?? "the bloodline";
  // Hard jobs pay more.
  const k = TIER_REWARD[c.tier];
  const days = Math.round(FALSE_TRAIL_DAYS * k);
  const support = Math.round(COUNTER_STORY_SUPPORT * k * 20) / 20;
  const bait = k >= TIER_REWARD.hard ? 2 : 1;
  switch (c.effect) {
    case "lead": {
      const op = s.operations.find((o) => o.regionId === c.regionId && !o.leadId);
      if (op) {
        surfaceLead(s, op, "humint", true);
        return ["A lead"];
      }
      return bl ? revealNest(s, bl, c.regionId).lines : [];
    }
    case "intel":
      return bl ? revealNest(s, bl, c.regionId).lines : [];
    case "cheaper":
      a.monthly = Math.round((a.monthly * (1 - Math.round(20 * k) / 100)) / 1_000) * 1_000;
      return [`${a.name}'s fee now $${a.monthly.toLocaleString("en-US")}/mo`];
    case "false-trail": {
      if (!bl) return [];
      s.nextOperation[bl] = Math.max(s.nextOperation[bl] ?? s.time, s.time) + days * DAY;
      let trapped = 0;
      for (const x of s.sites)
        if (x.bloodline === bl && x.regionId === c.regionId && x.kind !== "lair") {
          x.trapped = true;
          x.expiresAt += 4 * DAY;
          trapped++;
        }
      return [
        `${name(bl)} quiet for ${days} days`,
        ...(trapped
          ? [`${trapped} site${trapped === 1 ? "" : "s"} in ${region} drawn into a trap`]
          : []),
      ];
    }
    case "counter-story":
      changeSupport(s, c.regionId, support);
      return [`Support in ${region} +${support.toFixed(2)}`];
    case "bait":
      return bl ? addClues(s, bl, bait) : [];
    default:
      return [];
  }
}
