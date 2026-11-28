# Inventory: the grid

Paradise Cracked style, for equipping operatives at a base and in battle. The
base's armoury stays a plain list with counts. Code: `sim/people/inventory.ts`
(the grid, pure), `sim/people/equipment.ts` (with the armoury), `tactical/battle.ts`
(with TU and the ground), `ui/components/Inventory.tsx` (the screen).

## The loadout

* **Worn**: the hand (one weapon; none means a knife), armour, a helmet.
* **Carried**: two **pockets** (2 × 2) and a **backpack** (4 × 5). Every item
  takes width × height cells, long things standing upright; no rotation.
  Anything fits a pocket or the backpack if there's room, worn things too.

Item sizes are in `data/equipment.ts` (a pistol 1 × 2, a carbine 2 × 4,
the machine guns and the rocket launcher 2 × 5, a vest 2 × 3).

* **Named guns, calibres in the description** so ammunition is matched by
  eye: 9 mm Glock 19 and Sig Sauer MPX (each its own magazine), 5.56 mm
  H&K 416 and M249, 7.62 mm M240B and M110, 12-gauge shotguns, 84 mm Carl
  Gustav. Ammunition is named calibre first, the gun in brackets.

* **Magazines** reload a gun and are used up (the old one is dropped).
  Glock magazines fit both Glocks, 416 magazines both 416s. No
  magazine, no reload. At home guns are full; partial clips don't carry over.
* **Kit** still decides what goes along, item by item, wherever it sits.
  Magazines go with plainclothes; helmets and long guns only with tactical.
* Standard issue: a pistol, two pistol magazines, a soft vest. Each
  operative has a Low viz and a Full tactical loadout ([base.md](base.md),
  "Equipment"); the bots fill them with the best the armoury
  has for the kit.

## Weapons

* **Fire modes**: snap, aimed (a cone ×0.55), and **burst** for the SMG
  and both carbines (3 rounds). The M249 (6) and the M240B (7) fire
  **bursts only**; holding for reaction fire, they fire a single round like
  any gun. A burst is so many rounds at one target, each in a cone ×1.3 and flying
  on its own (tactical.md, "Shooting is ballistic"), stopping when it drops; 50% of the unit's TU. The mode is chosen on the action panel (M
  cycles); clicking an enemy, or T, shoots in it. Reaction fire uses snap
  shots.
* **Suppressed** weapons make no noise (pods near by don't wake), and a shot
  that drops its target leaves the team concealed and the target's pod
  unalerted. A little weaker.
* **Shotguns** fire 8 pellets; shells fit both. **Machine guns** (M249,
  M240B) fire bursts only, single rounds in reaction. The **rocket
  launcher** holds one round (blast: tactical.md). The **M110** is the
  sniper rifle. Clips, damage, cones and prices: `tactical/rules.ts` and
  `data/equipment.ts`.

## In battle

* **Inventory** (I) opens the operative's sheet: stats beside the inventory,
  the ground near the operative below (this tile and the eight round it, in
  sight), scrollable. ◀ ▶ step through the squad, to pass things over by the
  floor (drop, switch, pick up). The base's equip window is the same sheet. Drag an item to
  where it goes; dropped elsewhere (or Esc, or a right click) it goes back.
  The costs are listed beside the ground, and on the item as it's dragged. Putting a
  weapon in an occupied hand swaps: the one there goes where the new one
  came from (or to the ground, if it came from there).
* **Time**: out of one place plus into the other. The hand 2, a pocket 3,
  the backpack or the ground 6; rearranging within one container 2.
  Armour and helmet can't change mid-fight.
* **Backpack** (U) opens a strip of what can be used where it is: pick one
  and it becomes the **active item** in place of the weapon. Throw an
  incendiary where clicked; open a trauma kit on the operative or one next to
  them (10 health). It stays active while another of the kind is carried
  (a medic patching several), and the weapon comes back after the last.
  From the backpack +6 TU; reloading from the backpack +6 too.
* **The ground**: the dead drop what they carried (not what they wear);
  thralls drop their gun (and half the time a spare magazine). Items show
  on the map as small boxes. Downed operatives keep their kit.
* **After the battle**: each survivor comes home with what they carried out;
  what their kit left at home goes back where it was (or into the backpack,
  or the armoury). With a win, our kit left on the ground goes to the
  armoury; enemy guns come home only if carried. Trauma kits still carried
  patch wounds after the fight.

## Open

* Encumbrance (still undecided what weight is measured against).
* Smoke and frag grenades (same "use item" path as the rest).
* Worn armour and helmets on the figures: waiting for the characters (item art: [item-art.md](item-art.md)).
