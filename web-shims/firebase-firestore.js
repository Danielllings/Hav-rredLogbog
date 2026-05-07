// Web shim for firebase/firestore — returns mock data on web preview.
// Prevents Firestore permission errors when no user is authenticated
// and populates screens with realistic demo data for a sea trout fishing app.

const noop = () => {};
const resolved = (val) => Promise.resolve(val);

// ---------------------------------------------------------------------------
// Mock data: realistic sea trout fishing in Denmark
// ---------------------------------------------------------------------------

const now = new Date();
const iso = (daysAgo, hour = 6, min = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

const MOCK_SPOTS = [
  {
    id: 'spot-1',
    userId: 'web-preview-user',
    name: 'Stevns Klint',
    lat: 55.2889,
    lng: 12.4461,
    notes: 'God pladsvind fra øst. Vad ud til 2. revle.',
    coastDirection: 'E',
    created_at: iso(180),
    updated_at: iso(30),
  },
  {
    id: 'spot-2',
    userId: 'web-preview-user',
    name: 'Møns Klint – Liselund',
    lat: 54.9738,
    lng: 12.5484,
    notes: 'Dybt vand tæt på kysten. Godt til forår.',
    coastDirection: 'SE',
    created_at: iso(160),
    updated_at: iso(45),
  },
  {
    id: 'spot-3',
    userId: 'web-preview-user',
    name: 'Fyns Hoved',
    lat: 55.6170,
    lng: 10.6045,
    notes: 'Strøm langs odden. Bedst ved faldende vand.',
    coastDirection: 'N',
    created_at: iso(120),
    updated_at: iso(10),
  },
  {
    id: 'spot-4',
    userId: 'web-preview-user',
    name: 'Samsø – Nordby Strand',
    lat: 55.8900,
    lng: 10.5785,
    notes: 'Fin sandbund med ålegræs. Gode havørreder om efteråret.',
    coastDirection: 'NW',
    created_at: iso(90),
    updated_at: iso(5),
  },
  {
    id: 'spot-5',
    userId: 'web-preview-user',
    name: 'Langeland – Ristinge',
    lat: 54.8412,
    lng: 10.6340,
    notes: 'Sten og tang. Watfiskeri langs revlerne.',
    coastDirection: 'W',
    created_at: iso(200),
    updated_at: iso(60),
  },
];

const MOCK_TRIPS = [
  {
    id: 'trip-1',
    userId: 'web-preview-user',
    start_ts: iso(2, 5, 30),
    end_ts: iso(2, 8, 45),
    duration_sec: 11700,
    distance_m: 3200,
    fish_count: 2,
    fish_events_json: JSON.stringify([iso(2, 6, 20), iso(2, 7, 50)]),
    path_json: null,
    meta_json: null,
    spot_id: 'spot-1',
    spot_name: 'Stevns Klint',
    spot_lat: 55.2889,
    spot_lng: 12.4461,
    created_at: iso(2, 8, 45),
  },
  {
    id: 'trip-2',
    userId: 'web-preview-user',
    start_ts: iso(5, 17, 0),
    end_ts: iso(5, 20, 30),
    duration_sec: 12600,
    distance_m: 4100,
    fish_count: 0,
    fish_events_json: null,
    path_json: null,
    meta_json: null,
    spot_id: 'spot-3',
    spot_name: 'Fyns Hoved',
    spot_lat: 55.6170,
    spot_lng: 10.6045,
    created_at: iso(5, 20, 30),
  },
  {
    id: 'trip-3',
    userId: 'web-preview-user',
    start_ts: iso(8, 6, 0),
    end_ts: iso(8, 9, 15),
    duration_sec: 11700,
    distance_m: 2800,
    fish_count: 3,
    fish_events_json: JSON.stringify([iso(8, 6, 45), iso(8, 7, 30), iso(8, 8, 50)]),
    path_json: null,
    meta_json: null,
    spot_id: 'spot-2',
    spot_name: 'Møns Klint – Liselund',
    spot_lat: 54.9738,
    spot_lng: 12.5484,
    created_at: iso(8, 9, 15),
  },
  {
    id: 'trip-4',
    userId: 'web-preview-user',
    start_ts: iso(12, 16, 30),
    end_ts: iso(12, 19, 0),
    duration_sec: 9000,
    distance_m: 1900,
    fish_count: 1,
    fish_events_json: JSON.stringify([iso(12, 18, 10)]),
    path_json: null,
    meta_json: null,
    spot_id: 'spot-5',
    spot_name: 'Langeland – Ristinge',
    spot_lat: 54.8412,
    spot_lng: 10.6340,
    created_at: iso(12, 19, 0),
  },
  {
    id: 'trip-5',
    userId: 'web-preview-user',
    start_ts: iso(18, 5, 0),
    end_ts: iso(18, 8, 0),
    duration_sec: 10800,
    distance_m: 3500,
    fish_count: 0,
    fish_events_json: null,
    path_json: null,
    meta_json: null,
    spot_id: 'spot-4',
    spot_name: 'Samsø – Nordby Strand',
    spot_lat: 55.8900,
    spot_lng: 10.5785,
    created_at: iso(18, 8, 0),
  },
  {
    id: 'trip-6',
    userId: 'web-preview-user',
    start_ts: iso(25, 6, 15),
    end_ts: iso(25, 10, 0),
    duration_sec: 13500,
    distance_m: 4800,
    fish_count: 4,
    fish_events_json: JSON.stringify([iso(25, 7, 0), iso(25, 7, 45), iso(25, 8, 30), iso(25, 9, 20)]),
    path_json: null,
    meta_json: null,
    spot_id: 'spot-1',
    spot_name: 'Stevns Klint',
    spot_lat: 55.2889,
    spot_lng: 12.4461,
    created_at: iso(25, 10, 0),
  },
  {
    id: 'trip-7',
    userId: 'web-preview-user',
    start_ts: iso(32, 17, 0),
    end_ts: iso(32, 20, 0),
    duration_sec: 10800,
    distance_m: 2600,
    fish_count: 1,
    fish_events_json: JSON.stringify([iso(32, 19, 15)]),
    path_json: null,
    meta_json: null,
    spot_id: 'spot-3',
    spot_name: 'Fyns Hoved',
    spot_lat: 55.6170,
    spot_lng: 10.6045,
    created_at: iso(32, 20, 0),
  },
];

const MOCK_CATCHES = [
  {
    id: 'catch-1',
    userId: 'web-preview-user',
    date: iso(2, 6, 20),
    time_of_day: 'morgen',
    length_cm: 52,
    weight_kg: 1.6,
    bait: 'Sølvpilen 18g',
    notes: 'Blanktfisk! Tog den på tredje kast langs revlen.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=52cm+havørred',
    lat: 55.2889,
    lng: 12.4461,
    created_at: iso(2, 6, 25),
    updated_at: iso(2, 6, 25),
    trip_id: 'trip-1',
  },
  {
    id: 'catch-2',
    userId: 'web-preview-user',
    date: iso(2, 7, 50),
    time_of_day: 'morgen',
    length_cm: 38,
    weight_kg: 0.7,
    bait: 'Sort/rød flue',
    notes: 'Undermåler – genudsat forsigtigt.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=38cm+havørred',
    lat: 55.2895,
    lng: 12.4470,
    created_at: iso(2, 7, 55),
    updated_at: iso(2, 7, 55),
    trip_id: 'trip-1',
  },
  {
    id: 'catch-3',
    userId: 'web-preview-user',
    date: iso(8, 6, 45),
    time_of_day: 'morgen',
    length_cm: 61,
    weight_kg: 2.8,
    bait: 'Pattegransen wobler',
    notes: 'Sæsonens bedste! Stærk fisk der kæmpede i 5 min.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=61cm+havørred',
    lat: 54.9738,
    lng: 12.5484,
    created_at: iso(8, 6, 50),
    updated_at: iso(8, 6, 50),
    trip_id: 'trip-3',
  },
  {
    id: 'catch-4',
    userId: 'web-preview-user',
    date: iso(8, 7, 30),
    time_of_day: 'morgen',
    length_cm: 44,
    weight_kg: 1.1,
    bait: 'Møresilda 22g',
    notes: 'Grønlænder, godt huld.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=44cm+havørred',
    lat: 54.9740,
    lng: 12.5490,
    created_at: iso(8, 7, 35),
    updated_at: iso(8, 7, 35),
    trip_id: 'trip-3',
  },
  {
    id: 'catch-5',
    userId: 'web-preview-user',
    date: iso(8, 8, 50),
    time_of_day: 'morgen',
    length_cm: 47,
    weight_kg: 1.3,
    bait: 'Sølvpilen 18g',
    notes: 'Tæt under land, overraskende hugget.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=47cm+havørred',
    lat: 54.9742,
    lng: 12.5492,
    created_at: iso(8, 8, 55),
    updated_at: iso(8, 8, 55),
    trip_id: 'trip-3',
  },
  {
    id: 'catch-6',
    userId: 'web-preview-user',
    date: iso(12, 18, 10),
    time_of_day: 'aften',
    length_cm: 55,
    weight_kg: 2.0,
    bait: 'Tobis flue',
    notes: 'Flot overspringer i solnedgangen.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=55cm+havørred',
    lat: 54.8412,
    lng: 10.6340,
    created_at: iso(12, 18, 15),
    updated_at: iso(12, 18, 15),
    trip_id: 'trip-4',
  },
  {
    id: 'catch-7',
    userId: 'web-preview-user',
    date: iso(25, 7, 0),
    time_of_day: 'morgen',
    length_cm: 42,
    weight_kg: 0.9,
    bait: 'Fiskepilen kobber 12g',
    notes: 'Lille blank havørred, frisk fra havet.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=42cm+havørred',
    lat: 55.2889,
    lng: 12.4461,
    created_at: iso(25, 7, 5),
    updated_at: iso(25, 7, 5),
    trip_id: 'trip-6',
  },
  {
    id: 'catch-8',
    userId: 'web-preview-user',
    date: iso(25, 9, 20),
    time_of_day: 'morgen',
    length_cm: 68,
    weight_kg: 3.5,
    bait: 'Snurrebassen 28g',
    notes: 'Kæmpe fisk! Personlig rekord. Taget fra 2. revle.',
    photo_uri: 'https://placehold.co/600x400/1a1a2e/f5f5f5?text=68cm+havørred',
    lat: 55.2892,
    lng: 12.4465,
    created_at: iso(25, 9, 25),
    updated_at: iso(25, 9, 25),
    trip_id: 'trip-6',
  },
];

// Map of collection name -> mock data rows
const MOCK_DATA = {
  trips: MOCK_TRIPS,
  catches: MOCK_CATCHES,
  spots: MOCK_SPOTS,
};

// ---------------------------------------------------------------------------
// Shim helpers
// ---------------------------------------------------------------------------

// Wrap a data object as a Firestore document snapshot
function makeDocSnap(data) {
  return {
    id: data.id,
    ref: { id: data.id, path: `mock/${data.id}` },
    exists: () => true,
    data: () => {
      // Return a copy without the id field (Firestore data() excludes the doc id)
      const { id, ...rest } = data;
      return rest;
    },
  };
}

// Build a query snapshot from an array of data rows
function makeQuerySnap(rows) {
  const docs = rows.map(makeDocSnap);
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb) => docs.forEach(cb),
  };
}

// Extract the collection name from a collection/query ref
function getCollectionName(ref) {
  return (ref && ref.__collectionName) || null;
}

// ---------------------------------------------------------------------------
// Exported Firestore API shims
// ---------------------------------------------------------------------------

export function collection(_db, ...pathSegments) {
  // Typical call: collection(db, "users", userId, "catches")
  // The last segment is the sub-collection name we care about.
  const collName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'unknown';
  return { id: collName, path: pathSegments.join('/'), __collectionName: collName };
}

const mockDocRef = { id: 'mock-new', path: 'mock-new' };

export function doc(collectionRef, ...pathSegments) {
  // doc(collectionRef, id) — look up a specific document
  const collName = getCollectionName(collectionRef);
  const docId = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : null;
  return { id: docId || 'mock-new', path: `${collName}/${docId}`, __collectionName: collName, __docId: docId };
}

export function getDoc(docRef) {
  const collName = getCollectionName(docRef);
  const docId = docRef && docRef.__docId;
  const rows = (collName && MOCK_DATA[collName]) || [];
  const found = docId ? rows.find((r) => r.id === docId) : null;
  if (found) {
    return resolved(makeDocSnap(found));
  }
  // Not found
  return resolved({
    exists: () => false,
    data: () => null,
    id: docId || 'mock',
    ref: docRef || mockDocRef,
  });
}

export function getDocs(queryRef) {
  const collName = getCollectionName(queryRef);
  const rows = (collName && MOCK_DATA[collName]) || [];
  return resolved(makeQuerySnap(rows));
}

export function addDoc() { return resolved(mockDocRef); }
export function updateDoc() { return resolved(); }
export function deleteDoc() { return resolved(); }
export function setDoc() { return resolved(); }

export function onSnapshot(ref, cb) {
  const collName = getCollectionName(ref);
  const rows = (collName && MOCK_DATA[collName]) || [];
  if (typeof cb === 'function') cb(makeQuerySnap(rows));
  return noop;
}

export function query(collectionRef) {
  // Preserve the collection name so getDocs can find the right mock data
  const collName = getCollectionName(collectionRef);
  return { __collectionName: collName };
}

export function where() { return {}; }
export function orderBy() { return {}; }
export function limit() { return {}; }
export function startAfter() { return {}; }
export function endBefore() { return {}; }
export function serverTimestamp() { return new Date(); }
export function Timestamp() {}
Timestamp.now = () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toDate: () => new Date() });
Timestamp.fromDate = (d) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, toDate: () => d });
export function getFirestore() { return {}; }
export function initializeFirestore() { return {}; }
export function writeBatch() { return { set: noop, update: noop, delete: noop, commit: () => resolved() }; }
export function runTransaction(db, fn) { return fn({ get: getDoc, set: noop, update: noop, delete: noop }); }
