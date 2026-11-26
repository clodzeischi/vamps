// Control: every management screen behind one button, as numbered tabs
// (docs/design/ui.md). Keys 1–7 open each tab (ui/keys.ts, rebound in Settings).
import { projectsAt, staffSummary } from "../sim/research";
import { researchQueue } from "../sim/science";
import { staffAt } from "../sim/personnel";
import { isReady, type GameState } from "../sim/state";
import type { IconName } from "./components/Icon";
import { TAB_KEYS, type BindingId } from "./keys";

export type ControlTab = "installations" | "operations" | "research" | "bloodlines" | "market" | "details";

export interface ControlTabDef {
  id: ControlTab;
  label: string;
  icon: IconName;
  key: BindingId;
  tip: string;
  /** Where it stands, for the tooltip, and whether it wants attention (a dot on the tab). */
  status(g: GameState): { text: string; attention?: boolean };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Staff with nothing to work on. */
const idle = (g: GameState, kind: "research") => staffSummary(g, kind).total > 0 && projectsAt(g, undefined, kind).length === 0;

/** A base whose engineers have nothing queued. */
const idleShops = (g: GameState) => g.installations.some((b) => b.kind === "base" && isReady(g, b) && staffAt(g, b, "engineer") > 0 && projectsAt(g, b.id, "engineering").length === 0);

export const CONTROL_TABS: ControlTabDef[] = [
  {
    id: "installations", label: "Bases", icon: "bases", key: TAB_KEYS[0]!, tip: "Bases, SIGINT and refuelling stations: pick one to fly there; build new ones",
    status: (g) => (idleShops(g) ? { text: "workshops idle", attention: true } : { text: plural(g.installations.length, "site") }),
  },
  {
    id: "operations", label: "Operations", icon: "operations", key: TAB_KEYS[1]!, tip: "Every operative, aircraft and job, cover-ups and our agents",
    status: (g) => {
      const offers = g.coverUps.filter((c) => !c.startedAt).length;
      const out = g.missions.length ? `${plural(g.missions.length, "team")} out` : "no teams out";
      return { text: offers ? `${out}; ${plural(offers, "cover-up offer")} waiting` : out, attention: offers > 0 };
    },
  },
  {
    id: "research", label: "Research", icon: "research", key: TAB_KEYS[2]!, tip: "The Order's research",
    status: (g) => (idle(g, "research") ? { text: "labs idle", attention: true } : { text: plural(researchQueue(g).length, "topic") }),
  },
  {
    id: "bloodlines", label: "Intelligence", icon: "bloodlines", key: TAB_KEYS[3]!, tip: "The intelligence section, and the houses we hunt",
    status: (g) => {
      const open = g.leads.filter((l) => !l.missionId).length;
      return { text: open ? `${plural(open, "lead")} open` : "no open leads", attention: open > 0 };
    },
  },
  {
    id: "market", label: "Dark web", icon: "market", key: TAB_KEYS[4]!, tip: "Buy equipment and information; sell what the war brings back",
    status: () => ({ text: "buy and sell" }),
  },
  {
    id: "details", label: "Ledger", icon: "findings", key: TAB_KEYS[5]!, tip: "Funds, support and secrecy in detail, against last month",
    status: (g) => ({ text: g.funds < 0 ? "in debt" : "the books", attention: g.funds < 0 }),
  },
];

export const isControlTab = (k: string): k is ControlTab => CONTROL_TABS.some((t) => t.id === k);
/** How many tabs want attention: the count on the Control button. */
export const controlAttention = (g: GameState) => CONTROL_TABS.filter((t) => t.status(g).attention).length;
