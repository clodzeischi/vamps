#include "data/Items.h"

#include <cassert>
#include <map>

#include "data/Bloodlines.h"

namespace vamps {

const char* damageTypeName(DamageType t) {
    switch (t) {
        case DamageType::Ballistic: return "Ballistic";
        case DamageType::Incendiary: return "Incendiary";
        case DamageType::Explosive: return "Explosive";
        case DamageType::Melee: return "Melee";
        case DamageType::Stun: return "Stun";
        case DamageType::Haemolytic: return "Haemolytic";
        case DamageType::Smoke: return "Smoke";
        case DamageType::Light: return "Light";
        default: return "?";
    }
}

std::string sigilItemId(int bloodline) { return "sigil_" + std::to_string(bloodline); }

namespace {

// ---------------------------------------------------------------------------
// Small builders so the table below reads like a spreadsheet.
// ---------------------------------------------------------------------------

ItemDef firearm(std::string id, std::string name, int size, int weight, int cost,
                std::vector<std::string> ammo, FireMode snap, FireMode aimed, FireMode autoFire,
                bool twoHanded, std::string desc) {
    ItemDef d;
    d.id = std::move(id); d.name = std::move(name); d.kind = ItemKind::Firearm;
    d.size = size; d.weight = weight; d.storage = 0.2 * size;
    d.buyCost = cost; d.sellPrice = cost * 3 / 4;
    d.ammo = std::move(ammo); d.snap = snap; d.aimed = aimed; d.autoFire = autoFire;
    d.twoHanded = twoHanded; d.description = std::move(desc);
    return d;
}

ItemDef clip(std::string id, std::string name, int damage, DamageType type, int rounds, int cost,
             std::string desc) {
    ItemDef d;
    d.id = std::move(id); d.name = std::move(name); d.kind = ItemKind::Ammo;
    d.size = 1; d.weight = 2; d.storage = 0.1;
    d.damage = damage; d.damageType = type; d.clipSize = rounds;
    d.buyCost = cost; d.sellPrice = cost * 3 / 4; d.description = std::move(desc);
    return d;
}

ItemDef grenade(std::string id, std::string name, int damage, DamageType type, int radius, int cost,
                bool impact, std::string desc) {
    ItemDef d;
    d.id = std::move(id); d.name = std::move(name); d.kind = ItemKind::Grenade;
    d.size = 1; d.weight = 3; d.storage = 0.1;
    d.damage = damage; d.damageType = type; d.blastRadius = radius; d.impactFuse = impact;
    d.buyCost = cost; d.sellPrice = cost * 3 / 4; d.description = std::move(desc);
    return d;
}

ItemDef armor(std::string id, std::string name, int front, int side, int rear, int cost,
              std::string desc) {
    ItemDef d;
    d.id = std::move(id); d.name = std::move(name); d.kind = ItemKind::Armor;
    d.size = 0; d.weight = 0; d.storage = 0.5;
    d.armorFront = front; d.armorSide = side; d.armorRear = rear;
    d.buyCost = cost; d.sellPrice = cost * 3 / 4; d.description = std::move(desc);
    return d;
}

ItemDef artifact(std::string id, std::string name, int sellPrice, std::string desc) {
    ItemDef d;
    d.id = std::move(id); d.name = std::move(name); d.kind = ItemKind::Artifact;
    d.size = 1; d.weight = 2; d.storage = 0.2;
    d.sellPrice = sellPrice; d.description = std::move(desc);
    return d;
}

ItemDef& built(ItemDef& d, std::string research, int hours, int cost) {
    d.research = std::move(research); d.buildHours = hours; d.buildCost = cost;
    return d;
}

std::vector<ItemDef> buildTable() {
    std::vector<ItemDef> t;

    // ----- Standard-issue firearms (available on the open market) -----
    //                    id        name             sz wt  cost   ammo
    t.push_back(firearm("pistol", "9mm Pistol",      2, 5,   800, {"pistol_clip"},
                        {18, 60, 1}, {30, 78, 1}, {}, false,
                        "Reliable sidearm. Puts a fledgling down for a turn or two, no more."));
    t.push_back(firearm("rifle", "Assault Rifle",    3, 8,  3000, {"rifle_clip", "rifle_clip_inc"},
                        {25, 60, 1}, {80, 110, 1}, {35, 35, 3}, true,
                        "The agency's standard rifle. Accepts incendiary magazines once developed."));
    t.push_back(firearm("shotgun", "Combat Shotgun", 3, 7,  2500, {"shotgun_shells"},
                        {20, 55, 1}, {45, 75, 1}, {}, true,
                        "Brutal at close range, useless past ten metres."));
    t.back().effectiveRange = 8;
    t.push_back(firearm("amr", "Anti-Materiel Rifle", 3, 18, 6400, {"amr_mag", "amr_mag_inc"},
                        {33, 60, 1}, {80, 90, 1}, {}, true,
                        "12.7mm. Heavy, slow, and it goes through brick walls."));

    t.push_back(clip("pistol_clip", "Pistol Clip", 26, DamageType::Ballistic, 12, 70, "12 rounds, 9mm."));
    t.push_back(clip("rifle_clip", "Rifle Magazine", 30, DamageType::Ballistic, 20, 200, "20 rounds, 5.56mm."));
    t.push_back(clip("shotgun_shells", "Shotgun Shells", 45, DamageType::Ballistic, 8, 120, "8 shells, 00 buckshot."));
    t.push_back(clip("amr_mag", "AMR Magazine", 56, DamageType::Ballistic, 6, 300, "6 rounds, 12.7mm."));

    // ----- Incendiary munitions (research: Thermal Necrosis) -----
    {
        ItemDef d = clip("rifle_clip_inc", "Incendiary Magazine", 24, DamageType::Incendiary, 20, 0,
                         "Magnesium-cored rounds. Ignite vampire tissue on contact.");
        d.blackMarket = true; d.sellPrice = 400;
        t.push_back(built(d, "thermal_necrosis", 30, 800));
    }
    {
        ItemDef d = clip("amr_mag_inc", "AMR Incendiary Mag", 52, DamageType::Incendiary, 6, 0,
                         "Armour-piercing incendiary. The surest kill short of a flamethrower.");
        d.sellPrice = 600;
        t.push_back(built(d, "thermal_necrosis", 40, 1200));
    }
    {
        ItemDef d = firearm("flamer", "Napalm Projector", 3, 16, 0, {"napalm_tank"},
                            {30, 70, 1}, {}, {}, true,
                            "Throws a stream of jellied fuel. Sets everything in its path alight.");
        d.effectiveRange = 8; d.sellPrice = 9000;
        t.push_back(built(d, "napalm_projector", 300, 12000));
    }
    {
        ItemDef d = clip("napalm_tank", "Napalm Tank", 40, DamageType::Incendiary, 6, 0, "Six bursts.");
        d.blastRadius = 1; d.sellPrice = 600;
        t.push_back(built(d, "napalm_projector", 40, 800));
    }
    {
        ItemDef d = firearm("dartgun", "Haemolytic Dart Gun", 2, 4, 0, {"haem_darts"},
                            {20, 70, 1}, {40, 100, 1}, {}, false,
                            "Fires darts loaded with a synthetic anticoagulant enzyme. A vampire "
                            "in torpor that has been darted will not regenerate.");
        d.sellPrice = 7000;
        t.push_back(built(d, "haemolytic_agent", 250, 9000));
    }
    {
        ItemDef d = clip("haem_darts", "Haemolytic Darts", 15, DamageType::Haemolytic, 10, 0, "Ten darts.");
        d.sellPrice = 400;
        t.push_back(built(d, "haemolytic_agent", 30, 500));
    }

    // ----- Melee -----
    {
        ItemDef d; d.id = "knife"; d.name = "Combat Knife"; d.kind = ItemKind::MeleeWeapon;
        d.size = 1; d.weight = 1; d.damage = 20; d.damageType = DamageType::Melee;
        d.meleeTuPercent = 12; d.meleeAccuracy = 100; d.buyCost = 200; d.sellPrice = 150;
        d.description = "Last resort.";
        t.push_back(d);
        d.id = "machete"; d.name = "Machete"; d.size = 2; d.weight = 3; d.damage = 35;
        d.meleeTuPercent = 18; d.meleeAccuracy = 90; d.buyCost = 400; d.sellPrice = 300;
        d.description = "Heavy blade. Slow, but it keeps a thrall at arm's length.";
        t.push_back(d);
    }

    // ----- Grenades -----
    t.push_back(grenade("grenade", "Frag Grenade", 50, DamageType::Explosive, 3, 300, false,
                        "Set the fuse, throw, take cover. Explodes at the end of the turn."));
    t.push_back(grenade("molotov", "Molotov Cocktail", 30, DamageType::Incendiary, 1, 50, true,
                        "Bottle, petrol, rag. Bursts on impact. Crude but it ends vampires."));
    t.push_back(grenade("smoke_grenade", "Smoke Grenade", 0, DamageType::Smoke, 3, 150, false,
                        "Thick smoke that blocks line of sight."));
    t.push_back(grenade("flare", "Electro-Flare", 0, DamageType::Light, 6, 60, true,
                        "Lights up the area around where it lands for the rest of the mission."));
    {
        ItemDef d = grenade("thermite_grenade", "Thermite Grenade", 60, DamageType::Incendiary, 2, 0,
                            false, "Burns at 2500 C. Nothing regenerates from that.");
        d.sellPrice = 500; d.blackMarket = true;
        t.push_back(built(d, "thermal_necrosis", 40, 600));
    }
    {
        ItemDef d = grenade("thermite_charge", "Thermite Charge", 110, DamageType::Incendiary, 3, 0,
                            false, "Demolition charge. Breaches walls and incinerates rooms.");
        d.size = 2; d.weight = 8; d.sellPrice = 1500;
        t.push_back(built(d, "napalm_projector", 100, 2000));
    }

    // ----- Medical & equipment -----
    {
        ItemDef d; d.id = "medkit"; d.name = "Field Medkit"; d.kind = ItemKind::Medkit;
        d.size = 2; d.weight = 3; d.healAmount = 10; d.uses = 4;
        d.buyCost = 1500; d.sellPrice = 1000;
        d.description = "Seals wounds and restores a little health. Four uses.";
        t.push_back(d);
        d.id = "haem_stim"; d.name = "Haem Stimulant"; d.healAmount = 30; d.uses = 3;
        d.buyCost = 0; d.sellPrice = 4000; d.blackMarket = true;
        d.description = "A tamed derivative of vampire serum. Rapid tissue repair.";
        t.push_back(built(d, "haem_serum_analysis", 80, 3000));
    }
    {
        ItemDef d; d.id = "tracker"; d.name = "Motion Tracker"; d.kind = ItemKind::Equipment;
        d.size = 2; d.weight = 3; d.sellPrice = 6000;
        d.description = "Use (25% TU) to reveal moving bodies within 15 tiles until your next turn.";
        t.push_back(built(d, "motion_tracker", 200, 8000));
    }
    {
        ItemDef d; d.id = "neuro_blocker"; d.name = "Neuro-Blocker"; d.kind = ItemKind::Equipment;
        d.size = 1; d.weight = 1; d.willBonus = 30; d.sellPrice = 1200;
        d.description = "Receptor antagonist auto-injector. Carried: +30 Will against domination.";
        t.push_back(built(d, "pheromone_analysis", 50, 1500));
    }

    // ----- Armour -----
    t.push_back(armor("kevlar", "Kevlar Vest", 12, 8, 5, 1000, "Soft body armour. Stops pistol rounds, mostly."));
    {
        ItemDef d = armor("ceramic", "Ceramic Plate Armour", 30, 24, 18, 0,
                          "Boron-carbide plates. Turns aside claws and rifle fire.");
        d.sellPrice = 15000;
        t.push_back(built(d, "ceramic_armor", 400, 20000));
    }
    {
        ItemDef d = armor("sealed_suit", "Sealed Ballistic Suit", 40, 34, 26, 0,
                          "Ceramic armour with a sealed rebreather. Immune to smoke, +40 Will "
                          "against neurochemical domination.");
        d.willBonus = 40; d.sealed = true; d.sellPrice = 35000;
        t.push_back(built(d, "sealed_suit", 800, 45000));
    }
    {
        ItemDef d = armor("exoframe", "Exo-Frame", 60, 50, 40, 0,
                          "Powered exoskeleton with a sealed shell. +20 Strength.");
        d.willBonus = 40; d.sealed = true; d.strengthBonus = 20; d.sellPrice = 70000;
        d.blackMarket = true;
        t.push_back(built(d, "exoframe", 1500, 90000));
    }

    // ----- Recovered artefacts -----
    t.push_back(artifact("vamp_remains", "Vampire Remains", 8000,
                         "Charred tissue. The retrovirus is still detectable in the marrow."));
    t.push_back(artifact("pheromone_gland", "Pheromone Gland", 30000,
                         "An elder's modified apocrine gland. Produces neuroactive aerosols."));
    {
        ItemDef d = artifact("haem_serum", "Haem Serum", 12000,
                             "Vials of concentrated vampire blood plasma. Highly prized by collectors.");
        d.blackMarket = true; d.buyCost = 0;
        t.push_back(d);
    }
    t.push_back(artifact("blood_ledger", "Blood Ledger", 5000,
                         "Accounts: payments to producers, publishers, politicians."));
    t.push_back(artifact("encrypted_drive", "Encrypted Drive", 6000, "Hardware-encrypted storage."));
    t.push_back(artifact("jet_avionics", "Jet Avionics", 15000, "Salvaged flight electronics. Sells well."));
    for (int b = 0; b < kBloodlineCount; ++b) {
        ItemDef d = artifact(sigilItemId(b), std::string("Sigil Fragment (") + bloodline(b).shortName + ")",
                             20000,
                             "A carved fragment bearing a 13th-century Cathar sigil. The pattern "
                             "encodes a genealogy of the infection.");
        d.blackMarket = true;
        t.push_back(d);
    }

    // ----- Craft weapons & ammo -----
    {
        ItemDef d; d.id = "autocannon"; d.name = "Autocannon"; d.kind = ItemKind::CraftWeapon;
        d.storage = 3; d.buyCost = 30000; d.sellPrice = 20000; d.damage = 10;
        d.craftRangeKm = 10; d.craftReloadSec = 2; d.craftAmmoCapacity = 200; d.craftAccuracy = 25;
        d.craftAmmoItem = "cannon_rounds"; d.craftAmmoPerItem = 50;
        d.description = "30mm cannon. Short range, plenty of ammunition.";
        t.push_back(d);

        d = ItemDef(); d.id = "stinger"; d.name = "Stinger Launcher"; d.kind = ItemKind::CraftWeapon;
        d.storage = 3; d.buyCost = 16000; d.sellPrice = 12000; d.damage = 70;
        d.craftRangeKm = 30; d.craftReloadSec = 16; d.craftAmmoCapacity = 6; d.craftAccuracy = 65;
        d.craftAmmoItem = "stinger_missile";
        d.description = "Air-to-air missiles. The interceptor's main weapon.";
        t.push_back(d);

        d = ItemDef(); d.id = "thermobaric"; d.name = "Thermobaric Launcher"; d.kind = ItemKind::CraftWeapon;
        d.storage = 3; d.sellPrice = 30000; d.damage = 110;
        d.craftRangeKm = 45; d.craftReloadSec = 20; d.craftAmmoCapacity = 3; d.craftAccuracy = 75;
        d.craftAmmoItem = "thermobaric_missile";
        d.description = "Long-range fuel-air missiles.";
        t.push_back(built(d, "thermobaric_missile", 400, 40000));

        d = ItemDef(); d.id = "cannon_rounds"; d.name = "Cannon Rounds (x50)"; d.kind = ItemKind::CraftAmmo;
        d.storage = 1; d.buyCost = 1240; d.sellPrice = 600;
        t.push_back(d);
        d.id = "stinger_missile"; d.name = "Stinger Missile"; d.buyCost = 3000; d.sellPrice = 2000;
        t.push_back(d);
        d.id = "thermobaric_missile"; d.name = "Thermobaric Missile"; d.buyCost = 0; d.sellPrice = 6000;
        t.push_back(built(d, "thermobaric_missile", 200, 15000));
    }

    return t;
}

} // namespace

const std::vector<ItemDef>& allItems() {
    static const std::vector<ItemDef> table = buildTable();
    return table;
}

const ItemDef* findItem(const std::string& id) {
    static const std::map<std::string, const ItemDef*> index = [] {
        std::map<std::string, const ItemDef*> m;
        for (const auto& d : allItems()) m[d.id] = &d;
        return m;
    }();
    auto it = index.find(id);
    return it == index.end() ? nullptr : it->second;
}

const ItemDef& item(const std::string& id) {
    const ItemDef* d = findItem(id);
    assert(d && "unknown item id");
    return *d;
}

} // namespace vamps
