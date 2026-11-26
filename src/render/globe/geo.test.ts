import { describe, expect, it } from "vitest";
import { latLonToVector3, vector3ToLatLon } from "./geo";

describe("lat/lon conversion", () => {
  it("round-trips points around the globe", () => {
    for (const p of [
      { lat: 45.41, lon: 11.88 },
      { lat: -33.9, lon: 151.2 },
      { lat: 69.35, lon: 88.2 },
      { lat: 0, lon: -179 },
    ]) {
      const back = vector3ToLatLon(latLonToVector3(p));
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lon).toBeCloseTo(p.lon, 6);
    }
  });
});
