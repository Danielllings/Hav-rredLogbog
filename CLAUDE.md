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
| Vejr | DMI API via Cloud Functions |
| Sprog | TypeScript |

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
├── PersonalRecordsSection.tsx  # Rekorder i Galleri
├── catch/              # Fangst-skærme komponenter
│   ├── CatchHeroPhoto.tsx  # Hero foto med date badge
│   ├── CatchInputCard.tsx  # GlassCard input felt
│   ├── CatchStatsRow.tsx   # Bento grid for længde/vægt
│   └── index.ts            # Exports
└── statistics/         # Apple Health-stil statistik
    ├── CatchRateHero.tsx   # Animeret fangstrate ring
    ├── QuickStatsGrid.tsx  # Glassmorphism stat cards
    ├── TrendChart.tsx      # Bezier kurve graf
    └── GlassCard.tsx       # Reusable blur card (iOS blur/Android solid)

shared/components/      # Kort overlays (WebView + Leaflet)
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
- **Fiskemønster**: Viser optimale forhold baseret på tracked ture
  - Vindretning, vandtemperatur, vandstand
  - Barometertryk (præcis hPa), luftfugtighed (%)
- **TrendChart**: Bezier kurve med gradient fill og animeret tegning
- **BarChart**: Månedlig/sæson statistik

## Ny Fangst / Rediger Fangst

Modulært design med `components/catch/`:
- **CatchHeroPhoto**: Stor hero-foto med date badge og skift-knap
- **CatchInputCard**: GlassCard wrapper til input felter
- **CatchStatsRow**: Bento grid til længde/vægt med store tal

Bruges af både `new-catch.tsx` og `catch/[id].tsx` (edit mode).

## Konventioner

- App-navnet er altid "Havørred Logbog" uanset sprog
- Dark theme som standard
- Grafer viser pile for tur-start (grøn) og tur-slut (rød)
- Selfmålt vandtemperatur prioriteres over DMI data
- Offline ture synkroniseres automatisk ved netværk
- GlassCard: BlurView på iOS, solid farve på Android

## Workflows

Se [`AGENT_WORKFLOW.md`](./AGENT_WORKFLOW.md) for 3-agent workflow til feature udvikling (Planlægger → Udvikler → Reviewer).
