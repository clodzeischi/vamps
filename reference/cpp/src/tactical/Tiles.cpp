#include "tactical/Tiles.h"

namespace vamps {

const TileDef& tileDef(TileType t) {
    using T = TileType;
    // name        glyph  fg               bg              walk  sight shots cover armr into       flam  mv  floor
    static const TileDef defs[] = {
        {"Open air",  "  ", {0, 0, 0},       {0, 0, 0},       false, false, false, 0.0,  0, T::Void,   false, 1, false},
        {"Grass",     "..", {70, 120, 50},   {18, 34, 16},    true,  false, false, 0.0,  0, T::Grass,  true,  1, true},
        {"Dirt",      "..", {120, 95, 60},   {34, 26, 16},    true,  false, false, 0.0,  0, T::Dirt,   false, 1, true},
        {"Sand",      "..", {190, 165, 110}, {60, 50, 30},    true,  false, false, 0.0,  0, T::Sand,   false, 1, true},
        {"Snow",      "..", {200, 205, 215}, {70, 74, 82},    true,  false, false, 0.0,  0, T::Snow,   false, 1, true},
        {"Road",      "  ", {90, 90, 90},    {38, 38, 40},    true,  false, false, 0.0,  0, T::Road,   false, 1, true},
        {"Floor",     "__", {110, 100, 90},  {40, 34, 30},    true,  false, false, 0.0,  0, T::Floor,  false, 1, true},
        {"Ramp",      "::", {90, 140, 190},  {20, 34, 52},    true,  false, false, 0.0,  0, T::CraftFloor, false, 1, true},
        {"Wall",      "##", {170, 160, 150}, {80, 74, 68},    false, true,  true,  1.0, 60, T::Rubble, false, 1, true},
        {"Window",    "[]", {140, 190, 220}, {50, 60, 70},    false, false, false, 0.45, 15, T::Rubble, false, 1, true},
        {"Door",      "++", {170, 120, 60},  {60, 40, 20},    true,  true,  true,  1.0, 25, T::Rubble, true,  1, true},
        {"Open door", "''", {170, 120, 60},  {40, 30, 20},    true,  false, false, 0.0, 25, T::Rubble, true,  1, true},
        {"Hull",      "%%", {150, 160, 175}, {60, 64, 72},    false, true,  true,  1.0, 80, T::Rubble, false, 1, true},
        {"Rock",      "MM", {105, 95, 85},   {45, 40, 36},    false, true,  true,  1.0,  0, T::Rock,   false, 1, true},
        {"Pillar",    "()", {180, 170, 160}, {60, 55, 50},    false, true,  true,  1.0, 90, T::Rubble, false, 1, true},
        {"Tree",      "TT", {40, 150, 60},   {14, 40, 16},    false, true,  true,  1.0, 40, T::Dirt,   true,  1, true},
        {"Bush",      "**", {60, 170, 70},   {18, 40, 18},    true,  false, false, 0.3,  8, T::Dirt,   true,  2, true},
        {"Water",     "~~", {80, 130, 220},  {14, 30, 70},    false, false, false, 0.0,  0, T::Water,  false, 1, false},
        {"Low wall",  "==", {160, 150, 130}, {50, 46, 40},    true,  false, false, 0.45, 30, T::Rubble, false, 2, true},
        {"Crate",     "[]", {180, 140, 90},  {60, 44, 26},    false, false, false, 0.5, 20, T::Rubble, true,  1, true},
        {"Stairs",    "//", {220, 200, 120}, {60, 54, 30},    true,  false, false, 0.0,  0, T::Stairs, false, 1, true},
        {"Rubble",    ";;", {130, 120, 110}, {40, 36, 32},    true,  false, false, 0.2,  0, T::Rubble, false, 2, true},
        {"Gravestone","++", {170, 170, 175}, {30, 34, 30},    true,  false, false, 0.4, 20, T::Rubble, false, 2, true},
        {"Pew",       "==", {150, 100, 60},  {44, 32, 22},    true,  false, false, 0.35, 10, T::Floor, true,  2, true},
    };
    return defs[(int)t];
}

} // namespace vamps
