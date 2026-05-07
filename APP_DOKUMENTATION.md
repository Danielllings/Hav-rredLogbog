# Havørred Logbog - App Dokumentation

## Overblik

**Havørred Logbog** er en dansk mobilapp til havørredfiskere, bygget med React Native / Expo. Appen giver fiskere mulighed for at:

- Tracke fisketure med GPS
- Logge fangster med billeder og detaljer
- Gemme yndlingsspots
- Se vejr- og havdata fra Open-Meteo (DMI HARMONIE-model) automatisk koblet til ture
- Se statistik over fisketure og fangster
- Måle vandtemperatur selv under ture

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
| Vejrdata | Open-Meteo API (DMI HARMONIE-model, 2km opløsning) |
| Auth | Firebase Authentication |
| Sprog | TypeScript |

---

## Projektstruktur

```
sea-trout-log/
├── app/                    # Expo Router screens
│   ├── (auth)/             # Login/signup flow
│   │   ├── _layout.tsx
│   │   └── index.tsx       # Login med sprogvalg (DA/EN)
│   ├── (tabs)/             # Hovednavigation (tabs)
│   │   ├── _layout.tsx
│   │   ├── index.tsx       # GPS-tracking (hovedskærm)
│   │   ├── catches.tsx     # Fangstliste
│   │   ├── new-catch.tsx   # Ny fangst
│   │   ├── catch/[id].tsx  # Fangstdetaljer
│   │   ├── trips/[id].tsx  # Turdetaljer + vejrgraf
│   │   ├── trip-replay/[id].tsx # Tur-replay med animation
│   │   ├── spot-weather.tsx # Spotprognose + vejrkort
│   │   └── settings.tsx    # Indstillinger
│   └── _layout.tsx         # Root layout (auth + onboarding)
├── lib/                    # Forretningslogik
│   ├── catches.ts          # Fangst CRUD
│   ├── trips.ts            # Tur CRUD + statistik
│   ├── spots.ts            # Spots CRUD
│   ├── dmi.ts              # Vejr orchestration (Open-Meteo + DMI)
│   ├── openMeteoGrid.ts    # Open-Meteo grid fetch til overlays
│   ├── dmiOcean.ts         # DMI Ocean stationsliste (OCEAN_STATIONS_DK)
│   ├── dmiGridData.ts      # DMI EDR grid data (salinitet)
│   ├── dmiConfig.ts        # DMI URL-konfiguration (salinitet)
│   ├── firebase.ts         # Firebase init
│   ├── firestore.ts        # Firestore helpers
│   ├── db.ts               # Lokal SQLite (legacy, bruges ikke)
│   ├── offlineTrips.ts     # Offline-kø til ture
│   ├── fredningsbaelter.ts # Fredningszoner GeoJSON
│   ├── storage.ts          # Lokal storage
│   ├── maps.ts             # Kort-helpers
│   ├── theme.tsx           # Theme provider
│   └── i18n/               # Internationalisering
│       ├── index.ts
│       ├── translations.ts # DA/EN oversættelser
│       └── LanguageContext.tsx
├── components/             # Genanvendelige komponenter
│   ├── Onboarding.tsx      # Onboarding flow med privacy
│   └── SplashScreen.tsx    # Splash screen
├── shared/                 # Delte komponenter
│   └── components/
│       ├── CurrentVelocityOverlay.tsx  # Animeret havstrøm (leaflet-velocity)
│       ├── WaveSwellOverlay.tsx        # Animeret bølger (leaflet-velocity)
│       ├── SalinityHeatmapOverlay.tsx  # Salinitet heatmap (leaflet.heat)
│       ├── WaterLevelOverlay.tsx       # Vandstand heatmap (leaflet.heat)
│       ├── WindOverlay.tsx             # Vind overlay
│       ├── ForecastSlider.tsx          # Tidslinje til overlay prognose
│       ├── StatBox.tsx                 # Statistik boks
│       ├── TripCard.tsx                # Tur kort
│       └── SpotMarker.tsx              # Spot markør
├── constants/              # Konstanter
│   └── theme.ts            # THEME farver (bg, card, graphYellow, graphBlue, etc.)
├── assets/                 # Billeder, fonte osv.
├── functions/              # Firebase Cloud Functions (DMI salinitet proxy + push alerts)
└── app.config.ts           # Expo config (miljøvariabler)
```

---

## Hovedfunktioner

### 1. Onboarding (`components/Onboarding.tsx`)

Første gang appen startes vises onboarding:

- **Sprogvalg:** Dansk/English vælges først
- **Privacy policy:** Skal accepteres før brug (hardcoded DA/EN)
- **4 velkomst-slides:** Swipe navigation med dots
- **Gem completion:** AsyncStorage (`onboarding_complete_v1`)

### 2. Login (`app/(auth)/index.tsx`)

- Email/password authentication via Firebase
- **Sprogvalg** i bunden af login-kortet (Dansk/English)
- App-navnet er altid "Havørred Logbog" uanset sprog

### 3. GPS-tracking af fisketure (`app/(tabs)/index.tsx`)

- **Start/stop** tur med knap
- **Baggrunds-GPS** via `expo-location` + `expo-task-manager`
- **Fiskmarkering** under turen (tryk på knap når du fanger)
- **Selvmålt vandtemperatur:**
  - Knap under fangst-knappen: "Mål vandtemp"
  - Modal til indtastning af temperatur (°C)
  - Kan måle flere gange under turen (timestamps)
  - Viser seneste måling + antal på knappen
  - Bruges i grafer/evaluering i stedet for Open-Meteo data hvis målt
- **Automatisk** kobling til nærmeste spot ved afslutning
- **Open-Meteo-evaluering** ved gem (vejr + havdata for turens periode)
- **Loading overlay** mens turen gemmes
- **"Opret spot først" modal:** Vises hvis bruger prøver at starte tracking uden spots

### 4. Tur-replay (`app/(tabs)/trip-replay/[id].tsx`)

Animeret afspilning af gemte ture:

- **Kort med rute:** Traveled path (lys) + remaining path (faded)
- **Animeret markør:** Viser nuværende position
- **Fangst-markører:** Vises når replay passerer fangst-tidspunkt
- **Fangst-popup:** Animation når ny fangst vises
- **Playback kontroller:**
  - Play/Pause knap
  - Hastighedsvælger (1x, 2x, 4x, 8x, 16x)
  - Reset knap
- **Touch-scrubbing timeline:**
  - Træk med finger for at hoppe til vilkårligt tidspunkt
  - Scrubber handle viser nuværende position
  - Pauser automatisk under scrubbing
  - Kamera følger med

### 5. Turdetaljer (`app/(tabs)/trips/[id].tsx`)

- Viser **varighed, distance, antal fisk**
- **Vejrgrafer** (lufttemp, vindstyrke, vandtemp, vandstand)
- Grafer viser **pile** for tur-start (grøn) og tur-slut (rød)
- Viser data fra **Open-Meteo (DMI HARMONIE)** eller **selvmålt vandtemp**
- Kort med GPS-track og fangstpunkter
- Link til **Tur-replay**

### 6. Fangster (`app/(tabs)/catches.tsx`, `new-catch.tsx`, `catch/[id].tsx`)

- Billede (påkrævet) uploades til Firebase Storage
- Længde, vægt, agn, noter
- GPS-position
- Kobling til tracked tur (fremhævet gul kort-stil)

### 7. Spots (`lib/spots.ts`)

- Gem yndlingspladser med navn og GPS
- Ture kobles automatisk til nærmeste spot
- Aggregeret statistik (antal fisk pr. spot)
- Kystretning (til vind-evaluering)

### 8. Spot Weather / Prognose (`app/(tabs)/spot-weather.tsx`)

- Vælg et spot og se **48-timers prognose** fra Open-Meteo (DMI HARMONIE-model)
- Lufttemp, vind, vandstand, bølgehøjde
- Sol op/ned tider via `suncalc`
- **Kort/Satellit knapper:** Skjules når Hav & vejr overlay er aktivt

### 9. Animerede Kort Overlays (Vejrkort)

Fire interaktive overlays i Vejrkort (spot-weather), alle med **WebView + Leaflet**:

| Overlay | Visualisering | Data | Cursor |
|---------|---------------|------|--------|
| **Havstrøm** | Animerede partikler (leaflet-velocity) | u/v hastighed | Viser km/t |
| **Bølgehøjde** | Animerede partikler (leaflet-velocity) | Signifikant højde | Viser meter |
| **Salinitet** | Heatmap (leaflet.heat) | PSU saltindhold | Viser PSU + vandtype |
| **Vandstand** | Heatmap (leaflet.heat) | Sea-mean-deviation | Viser cm ± normal |
| **Vind** | Animerede partikler | Vindhastighed/retning | Viser m/s |

#### Windy-stil Lagmenu
- **Hav overlays sektion:** Tap-to-select med farvede ikoner og checkmarks
- **Ekstra lag sektion:** Spots, Fredningsbælter, DMI Stationer
- Kun ét ocean overlay aktivt ad gangen
- Mørk glasmorfisme design
- **Kort/Satellit vælger skjules** når overlay er aktivt

#### Datakilder:
| Overlay | Kilde | Endpoint / Parameter |
|---------|-------|----------------------|
| Havstrøm | Open-Meteo Marine | `ocean_current_velocity`, `ocean_current_direction` |
| Bølger | Open-Meteo Marine | `wave_height`, `wave_direction` |
| Vandstand | Open-Meteo Marine | `sea_level` heatmap punkter |
| Vind | Open-Meteo Weather | `wind_speed_10m`, `wind_direction_10m` |
| Salinitet | DMI EDR API | `dkss_idw`/`dkss_nsbs` → `salinity` (CoverageJSON) |

#### Farveskalaer (vertikal legend):
- **Havstrøm:** Blå → Cyan → Grøn → Gul → Rød (0-2+ m/s)
- **Bølger:** Blå → Cyan → Grøn → Gul → Rød (0-3+ m)
- **Salinitet:** Grøn → Gul → Orange → Rød (0-35 PSU)
- **Vandstand:** Blå → Grøn → Rød (-100 til +100 cm)

### 10. Fredningsbælter (`lib/fredningsbaelter.ts`)

- Viser **fredningszoner** på kortet med farvekodning
- **Grøn:** Ingen fredning aktiv
- **Gul:** Delvis fredning (visse arter/perioder)
- **Rød:** Fuld fredning aktiv
- Data fra bundlet GeoJSON fil

### 11. Indstillinger (`app/(tabs)/settings.tsx`)

- **Sprog:** Dansk/English
- **Tema:** Lys/Mørk (system default)
- **Konto:** Log ud
- **Version info**

### 12. Offline-understøttelse (`lib/offlineTrips.ts`)

- Ture gemmes lokalt hvis netværk er nede
- Automatisk sync ved app-start eller netværksgenetablering
- Retry-logik med exponential backoff
- Vejrdata hentes fra Open-Meteo ved sync hvis ikke tilgængelig offline
- **Selvmålte vandtemperaturer** bevares og anvendes ved sync

---

## Vejr Integration

Appen bruger **Open-Meteo** som primær vejrdatakilde (gratis, ingen API-key, ~250ms responstid). Open-Meteo leverer data fra DMI's HARMONIE-model med 2km opløsning. **DMI EDR** bruges kun til salinitet.

### Open-Meteo API (primær) (`lib/dmi.ts`, `lib/openMeteoGrid.ts`)

**Spot-vejr** (`dmi.ts` -> `getSpotForecastEdr()`):
- 2 parallelle requests: Weather API + Marine API (~250ms total)
- Weather: temperatur, vind, vindstød, fugtighed, tryk, skydække, nedbør, dugpunkt, sigtbarhed
- Marine: bølgehøjde, bølgeperiode, bølgeretning, vandtemperatur, vandstand, havstrøm

**Endpoints:**
```
Weather: https://api.open-meteo.com/v1/forecast
Marine:  https://marine-api.open-meteo.com/v1/marine
```

**Tur-evaluering** (`dmi.ts` -> `evaluateTripWithDmi()`):
- 2 parallelle Open-Meteo kald med `start_date`/`end_date` for turens tidspunkt
- Bruger DMI HARMONIE 2km model (via `models=dmi_seamless`) for ture <90 dage
- Bruger archive API (`archive-api.open-meteo.com`) for ture >90 dage
- Beregner Stat (avg/min/max) + tidsserier for: luft-temp, vind, vindretning, tryk, fugtighed, vandtemp, vandstand

**Kort-overlays** (`lib/openMeteoGrid.ts`):
- Genererer 18x18 grid af punkter over danske farvande
- Kalder Open-Meteo med komma-separerede koordinater (max ~1000 punkter)
- Returnerer CoverageJSON-kompatibelt format til Leaflet-velocity
- **Havstrom**: `fetchCurrentGrid()` -> u/v komponenter fra velocity+direction
- **Bolger**: `fetchWaveGrid()` -> pseudo u/v fra hojde+retning
- **Vind**: `fetchWindGrid()` -> u/v fra speed+direction
- **Vandstand**: `fetchWaterLevelGrid()` -> heatmap punkter

### DMI (kun salinitet + stationsmarkorer)

**Salinitet** (`lib/dmiGridData.ts` via `SalinityHeatmapOverlay.tsx`):
- Direkte DMI EDR API (Open-Meteo har ikke salinitet)
- Collections: `dkss_idw`, `dkss_nsbs`
- Format: CoverageJSON cube

**Stationsmarkorer** (`lib/dmiOcean.ts`):
- `OCEAN_STATIONS_DK` array med 80+ danske havstationer
- Bruges til kort-pins (toggle i lag-modalen under "DMI Stationer")

```typescript
export const OCEAN_STATIONS_DK: OceanStation[] = [
  { id: "31417", name: "Nakskov I", lat: 54.828, lon: 11.1363, coastal: true, hasTemp: true, hasLevel: true },
  { id: "30017", name: "Hornbaek Havn", lat: 56.0934, lon: 12.4571, coastal: true, hasTemp: true, hasLevel: true },
  // ... 80+ stationer
];
```

---

## Selvmålt Vandtemperatur

Brugeren kan måle vandtemperatur selv under tracking:

### SaveTripPayload (`lib/offlineTrips.ts`)
```typescript
type SaveTripPayload = {
  // ... andre felter
  manual_water_temps?: { ts: number; temp: number }[]; // Timestamps med målinger
};
```

### Logik
1. Bruger trykker "Mål vandtemp" under tracking
2. Indtaster temperatur i modal (valideres: -5 til 35°C)
3. Gemmes med timestamp i `manualWaterTemps` array
4. Ved tur-afslutning:
   - Hvis målinger findes -> bruges i stedet for Open-Meteo's `waterTempC`
   - `waterTempSeries` bygges fra målingerne
   - `evaluation.manualWaterTemp = true` markerer selvmålt
5. Ved offline sync → samme logik anvendes

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
  meta_json?: string;       // Vejr-evaluering fra Open-Meteo (inkl. evt. manualWaterTemp)
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

## Theme Farver (`constants/theme.ts`)

```typescript
export const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  primary: "#FFFFFF",
  startGreen: "#22C55E",
  graphYellow: "#F59E0B",
  graphBlue: "#3B82F6",
  danger: "#FF453A",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  textTertiary: "#636366",
  inputBg: "#2C2C2E",
};
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
| `dmiEdrUrl` | Cloud Function proxy for DMI EDR (kun salinitet) |
| `dmiEdrBaseUrl` | Cloud Function proxy for DMI EDR grid data (salinitet) |

---

## Internationalisering (i18n)

- Dansk (da) og Engelsk (en) understøttet
- Sprog vælges i:
  - Onboarding (første gang)
  - Login-skærm
  - Indstillinger
- `useLanguage()` hook returnerer `t()` funktion og `language`
- Oversættelser i `lib/i18n/translations.ts`
- **App-navnet er altid "Havørred Logbog"** uanset sprog

---

## Kendte Udfordringer & Løsninger

### 1. Vejrdata for korte ture
**Problem:** Meget korte ture kan have begrænset datadækning.
**Løsning:** Open-Meteo leverer timebaserede prognoser; minimum vejrdata vindue er 2 timer.

### 2. Loading spinner ikke synlig
**Problem:** Overlay var inde i ScrollView og dækkede kun scrollbart indhold.
**Løsning:** Flyt overlay udenfor ScrollView med `position: absolute` og `zIndex: 9999`.

### 3. Tur-pile vises ikke på grafer
**Problem:** Tur-tidspunkter var efter grafens data-range (ratio > 1).
**Løsning:** Clamp ratios til 0-1 for at vise pile på grafkanten.

### 4. Open-Meteo responstid
**Bemærkning:** Open-Meteo er gratis og kræver ingen API-key. Responstid er typisk ~200-400ms. Ingen Cloud Function proxy nødvendig (direkte kald fra app).

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
| react-native-maps | 1.20.1 | Kortvisning + Polygon/Overlay |
| expo-location | ~19.0.7 | GPS |
| expo-sqlite | ~16.0.9 | Lokal DB (legacy) |
| react-native-svg | 15.12.1 | Grafer |
| suncalc | ^1.9.0 | Sol op/ned |
| @react-native-community/netinfo | ^11.5.2 | Netværksstatus |
| @react-native-community/slider | ^5.1.2 | Forecast time slider |
| @turf/boolean-point-in-polygon | ^7.3.4 | Geo-beregninger |

---

## Kontakt & Support

For spørgsmål om appen, kontakt udvikleren.

---

*Sidst opdateret: 25. april 2026*
