/**
 * seedDemoData.ts
 *
 * Populates the demo account (demo@havorredlogbog.dk) with realistic mock data
 * for App Store screenshots.
 *
 * Setup (run from project root):
 *   npm install --save-dev ts-node firebase-admin
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./path-to-service-account.json npx ts-node scripts/seedDemoData.ts
 *
 * Or on Windows (PowerShell):
 *   $env:GOOGLE_APPLICATION_CREDENTIALS=".\path-to-service-account.json"; npx ts-node scripts/seedDemoData.ts
 *
 * Requires:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service-account JSON, OR
 *   - Running on a machine with default Firebase Admin credentials (e.g. Cloud Shell, gcloud auth)
 *   - The demo user must already exist in Firebase Auth
 */

import admin from "firebase-admin";
import { randomUUID } from "crypto";

// ---------- INIT ----------
admin.initializeApp({
  projectId: "havoerredelogbog",
});

const db = admin.firestore();

// ---------- DEMO USER ----------
const DEMO_EMAIL = "demo@havorredlogbog.dk";

async function getDemoUserId(): Promise<string> {
  const user = await admin.auth().getUserByEmail(DEMO_EMAIL);
  return user.uid;
}

// ---------- HELPERS ----------
function uuid(): string {
  return randomUUID();
}

function isoStr(d: Date): string {
  return d.toISOString();
}

function epochMs(d: Date): number {
  return d.getTime();
}

/** Generate a series of {ts, v} data points with realistic variation */
function generateSeries(
  startMs: number,
  durationHours: number,
  baseValue: number,
  amplitude: number,
  options?: { warmDuringDay?: boolean; noiseScale?: number }
): { ts: number; v: number }[] {
  const points: { ts: number; v: number }[] = [];
  const noiseScale = options?.noiseScale ?? 0.3;

  for (let h = 0; h <= durationHours; h++) {
    const ts = startMs + h * 3600000;
    const hourOfDay = new Date(ts).getHours();

    let variation = 0;
    if (options?.warmDuringDay) {
      // Simulate day warming: peak around 14:00, low around 05:00
      variation = amplitude * Math.sin(((hourOfDay - 5) / 24) * Math.PI * 2);
    } else {
      // Random walk with tendency to return to base
      variation = amplitude * Math.sin((h / durationHours) * Math.PI);
    }

    const noise = (Math.random() - 0.5) * 2 * noiseScale * amplitude;
    const v = Math.round((baseValue + variation + noise) * 10) / 10;
    points.push({ ts, v });
  }
  return points;
}

/** Generate a GPS path along the coast near a spot */
function generatePath(
  baseLat: number,
  baseLng: number,
  coastDirection: string,
  numPoints: number,
  startMs: number,
  durationMs: number
): { lat: number; lng: number; ts: number }[] {
  const path: { lat: number; lng: number; ts: number }[] = [];

  // Determine walking direction based on coast direction
  // Walk parallel to the coast
  let dLat = 0;
  let dLng = 0;
  const step = 0.0008; // roughly 50-80m per step

  switch (coastDirection) {
    case "N":
      dLng = step;
      dLat = 0;
      break; // Walk east along north coast
    case "NE":
      dLng = step * 0.7;
      dLat = -step * 0.7;
      break;
    case "E":
      dLat = -step;
      dLng = 0;
      break; // Walk south along east coast
    case "SE":
      dLat = -step * 0.7;
      dLng = -step * 0.7;
      break;
    case "S":
      dLng = -step;
      dLat = 0;
      break;
    case "SW":
      dLng = -step * 0.7;
      dLat = step * 0.7;
      break;
    case "W":
      dLat = step;
      dLng = 0;
      break;
    case "NW":
      dLat = step * 0.7;
      dLng = step * 0.7;
      break;
  }

  const timeStep = durationMs / (numPoints - 1);

  for (let i = 0; i < numPoints; i++) {
    const noise = () => (Math.random() - 0.5) * 0.0002;
    path.push({
      lat: Math.round((baseLat + dLat * i + noise()) * 100000) / 100000,
      lng: Math.round((baseLng + dLng * i + noise()) * 100000) / 100000,
      ts: Math.round(startMs + timeStep * i),
    });
  }

  return path;
}

// ---------- SPOTS DATA ----------
interface Spot {
  id: string;
  userId: string;
  name: string;
  lat: number;
  lng: number;
  coastDirection: string;
  created_at: string;
  updated_at: string;
}

function createSpots(userId: string): Spot[] {
  const now = new Date("2026-02-01T10:00:00Z");
  return [
    {
      id: uuid(),
      userId,
      name: "Stevns Klint",
      lat: 55.3015,
      lng: 12.446,
      coastDirection: "E",
      created_at: isoStr(now),
      updated_at: isoStr(now),
    },
    {
      id: uuid(),
      userId,
      name: "Moens Klint",
      lat: 54.9685,
      lng: 12.5515,
      coastDirection: "SE",
      created_at: isoStr(now),
      updated_at: isoStr(now),
    },
    {
      id: uuid(),
      userId,
      name: "Gilleleje",
      lat: 56.123,
      lng: 12.311,
      coastDirection: "N",
      created_at: isoStr(now),
      updated_at: isoStr(now),
    },
    {
      id: uuid(),
      userId,
      name: "Kerteminde",
      lat: 55.4527,
      lng: 10.662,
      coastDirection: "NE",
      created_at: isoStr(now),
      updated_at: isoStr(now),
    },
    {
      id: uuid(),
      userId,
      name: "Hornbaek",
      lat: 56.087,
      lng: 12.459,
      coastDirection: "N",
      created_at: isoStr(now),
      updated_at: isoStr(now),
    },
  ];
}

// ---------- TRIPS DATA ----------
interface TripScenario {
  spotIndex: number;
  startDate: Date;
  durationHours: number;
  distanceM: number;
  fishCount: number;
  numWaypoints: number;
  weather: {
    airTempBase: number;
    airTempAmp: number;
    windBase: number;
    windAmp: number;
    waterTempBase: number;
    waterTempAmp: number;
    waterLevelBase: number;
    waterLevelAmp: number;
    pressureBase: number;
    pressureAmp: number;
    humidityBase: number;
    humidityAmp: number;
  };
}

const tripScenarios: TripScenario[] = [
  {
    // 1. Good morning trip at Stevns, 3h, 4.2km, 3 fish
    spotIndex: 0,
    startDate: new Date("2026-03-08T06:30:00+01:00"),
    durationHours: 3,
    distanceM: 4200,
    fishCount: 3,
    numWaypoints: 15,
    weather: {
      airTempBase: 8,
      airTempAmp: 3,
      windBase: 4,
      windAmp: 2,
      waterTempBase: 5.5,
      waterTempAmp: 0.3,
      waterLevelBase: 15,
      waterLevelAmp: 8,
      pressureBase: 1018,
      pressureAmp: 2,
      humidityBase: 78,
      humidityAmp: 8,
    },
  },
  {
    // 2. Evening trip at Moens Klint, 2.5h, 3.1km, 2 fish
    spotIndex: 1,
    startDate: new Date("2026-03-15T17:00:00+01:00"),
    durationHours: 2.5,
    distanceM: 3100,
    fishCount: 2,
    numWaypoints: 12,
    weather: {
      airTempBase: 10,
      airTempAmp: 2,
      windBase: 3.5,
      windAmp: 1.5,
      waterTempBase: 6.0,
      waterTempAmp: 0.2,
      waterLevelBase: 8,
      waterLevelAmp: 5,
      pressureBase: 1015,
      pressureAmp: 1,
      humidityBase: 72,
      humidityAmp: 6,
    },
  },
  {
    // 3. Long day at Gilleleje, 5h, 7.8km, 4 fish
    spotIndex: 2,
    startDate: new Date("2026-03-22T05:45:00+01:00"),
    durationHours: 5,
    distanceM: 7800,
    fishCount: 4,
    numWaypoints: 20,
    weather: {
      airTempBase: 11,
      airTempAmp: 4,
      windBase: 5.5,
      windAmp: 2.5,
      waterTempBase: 6.5,
      waterTempAmp: 0.4,
      waterLevelBase: 20,
      waterLevelAmp: 12,
      pressureBase: 1010,
      pressureAmp: 3,
      humidityBase: 68,
      humidityAmp: 10,
    },
  },
  {
    // 4. Short blank trip at Kerteminde, 1.5h, 2.0km, 0 fish
    spotIndex: 3,
    startDate: new Date("2026-03-29T14:00:00+01:00"),
    durationHours: 1.5,
    distanceM: 2000,
    fishCount: 0,
    numWaypoints: 10,
    weather: {
      airTempBase: 13,
      airTempAmp: 2,
      windBase: 8,
      windAmp: 3,
      waterTempBase: 7.0,
      waterTempAmp: 0.2,
      waterLevelBase: -3,
      waterLevelAmp: 4,
      pressureBase: 1005,
      pressureAmp: 2,
      humidityBase: 82,
      humidityAmp: 5,
    },
  },
  {
    // 5. Sunset trip at Hornbaek, 3h, 3.5km, 1 fish
    spotIndex: 4,
    startDate: new Date("2026-04-05T18:30:00+02:00"),
    durationHours: 3,
    distanceM: 3500,
    fishCount: 1,
    numWaypoints: 14,
    weather: {
      airTempBase: 12,
      airTempAmp: 3,
      windBase: 4.5,
      windAmp: 2,
      waterTempBase: 7.5,
      waterTempAmp: 0.3,
      waterLevelBase: 10,
      waterLevelAmp: 6,
      pressureBase: 1020,
      pressureAmp: 1,
      humidityBase: 70,
      humidityAmp: 7,
    },
  },
  {
    // 6. Spring trip at Stevns, 4h, 5.2km, 2 fish
    spotIndex: 0,
    startDate: new Date("2026-04-12T07:00:00+02:00"),
    durationHours: 4,
    distanceM: 5200,
    fishCount: 2,
    numWaypoints: 16,
    weather: {
      airTempBase: 14,
      airTempAmp: 4,
      windBase: 3,
      windAmp: 1.5,
      waterTempBase: 8.5,
      waterTempAmp: 0.4,
      waterLevelBase: 18,
      waterLevelAmp: 7,
      pressureBase: 1022,
      pressureAmp: 2,
      humidityBase: 65,
      humidityAmp: 8,
    },
  },
  {
    // 7. Windy trip at Moens Klint, 2h, 2.8km, 0 fish
    spotIndex: 1,
    startDate: new Date("2026-04-18T10:00:00+02:00"),
    durationHours: 2,
    distanceM: 2800,
    fishCount: 0,
    numWaypoints: 11,
    weather: {
      airTempBase: 9,
      airTempAmp: 2,
      windBase: 12,
      windAmp: 4,
      waterTempBase: 7.8,
      waterTempAmp: 0.2,
      waterLevelBase: 30,
      waterLevelAmp: 10,
      pressureBase: 998,
      pressureAmp: 4,
      humidityBase: 85,
      humidityAmp: 5,
    },
  },
  {
    // 8. Great day at Gilleleje (blank but long), 6h, 9.1km, 0 fish
    spotIndex: 2,
    startDate: new Date("2026-04-24T06:00:00+02:00"),
    durationHours: 6,
    distanceM: 9100,
    fishCount: 0,
    numWaypoints: 20,
    weather: {
      airTempBase: 15,
      airTempAmp: 5,
      windBase: 6,
      windAmp: 2.5,
      waterTempBase: 9.0,
      waterTempAmp: 0.5,
      waterLevelBase: 5,
      waterLevelAmp: 8,
      pressureBase: 1013,
      pressureAmp: 2,
      humidityBase: 60,
      humidityAmp: 10,
    },
  },
];

interface TripData {
  id: string;
  userId: string;
  start_ts: string;
  end_ts: string;
  duration_sec: number;
  distance_m: number;
  fish_count: number;
  path_json: string;
  meta_json: string;
  fish_events_json: string;
  spot_id: string;
  spot_name: string;
  spot_lat: number;
  spot_lng: number;
  created_at: string;
}

function createTrips(userId: string, spots: Spot[]): TripData[] {
  return tripScenarios.map((scenario) => {
    const spot = spots[scenario.spotIndex];
    const startMs = epochMs(scenario.startDate);
    const durationMs = scenario.durationHours * 3600000;
    const endDate = new Date(startMs + durationMs);

    // Generate GPS path
    const path = generatePath(
      spot.lat,
      spot.lng,
      spot.coastDirection,
      scenario.numWaypoints,
      startMs,
      durationMs
    );

    // Generate weather series
    const w = scenario.weather;
    const airTempSeries = generateSeries(startMs, scenario.durationHours, w.airTempBase, w.airTempAmp, { warmDuringDay: true });
    const windSpeedSeries = generateSeries(startMs, scenario.durationHours, w.windBase, w.windAmp, { noiseScale: 0.5 });
    const waterTempSeries = generateSeries(startMs, scenario.durationHours, w.waterTempBase, w.waterTempAmp);
    const waterLevelSeries = generateSeries(startMs, scenario.durationHours, w.waterLevelBase, w.waterLevelAmp, { noiseScale: 0.4 });
    const pressureSeries = generateSeries(startMs, scenario.durationHours, w.pressureBase, w.pressureAmp, { noiseScale: 0.2 });
    const humiditySeries = generateSeries(startMs, scenario.durationHours, w.humidityBase, w.humidityAmp, { noiseScale: 0.4 });

    // Compute avg/min/max from series
    const stats = (series: { ts: number; v: number }[]) => {
      const values = series.map((p) => p.v);
      return {
        avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    };

    const meta = {
      evaluation: {
        source: "DMI",
        airTempC: stats(airTempSeries),
        windMS: stats(windSpeedSeries),
        waterTempC: stats(waterTempSeries),
        waterLevelCM: stats(waterLevelSeries),
        pressureHPa: stats(pressureSeries),
        humidityPct: stats(humiditySeries),
        airTempSeries,
        windSpeedSeries,
        waterTempSeries,
        waterLevelSeries,
        pressureSeries,
        humiditySeries,
      },
    };

    // Generate fish event timestamps (evenly distributed during the trip)
    const fishEvents: string[] = [];
    if (scenario.fishCount > 0) {
      for (let i = 0; i < scenario.fishCount; i++) {
        const offset = ((i + 1) / (scenario.fishCount + 1)) * durationMs;
        const jitter = (Math.random() - 0.5) * durationMs * 0.1;
        fishEvents.push(new Date(startMs + offset + jitter).toISOString());
      }
    }

    return {
      id: uuid(),
      userId,
      start_ts: isoStr(scenario.startDate),
      end_ts: isoStr(endDate),
      duration_sec: Math.round(durationMs / 1000),
      distance_m: scenario.distanceM,
      fish_count: scenario.fishCount,
      path_json: JSON.stringify(path),
      meta_json: JSON.stringify(meta),
      fish_events_json: JSON.stringify(fishEvents),
      spot_id: spot.id,
      spot_name: spot.name,
      spot_lat: spot.lat,
      spot_lng: spot.lng,
      created_at: isoStr(scenario.startDate),
    };
  });
}

// ---------- CATCHES DATA ----------
interface CatchData {
  id: string;
  userId: string;
  date: string;
  length_cm: number;
  weight_kg: number;
  bait: string;
  notes: string;
  photo_uri: string;
  lat: number;
  lng: number;
  trip_id: string;
  created_at: string;
  updated_at: string;
}

interface CatchTemplate {
  tripIndex: number;
  lengthCm: number;
  weightKg: number;
  bait: string;
  notes: string;
}

const catchTemplates: CatchTemplate[] = [
  // Trip 1 (Stevns, 3 fish)
  { tripIndex: 0, lengthCm: 48, weightKg: 1.4, bait: "Kystflue", notes: "Flot blank fisk taget i solopgangen" },
  { tripIndex: 0, lengthCm: 52, weightKg: 1.8, bait: "Spinner", notes: "Tog den taet pa bunden ved revet" },
  { tripIndex: 0, lengthCm: 38, weightKg: 0.7, bait: "Kystflue", notes: "Lille groenlaender, genudsat" },
  // Trip 2 (Moens Klint, 2 fish)
  { tripIndex: 1, lengthCm: 61, weightKg: 3.2, bait: "Blink", notes: "Kaempe fisk! Tog 10 min at lande" },
  { tripIndex: 1, lengthCm: 44, weightKg: 1.1, bait: "Wobler", notes: "Aktiv fisk i skumringen" },
  // Trip 3 (Gilleleje, 4 fish)
  { tripIndex: 2, lengthCm: 55, weightKg: 2.1, bait: "Flue", notes: "Fin overspringer taget pa tyndere forfang" },
  { tripIndex: 2, lengthCm: 42, weightKg: 0.9, bait: "Spinner", notes: "Hurtig fisk ved stenene" },
  { tripIndex: 2, lengthCm: 67, weightKg: 3.8, bait: "Kystflue", notes: "Saesonfisk! Solvblank og fed" },
  { tripIndex: 2, lengthCm: 45, weightKg: 1.2, bait: "Blink", notes: "Sidste fisk for dagen" },
  // Trip 5 (Hornbaek, 1 fish)
  { tripIndex: 4, lengthCm: 72, weightKg: 4.5, bait: "Wobler", notes: "Absolut monster! Personal record" },
  // Trip 6 (Stevns, 2 fish)
  { tripIndex: 5, lengthCm: 50, weightKg: 1.6, bait: "Flue", notes: "Smuk foraarsfisk med havlus" },
  { tripIndex: 5, lengthCm: 35, weightKg: 0.5, bait: "Spinner", notes: "Lille skolefisk, forsigtig bid" },
];

function createCatches(userId: string, trips: TripData[]): CatchData[] {
  return catchTemplates.map((template) => {
    const trip = trips[template.tripIndex];
    const tripStart = new Date(trip.start_ts).getTime();
    const tripDuration = trip.duration_sec * 1000;

    // Place catch at random point during trip
    const catchTime = new Date(tripStart + Math.random() * tripDuration * 0.8 + tripDuration * 0.1);

    // Place catch near the trip's spot with small offset
    const latOffset = (Math.random() - 0.5) * 0.005;
    const lngOffset = (Math.random() - 0.5) * 0.005;

    return {
      id: uuid(),
      userId,
      date: isoStr(catchTime),
      length_cm: template.lengthCm,
      weight_kg: template.weightKg,
      bait: template.bait,
      notes: template.notes,
      photo_uri: "",
      lat: Math.round((trip.spot_lat + latOffset) * 100000) / 100000,
      lng: Math.round((trip.spot_lng + lngOffset) * 100000) / 100000,
      trip_id: trip.id,
      created_at: isoStr(catchTime),
      updated_at: isoStr(catchTime),
    };
  });
}

// ---------- MAIN ----------
async function main() {
  console.log("Seeding demo data for App Store screenshots...\n");

  // Get demo user ID
  let userId: string;
  try {
    userId = await getDemoUserId();
    console.log(`Found demo user: ${userId}`);
  } catch (err) {
    console.error(`Could not find demo user (${DEMO_EMAIL}). Make sure the user exists in Firebase Auth.`);
    console.error(err);
    process.exit(1);
  }

  // Create data
  const spots = createSpots(userId);
  const trips = createTrips(userId, spots);
  const catches = createCatches(userId, trips);

  console.log(`\nPrepared: ${spots.length} spots, ${trips.length} trips, ${catches.length} catches`);

  // Delete existing demo data
  console.log("\nClearing existing demo data...");
  const userDocRef = db.collection("users").doc(userId);

  const collections = ["spots", "trips", "catches"];
  for (const collName of collections) {
    const snapshot = await userDocRef.collection(collName).get();
    if (snapshot.size > 0) {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      console.log(`  Deleted ${snapshot.size} existing ${collName}`);
    }
  }

  // Write spots
  console.log("\nWriting spots...");
  for (const spot of spots) {
    await userDocRef.collection("spots").doc(spot.id).set(spot);
    console.log(`  + ${spot.name}`);
  }

  // Write trips
  console.log("\nWriting trips...");
  for (const trip of trips) {
    await userDocRef.collection("trips").doc(trip.id).set(trip);
    const fishLabel = trip.fish_count === 0 ? "blank" : `${trip.fish_count} fisk`;
    console.log(`  + ${trip.spot_name} (${trip.start_ts.slice(0, 10)}) - ${fishLabel}`);
  }

  // Write catches
  console.log("\nWriting catches...");
  for (const c of catches) {
    await userDocRef.collection("catches").doc(c.id).set(c);
    console.log(`  + ${c.length_cm}cm ${c.weight_kg}kg (${c.bait})`);
  }

  console.log("\nDone! Demo data seeded successfully.");
  console.log(`\nSummary:`);
  console.log(`  Spots:   ${spots.length}`);
  console.log(`  Trips:   ${trips.length}`);
  console.log(`  Catches: ${catches.length}`);
  console.log(`  Total fish across trips: ${trips.reduce((s, t) => s + t.fish_count, 0)}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
