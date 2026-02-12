import { fmtTime, formatTripName, getTripTitleParts } from "../formatters";

describe("formatters", () => {
  describe("fmtTime", () => {
    it("formats 0 seconds", () => {
      expect(fmtTime(0)).toBe("00:00:00");
    });

    it("formats seconds only", () => {
      expect(fmtTime(45)).toBe("00:00:45");
    });

    it("formats minutes and seconds", () => {
      expect(fmtTime(125)).toBe("00:02:05");
    });

    it("formats hours, minutes, and seconds", () => {
      expect(fmtTime(3661)).toBe("01:01:01");
    });

    it("formats large values (10+ hours)", () => {
      expect(fmtTime(36000)).toBe("10:00:00");
    });

    it("pads single digits with zeros", () => {
      expect(fmtTime(3600 + 60 + 1)).toBe("01:01:01");
    });
  });

  describe("formatTripName", () => {
    it("returns date for trip with valid start_ts", () => {
      const trip = { start_ts: "2024-06-15T10:30:00Z" };
      const result = formatTripName(trip);
      // Date format depends on locale, just check it contains date parts
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns date with spot name when available", () => {
      const trip = {
        start_ts: "2024-06-15T10:30:00Z",
        spot_name: "Køge Bugt",
      };
      const result = formatTripName(trip);
      expect(result).toContain("Køge Bugt");
      expect(result).toContain("·");
    });

    it("trims spot name whitespace", () => {
      const trip = {
        start_ts: "2024-06-15T10:30:00Z",
        spot_name: "  Køge Bugt  ",
      };
      const result = formatTripName(trip);
      expect(result).toContain("Køge Bugt");
      expect(result).not.toContain("  Køge");
    });

    it("ignores empty spot name", () => {
      const trip = {
        start_ts: "2024-06-15T10:30:00Z",
        spot_name: "   ",
      };
      const result = formatTripName(trip);
      expect(result).not.toContain("·");
    });

    it("returns fallback for invalid date", () => {
      const trip = { start_ts: "invalid-date" };
      const result = formatTripName(trip);
      expect(result).toBe("Ukendt dato");
    });

    it("returns fallback for missing start_ts", () => {
      const trip = {};
      const result = formatTripName(trip);
      expect(result).toBe("Ukendt dato");
    });

    it("uses translate function when provided", () => {
      const trip = {};
      const translate = (key: string) =>
        key === "unknownDate" ? "Unknown date" : key;
      const result = formatTripName(trip, translate);
      expect(result).toBe("Unknown date");
    });
  });

  describe("getTripTitleParts", () => {
    it("returns dateStr and spotName for complete trip", () => {
      const trip = {
        start_ts: "2024-06-15T10:30:00Z",
        spot_name: "Amager Strand",
      };
      const { dateStr, spotName } = getTripTitleParts(trip);
      expect(dateStr).toBeTruthy();
      expect(spotName).toBe("Amager Strand");
    });

    it("returns null spotName when missing", () => {
      const trip = { start_ts: "2024-06-15T10:30:00Z" };
      const { spotName } = getTripTitleParts(trip);
      expect(spotName).toBeNull();
    });

    it("returns null spotName for empty string", () => {
      const trip = {
        start_ts: "2024-06-15T10:30:00Z",
        spot_name: "",
      };
      const { spotName } = getTripTitleParts(trip);
      expect(spotName).toBeNull();
    });

    it("returns null spotName for whitespace only", () => {
      const trip = {
        start_ts: "2024-06-15T10:30:00Z",
        spot_name: "   ",
      };
      const { spotName } = getTripTitleParts(trip);
      expect(spotName).toBeNull();
    });

    it("returns fallback dateStr for null trip", () => {
      const { dateStr } = getTripTitleParts(null);
      expect(dateStr).toBe("Ukendt dato");
    });

    it("uses translate function for fallback", () => {
      const translate = (key: string) =>
        key === "unknownDate" ? "Unknown" : key;
      const { dateStr } = getTripTitleParts(null, translate);
      expect(dateStr).toBe("Unknown");
    });
  });
});
