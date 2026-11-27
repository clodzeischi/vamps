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
Code: `sim/campaign/story.ts`, `GameState.story`.

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

**The fall** is set by the hunt ([intelligence.md](intelligence.md)): Agnes
doesn't wait. **Raiding the first Perfecti den** (won or lost) brings the
Sigil down on Padua, however early that is: a player who gets there fast
gets hit fast. With no den raided, she attacks anyway on a random day
between 40 and 50. The assault is timed for when the team is home (at
least 3 operators): back injured from the first big hit, loot to sort,
research to start, operators to rest, and then the assault, with heavy
weapons.

**The battle for Padua** is a doomed horde battle against Agnes's elites
([levels.md](levels.md), Horde), not one that can be won: the extraction
zone is on the roof, and each wave held gets more staff out before the
team escapes. Research progress is the Order's, not Padua's, so it
survives the fall; Padua's workshop orders and stores do not. Until the
battle is built, the operators at the base bail out by the roof at once:
they live, the staff are lost. The random day comes from the seed
(`fallDay`); a raid on a Perfecti den sets `fallAt` to now.

Every installation in Europe is lost; operatives in the field and aircraft in
the air survive. Stranded teams fly to the nearest base abroad if in
range, else go overland (4 days + 1 per 600 nm; half with a ratline) and
the aircraft is abandoned.

**Act II: the hostage years.** The Vatican is held hostage. The second cell
is whatever the player built abroad. With nothing abroad, a **church cell**
activates (4 rookies, 6 beds, room for one aircraft, nothing else, $60k a
month) in the region of the best HUMINT agent, else the best-supported
region outside Serpenta territory. Rules: stipend at 20/35/50% by lesser
sigils broken; Europe pays nothing and is closed except through access
agents; Agnes runs no operations. **Secrecy 0 = Agnes exposes the Order**:
open war, stipend gone for good.

**Act III: the return.** Three of the five lesser bloodlines destroyed
reopens Europe (+1 support, stipend 75%, Agnes active again) and unlocks
her network again: her lair at Montségur is found by climbing the Perfecti
like any other house's (den clues from Act I are kept). **Victory: Agnes's
lair destroyed.** Remaining lines scatter. Agnes can't be kept down without
the **Montségur silencer**, the end of the research spine (the Root Strain,
from a Perfecti elder sample: [research.md](research.md)).

Bloodlines are destroyed by climbing their network to the lair and striking it ([intelligence.md](intelligence.md)). A
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
Bloodlines screen shows What we know as one paragraph under a
[CLASSIFIED: OPV ONLY] marking, growing by one entry per page (a raid, snatch or
questioning; `knowledgeOf`; nothing says what is still to come): history and the elder's name, then portrait
and bio, methods today, a secret or weakness, and when the lair is found,
where the elder sleeps (never a named city). Agnes's first two are known from the
start. Elders speak when their lair is found and appear when their line
dies; Agnes signs the fall and the exposure.

**Portraits**: 480×600 JPEG, quality 70, about 50 KB, cropped from renders.
Each elder has a `prompt` in `ELDERS`; use it with: "photorealistic
cinematic portrait, 2:3, half-length, dramatic low-key lighting, muted
palette, shallow depth of field, looking slightly past the camera".
