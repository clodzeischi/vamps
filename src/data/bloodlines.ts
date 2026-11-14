// The six sigils. Each works the public in its home regions hardest.
export interface BloodlineDef {
  id: string;
  name: string;
  short: string;
  homeRegions: string[];
  /** How hard its media campaigns push support down (1 = normal). */
  pr: number;
}

export const BLOODLINES: BloodlineDef[] = [
  {
    id: "ashgrove", name: "House Ashgrove", short: "Ashgrove", pr: 1.5,
    homeRegions: ["us_northeast", "us_south", "us_midwest", "us_west", "canada_east", "canada_west", "mexico_central", "caribbean"],
  },
  {
    id: "huaca", name: "The Huaca Line", short: "Huaca", pr: 1.0,
    homeRegions: ["brazil", "andean_north", "andes_south", "southern_cone"],
  },
  {
    id: "carcassonne", name: "The Carcassonne Perfecti", short: "Perfecti", pr: 1.0,
    homeRegions: ["italy", "iberia", "france_benelux", "british_isles", "germany_alps", "central_europe", "balkans", "nordic", "eastern_europe", "russia_west", "russia_volga", "urals"],
  },
  {
    id: "sahel", name: "The Sahel Brood", short: "Sahel", pr: 1.0,
    homeRegions: ["maghreb", "nile", "west_africa", "central_africa", "east_africa", "southern_africa", "levant", "arabia", "iran", "turkey_caucasus"],
  },
  {
    id: "jade", name: "The Jade Court", short: "Jade", pr: 1.0,
    homeRegions: ["north_china", "south_china", "west_china", "japan_korea", "se_asia", "south_asia", "central_asia", "north_siberia", "south_siberia", "russia_far_east"],
  },
  {
    id: "nullarbor", name: "The Nullarbor Kin", short: "Nullarbor", pr: 1.0,
    homeRegions: ["australia_east", "australia_west", "pacific", "maritime_asia"],
  },
];
