import {
  waterLevelBucket,
  seasonFromMonth,
  timeOfDayBucket,
  tempBucketLabel,
  windSpeedBucketLabel,
  coastWindLabel,
  windDirLabelFromDeg,
  durationBucketLabel,
  movementLabel,
  pickBestBucket,
  buildBucketItems,
  buildSpotSummary,
  withTimeout,
  type SimpleBucket,
} from "../patternAnalysis";

describe("patternAnalysis", () => {
  describe("waterLevelBucket", () => {
    it("returns 'ukendt' for null", () => {
      expect(waterLevelBucket(null)).toBe("ukendt");
    });

    it("returns 'ukendt' for undefined", () => {
      expect(waterLevelBucket(undefined)).toBe("ukendt");
    });

    it("returns 'ukendt' for NaN", () => {
      expect(waterLevelBucket(NaN)).toBe("ukendt");
    });

    it("returns 'Lavvande' for values below -20", () => {
      expect(waterLevelBucket(-25)).toBe("Lavvande");
      expect(waterLevelBucket(-100)).toBe("Lavvande");
    });

    it("returns 'Højvande' for values above 20", () => {
      expect(waterLevelBucket(25)).toBe("Højvande");
      expect(waterLevelBucket(100)).toBe("Højvande");
    });

    it("returns 'Middel vandstand' for values between -20 and 20", () => {
      expect(waterLevelBucket(0)).toBe("Middel vandstand");
      expect(waterLevelBucket(-20)).toBe("Middel vandstand");
      expect(waterLevelBucket(20)).toBe("Middel vandstand");
      expect(waterLevelBucket(10)).toBe("Middel vandstand");
    });
  });

  describe("seasonFromMonth", () => {
    it("returns 'Vinteren' for December, January", () => {
      expect(seasonFromMonth(11)).toBe("Vinteren"); // December
      expect(seasonFromMonth(0)).toBe("Vinteren"); // January
      expect(seasonFromMonth(1)).toBe("Vinteren"); // February is border
    });

    it("returns 'Foråret' for February-April", () => {
      expect(seasonFromMonth(2)).toBe("Foråret"); // March
      expect(seasonFromMonth(3)).toBe("Foråret"); // April
      expect(seasonFromMonth(4)).toBe("Foråret"); // May
    });

    it("returns 'Sommeren' for May-July", () => {
      expect(seasonFromMonth(5)).toBe("Sommeren"); // June
      expect(seasonFromMonth(6)).toBe("Sommeren"); // July
      expect(seasonFromMonth(7)).toBe("Sommeren"); // August
    });

    it("returns 'Efteråret' for August-October", () => {
      expect(seasonFromMonth(8)).toBe("Efteråret"); // September
      expect(seasonFromMonth(9)).toBe("Efteråret"); // October
      expect(seasonFromMonth(10)).toBe("Efteråret"); // November
    });
  });

  describe("timeOfDayBucket", () => {
    it("returns 'Natten' for late night/early morning", () => {
      expect(timeOfDayBucket(0)).toBe("Natten");
      expect(timeOfDayBucket(3)).toBe("Natten");
      expect(timeOfDayBucket(4)).toBe("Natten");
    });

    it("returns 'Morgenen' for early morning", () => {
      expect(timeOfDayBucket(5)).toBe("Morgenen");
      expect(timeOfDayBucket(7)).toBe("Morgenen");
      expect(timeOfDayBucket(8)).toBe("Morgenen");
    });

    it("returns 'Formiddagen' for late morning", () => {
      expect(timeOfDayBucket(9)).toBe("Formiddagen");
      expect(timeOfDayBucket(10)).toBe("Formiddagen");
      expect(timeOfDayBucket(11)).toBe("Formiddagen");
    });

    it("returns 'Eftermiddagen' for afternoon", () => {
      expect(timeOfDayBucket(12)).toBe("Eftermiddagen");
      expect(timeOfDayBucket(14)).toBe("Eftermiddagen");
      expect(timeOfDayBucket(16)).toBe("Eftermiddagen");
    });

    it("returns 'Aftenen' for evening", () => {
      expect(timeOfDayBucket(17)).toBe("Aftenen");
      expect(timeOfDayBucket(19)).toBe("Aftenen");
      expect(timeOfDayBucket(21)).toBe("Aftenen");
    });

    it("returns 'Natten' for late night", () => {
      expect(timeOfDayBucket(22)).toBe("Natten");
      expect(timeOfDayBucket(23)).toBe("Natten");
    });
  });

  describe("tempBucketLabel", () => {
    it("returns 'ukendt' for null/undefined/NaN", () => {
      expect(tempBucketLabel(null)).toBe("ukendt");
      expect(tempBucketLabel(undefined)).toBe("ukendt");
      expect(tempBucketLabel(NaN)).toBe("ukendt");
    });

    it("returns correct temperature ranges", () => {
      expect(tempBucketLabel(2)).toBe("0–4°C");
      expect(tempBucketLabel(6)).toBe("4–8°C");
      expect(tempBucketLabel(10)).toBe("8–12°C");
      expect(tempBucketLabel(14)).toBe("12–16°C");
      expect(tempBucketLabel(20)).toBe("16°C+");
    });

    it("handles boundary values", () => {
      expect(tempBucketLabel(0)).toBe("0–4°C");
      expect(tempBucketLabel(4)).toBe("4–8°C");
      expect(tempBucketLabel(8)).toBe("8–12°C");
      expect(tempBucketLabel(12)).toBe("12–16°C");
      expect(tempBucketLabel(16)).toBe("16°C+");
    });
  });

  describe("windSpeedBucketLabel", () => {
    it("returns 'ukendt' for null/undefined/NaN", () => {
      expect(windSpeedBucketLabel(null)).toBe("ukendt");
      expect(windSpeedBucketLabel(undefined)).toBe("ukendt");
      expect(windSpeedBucketLabel(NaN)).toBe("ukendt");
    });

    it("returns correct wind speed categories", () => {
      expect(windSpeedBucketLabel(2)).toBe("svag vind");
      expect(windSpeedBucketLabel(5)).toBe("mild vind");
      expect(windSpeedBucketLabel(10)).toBe("frisk vind");
      expect(windSpeedBucketLabel(15)).toBe("hård vind");
    });

    it("handles boundary values", () => {
      expect(windSpeedBucketLabel(0)).toBe("svag vind");
      expect(windSpeedBucketLabel(4)).toBe("mild vind");
      expect(windSpeedBucketLabel(8)).toBe("frisk vind");
      expect(windSpeedBucketLabel(12)).toBe("hård vind");
    });
  });

  describe("coastWindLabel", () => {
    it("returns null for null/undefined/empty", () => {
      expect(coastWindLabel(null)).toBeNull();
      expect(coastWindLabel(undefined)).toBeNull();
      expect(coastWindLabel("")).toBeNull();
    });

    it("detects fralandsvind", () => {
      expect(coastWindLabel("fralandsvind")).toBe("fralandsvind");
      expect(coastWindLabel("Fraland")).toBe("fralandsvind");
      expect(coastWindLabel("offshore")).toBe("fralandsvind");
    });

    it("detects pålandsvind", () => {
      expect(coastWindLabel("pålandsvind")).toBe("pålandsvind");
      expect(coastWindLabel("på-land")).toBe("pålandsvind");
      expect(coastWindLabel("onshore")).toBe("pålandsvind");
    });

    it("detects sidevind", () => {
      expect(coastWindLabel("sidevind")).toBe("sidevind");
      expect(coastWindLabel("langs kysten")).toBe("sidevind");
      expect(coastWindLabel("tvaers")).toBe("sidevind");
    });

    it("returns null for 'ukendt'", () => {
      expect(coastWindLabel("ukendt")).toBeNull();
    });

    it("returns original value for unrecognized patterns", () => {
      expect(coastWindLabel("custom")).toBe("custom");
    });
  });

  describe("windDirLabelFromDeg", () => {
    it("returns correct compass directions", () => {
      expect(windDirLabelFromDeg(0)).toBe("Nord");
      expect(windDirLabelFromDeg(45)).toBe("Nordøst");
      expect(windDirLabelFromDeg(90)).toBe("Øst");
      expect(windDirLabelFromDeg(135)).toBe("Sydøst");
      expect(windDirLabelFromDeg(180)).toBe("Syd");
      expect(windDirLabelFromDeg(225)).toBe("Sydvest");
      expect(windDirLabelFromDeg(270)).toBe("Vest");
      expect(windDirLabelFromDeg(315)).toBe("Nordvest");
    });

    it("handles values over 360", () => {
      expect(windDirLabelFromDeg(360)).toBe("Nord");
      expect(windDirLabelFromDeg(450)).toBe("Øst"); // 450 % 360 = 90
    });

    it("handles negative values", () => {
      expect(windDirLabelFromDeg(-90)).toBe("Vest"); // -90 + 360 = 270
      expect(windDirLabelFromDeg(-180)).toBe("Syd"); // -180 + 360 = 180
    });
  });

  describe("durationBucketLabel", () => {
    it("returns null for null/undefined/NaN", () => {
      expect(durationBucketLabel(null)).toBeNull();
      expect(durationBucketLabel(undefined)).toBeNull();
      expect(durationBucketLabel(NaN)).toBeNull();
    });

    it("returns correct duration categories", () => {
      expect(durationBucketLabel(3600)).toBe("<2 timer"); // 1 hour
      expect(durationBucketLabel(10800)).toBe("2-4 timer"); // 3 hours
      expect(durationBucketLabel(18000)).toBe("4-6 timer"); // 5 hours
      expect(durationBucketLabel(25200)).toBe("6+ timer"); // 7 hours
    });

    it("handles boundary values", () => {
      expect(durationBucketLabel(7199)).toBe("<2 timer"); // just under 2 hours
      expect(durationBucketLabel(7200)).toBe("2-4 timer"); // exactly 2 hours
      expect(durationBucketLabel(14400)).toBe("4-6 timer"); // exactly 4 hours
      expect(durationBucketLabel(21600)).toBe("6+ timer"); // exactly 6 hours
    });
  });

  describe("movementLabel", () => {
    it("returns null for invalid inputs", () => {
      expect(movementLabel(null, 3600)).toBeNull();
      expect(movementLabel(1000, null)).toBeNull();
      expect(movementLabel(undefined, 3600)).toBeNull();
      expect(movementLabel(1000, undefined)).toBeNull();
    });

    it("returns null for zero duration", () => {
      expect(movementLabel(1000, 0)).toBeNull();
    });

    it("returns 'Stillestående/let bevægelse' for short distances", () => {
      expect(movementLabel(100, 3600)).toBe("Stillestående/let bevægelse");
      expect(movementLabel(300, 3600)).toBe("Stillestående/let bevægelse");
    });

    it("returns 'Affiskning af vand' for long distances or high speed", () => {
      expect(movementLabel(2000, 3600)).toBe("Affiskning af vand");
      expect(movementLabel(1500, 3600)).toBe("Affiskning af vand");
    });

    it("returns 'Roligt tempo' for moderate movement", () => {
      expect(movementLabel(800, 3600)).toBe("Roligt tempo");
    });
  });

  describe("pickBestBucket", () => {
    it("returns null for empty stats", () => {
      expect(pickBestBucket({}, 3)).toBeNull();
    });

    it("returns bucket with most fish", () => {
      const stats: Record<string, SimpleBucket> = {
        "Option A": { trips: 5, fish: 10 },
        "Option B": { trips: 3, fish: 15 },
        "Option C": { trips: 4, fish: 8 },
      };
      const result = pickBestBucket(stats, 3);
      expect(result?.label).toBe("Option B");
      expect(result?.trips).toBe(3);
    });

    it("filters by minTrips when possible", () => {
      const stats: Record<string, SimpleBucket> = {
        "Option A": { trips: 2, fish: 20 }, // below minTrips
        "Option B": { trips: 5, fish: 10 },
        "Option C": { trips: 4, fish: 8 },
      };
      const result = pickBestBucket(stats, 3);
      expect(result?.label).toBe("Option B");
    });

    it("falls back to all entries if none meet minTrips", () => {
      const stats: Record<string, SimpleBucket> = {
        "Option A": { trips: 1, fish: 20 },
        "Option B": { trips: 2, fish: 10 },
      };
      const result = pickBestBucket(stats, 5);
      expect(result?.label).toBe("Option A");
    });
  });

  describe("buildBucketItems", () => {
    it("returns empty array for empty stats", () => {
      expect(buildBucketItems({}, 100, 3)).toEqual([]);
    });

    it("returns empty array when totalFish is 0", () => {
      const stats: Record<string, SimpleBucket> = {
        "Option A": { trips: 5, fish: 10 },
      };
      expect(buildBucketItems(stats, 0, 3)).toEqual([]);
    });

    it("calculates share percentages correctly", () => {
      const stats: Record<string, SimpleBucket> = {
        "Option A": { trips: 5, fish: 50 },
        "Option B": { trips: 3, fish: 30 },
        "Option C": { trips: 2, fish: 20 },
      };
      const items = buildBucketItems(stats, 100, 1);
      expect(items[0].label).toBe("Option A");
      expect(items[0].share).toBe(50);
      expect(items[1].label).toBe("Option B");
      expect(items[1].share).toBe(30);
    });

    it("sorts by fish count descending", () => {
      const stats: Record<string, SimpleBucket> = {
        "Z": { trips: 5, fish: 10 },
        "A": { trips: 3, fish: 30 },
        "M": { trips: 4, fish: 20 },
      };
      const items = buildBucketItems(stats, 60, 1);
      expect(items.map(i => i.label)).toEqual(["A", "M", "Z"]);
    });

    it("excludes 'ukendt' when other options exist", () => {
      const stats: Record<string, SimpleBucket> = {
        "ukendt": { trips: 10, fish: 50 },
        "Known": { trips: 5, fish: 30 },
      };
      const items = buildBucketItems(stats, 80, 1);
      expect(items.length).toBe(1);
      expect(items[0].label).toBe("Known");
    });

    it("respects limit parameter", () => {
      const stats: Record<string, SimpleBucket> = {
        "A": { trips: 5, fish: 10 },
        "B": { trips: 5, fish: 20 },
        "C": { trips: 5, fish: 30 },
        "D": { trips: 5, fish: 40 },
      };
      const items = buildBucketItems(stats, 100, 1, 2);
      expect(items.length).toBe(2);
      expect(items[0].label).toBe("D");
      expect(items[1].label).toBe("C");
    });
  });

  describe("buildSpotSummary", () => {
    it("returns null for empty trips", () => {
      expect(buildSpotSummary([], [])).toBeNull();
    });

    it("returns null when no trips have spot_id", () => {
      const trips = [{ fish_count: 5 }, { fish_count: 3 }];
      expect(buildSpotSummary(trips, [])).toBeNull();
    });

    it("aggregates trips by spot", () => {
      const trips = [
        { spot_id: "1", fish_count: 5 },
        { spot_id: "1", fish_count: 3 },
        { spot_id: "2", fish_count: 10 },
      ];
      const spots = [
        { id: "1", name: "Spot One" },
        { id: "2", name: "Spot Two" },
      ];
      const summary = buildSpotSummary(trips, spots);

      expect(summary).not.toBeNull();
      expect(summary?.totalSpots).toBe(2);
      expect(summary?.mostVisited.name).toBe("Spot One");
      expect(summary?.mostVisited.trips).toBe(2);
      expect(summary?.bestCatch.name).toBe("Spot Two");
      expect(summary?.bestCatch.avg).toBe(10);
    });

    it("handles spotId vs spot_id variations", () => {
      const trips = [
        { spotId: "1", fish_count: 5 },
        { spotID: "2", fish_count: 3 },
      ];
      const spots = [
        { id: "1", name: "Spot One" },
        { id: "2", name: "Spot Two" },
      ];
      const summary = buildSpotSummary(trips, spots);
      expect(summary?.totalSpots).toBe(2);
    });

    it("uses fallback name when spot not found", () => {
      const trips = [{ spot_id: "999", fish_count: 5 }];
      const summary = buildSpotSummary(trips, []);
      expect(summary?.mostVisited.name).toBe("Spot #999");
    });
  });

  describe("withTimeout", () => {
    it("resolves when promise completes before timeout", async () => {
      const promise = Promise.resolve("success");
      const result = await withTimeout(promise, 1000, "test");
      expect(result).toBe("success");
    });

    it("rejects when promise exceeds timeout", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("late"), 1000);
      });
      await expect(withTimeout(slowPromise, 50, "slowOp")).rejects.toThrow(
        "slowOp timed out"
      );
    });

    it("rejects with original error when promise fails", async () => {
      const failingPromise = Promise.reject(new Error("original error"));
      await expect(withTimeout(failingPromise, 1000, "test")).rejects.toThrow(
        "original error"
      );
    });
  });
});
