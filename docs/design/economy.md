# Economy: funding, pledges, losing, the dark web

## Funding

Income = Vatican stipend (by difficulty; a share of it in Act II, see
[story.md](story.md)) + each region's contribution × its support × its
pledge. Levers: `regionalFunding` and `marketPrices` per difficulty
(`data/difficulty.ts`), `HOSTAGE_STIPEND` (`sim/story.ts`), `PLEDGE`
(`sim/economy.ts`), `GOODS` (`sim/market.ts`). Pinned by `sim/market.test.ts`.

The books are kept in `GameState.ledger` (`sim/ledger.ts`): every money,
support and secrecy change is noted, and month end closes the month.

**Budget targets** (user), measured in Act II in "working bases" (a base
abroad with six operators, a helicopter and a SIGINT station, about $555k a
month):

| Difficulty | Without trying | With good financial play |
|---|---|---|
| Novice | 2 | 3–4 |
| Inquisitor | 1 | 2–3 |
| Grand Inquisitor | barely 1 | 1 + a remote base |

Currently met: the bots reach about 2.5 / 1.4 / 1.0 without trying, and
good play (workshop lines, pledges, tissue, artifacts) about 4 / 2.7 / 1.9.

## Pledges

Each region's contribution is multiplied by its pledge (60–200%). This
month's record: an operation that worked +8%, a nest/den/haven burned +12%
more, a lair +50% more, an artifact returned +10%; a known operation let run
−3%, a found site never hit −5%. Neighbours get a third. It settles at month
end and the monthly report lists who gives more and less.

## Losing

* The last Operational Base lost.
* **Half the regions hostile** (24 of 48 at −3), with a warning from the
  Holy See at 18.
* **Debt**: the first month end in the red brings auditors and a quarter of
  lay staff walking out; the second, half the rest and leased jets
  repossessed; the third dissolves the Order.

## The dark web

Dark web screen (K), **Buy** and **Sell** tabs. Code: `sim/market.ts`,
`ui/screens/geoscape/MarketScreen.tsx`. It's the only place equipment is
bought: the armoury's Order button puts an item in the cart, shipping there.

**One price either way.** Equipment buys and sells at its list price;
research at $1,500 a point (× difficulty). Selling to us costs no less than
buying from us.

### Buy

* A catalogue on the left (**equipment**, then **information**), the
  **cart** on the right: ship-to base (a drop-down), a quantity per line,
  subtotal, a **20% crypto tumbler fee** on the whole order, total, one
  payment. The fee is what stops buying and selling back from paying. The
  cart stays while the screen is closed; it isn't saved.
* **Equipment** ships to the chosen base in **40 hours**, whatever and
  wherever (a dark-web parcel; lost if the base falls first).
* **Information**: public science (topics marked `trade: { public: true }`
  in `data/research.ts`: field medicine, combat surgery, composite armour,
  signal analysis) is ours the moment it's paid for, as if a lab had
  finished it; a project on it stops. Only topics whose prerequisites we
  know are offered.
* **What's for sale**: equipment needing no research, or research that's
  public (public science, or ours once it has leaked). We can buy what we
  haven't researched, within reason. **Never** anything only we could
  have: vampire tissue, blood, captives, the bloodlines' heirlooms, or
  items built on our own vampire research before it's out. We are the
  world's authority on vampires; nobody else has any to sell.

### Sell

* **Vampire tissue** (remains in cold storage): $60k raw, $160k after
  Vampire physiology, $280k after Haematology. Secrecy −0.4 each.
* **Products** from repeatable workshop lines, no secrecy cost:

  | Product | Needs | Eng-days | Materials | Price |
  |---|---|---|---|---|
  | Synthetic plasma | Haematology | 45 | $60k | $200k |
  | Pheromone blockers | Pheromones | 40 | $45k | $150k |
  | UV sterilisers | UV weaponry | 30 | $35k | $120k |
  | Ceramic inserts | Composite armour | 25 | $25k | $80k |

* **Demand** per market (tissue, products, artifacts): a sale pays price ×
  demand, then knocks it down (10–20%); it recovers 1% a day (floor 10%).
  About 1.5–3 units a month each at full price.
* **Equipment** from a base's armoury (not what agents carry), at list price.
* **Research**: what only we know (topics with a `buyer`), sold once, to
  pharmaceutical companies through cutouts, defence contractors, data
  brokers. We keep it. Vampire science costs secrecy (0.3–0.5).
  30–60 days later it is **public**: the log says so, our goods made from it
  fetch half (others make them too), and items that need it appear on the
  Buy tab.
* **Artifacts**: dens (30%) and havens (60%) sometimes hold one
  ($120–500k); every lair gives its line's treasure ($1–1.6M). Six named
  pieces per line. Sell (secrecy −0.5) or return it where it was taken
  (support +0.5, pledge +10%).
* Prices: Novice ×1.15, Grand ×0.85 (goods, artifacts and research; not
  equipment). Nobody deals with an exposed Order.
