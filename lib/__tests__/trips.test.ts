import {
  getFishEventsCount,
  distanceMeters,
  getEndPositionFromPath,
  type TripRowBase,
} from "../tripUtils";

describe("trips utilities", () => {
  describe("getFishEventsCount", () => {
    const baseTripRow: Omit<TripRowBase, "fish_count" | "fish_events_json"> = {};

    it("returns fish_count when fish_events_json is null", () => {
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 5,
        fish_events_json: null,
      };
      expect(getFishEventsCount(trip)).toBe(5);
    });

    it("returns fish_count when fish_events_json is undefined", () => {
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 3,
        fish_events_json: undefined,
      };
      expect(getFishEventsCount(trip)).toBe(3);
    });

    it("returns 0 when fish_count is 0 and no events", () => {
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 0,
        fish_events_json: null,
      };
      expect(getFishEventsCount(trip)).toBe(0);
    });

    it("parses fish_events_json array and returns length", () => {
      const events = ["2024-01-01T10:30:00Z", "2024-01-01T11:00:00Z"];
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 0,
        fish_events_json: JSON.stringify(events),
      };
      expect(getFishEventsCount(trip)).toBe(2);
    });

    it("prefers fish_events_json over fish_count when present", () => {
      const events = ["2024-01-01T10:30:00Z", "2024-01-01T11:00:00Z", "2024-01-01T11:30:00Z"];
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 1, // should be ignored
        fish_events_json: JSON.stringify(events),
      };
      expect(getFishEventsCount(trip)).toBe(3);
    });

    it("returns fish_count on invalid JSON", () => {
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 4,
        fish_events_json: "not-valid-json",
      };
      expect(getFishEventsCount(trip)).toBe(4);
    });

    it("returns fish_count when JSON is not an array", () => {
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 2,
        fish_events_json: JSON.stringify({ count: 5 }),
      };
      expect(getFishEventsCount(trip)).toBe(2);
    });

    it("returns 0 for empty events array", () => {
      const trip: TripRowBase = {
        ...baseTripRow,
        fish_count: 5, // ignored when events exist
        fish_events_json: JSON.stringify([]),
      };
      expect(getFishEventsCount(trip)).toBe(0);
    });
  });

  describe("distanceMeters (haversine)", () => {
    it("returns 0 for identical coordinates", () => {
      expect(distanceMeters(55.6761, 12.5683, 55.6761, 12.5683)).toBe(0);
    });

    it("calculates distance between Copenhagen and Malmö (~28km)", () => {
      const distance = distanceMeters(55.6761, 12.5683, 55.605, 13.0038);
      expect(distance).toBeGreaterThan(27000);
      expect(distance).toBeLessThan(30000);
    });

    it("calculates short distance (~100m)", () => {
      // ~100m north (0.0009 degrees ≈ 100m at this latitude)
      const distance = distanceMeters(55.6761, 12.5683, 55.677, 12.5683);
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });

    it("is symmetric", () => {
      const d1 = distanceMeters(55.6761, 12.5683, 55.7, 12.6);
      const d2 = distanceMeters(55.7, 12.6, 55.6761, 12.5683);
      expect(d1).toBeCloseTo(d2, 5);
    });

    it("handles equator correctly", () => {
      // ~111km at equator (1 degree)
      const distance = distanceMeters(0, 0, 1, 0);
      expect(distance).toBeGreaterThan(110000);
      expect(distance).toBeLessThan(112000);
    });
  });

  describe("getEndPositionFromPath", () => {
    it("returns null for null input", () => {
      expect(getEndPositionFromPath(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(getEndPositionFromPath(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getEndPositionFromPath("")).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(getEndPositionFromPath("not-json")).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(getEndPositionFromPath("[]")).toBeNull();
    });

    it("extracts last position with lat/lng format", () => {
      const path = JSON.stringify([
        { lat: 55.6761, lng: 12.5683 },
        { lat: 55.677, lng: 12.5690 },
        { lat: 55.678, lng: 12.5700 },
      ]);
      const result = getEndPositionFromPath(path);
      expect(result).toEqual({ lat: 55.678, lng: 12.57 });
    });

    it("extracts last position with latitude/longitude format", () => {
      const path = JSON.stringify([
        { latitude: 55.6761, longitude: 12.5683 },
        { latitude: 55.678, longitude: 12.57 },
      ]);
      const result = getEndPositionFromPath(path);
      expect(result).toEqual({ lat: 55.678, lng: 12.57 });
    });

    it("handles single point path", () => {
      const path = JSON.stringify([{ lat: 55.6761, lng: 12.5683 }]);
      const result = getEndPositionFromPath(path);
      expect(result).toEqual({ lat: 55.6761, lng: 12.5683 });
    });

    it("returns null if last point has invalid lat/lng", () => {
      const path = JSON.stringify([
        { lat: 55.6761, lng: 12.5683 },
        { x: 100, y: 200 }, // invalid format
      ]);
      expect(getEndPositionFromPath(path)).toBeNull();
    });

    it("returns null for non-array JSON", () => {
      const path = JSON.stringify({ lat: 55.6761, lng: 12.5683 });
      expect(getEndPositionFromPath(path)).toBeNull();
    });
  });
});
