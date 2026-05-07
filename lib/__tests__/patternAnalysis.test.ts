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
  type TFunc,
} from "../patternAnalysis";
import { da, en } from "../i18n/translations";

// Helper: create a t() function for a given language
const makeTFunc = (translations: Record<string, string>): TFunc =>
  (key: any) => translations[key] ?? key;

const tDa = makeTFunc(da as unknown as Record<string, string>);
const tEn = makeTFunc(en as unknown as Record<string, string>);

describe("patternAnalysis", () => {
  describe("waterLevelBucket", () => {
    it("returns translated 'unknown' for null", () => {
      expect(waterLevelBucket(null, tDa)).toBe("ukendt");
      expect(waterLevelBucket(null, tEn)).toBe("unknown");
    });

    it("returns key when no t function passed", () => {
      expect(waterLevelBucket(null)).toBe("unknown");
      expect(waterLevelBucket(undefined)).toBe("unknown");
      expect(waterLevelBucket(NaN)).toBe("unknown");
    });

    it("returns translated low water for values below -20", () => {
      expect(waterLevelBucket(-25, tDa)).toBe("Lavvande");
      expect(waterLevelBucket(-100, tEn)).toBe("Low water");
    });

    it("returns translated high water for values above 20", () => {
      expect(waterLevelBucket(25, tDa)).toBe("Højvande");
      expect(waterLevelBucket(100, tEn)).toBe("High water");
    });

    it("returns translated mid water for values between -20 and 20", () => {
      expect(waterLevelBucket(0, tDa)).toBe("Middel vandstand");
      expect(waterLevelBucket(-20, tDa)).toBe("Middel vandstand");
      expect(waterLevelBucket(20, tDa)).toBe("Middel vandstand");
      expect(waterLevelBucket(10, tEn)).toBe("Medium water level");
    });
  });

  describe("seasonFromMonth", () => {
    it("returns winter for December, January", () => {
      expect(seasonFromMonth(11, tDa)).toBe("Vinteren");
      expect(seasonFromMonth(0, tDa)).toBe("Vinteren");
      expect(seasonFromMonth(1, tDa)).toBe("Vinteren");
      expect(seasonFromMonth(11, tEn)).toBe("Winter");
    });

    it("returns spring for February-April", () => {
      expect(seasonFromMonth(2, tDa)).toBe("Foråret");
      expect(seasonFromMonth(3, tDa)).toBe("Foråret");
      expect(seasonFromMonth(4, tDa)).toBe("Foråret");
      expect(seasonFromMonth(3, tEn)).toBe("Spring");
    });

    it("returns summer for May-July", () => {
      expect(seasonFromMonth(5, tDa)).toBe("Sommeren");
      expect(seasonFromMonth(6, tDa)).toBe("Sommeren");
      expect(seasonFromMonth(7, tDa)).toBe("Sommeren");
      expect(seasonFromMonth(6, tEn)).toBe("Summer");
    });

    it("returns autumn for August-October", () => {
      expect(seasonFromMonth(8, tDa)).toBe("Efteråret");
      expect(seasonFromMonth(9, tDa)).toBe("Efteråret");
      expect(seasonFromMonth(10, tDa)).toBe("Efteråret");
      expect(seasonFromMonth(9, tEn)).toBe("Autumn");
    });
  });

  describe("timeOfDayBucket", () => {
    it("returns night for late night/early morning", () => {
      expect(timeOfDayBucket(0, tDa)).toBe("Natten");
      expect(timeOfDayBucket(3, tDa)).toBe("Natten");
      expect(timeOfDayBucket(4, tDa)).toBe("Natten");
      expect(timeOfDayBucket(0, tEn)).toBe("Night");
    });

    it("returns morning for early morning", () => {
      expect(timeOfDayBucket(5, tDa)).toBe("Morgenen");
      expect(timeOfDayBucket(7, tDa)).toBe("Morgenen");
      expect(timeOfDayBucket(8, tDa)).toBe("Morgenen");
      expect(timeOfDayBucket(5, tEn)).toBe("Morning");
    });

    it("returns late morning for mid-morning", () => {
      expect(timeOfDayBucket(9, tDa)).toBe("Formiddagen");
      expect(timeOfDayBucket(10, tDa)).toBe("Formiddagen");
      expect(timeOfDayBucket(11, tDa)).toBe("Formiddagen");
      expect(timeOfDayBucket(9, tEn)).toBe("Late morning");
    });

    it("returns afternoon for afternoon", () => {
      expect(timeOfDayBucket(12, tDa)).toBe("Eftermiddagen");
      expect(timeOfDayBucket(14, tDa)).toBe("Eftermiddagen");
      expect(timeOfDayBucket(16, tDa)).toBe("Eftermiddagen");
      expect(timeOfDayBucket(12, tEn)).toBe("Afternoon");
    });

    it("returns evening for evening", () => {
      expect(timeOfDayBucket(17, tDa)).toBe("Aftenen");
      expect(timeOfDayBucket(19, tDa)).toBe("Aftenen");
      expect(timeOfDayBucket(21, tDa)).toBe("Aftenen");
      expect(timeOfDayBucket(17, tEn)).toBe("Evening");
    });

    it("returns night for late night", () => {
      expect(timeOfDayBucket(22, tDa)).toBe("Natten");
      expect(timeOfDayBucket(23, tDa)).toBe("Natten");
    });
  });

  describe("tempBucketLabel", () => {
    it("returns unknown for null/undefined/NaN", () => {
      expect(tempBucketLabel(null, tDa)).toBe("ukendt");
      expect(tempBucketLabel(undefined, tDa)).toBe("ukendt");
      expect(tempBucketLabel(NaN, tDa)).toBe("ukendt");
      expect(tempBucketLabel(null, tEn)).toBe("unknown");
    });

    it("returns correct temperature ranges", () => {
      expect(tempBucketLabel(2, tDa)).toBe("0–4°C");
      expect(tempBucketLabel(6, tDa)).toBe("4–8°C");
      expect(tempBucketLabel(10, tDa)).toBe("8–12°C");
      expect(tempBucketLabel(14, tDa)).toBe("12–16°C");
      expect(tempBucketLabel(20, tDa)).toBe("16°C+");
    });

    it("handles boundary values", () => {
      expect(tempBucketLabel(0, tDa)).toBe("0–4°C");
      expect(tempBucketLabel(4, tDa)).toBe("4–8°C");
      expect(tempBucketLabel(8, tDa)).toBe("8–12°C");
      expect(tempBucketLabel(12, tDa)).toBe("12–16°C");
      expect(tempBucketLabel(16, tDa)).toBe("16°C+");
    });
  });

  describe("windSpeedBucketLabel", () => {
    it("returns unknown for null/undefined/NaN", () => {
      expect(windSpeedBucketLabel(null, tDa)).toBe("ukendt");
      expect(windSpeedBucketLabel(undefined, tDa)).toBe("ukendt");
      expect(windSpeedBucketLabel(NaN, tDa)).toBe("ukendt");
      expect(windSpeedBucketLabel(null, tEn)).toBe("unknown");
    });

    it("returns correct wind speed categories", () => {
      expect(windSpeedBucketLabel(2, tDa)).toBe("svag vind");
      expect(windSpeedBucketLabel(5, tDa)).toBe("mild vind");
      expect(windSpeedBucketLabel(10, tDa)).toBe("frisk vind");
      expect(windSpeedBucketLabel(15, tDa)).toBe("hård vind");
      expect(windSpeedBucketLabel(2, tEn)).toBe("weak wind");
      expect(windSpeedBucketLabel(15, tEn)).toBe("hard wind");
    });

    it("handles boundary values", () => {
      expect(windSpeedBucketLabel(0, tDa)).toBe("svag vind");
      expect(windSpeedBucketLabel(4, tDa)).toBe("mild vind");
      expect(windSpeedBucketLabel(8, tDa)).toBe("frisk vind");
      expect(windSpeedBucketLabel(12, tDa)).toBe("hård vind");
    });
  });

  describe("coastWindLabel", () => {
    it("returns null for null/undefined/empty", () => {
      expect(coastWindLabel(null)).toBeNull();
      expect(coastWindLabel(undefined)).toBeNull();
      expect(coastWindLabel("")).toBeNull();
    });

    it("detects offshore wind", () => {
      expect(coastWindLabel("fralandsvind", tDa)).toBe("fralandsvind");
      expect(coastWindLabel("Fraland", tDa)).toBe("fralandsvind");
      expect(coastWindLabel("offshore", tDa)).toBe("fralandsvind");
      expect(coastWindLabel("offshore", tEn)).toBe("offshore wind");
    });

    it("detects onshore wind", () => {
      expect(coastWindLabel("pålandsvind", tDa)).toBe("pålandsvind");
      expect(coastWindLabel("på-land", tDa)).toBe("pålandsvind");
      expect(coastWindLabel("onshore", tDa)).toBe("pålandsvind");
      expect(coastWindLabel("onshore", tEn)).toBe("onshore wind");
    });

    it("detects side wind", () => {
      expect(coastWindLabel("sidevind", tDa)).toBe("sidevind");
      expect(coastWindLabel("langs kysten", tDa)).toBe("sidevind");
      expect(coastWindLabel("tvaers", tDa)).toBe("sidevind");
      expect(coastWindLabel("sidevind", tEn)).toBe("side wind");
    });

    it("returns null for 'ukendt'", () => {
      expect(coastWindLabel("ukendt")).toBeNull();
      expect(coastWindLabel("unknown")).toBeNull();
    });

    it("returns original value for unrecognized patterns", () => {
      expect(coastWindLabel("custom")).toBe("custom");
    });
  });

  describe("windDirLabelFromDeg", () => {
    it("returns correct compass directions in Danish", () => {
      expect(windDirLabelFromDeg(0, tDa)).toBe("Nord");
      expect(windDirLabelFromDeg(45, tDa)).toBe("Nordøst");
      expect(windDirLabelFromDeg(90, tDa)).toBe("Øst");
      expect(windDirLabelFromDeg(135, tDa)).toBe("Sydøst");
      expect(windDirLabelFromDeg(180, tDa)).toBe("Syd");
      expect(windDirLabelFromDeg(225, tDa)).toBe("Sydvest");
      expect(windDirLabelFromDeg(270, tDa)).toBe("Vest");
      expect(windDirLabelFromDeg(315, tDa)).toBe("Nordvest");
    });

    it("returns correct compass directions in English", () => {
      expect(windDirLabelFromDeg(0, tEn)).toBe("North");
      expect(windDirLabelFromDeg(45, tEn)).toBe("Northeast");
      expect(windDirLabelFromDeg(90, tEn)).toBe("East");
      expect(windDirLabelFromDeg(135, tEn)).toBe("Southeast");
      expect(windDirLabelFromDeg(180, tEn)).toBe("South");
      expect(windDirLabelFromDeg(225, tEn)).toBe("Southwest");
      expect(windDirLabelFromDeg(270, tEn)).toBe("West");
      expect(windDirLabelFromDeg(315, tEn)).toBe("Northwest");
    });

    it("handles values over 360", () => {
      expect(windDirLabelFromDeg(360, tDa)).toBe("Nord");
      expect(windDirLabelFromDeg(450, tDa)).toBe("Øst"); // 450 % 360 = 90
    });

    it("handles negative values", () => {
      expect(windDirLabelFromDeg(-90, tDa)).toBe("Vest"); // -90 + 360 = 270
      expect(windDirLabelFromDeg(-180, tDa)).toBe("Syd"); // -180 + 360 = 180
    });
  });

  describe("durationBucketLabel", () => {
    it("returns null for null/undefined/NaN", () => {
      expect(durationBucketLabel(null)).toBeNull();
      expect(durationBucketLabel(undefined)).toBeNull();
      expect(durationBucketLabel(NaN)).toBeNull();
    });

    it("returns correct duration categories in Danish", () => {
      expect(durationBucketLabel(3600, tDa)).toBe("<2 timer"); // 1 hour
      expect(durationBucketLabel(10800, tDa)).toBe("2-4 timer"); // 3 hours
      expect(durationBucketLabel(18000, tDa)).toBe("4-6 timer"); // 5 hours
      expect(durationBucketLabel(25200, tDa)).toBe("6+ timer"); // 7 hours
    });

    it("returns correct duration categories in English", () => {
      expect(durationBucketLabel(3600, tEn)).toBe("<2 hours"); // 1 hour
      expect(durationBucketLabel(10800, tEn)).toBe("2-4 hours"); // 3 hours
      expect(durationBucketLabel(18000, tEn)).toBe("4-6 hours"); // 5 hours
      expect(durationBucketLabel(25200, tEn)).toBe("6+ hours"); // 7 hours
    });

    it("handles boundary values", () => {
      expect(durationBucketLabel(7199, tDa)).toBe("<2 timer"); // just under 2 hours
      expect(durationBucketLabel(7200, tDa)).toBe("2-4 timer"); // exactly 2 hours
      expect(durationBucketLabel(14400, tDa)).toBe("4-6 timer"); // exactly 4 hours
      expect(durationBucketLabel(21600, tDa)).toBe("6+ timer"); // exactly 6 hours
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

    it("returns standing/light movement for short distances", () => {
      expect(movementLabel(100, 3600, tDa)).toBe("Stillestående/let bevægelse");
      expect(movementLabel(300, 3600, tDa)).toBe("Stillestående/let bevægelse");
      expect(movementLabel(100, 3600, tEn)).toBe("Standing still/light movement");
    });

    it("returns fishing the water for long distances or high speed", () => {
      expect(movementLabel(2000, 3600, tDa)).toBe("Affiskning af vand");
      expect(movementLabel(1500, 3600, tDa)).toBe("Affiskning af vand");
      expect(movementLabel(2000, 3600, tEn)).toBe("Fishing the water");
    });

    it("returns calm pace for moderate movement", () => {
      expect(movementLabel(800, 3600, tDa)).toBe("Roligt tempo");
      expect(movementLabel(800, 3600, tEn)).toBe("Calm pace");
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

    it("excludes 'ukendt' and 'unknown' when other options exist", () => {
      const stats: Record<string, SimpleBucket> = {
        "ukendt": { trips: 10, fish: 50 },
        "Known": { trips: 5, fish: 30 },
      };
      const items = buildBucketItems(stats, 80, 1);
      expect(items.length).toBe(1);
      expect(items[0].label).toBe("Known");

      const statsEn: Record<string, SimpleBucket> = {
        "unknown": { trips: 10, fish: 50 },
        "Known": { trips: 5, fish: 30 },
      };
      const itemsEn = buildBucketItems(statsEn, 80, 1);
      expect(itemsEn.length).toBe(1);
      expect(itemsEn[0].label).toBe("Known");
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
