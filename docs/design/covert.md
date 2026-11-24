# Covert work: HUMINT, cover-ups, judged events

Everything covert under way or on offer is on the **Covert actions** screen
(C). Anything under way can be called off at any time: money spent, agents
home, secrecy −1, no roll.

## HUMINT assets

Code: `sim/humint.ts`. Assets are people the Order recruited in a region,
each doing one job for a monthly fee. Several per region. Agents make the
meeting and go home.

| Asset | Does | Fee/month |
|---|---|---|
| Access | Opens hostile regions, and a European region in Act II; hears operations there (0.1) | $20k |
| PR | +0.004 support a day; halves bloodline media damage there | $30k |
| Ratline | Escape route to our nearest base (dashed green on the globe); gets an unarmed agent out of a double's trap 60% ($25k); halves overland escape after the fall | $15k |
| Informant | Hears operations in its region (rate 0.2, no neighbours) | $25k |

Fees scale ×0.6–1.6 by region funding, +15% per point of hostility, fixed
at recruitment. They were halved so the mechanic is limited by skill, not
money.

* **Sources**: SIGINT leads (8% doubles), informants (15%), and
  **volunteers** (25%), who come forward about unheard operations anywhere,
  about two a month worldwide.
* **Recruiting**: every source lead says who the person is and what asset
  they'd be (stories that name a person fix their role, asset and sex).
  "Recruit them" rolls Tradecraft vs 45.
* **Doubles always compromise the agent.** Unarmed (civilian clothes): the
  agent who sat down is taken, unless a ratline gets them out. Armed: the
  team fights its way out (a battle). **Spotting a double rolls Insight**,
  on arrival or with "Watch the meeting point first".
* **Asset calls**: about one per asset every 50 days (more in a living
  bloodline's homeland and at low secrecy). A judged job; on hard ones a
  failure burns the asset and some failures burn every asset in the region
  (secrecy −2). Ignored: 15% the asset is lost. Tune `CALL_RATE`.
* **Disinformation offers** (about monthly while we hold an asset): false
  trail (the line's next operation delayed, its sites trapped for a
  stronger strike), counter-story (only where support was pushed down),
  bait (a den clue, two at hard tiers). "Intel" calls reveal a nest of the
  house. Same burn rules.
* **Turned thralls**: Tradecraft vs 50 turns a captive thrall into an
  informant at half fee in the region it came from. Failed: released, and
  30% of the time it tells its masters (secrecy −2).

## Cover-ups

Code: `sim/coverups.ts`. Off-screen jobs (XCOM 2 covert actions) offered as
a steady trickle, more after noise and at low secrecy, usually where the
last incident was. Money and 0–2 agents for 1–7 days. Failure can backfire
(secrecy and local support lost). Includes four **nerve** jobs that test
Faith as dread (the door, the half-taken, the chapel, the furnace) and
Combat jobs (the lock-up, the hunters).

**Media campaigns** (`sim/media.ts`): quiet, sustained or saturation per
region, paid daily, +0.35 / +0.75 / +1.25 support a month; saturation costs
secrecy.

## Judged events: who to send

Code: `sim/judged.ts`. Cover-ups, asset calls and disinformation hint in
the text at who to send and how hard it is. **Nothing names the stat or
shows the odds** ("just hints, not SEND HIGH FAITH GUY"). The picker lists
free agents in roster order with all stats, none preselected.

* Each situation has 2–3 **readings** with their own stat weights and hint;
  some are red herrings (a panicking asset wants a bodyguard but needs
  calming: Insight).
* **Tiers** telegraph difficulty: easy 30%, routine 45%, hard 20%, very
  hard 5%. Difficulty 30 / 42 / 52 / 62, Faith +15.
* Roll: `0.55 + (skill − difficulty) / 40`, clamped 5–95%; skill is best ×
  0.6 + average × 0.4. The right agent beats a random one by ~30 points on
  routine jobs, so reading the text pays.
* Easy and routine failures are mild; only hard ones backfire or burn.
  Rewards scale ×0.75 / 1 / 1.4 / 1.8.
* A failure's debrief says, in the fiction, whether it was a misread, the
  right person short of experience, or bad luck.

**Hint vocabulary** (keep it consistent so players learn it):
* Faith: grief, guilt, fear for a soul, confession, "hasn't slept since",
  someone who saw one of them, clergy.
* Insight: a shifting story, a moving price, an offer too good, a hidden
  motive, a bluff.
* Tradecraft: cameras, locks, records, servers, being watched, unseen,
  lifting something.
* Combat: hard men, debt collectors, muscle, threats.
* Easy: careless, bored, retiring next month. Hard: wary, burned before,
  another buyer. Very hard: a professional, the ministry, "already told
  everyone".

Not judged yet: recruiting (Tradecraft 45) and turning (50). Next: more
situations, and Church requests through the cardinal where what's asked for
isn't what's needed.
