import { expect, it } from "vitest";
import { AGNES } from "../../data/bloodlines";
import { newCampaign } from "./campaign";
import { networkOf, revealSite } from "../intel/networks";
import { objectives } from "./objectives";
import { theFall } from "./story";

const texts = (s: ReturnType<typeof newCampaign>) => objectives(s).map((o) => o.text);

it("the objectives follow the acts, and what we know", () => {
  const s = newCampaign("inquisitor", 1);
  expect(texts(s)).toEqual(["Destroy Agnes of Toulouse", "Find a Perfecti den: 0 of 2 clues"]);
  s.story.beats.push("where-would-we-go");
  expect(texts(s)).toContain("Build an Operational Base outside Europe");

  const den = networkOf(s, AGNES).sites.find((x) => x.kind === "den")!;
  revealSite(s, den, AGNES);
  expect(texts(s)).toContain(`Raid the Perfecti den in ${den.city}`);

  theFall(s);
  expect(texts(s).slice(0, 2)).toEqual(["Destroy lesser bloodlines: 0 of 3", "Keep the Order secret"]);
  const lair = networkOf(s, "ashgrove").sites.find((x) => x.kind === "lair")!;
  revealSite(s, lair, "ashgrove");
  expect(texts(s)).toContain(`Assault the Ashgrove lair in ${lair.city}`);
  s.story.exposed = true;
  expect(objectives(s)[1]!.state).toBe("failed");

  s.story.act = 3;
  expect(texts(s)).toContain("Find her lair: 0 of 2 dens raided");
  revealSite(s, networkOf(s, AGNES).sites.find((x) => x.kind === "lair")!, AGNES);
  expect(texts(s).some((t) => t.startsWith("Assault the Perfecti lair at "))).toBe(true);
});
