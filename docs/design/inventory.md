# Inventory: the grid

Paradise Cracked style, for equipping agents at a base and in battle. The
base's armoury stays a plain list with counts. Code: `sim/inventory.ts`
(the grid, pure), `sim/equipment.ts` (with the armoury), `tactical/battle.ts`
(with TU and the ground), `ui/components/Inventory.tsx` (the screen).

## The loadout

* **Worn**: the hand (one weapon; none means a knife), armour, a helmet.
* **Carried**: two **pockets** (2 × 2) and a **backpack** (4 × 5). Every item
  takes width × height cells, long things standing upright; no rotation.
  Anything fits a pocket or the backpack if there's room, worn things too.

| Item | Size | Item | Size |
|---|---|---|---|
| Pistol | 1 × 2 | Soft vest, plate carrier | 2 × 3 |
| Suppressed pistol | 1 × 3 | Helmet | 2 × 2 |
| Compact SMG | 1 × 3 | Incendiary | 1 × 1 |
| Carbine, shotgun | 2 × 4 | Trauma kit | 2 × 1 |
| Suppressed carbine | 2 × 5 | Pistol, SMG magazine, shells | 1 × 1 |
| | | Carbine magazine | 1 × 2 |

* **Magazines** reload a gun and are used up (the old one is dropped).
  Pistol magazines fit both pistols, carbine magazines both carbines. No
  magazine, no reload. At home guns are full; partial clips don't carry over.
* **Kit** still decides what goes along, item by item, wherever it sits.
  Magazines go with plainclothes; helmets and long guns only with tactical.
* Standard issue: a pistol, two pistol magazines, a soft vest. "Best for…"
  adds two magazines for the weapon, an incendiary and a trauma kit if
  there's room.

## Weapons

* **Fire modes**: snap, aimed (+15 aim), and **burst** for the SMG and both
  carbines: 3 rounds at one target, each −10 aim and rolled, stopping when
  it drops; 50% of the unit's TU. The mode is chosen on the action bar (M
  cycles); clicking an enemy, or T, shoots in it. Overwatch uses snap shots.
* **Suppressed** weapons make no noise (pods near by don't wake), and a shot
  that drops its target leaves the team concealed and the target's pod
  unalerted. A little weaker (pistol 10–22, carbine 16–28).
* Clips: pistol 6, SMG 12, carbine 8, shotgun 3.

## In battle

* **Inventory** (I) opens the screen with the ground near the agent below
  (this tile and the eight round it, in sight), scrollable. Click an item to
  lift it, click where it goes; right click or Esc puts it back. Putting a
  weapon in an occupied hand swaps: the one there goes where the new one
  came from (or to the ground, if it came from there).
* **Time**: out of one place plus into the other. The hand 2, a pocket 3,
  the backpack or the ground 6; rearranging within one container 2.
  Armour and helmet can't change mid-fight. Not while on overwatch or
  hunkered.
* **Use item** (U) uses something where it is, without the hand: throw an
  incendiary, open a trauma kit on the agent or one next to them (10
  health). From the backpack, +6 TU. Reloading from the backpack, +6 too.
* **The ground**: the dead drop what they carried (not what they wear);
  thralls drop their gun (and half the time a spare magazine). Items show
  on the map as small boxes. Downed agents keep their kit.
* **After the battle**: each survivor comes home with what they carried out;
  what their kit left at home goes back where it was (or into the backpack,
  or the armoury). With a win, our kit left on the ground goes to the
  armoury; enemy guns come home only if carried. Trauma kits still carried
  patch wounds after the fight.

## Open

* Encumbrance (still undecided what weight is measured against).
* Sensors (the motion tracker) as usable items; UV flare, smoke and frag
  grenades fit the same "use item" path.
* Item art: placeholders (the icon on a box coloured by kind).
