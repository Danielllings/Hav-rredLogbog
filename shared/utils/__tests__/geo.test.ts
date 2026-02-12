import {
  haversine,
  computeDistance,
  MIN_WAYPOINT_DISTANCE,
  MAX_WAYPOINT_DISTANCE,
  MAX_WAYPOINT_SPEED_MS,
  type Pt,
} from "../geo";

describe("geo utilities", () => {
  describe("haversine", () => {
    it("returns 0 for identical points", () => {
      const point: Pt = { latitude: 55.6761, longitude: 12.5683, t: 0 };
      expect(haversine(point, point)).toBe(0);
    });

    it("calculates distance between Copenhagen and Malmö (~28km)", () => {
      const copenhagen: Pt = { latitude: 55.6761, longitude: 12.5683, t: 0 };
      const malmo: Pt = { latitude: 55.605, longitude: 13.0038, t: 0 };
      const distance = haversine(copenhagen, malmo);
      // Should be approximately 28km
      expect(distance).toBeGreaterThan(27000);
      expect(distance).toBeLessThan(30000);
    });

    it("calculates short distance accurately (~100m)", () => {
      const a: Pt = { latitude: 55.6761, longitude: 12.5683, t: 0 };
      const b: Pt = { latitude: 55.677, longitude: 12.5683, t: 0 };
      const distance = haversine(a, b);
      // ~100m north
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });

    it("is symmetric (a to b equals b to a)", () => {
      const a: Pt = { latitude: 55.6761, longitude: 12.5683, t: 0 };
      const b: Pt = { latitude: 55.7, longitude: 12.6, t: 0 };
      expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 5);
    });
  });

  describe("computeDistance", () => {
    it("returns 0 for empty array", () => {
      expect(computeDistance([])).toBe(0);
    });

    it("returns 0 for single point", () => {
      const points: Pt[] = [{ latitude: 55.6761, longitude: 12.5683, t: 0 }];
      expect(computeDistance(points)).toBe(0);
    });

    it("calculates distance for valid path", () => {
      // ~100m per segment, 60 seconds apart (normal walking speed ~1.7 m/s)
      const points: Pt[] = [
        { latitude: 55.6761, longitude: 12.5683, t: 0 },
        { latitude: 55.677, longitude: 12.5683, t: 60000 }, // ~100m north in 60s
        { latitude: 55.678, longitude: 12.5683, t: 120000 }, // ~100m more in 60s
      ];
      const distance = computeDistance(points);
      // Should be approximately 200m
      expect(distance).toBeGreaterThan(180);
      expect(distance).toBeLessThan(220);
    });

    it("filters out jitter (points too close together)", () => {
      // Jitter point is only 1m away, should be skipped
      // Valid point is 100m away in 60s (normal walking speed)
      const points: Pt[] = [
        { latitude: 55.6761, longitude: 12.5683, t: 0 },
        { latitude: 55.67611, longitude: 12.5683, t: 1000 }, // ~1m - should be filtered
        { latitude: 55.677, longitude: 12.5683, t: 60000 }, // ~100m in 60s - should count
      ];
      const distance = computeDistance(points);
      // Should only count the ~100m jump, not the jitter
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });

    it("filters out GPS spikes (points too far apart)", () => {
      const points: Pt[] = [
        { latitude: 55.6761, longitude: 12.5683, t: 0 },
        { latitude: 55.68, longitude: 12.5683, t: 1000 }, // ~400m in 1 sec = spike
        { latitude: 55.677, longitude: 12.5683, t: 10000 }, // Normal point
      ];
      const distance = computeDistance(points);
      // The spike should be filtered out
      expect(distance).toBeLessThan(MAX_WAYPOINT_DISTANCE);
    });
  });

  describe("constants", () => {
    it("has reasonable MIN_WAYPOINT_DISTANCE", () => {
      expect(MIN_WAYPOINT_DISTANCE).toBeGreaterThan(0);
      expect(MIN_WAYPOINT_DISTANCE).toBeLessThan(50);
    });

    it("has reasonable MAX_WAYPOINT_DISTANCE", () => {
      expect(MAX_WAYPOINT_DISTANCE).toBeGreaterThan(100);
      expect(MAX_WAYPOINT_DISTANCE).toBeLessThan(500);
    });

    it("has reasonable MAX_WAYPOINT_SPEED_MS", () => {
      // Should be less than ~30 km/h for walking/fishing
      expect(MAX_WAYPOINT_SPEED_MS).toBeLessThan(10);
      expect(MAX_WAYPOINT_SPEED_MS).toBeGreaterThan(1);
    });
  });
});
