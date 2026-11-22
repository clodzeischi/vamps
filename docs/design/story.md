# Story: lore, campaign arc, people

## Premise

**OPV, Ordo Potestatis Vera**: a secret branch of the Inquisition inside the
Vatican, fighting a covert (later open) war against vampires.

* In 1244 the Church burned the Cathar *Perfecti* at Montségur. Some
  survived, carrying a retrovirus: enormous tissue repair at the cost of
  haemophagy and photosensitivity. The OPV is the Church cleaning up its own
  failure, one reason the Vatican wants it secret.
* **Science, not mysticism.** Stakes do nothing. Chemistry and physics work:
  the haemolytic agent gels their blood, fire cauterises, UV burns.
  Bullets and blades only put a vampire into torpor.
* Six **bloodlines (sigils)**, each territorial: every region is exactly one
  line's homeland, and a line operates only there (`data/bloodlines.ts`).

| Bloodline | Home | Elder |
|---|---|---|
| House Ashgrove | N. America | Josiah Ashgrove, the Patriarch (Bristol deacon, 1636; the Ashgrove Foundation; Salem 1692) |
| The Huaca Line | S. America | Inés Quispe Sisa, the Silver Widow (Potosí, c. 1590; buried three times) |
| The Carcassonne Perfecti (the **Serpenta Sigil**) | Europe | **Agnes of Toulouse**, the Last Perfect (walked out of the fire at Montségur) |
| The Sahel Brood | Africa | Zahra of Taoudenni, the Salt Queen (1340s) |
| The Jade Court | Asia | Shen Wuyou, the Chancellor (Ming secret police, 1570s) |
| The Nullarbor Kin | Oceania | Cornelis Vos, the Wreck-Lord (VOC under-merchant, wrecked 1641) |

Tactical traits per line are in [tactical.md](tactical.md).

## Campaign arc (from the user's book)

Target length about 12 months: Act I ~1.5, Act II ~9, Act III ~1.5.
Code: `sim/story.ts`, `GameState.story`.

**Act I: the fall.** Padua hunts Agnes. A small economy, effectively a
tutorial. Scripted beats (`BEATS`, each plays once) push the player to build
abroad:

| Day | Beat |
|---|---|
| 0 | "OPV's Standing Orders", the cardinal's briefing |
| 6, 11 | Volunteers in São Paulo and Boston |
| 17 | An Ashgrove den in Boston only an armed team based abroad can reach. Ignored: US Northeast support −0.8 |
| 24 | "The name Agnes" |
| 34 | "Where would we go?" (only with no base outside Europe) |
| 28–45 | "Someone on the inside": the CDF report; then Serpenta intercepts, graded by SIGINT on Italy and France |

**The fall** is set by what the Order learns of Agnes. At **60 intel on
the Perfecti** (never before day 28; by day 45 regardless) the cardinal
passes on unverified reports that Agnes has someone inside the CDF and
may know about Padua. A week later the Sigil strikes, **the first hour
at least 3 operators are home** (or all Padua has), and after three more
weeks whoever is there. Intel on her line comes at 0.7 of the usual rate
in Act I (`AGNES_ACT1_INTEL`), so the report comes from about day 35 and
Perfecti rarely reach 100 before the fall. SIGINT on Italy or France may
intercept the build-up between the report and the strike.
Every installation in Europe is lost; agents in the field and aircraft in
the air survive. Padua's own fall is to be fought: **the battle for
Padua**, a doomed horde mission against Agnes's elites, with the
extraction zone on the roof; the more waves the team holds, the more
staff and research get out ([levels.md](levels.md), Horde). Until it is
built, the operators at the base bail out by the roof at once: they
live, the staff and the work are lost. Stranded teams fly to the nearest
base abroad if in range, else go overland (4 days + 1 per 600 nm; half
with a ratline) and the aircraft is abandoned.

**Act II: the hostage years.** The Vatican is held hostage. The second cell
is whatever the player built abroad. With nothing abroad, a **church cell**
activates (4 rookies, 6 beds, room for one aircraft, nothing else, $60k a
month) in the region of the best HUMINT asset, else the best-supported
region outside Serpenta territory. Rules: stipend at 20/35/50% by lesser
sigils broken; Europe pays nothing and is closed except through access
assets; Agnes runs no operations. **Secrecy 0 = Agnes exposes the Order**:
open war, stipend gone for good.

**Act III: the return.** Three of the five lesser bloodlines destroyed
reopens Europe (+1 support, stipend 75%, Agnes active again) and unlocks
her lair at Montségur (`lairLocked` until then). **Victory: Agnes's lair
destroyed.** Remaining lines scatter.

Bloodlines are destroyed by intel → lair (at intel 100) → lair strike. A
destroyed line's operations stop, its homelands gain support, and the
survivors grow 20% bolder.

## The cardinal

**Cardinal Ettore Valsecchi**, Prefect of the OPV, is the quest giver
(`public/assets/portraits/cardinal.jpg`). He signs the briefings, adds a line
before every lead (by source and act), returns after the fall on "the reserve
channel", sends eight lore-only dispatches from Europe through Act II (every
12–20 days; silent if exposed), and closes the war at Montségur.

Leads can show a scene in place of his portrait: SIGINT uses the radio tower
(`sigint.jpg`), HUMINT the stairwell brush pass (`humint.jpg`).

## Elders and chronicles

Data in `data/people.ts` (elders) and `data/lore.ts` (chronicles). The
Bloodlines screen reveals one chronicle entry per 20 intel: 20 history and
the elder's name, 40 portrait and bio, 60 methods today, 80 a secret or
weakness, 100 where the elder sleeps (never a named city; lairs other than
Montségur are placed when found). Agnes's first two are known from the
start. Elders speak when their lair is found and appear when their line
dies; Agnes signs the fall and the exposure.

**Portraits**: 480×600 JPEG, quality 70, about 50 KB, cropped from renders.
Each elder has a `prompt` in `ELDERS`; use it with: "photorealistic
cinematic portrait, 2:3, half-length, dramatic low-key lighting, muted
palette, shallow depth of field, looking slightly past the camera".
