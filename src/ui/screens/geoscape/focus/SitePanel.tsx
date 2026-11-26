// A known vampire site in focus: what's there, and burning it.
import { pct, timeLeft } from "../../../format";
import { ELDERS } from "../../../../data/people";
import {
  basesUnderThreat,
  DENS_FOR_LAIR,
  densRaided,
  moveChance,
} from "../../../../sim/intel/networks";
import { SITE_KINDS, siteTitle } from "../../../../sim/missions/missions";
import { basesInReach } from "../../../../sim/people/personnel";
import { type GameState, type Site } from "../../../../sim/core/state";
import { Panel } from "../../../components/Panel";
import { useGame } from "../../../store";
import { bloodline, DispatchButton } from "./shared";

/** What burning a site does for the climb (sim/intel/networks.ts). */
function burnGives(g: GameState, site: Site): string {
  const net = g.networks[site.bloodline];
  if (site.kind === "lair") return "the end of the bloodline";
  if (site.kind === "nest") return "a den clue, from what's inside";
  const done = net ? densRaided(net) : 0;
  return done + 1 >= DENS_FOR_LAIR
    ? "with the dens already burned, the lair"
    : `a den burned (${done + 1} of ${DENS_FOR_LAIR} toward the lair)`;
}

export function SitePanel({ site }: { site: Site }) {
  const g = useGame();
  const reach = basesInReach(g, site.pos);
  const kind = SITE_KINDS[site.kind];
  const threatened = site.kind === "lair" ? basesUnderThreat(g, site.bloodline) : [];
  return (
    <Panel
      title={site.kind === "lair" ? "Bloodline lair" : `Vampire ${kind.name.toLowerCase()}`}
      className="lead-panel site-panel"
    >
      <h3 className="lead-title">{siteTitle(site)}</h3>
      <p className="prose lead-text">{kind.description}</p>
      <div className="kv">
        <span>Bloodline</span>
        <span>{bloodline(site.bloodline)?.name}</span>
      </div>
      <div className="kv">
        <span>Expected</span>
        <span>
          {site.thralls} thralls,{" "}
          {site.vampires === 1 ? "one vampire" : `${site.vampires} vampires`}
        </span>
      </div>
      {site.kind === "lair" && ELDERS[site.bloodline] && (
        <div className="kv">
          <span>Sleeps here</span>
          <span>{ELDERS[site.bloodline]!.name}</span>
        </div>
      )}
      {site.expiresAt - g.time > 1000 * 86_400_000 ? (
        <div
          className="kv"
          data-tip="Any day it may pack up and go; more likely the more houses have fallen"
        >
          <span>It moves</span>
          <span>
            {site.kind === "lair" || site.kind === "haven"
              ? "never; it is waiting"
              : `any day: about ${pct(moveChance(g, site.kind))} a day`}
          </span>
        </div>
      ) : (
        <div className={`kv ${site.expiresAt - g.time < 2 * 86_400_000 ? "bad" : ""}`}>
          <span>They move in</span>
          <span>about {timeLeft(site.expiresAt - g.time)}</span>
        </div>
      )}
      <div className="kv">
        <span>Burned, it gives</span>
        <span>{burnGives(g, site)}</span>
      </div>
      {site.kind === "lair" && threatened.length > 0 && (
        <div className="kv kv-block bad">
          <span>It may strike</span>
          <span>{threatened.map((b) => b.name).join(", ")}</span>
        </div>
      )}
      <div className="kv kv-block">
        <span>In reach of</span>
        <span>
          {reach.length ? (
            reach
              .map(
                (r) =>
                  `${r.base.name.replace("Operational Base ", "")} (${Math.round(r.distance)} nm)`,
              )
              .join(", ")
          ) : (
            <em className="bad">no aircraft; charter only</em>
          )}
        </span>
      </div>
      <DispatchButton
        target={{ kind: "site", id: site.id }}
        missionId={site.missionId}
        inReach={reach.length > 0}
      />
    </Panel>
  );
}
