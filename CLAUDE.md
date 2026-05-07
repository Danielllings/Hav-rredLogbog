# Havørred Logbog

> **CLAUDE:** Husk at opdatere denne fil løbende når du laver ændringer i kodebasen - nye filer, ændret struktur, nye konventioner, osv.

React Native / Expo fiskeri-app til havørredfiskere. Tracker ture med GPS, logger fangster, viser vejr/havdata fra Open-Meteo (DMI HARMONIE 2km model).

## Stack

| Kategori | Teknologi |
|----------|-----------|
| Framework | React Native 0.81.5 + Expo ~54 |
| Navigation | Expo Router + React Navigation |
| Database | Firebase Firestore |
| Storage | Firebase Storage (billeder) |
| Kort | react-native-maps |
| Animation | react-native-reanimated ~4.1.1 + react-native-worklets 0.5.1 |
| Vejr | Open-Meteo API (DMI HARMONIE model) |
| Sprog | TypeScript |

> **Note:** Reanimated 4.x KRÆVER `react-native-worklets` som peer dependency. Expo SDK 54 forventer version 0.5.1. Se overrides i package.json for semver fix.

## Projektstruktur

```
app/                    # Expo Router screens
├── (auth)/             # Login/signup
├── (tabs)/             # Hovednavigation
│   ├── index.tsx       # GPS-tracking (hovedskærm)
│   ├── catches.tsx     # Fangstliste (Galleri)
│   ├── new-catch.tsx   # Ny fangst
│   ├── catch/[id].tsx  # Fangstdetaljer / Rediger
│   ├── statistics.tsx  # Statistik (Apple Health-stil)
│   ├── trips/[id].tsx  # Turdetaljer + vejrgraf
│   ├── trip-replay/[id].tsx  # Tur-replay
│   ├── weather-alerts.tsx    # Vejr-alerts indstillinger
│   └── settings.tsx    # Indstillinger
└── _layout.tsx         # Root layout

lib/                    # Forretningslogik
├── catches.ts          # Fangst CRUD
├── trips.ts            # Tur CRUD + statistik
├── spots.ts            # Spots CRUD
├── dmi.ts              # Vejr orchestration (Open-Meteo + DMI)
├── openMeteoGrid.ts    # Open-Meteo grid fetch til overlays
├── dmiClimate.ts       # DMI Climate API (historiske observationer)
├── dmiOcean.ts         # DMI Ocean API (historiske observationer)
├── dmiGridData.ts      # DMI EDR grid data (salinitet)
├── firebase.ts         # Firebase init
├── offlineTrips.ts     # Offline-kø til ture
├── fredningsbaelter.ts # Fredningszoner GeoJSON
├── pushTokenManager.ts # FCM push token håndtering
├── weatherAlertScheduler.ts  # Lokal alert scheduling
├── catchProfileGenerator.ts  # Brugerens fangstprofil
├── forecastMatcher.ts  # Match vejr mod profil
├── records.ts          # Beregning af personlige rekorder
└── i18n/               # DA/EN oversættelser

types/                  # TypeScript types
├── catchProfile.ts     # Fangstprofil types
├── weatherAlerts.ts    # Push notification types
└── records.ts          # Personlige rekorder types

components/             # Genanvendelige komponenter
├── PersonalRecordsSection.tsx  # Rekorder i Galleri
├── catch/              # Fangst-skærme komponenter
│   ├── CatchHeroPhoto.tsx  # Hero foto med date badge
│   ├── CatchInputCard.tsx  # GlassCard input felt
│   ├── CatchStatsRow.tsx   # Bento grid for længde/vægt
│   └── index.ts            # Exports
└── statistics/         # Apple Health-stil statistik
    ├── CatchRateHero.tsx   # Animeret fangstrate ring
    ├── QuickStatsGrid.tsx  # Glassmorphism stat cards
    ├── TrendChart.tsx      # Bezier kurve graf + simpel BarChart
    ├── AdvancedBarChart.tsx # Interaktiv månedsoversigt med touch
    └── GlassCard.tsx       # Reusable blur card (iOS blur/Android solid)

shared/components/      # Kort overlays + markers
├── SpotMarker.tsx              # Spot pin med vector ikon (fish/star)
├── CurrentVelocityOverlay.tsx  # Havstrøm
├── WaveSwellOverlay.tsx        # Bølger
├── SalinityHeatmapOverlay.tsx  # Salinitet
├── WaterLevelOverlay.tsx       # Vandstand
└── WindOverlay.tsx             # Vind

constants/theme.ts      # THEME/NERO farver
constants/appleTheme.ts # APPLE Health-stil farver (statistik)
functions/              # Firebase Cloud Functions
├── src/index.ts        # DMI proxy exports
└── src/weatherAlerts.ts # Server-side push notifications
```

## Theme Farver

**THEME** (`constants/theme.ts`) - Generelt UI:
```typescript
const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  graphYellow: "#F59E0B",
  graphBlue: "#3B82F6",
  startGreen: "#22C55E",
  danger: "#FF453A",
  inputBg: "#2C2C2E",
};
```

**APPLE** (`constants/appleTheme.ts`) - Statistik/fangst-skærme (gul accent):
```typescript
const APPLE = {
  bg: "#121212",           // Mørk grå baggrund
  accent: "#F59E0B",       // Gul accent
  accentMuted: "rgba(245, 158, 11, 0.15)",
  card: "rgba(28, 28, 30, 0.6)",      // iOS blur
  cardSolid: "#1C1C1E",               // Android fallback
  // Alle ring-farver er gule toner
  ringRed: "#F59E0B",
  ringGreen: "#D97706",
  ringCyan: "#FBBF24",
};
```

## Vejr API Integration

### Open-Meteo (primær - prognoser + overlays)

Gratis, ingen API key, ~200-400ms responstid. Bruger DMI's eget HARMONIE-model (2km opløsning) via `models=dmi_seamless`.

**Spot-vejr** (`dmi.ts` → `getSpotForecastEdr()`):
- 2 parallelle requests: Weather API + Marine API (~250ms total)
- Weather: temperatur, vind, vindstød, fugtighed, tryk, skydække, nedbør, dugpunkt, sigtbarhed
- Marine: bølgehøjde, bølgeperiode, bølgeretning, vandtemperatur, vandstand, havstrøm

**Kort-overlays** (`lib/openMeteoGrid.ts`):
- Genererer 18×18 grid af punkter over danske farvande
- Kalder Open-Meteo med komma-separerede koordinater (max ~1000 punkter)
- Returnerer CoverageJSON-kompatibelt format til Leaflet-velocity
- **Havstrøm**: `fetchCurrentGrid()` → u/v komponenter fra velocity+direction
- **Bølger**: `fetchWaveGrid()` → pseudo u/v fra højde+retning
- **Vind**: `fetchWindGrid()` → u/v fra speed+direction
- **Vandstand**: `fetchWaterLevelGrid()` → heatmap punkter

**Open-Meteo endpoints:**
```
Weather: https://api.open-meteo.com/v1/forecast
Marine:  https://marine-api.open-meteo.com/v1/marine
```

**Tur-evaluering** (`dmi.ts` → `evaluateTripWithDmi()`):
- 2 parallelle Open-Meteo kald med `start_date`/`end_date` for turens tidspunkt (~250ms)
- Bruger DMI HARMONIE 2km model (via `models=dmi_seamless`) for ture <90 dage
- Bruger archive API (`archive-api.open-meteo.com`) for ture >90 dage
- Beregner Stat (avg/min/max) + tidsserier for: luft-temp, vind, vindretning, tryk, fugtighed, vandtemp, vandstand
- `computeCoastWindInfo()` beregner kyst-/vindrelation fra GPS-track (ren matematik, ingen API)

### DMI (kun brugt til)

- **Salinitet** (`SalinityHeatmapOverlay.tsx`): Direkte DMI EDR (Open-Meteo har ikke salinitet)
- **Stationsmarkører** (`spot-weather.tsx`): `OCEAN_STATIONS_DK` til kort-pins
- **dmiClimate.ts / dmiOcean.ts**: Beholdt men ikke længere kaldt af tur-evaluering

## Firebase Struktur

```
/users/{userId}/
  ├── trips/{tripId}      # Fisketure
  ├── catches/{catchId}   # Fangster
  ├── spots/{spotId}      # Spots
  ├── pushTokens/{token}  # FCM push tokens
  ├── catchProfile        # Cached fangstprofil
  └── alertHistory/       # Sendte alerts

/weatherAlertUsers/{userId}  # Aggregeret til Cloud Function queries
  ├── enabled, pushTokens, monitoredSpots
  ├── profileSummary      # Brugerens fangstmønster
  └── lastAlertSent       # Rate limiting

/catches/{userId}/{catchId}.jpg       # Fangst-billeder i Storage
/catches/{userId}/{catchId}_bait.jpg  # Agn-billeder i Storage (valgfrit)
```

## Push Notifikationer (Smart Vejr-Alerts)

**Arkitektur:**
- **Client-side backup**: `weatherAlertScheduler.ts` med `expo-background-fetch`
- **Server-side (primær)**: `functions/src/weatherAlerts.ts` kører hver 2. time
- **Push tokens**: Expo tokens i `/users/{userId}/pushTokens`

**Match-logik baseret på brugerens fangstmønster:**
- Vindstyrke (25%) - fra historiske fangster
- Vandtemperatur (30%) - estimeret fra lufttemp
- Tidevand/vandstand (20%)
- Vindretning (15%)
- Tid på dagen (10%)

**Rate limiting:** Max én alert per 12 timer per bruger.

## Personlige Rekorder

Top-sektion i Galleriet (`catches.tsx`) der viser brugerens rekorder:

| Rekord | Data | Navigation |
|--------|------|------------|
| Største fisk | `length_cm` fra catches | → `/catch/[id]` |
| Tungeste fisk | `weight_kg` fra catches | → `/catch/[id]` |
| Flest fisk på tur | `getFishEventsCount()` fra trips | → `/trips/[id]` |

**Filer:**
- `lib/records.ts` - `calculatePersonalRecords(catches, trips)`
- `types/records.ts` - TypeScript interfaces
- `components/PersonalRecordsSection.tsx` - UI med NERO tema

## Kommandoer

```bash
npm install
npx expo start           # Start udvikling
npx expo start --clear   # Ryd cache
npx expo doctor          # Tjek projekt
```

## Statistik-side

Apple Health-inspireret design med:
- **CatchRateHero**: Animeret fangstrate-ring med glow effekt
- **QuickStatsGrid**: Fangstture, nulture, timer, km, fisk/time, multi-fisk rate
- **Spot-præstation**: Bedste og værste spot baseret på fangstrate (fisk/tur)
  - Kun spots med mindst 1 tur tælles
  - Viser: spot-navn, antal fisk, antal ture, fisk per tur
  - `analyzeSpotPerformance()` i `statistics.tsx`
- **AdvancedBarChart** (`components/statistics/AdvancedBarChart.tsx`): Minimalistisk månedsoversigt
  - Horizontal scroll - viser 5 måneder ad gangen
  - Fulde månedsnavne (Januar, Februar, osv.)
  - Tryk på søjle viser tooltip med fisk/ture
  - Scroll-indikator dots i bunden
- **Fiskemønster**: Viser optimale forhold baseret på tracked ture
  - Vindretning, vandtemperatur, vandstand
  - Barometertryk (præcis hPa), luftfugtighed (%)
- **TrendChart**: Bezier kurve med gradient fill og animeret tegning

## Ny Fangst / Rediger Fangst

Modulært design med `components/catch/`:
- **CatchHeroPhoto**: Stor hero-foto med date badge og skift-knap
- **CatchInputCard**: GlassCard wrapper til input felter
- **CatchStatsRow**: Bento grid til længde/vægt med store tal

Bruges af både `new-catch.tsx` og `catch/[id].tsx` (edit mode).

## Spots & Kort-Pins

**Spot oprettelse og sync** (`spot-weather.tsx`):
- Bruger klikker på kort → modal åbnes med navn + kystretning
- `createSpot()` returnerer nyt spot med Firestore ID
- `setSpots((prev) => [created, ...prev])` opdaterer UI øjeblikkeligt (optimistic update)
- SpotMarker komponenter re-renders automatisk via `spots.map()`

**SpotMarker** (`shared/components/SpotMarker.tsx`):
- **Best spot**: Gul baggrund (#F59E0B) med star ikon
- **Normal spot**: Mørk baggrund (#1C1C1E) med fish ikon + gul border
- iOS: Custom view med bubble + arrow
- Android: Native Ionicons (undgår clipping bugs)
- Memoized med custom comparison for performance

**Best spot beregning**:
```typescript
// Kører når spots ændres
useEffect(() => {
  for (const s of spots) {
    const c = await getFishCountForSpot(s.id);
    if (c > bestCount) bestId = s.id;
  }
  setBestSpotId(bestId);
}, [spots]);
```

## Konventioner

- App-navnet er altid "Havørred Logbog" uanset sprog
- Dark theme som standard
- Grafer viser pile for tur-start (grøn) og tur-slut (rød)
- Selfmålt vandtemperatur prioriteres over DMI data
- Offline ture synkroniseres automatisk ved netværk
- GlassCard: BlurView på iOS, solid farve på Android

## EAS Build & Submit

**Kommandoer:**
```bash
# Build til App Store
eas build --platform ios --profile production --auto-submit

# Med cache clear (ved dependency problemer)
eas build --platform ios --profile production --clear-cache --auto-submit

# Submit eksisterende build
eas submit --platform ios --latest
```

**Vigtige filer:**
- `eas.json` - Build profiles, autoIncrement
- `app.config.ts` - Expo config, plugins, API keys via env vars

## Kendte Build-Problemer & Fixes

### 1. semver/functions/satisfies fejl (Metro bundler)
**Symptom:** `Unable to resolve module semver/functions/satisfies` eller `Unable to resolve module ./functions/parse from semver/index.js` under EAS Build Metro bundling.

**Årsag:** Metro bundler kan ikke resolve semver's subpath imports (`require('semver/functions/satisfies')`). At tilføje semver til dependencies virker IKKE fordi semver's egen index.js også bruger subpath imports internt.

**Fix (patch-package):** Skip version validation scripts helt:

1. Installer patch-package:
```bash
npm install --save-dev patch-package
```

2. Opret `patches/react-native-reanimated+4.1.6.patch`:
```patch
diff --git a/node_modules/react-native-reanimated/scripts/validate-react-native-version.js b/node_modules/react-native-reanimated/scripts/validate-react-native-version.js
--- a/node_modules/react-native-reanimated/scripts/validate-react-native-version.js
+++ b/node_modules/react-native-reanimated/scripts/validate-react-native-version.js
@@ -1,43 +1,4 @@
 'use strict';

-const semverSatisfies = require('semver/functions/satisfies');
-// ... al validation kode ...
-process.exit(1);
+// Skip version validation - semver doesn't work with Metro bundler
+process.exit(0);
diff --git a/node_modules/react-native-reanimated/scripts/validate-worklets-version.js b/node_modules/react-native-reanimated/scripts/validate-worklets-version.js
--- a/node_modules/react-native-reanimated/scripts/validate-worklets-version.js
+++ b/node_modules/react-native-reanimated/scripts/validate-worklets-version.js
@@ -1,63 +1,8 @@
 'use strict';

-const semverSatisfies = require('semver/functions/satisfies');
-// ... al validation kode ...
+// Skip version validation at runtime - semver doesn't work with Metro bundler
 function validateVersion(reanimatedVersion) {
-  // ... validation logic ...
+  return { ok: true };
 }

 module.exports = validateVersion;
```

3. Opret `patches/react-native-worklets+0.5.1.patch`:
```patch
diff --git a/node_modules/react-native-worklets/scripts/validate-react-native-version.js b/node_modules/react-native-worklets/scripts/validate-react-native-version.js
--- a/node_modules/react-native-worklets/scripts/validate-react-native-version.js
+++ b/node_modules/react-native-worklets/scripts/validate-react-native-version.js
@@ -1,43 +1,4 @@
 'use strict';

-const semverSatisfies = require('semver/functions/satisfies');
-// ... al validation kode ...
+// Skip version validation - semver doesn't work with Metro bundler
+process.exit(0);
```

4. Tilføj scripts til `package.json`:
```json
{
  "scripts": {
    "postinstall": "patch-package",
    "eas-build-post-install": "npx patch-package"
  }
}
```

**VIGTIGT:** `eas-build-post-install` scriptet køres automatisk af EAS Build efter npm install. Brug IKKE `postInstall` i eas.json - det er ikke længere supported.

### 2. package-lock.json out of sync
**Symptom:** `npm ci` fejler med "Missing: semver@X.X.X from lock file"

**Fix:**
```bash
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
git add package.json package-lock.json
git commit -m "Regenerate lock file"
git push
```

### 3. react-native-maps Google Maps podspec
**Symptom:** `No podspec found for react-native-google-maps`

**Fix:** Tilføj til `app.config.ts` plugins:
```typescript
plugins: [
  "expo-router",
  "expo-notifications",
  [
    "expo-build-properties",
    {
      ios: {
        useFrameworks: "static",
      },
    },
  ],
],
```

### 4. Build number already used
**Symptom:** `Build number X has already been used`

**Fix:** `eas.json` har `"autoIncrement": true` - bare rebuild.

### 5. Duplicate/malformed package.json entries
**Symptom:** `npm ci` fejler med "Missing: semver@X.X.X from lock file" selv efter regenerering

**Årsag:** Duplikerede dependencies eller forkert indrykning i package.json

**Diagnose:** Kig efter duplikerede linjer eller forkert spacing:
```json
// FORKERT - duplikat og forkert indrykning:
"semver": "^7.6.0",
    "react-native-maps": "^1.20.1",  // <-- forkert indrykning
...
"semver": "^7.7.4",  // <-- duplikat!
```

**Fix:** Fjern duplikater, ret indrykning, regenerer lock file.

### 6. Reanimated/Worklets pod install fejl
**Symptom:**
```
[Reanimated] react-native-worklets package isn't installed. Please install a version between 0.4.0 and 0.4 to use Reanimated 4.1.6.
[Reanimated] Failed to validate worklets version
[!] Invalid `RNReanimated.podspec` file
```

**Årsag:** Reanimated 4.x kræver `react-native-worklets` som peer dependency. Fejlmeddelelsen "0.4.0 and 0.4" er **forældet/buggy** - den er fra 4.0.x æraen.

**Faktisk krav for Reanimated 4.1.x:** worklets 0.5.x, 0.6.x eller 0.7.x

**Expo SDK 54 forventer:** `react-native-worklets: 0.5.1` (præcis)

**Fix:**
```bash
# Brug ALTID npx expo install for korrekte versioner
npx expo install react-native-reanimated react-native-worklets

# UNDGÅ legacy-peer-deps - det kan forårsage resolution problemer
# Fjern .npmrc hvis den indeholder legacy-peer-deps=true
```

**Vigtig note:** Valideringen sker i `node_modules/react-native-reanimated/scripts/validate-worklets-build.js`. Denne køres under pod install og fejler hvis `require('react-native-worklets/package.json')` ikke kan finde pakken.

## Sikkerhed

| Secret | Håndtering |
|--------|------------|
| Firebase keys | EAS Secrets / env vars |
| Maps API key | EAS Secrets |

**Ingen secrets må committes til git.**

## Workflows

Se [`AGENT_WORKFLOW.md`](./AGENT_WORKFLOW.md) for 3-agent workflow til feature udvikling (Planlægger → Udvikler → Reviewer).
