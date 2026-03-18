# Havørred Logbog

> **CLAUDE:** Husk at opdatere denne fil løbende når du laver ændringer i kodebasen - nye filer, ændret struktur, nye konventioner, osv.

React Native / Expo fiskeri-app til havørredfiskere. Tracker ture med GPS, logger fangster, viser vejr/havdata fra DMI.

## Stack

| Kategori | Teknologi |
|----------|-----------|
| Framework | React Native 0.81.5 + Expo ~54 |
| Navigation | Expo Router + React Navigation |
| Database | Firebase Firestore |
| Storage | Firebase Storage (billeder) |
| Kort | react-native-maps |
| Animation | react-native-reanimated ~4.1.1 (worklets built-in) |
| Vejr | DMI API via Cloud Functions |
| Sprog | TypeScript |

> **Note:** `react-native-worklets` er fjernet - Reanimated 4.x har worklets built-in og standalone pakken skaber konflikter med semver resolution.

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

hooks/                  # React hooks
└── usePurchases.ts     # RevenueCat subscription hooks

lib/                    # Forretningslogik
├── purchases.ts        # RevenueCat integration
├── catches.ts          # Fangst CRUD
├── trips.ts            # Tur CRUD + statistik
├── spots.ts            # Spots CRUD
├── dmi.ts              # DMI orchestration
├── dmiClimate.ts       # DMI Climate API (luft-temp, vind)
├── dmiOcean.ts         # DMI Ocean API (vandtemp, vandstand)
├── dmiGridData.ts      # DMI EDR grid data (strøm, salinitet)
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
├── Paywall.tsx               # RevenueCat subscription paywall
├── ProFeatureGate.tsx        # Pro-feature wrapper med blur/lås
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

## DMI API Integration

Tre API'er via Cloud Functions proxy:

- **Climate** (`dmiClimate.ts`): Lufttemp, vind, barometertryk (hPa), luftfugtighed (%) - timebaseret fra 30+ kyststationer
- **Ocean** (`dmiOcean.ts`): Vandtemp, vandstand - 80+ havnestationer i `OCEAN_STATIONS_DK`
- **EDR** (`dmiGridData.ts`): Havstrøm, salinitet, bølger - grid data

**Fiskemønster-tracking** (`dmi.ts` → `DmiEvaluation`):
- Præcis barometertryk (hPa) og luftfugtighed (%) gemmes per tracked tur
- Bruges til mønsteranalyse i statistik-siden

**Vigtig logik:**
```typescript
// DMI Climate bruger hele timer - timestamps skal rundes
function floorToHour(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

// DMI har ~1-2 timers forsinkelse
const effectiveStartMs = Math.min(startMs, nowMs - 2 * 60 * 60 * 1000);
```

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

/catches/{userId}/{catchId}.jpg  # Billeder i Storage
```

## RevenueCat Subscriptions (Havørred Logbog Pro)

**Filer:**
- `lib/purchases.ts` - Core RevenueCat logic (init, purchase, restore)
- `hooks/usePurchases.ts` - React hooks (`usePurchases`, `useIsPro`)
- `components/Paywall.tsx` - Custom paywall + native paywall wrapper

**Entitlement:** `HavørredLogbog Pro`

**Produkter:**
- `havoerred_pro_monthly` - Månedligt abonnement
- `havoerred_pro_yearly` - Årligt abonnement
- `havoerred_pro_lifetime` - Livstidskøb

**Brug:**
```typescript
// Tjek Pro status (simpel)
import { useIsPro } from "../hooks/usePurchases";
const { isPro, isLoading } = useIsPro();

// Fuld subscription info
import { usePurchases } from "../hooks/usePurchases";
const { isPro, customerInfo } = usePurchases();
// customerInfo.entitlements.active["HavørredLogbog Pro"]
//   .productIdentifier - "havoerred_pro_monthly" etc.
//   .expirationDate - ISO date string (null for lifetime)
//   .willRenew - boolean

// Vis paywall
import { presentPaywall } from "../components/Paywall";
await presentPaywall();

// Eller brug custom paywall component
<Paywall onClose={() => setVisible(false)} />
```

**Subscription status visning i Settings:**
- Viser abonnementstype (Månedligt/Årligt/Livstid)
- Viser udløbs-/fornyelses-dato
- Advarsel hvis auto-fornyelse er slået fra
- Livstid viser "Ingen udløbsdato" med grønt uendeligt-ikon

**Init:** Konfigureres i `app/_layout.tsx` ved app-start, linker til Firebase user.

## Pro Feature Gating

Pro-funktioner vises med blur/lås overlay for gratis brugere:

**Låste funktioner:**
- Statistik: Spot-analyse, månedsoversigt-graf, fiskemønster
- Smart Vejr-Alerts: Hele funktionaliteten
- PDF-eksport: Statistik rapport

**Komponenter:**
```typescript
// Wrapper komponent - slører indhold og viser lås
import { ProFeatureGate } from "../components/ProFeatureGate";
<ProFeatureGate featureName="Avanceret statistik">
  <MyProContent />
</ProFeatureGate>

// Hook version - til mere kontrol
import { useProFeature } from "../components/ProFeatureGate";
const { isPro, showPaywall, PaywallModal } = useProFeature();
```

**UI:**
- Blur overlay (iOS) / semi-transparent overlay (Android)
- Lås-ikon med "Pro-funktion" tekst
- "Abonner" knap der åbner paywall
- PRO badge på låste rækker i settings

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

## Dev Mode (Test Pro uden køb)

I `hooks/usePurchases.ts`:
```typescript
// Skift false til true for at teste som Pro i Expo Go
const DEV_MODE_PRO = __DEV__ && false;
```
`__DEV__` er automatisk false i production builds.

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

### 1. semver/functions/satisfies fejl
**Symptom:** `Unable to resolve module semver/functions/satisfies`

**Årsag:** `react-native-worklets` (peer dep af reanimated) mangler semver.

**Fix:** Tilføj til `package.json`:
```json
{
  "dependencies": {
    "semver": "^7.6.0"
  },
  "overrides": {
    "react-native-worklets": {
      "semver": "^7.6.0"
    }
  }
}
```

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

## RevenueCat Setup

**API Key:** `appl_eMkcExAdXMPYVSzjgarDfZdHWNg` (iOS production)

**Dashboard setup kræver:**
1. In-App Purchase Key (P8 fil fra App Store Connect)
2. App med bundle ID `dk.havoerred.logbog`
3. Products, Entitlement, Offering konfigureret

**App Store Connect:**
- In-App Purchases skal oprettes
- Sandbox tester konto til test

## Sikkerhed

| Secret | Håndtering |
|--------|------------|
| Firebase keys | EAS Secrets / env vars |
| Maps API key | EAS Secrets |
| RevenueCat key | Hardcoded (public key, designet til client) |

**Ingen secrets må committes til git.**

## Workflows

Se [`AGENT_WORKFLOW.md`](./AGENT_WORKFLOW.md) for 3-agent workflow til feature udvikling (Planlægger → Udvikler → Reviewer).
