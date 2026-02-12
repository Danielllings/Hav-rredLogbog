# Sea Trout Log - App Dokumentation

## Overblik

**Sea Trout Log** er en dansk mobilapp til havørredfiskere, bygget med React Native / Expo. Appen giver fiskere mulighed for at:

- Tracke fisketure med GPS
- Logge fangster med billeder og detaljer
- Gemme yndlingsspots
- Se vejr- og havdata fra DMI automatisk koblet til ture
- Se statistik over fisketure og fangster

---

## Teknologi Stack

| Kategori | Teknologi |
|----------|-----------|
| Framework | React Native 0.81.5 + Expo ~54 |
| Navigation | Expo Router + React Navigation |
| Database | Firebase Firestore (cloud) |
| Billede storage | Firebase Storage |
| Lokal cache | AsyncStorage |
| Lokation | expo-location |
| Kort | react-native-maps |
| Grafer | react-native-svg (custom) |
| Vejrdata | DMI Open Data API (via Cloud Functions) |
| Auth | Firebase Authentication |
| Sprog | TypeScript |

---

## Projektstruktur

```
sea-trout-log/
├── app/                    # Expo Router screens
│   ├── (auth)/             # Login/signup flow
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   ├── (tabs)/             # Hovednavigation (tabs)
│   │   ├── _layout.tsx
│   │   ├── index.tsx       # GPS-tracking (hovedskærm)
│   │   ├── catches.tsx     # Fangstliste
│   │   ├── new-catch.tsx   # Ny fangst
│   │   ├── catch/[id].tsx  # Fangstdetaljer
│   │   ├── trips/[id].tsx  # Turdetaljer + vejrgraf
│   │   ├── spot-weather.tsx # Spotprognose
│   │   ├── settings.tsx    # Indstillinger
│   │   └── manual-import.tsx # Manuel import
│   └── _layout.tsx         # Root layout
├── lib/                    # Forretningslogik
│   ├── catches.ts          # Fangst CRUD
│   ├── trips.ts            # Tur CRUD + statistik
│   ├── spots.ts            # Spots CRUD
│   ├── dmi.ts              # DMI orchestration (samler climate + ocean)
│   ├── dmiClimate.ts       # DMI Climate API (luft-temp, vind)
│   ├── dmiOcean.ts         # DMI Ocean API (vandtemp, vandstand)
│   ├── dmiConfig.ts        # DMI URL-konfiguration
│   ├── firebase.ts         # Firebase init
│   ├── firestore.ts        # Firestore helpers
│   ├── db.ts               # Lokal SQLite (legacy, bruges ikke)
│   ├── offlineTrips.ts     # Offline-kø til ture
│   ├── storage.ts          # Lokal storage
│   ├── maps.ts             # Kort-helpers
│   └── i18n/               # Internationalisering
│       ├── index.ts
│       ├── translations.ts # DA/EN oversættelser
│       └── LanguageContext.tsx
├── components/             # Genanvendelige komponenter
├── assets/                 # Billeder, fonte osv.
├── functions/              # Firebase Cloud Functions (proxy)
└── app.config.ts           # Expo config (miljøvariabler)
```

---

## Hovedfunktioner

### 1. GPS-tracking af fisketure (`app/(tabs)/index.tsx`)

- **Start/stop** tur med knap
- **Baggrunds-GPS** via `expo-location` + `expo-task-manager`
- **Fiskmarkering** under turen (tryk på knap når du fanger)
- **Automatisk** kobling til nærmeste spot ved afslutning
- **DMI-evaluering** ved gem (vejr + havdata for turens periode)
- **Loading overlay** mens turen gemmes

### 2. Turdetaljer (`app/(tabs)/trips/[id].tsx`)

- Viser **varighed, distance, antal fisk**
- **Vejrgrafer** (lufttemp, vindstyrke, vandtemp, vandstand)
- Grafer viser **pile** for tur-start (grøn) og tur-slut (rød)
- Viser data fra **nærmeste DMI-station**
- Kort med GPS-track og fangstpunkter

### 3. Fangster (`app/(tabs)/catches.tsx`, `new-catch.tsx`, `catch/[id].tsx`)

- Billede (påkrævet) uploades til Firebase Storage
- Længde, vægt, agn, noter
- GPS-position
- Kobling til tur (valgfrit)

### 4. Spots (`lib/spots.ts`)

- Gem yndlingspladser med navn og GPS
- Ture kobles automatisk til nærmeste spot
- Aggregeret statistik (antal fisk pr. spot)

### 5. Spot Weather / Prognose (`app/(tabs)/spot-weather.tsx`)

- Vælg et spot og se **48-timers prognose** fra DMI EDR
- Lufttemp, vind, vandstand, bølgehøjde
- Sol op/ned tider via `suncalc`

### 6. Offline-understøttelse (`lib/offlineTrips.ts`)

- Ture gemmes lokalt hvis netværk er nede
- Automatisk sync ved app-start eller netværksgenetablering
- Retry-logik med exponential backoff
- DMI-data hentes ved sync hvis ikke tilgængelig offline

---

## DMI Integration

Appen bruger tre DMI API'er via Firebase Cloud Functions som proxy:

### Climate API (`lib/dmiClimate.ts`)
- **Data:** Lufttemperatur, vindstyrke, vindretning
- **Opløsning:** Timebaseret (fra-tidspunkt er hele timer)
- **Stationer:** 30+ danske kyststationer
- **Parameter-ID'er:** `mean_temp`, `mean_wind_speed`, `mean_wind_dir`

### Ocean API (`lib/dmiOcean.ts`)
- **Data:** Vandtemperatur, vandstand
- **Stationer:** 80+ danske havnestationer
- **Parameter-ID'er:** `tw` (temp), `sealev_dvr`, `sealev_ln` (vandstand)
- **Fallback:** Prøver nærmeste stationer indtil data findes

### EDR API (Forecast) (`lib/dmi.ts`)
- **Data:** HARMONIE vejrmodel (luft, vind), DKSS/WAM havmodel
- **Bruges til:** Spot Weather prognose
- **Cache:** 5 min TTL for gentagne opslag

### Vigtig DMI-logik

```typescript
// DMI Climate bruger hele timer - timestamps skal rundes
function floorToHour(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

// DMI har ~1-2 timers forsinkelse - start mindst 2 timer i fortiden
const twoHoursAgo = floorToHour(nowMs - 2 * 60 * 60 * 1000);
if (effectiveStartMs > twoHoursAgo) {
  effectiveStartMs = twoHoursAgo;
}
```

---

## Firebase Struktur

### Firestore Collections

```
/users/{userId}/
  ├── trips/        # Fisketure
  │   └── {tripId}
  ├── catches/      # Fangster
  │   └── {catchId}
  └── spots/        # Spots
      └── {spotId}
```

### Trip Document
```typescript
type TripRow = {
  id: string;
  userId: string;
  start_ts: string;         // ISO
  end_ts: string;           // ISO
  duration_sec: number;
  distance_m: number;
  fish_count: number;
  path_json?: string;       // GPS-punkter
  meta_json?: string;       // DMI-evaluering
  fish_events_json?: string; // Fangst-tidspunkter
  spot_id?: string;
  spot_name?: string;
  spot_lat?: number;
  spot_lng?: number;
  created_at: string;
};
```

### Storage
```
/catches/{userId}/{catchId}.jpg
```

---

## Miljøvariabler (app.config.ts → extra)

| Variabel | Beskrivelse |
|----------|-------------|
| `firebaseApiKey` | Firebase API key |
| `firebaseAuthDomain` | Firebase Auth domain |
| `firebaseProjectId` | Firebase project ID |
| `firebaseStorageBucket` | Firebase Storage bucket |
| `firebaseMessagingSenderId` | Firebase messaging sender |
| `firebaseAppId` | Firebase app ID |
| `dmiClimateUrl` | Cloud Function proxy for DMI Climate |
| `dmiOceanUrl` | Cloud Function proxy for DMI Ocean |
| `dmiEdrUrl` | Cloud Function proxy for DMI EDR |

---

## Internationalisering (i18n)

- Dansk (da) og Engelsk (en) understøttet
- Sprog vælges i indstillinger
- `useTranslation()` hook returnerer `t()` funktion
- Oversættelser i `lib/i18n/translations.ts`

---

## Kendte Udfordringer & Løsninger

### 1. DMI Climate returnerer ingen data
**Problem:** Query-timestamps matcher ikke DMI's timebaserede `from`-felt.
**Løsning:** Rund start/slut til hele timer med `floorToHour`/`ceilToHour`.

### 2. Stadig ingen data for korte ture
**Problem:** DMI har ~1-2 timers forsinkelse, så data for "nu" eksisterer ikke.
**Løsning:** Udvid query-vinduet til at starte mindst 2 timer i fortiden.

### 3. Loading spinner ikke synlig
**Problem:** Overlay var inde i ScrollView og dækkede kun scrollbart indhold.
**Løsning:** Flyt overlay udenfor ScrollView med `position: absolute` og `zIndex: 9999`.

### 4. Tur-pile vises ikke på grafer
**Problem:** Tur-tidspunkter var efter grafens data-range (ratio > 1).
**Løsning:** Clamp ratios til 0-1 for at vise pile på grafkanten.

---

## Fremtidige Forbedringer (Idéer)

- [ ] Push-notifikationer ved gode vejrforhold
- [ ] Deling af fangster på sociale medier
- [ ] Aggregeret statistik på tværs af brugere
- [ ] Månekalender integration (solunar)
- [ ] Export af data (CSV/PDF)
- [ ] Offline kort-tiles
- [ ] Widget til hjemmeskærm

---

## Udvikling

### Start udvikling
```bash
cd D:\sea-trout-log
npm install
npx expo start
```

### Build til produktion
```bash
npx expo build:android
npx expo build:ios
```

### Vigtige kommandoer
```bash
npx expo start --clear    # Ryd cache
npx expo doctor           # Tjek projektets sundhed
```

---

## Afhængigheder (Highlights)

| Pakke | Version | Formål |
|-------|---------|--------|
| expo | ~54.0.25 | Framework |
| firebase | ^12.5.0 | Backend |
| react-native-maps | 1.20.1 | Kortvisning |
| expo-location | ~19.0.7 | GPS |
| expo-sqlite | ~16.0.9 | Lokal DB (legacy) |
| react-native-svg | 15.12.1 | Grafer |
| suncalc | ^1.9.0 | Sol op/ned |
| @react-native-community/netinfo | ^11.5.2 | Netværksstatus |

---

## Kontakt & Support

For spørgsmål om appen, kontakt udvikleren.

---

*Sidst opdateret: Februar 2026*
