# Havørred Logbog - Claude Context Cache

Sidst opdateret: 2026-02-09 (Session 2)

## App Oversigt

React Native/Expo fiskeri-app til at logge havørred-fangster med vejrdata fra DMI.

## Teknologi Stack

- **Framework**: React Native med Expo (expo-router)
- **Database**: Firebase (Firestore)
- **Storage**: Firebase Storage (billeder)
- **Kort**: react-native-maps med Google Maps + SDFI ortofoto tiles
- **Vejr API**: DMI (via Firebase Cloud Functions proxy)
- **Grafer**: react-native-svg

## Mappestruktur

```
D:\sea-trout-log\
├── app/
│   ├── (auth)/
│   │   └── index.tsx              # Login skærm (OPDATERET - ny UI)
│   ├── (tabs)/                    # Tab-baseret navigation
│   │   ├── _layout.tsx            # Tab bar layout + navigation ikoner
│   │   ├── index.tsx              # Fisketur (track) skærm - start/stop tur
│   │   ├── new-catch.tsx          # Ny fangst formular
│   │   ├── catches.tsx            # Galleri med alle fangster
│   │   ├── spot-weather.tsx       # Spot-vejr kort med DMI data
│   │   ├── settings.tsx           # Indstillinger (NY: sprogvalg)
│   │   ├── manual-import.tsx      # Manuel import
│   │   ├── catch/
│   │   │   └── [id].tsx           # Fangst detalje
│   │   └── trips/
│   │       └── [id].tsx           # Tur detalje
│   └── _layout.tsx                # Root layout (NY: network listener, i18n)
├── components/
│   └── SplashScreen.tsx           # NY: Animeret splash screen
├── lib/
│   ├── i18n/                      # NY: Internationalisering
│   │   ├── index.ts               # Exports
│   │   ├── translations.ts        # DA/EN oversættelser
│   │   └── LanguageContext.tsx    # React context for sprog
│   ├── catches.ts                 # CRUD for fangster
│   ├── trips.ts                   # CRUD for ture
│   ├── spots.ts                   # CRUD for spots
│   ├── storage.ts                 # Firebase Storage helpers
│   ├── dmi.ts                     # DMI API integration
│   ├── offlineTrips.ts            # OPDATERET: Forbedret offline sync
│   └── maps.ts                    # Kort konstanter
├── functions/
│   └── src/
│       └── index.ts               # Firebase Cloud Functions (DMI proxy)
└── assets/                        # Billeder, fonts
```

## Tema/Farver (Dark Mode)

```typescript
const THEME = {
  bg: "#121212",           // Baggrund
  card: "#1C1C1E",         // Kort baggrund
  cardBorder: "#2C2C2E",   // Kort kant
  text: "#FFFFFF",         // Primær tekst
  textSec: "#A1A1AA",      // Sekundær tekst
  graphYellow: "#F59E0B",  // Accent farve (gul)
  startGreen: "#22C55E",   // Grøn (start, success)
  danger: "#FF453A",       // Rød (slet, fejl)
  inputBg: "#2C2C2E",      // Input baggrund
  border: "#333333",       // Generel kant
};
```

## Seneste Ændringer (Session 2026-02-09 #2)

### 1. Animeret Splash Screen
Ny `components/SplashScreen.tsx`:
- Animeret logo med fiske-ikon
- Pulserende loading dots
- Wave animation i baggrunden
- Smooth fade-in af titel og undertitel
- Bruger i18n for tekster

### 2. Internationalisering (i18n)
Nyt `lib/i18n/` modul:
- Dansk (da) og Engelsk (en) oversættelser
- `LanguageProvider` context wrapper
- `useLanguage()` hook: `{ language, setLanguage, t }`
- `useTranslation()` hook for kun `t()` funktion
- Sprogvalg gemmes i AsyncStorage

### 3. Sprogvælger i Settings
Tilføjet i `settings.tsx`:
- Sprogsektion med flag-ikon (🇩🇰/🇬🇧)
- Modal med sprogoversigt
- Checkmark på valgt sprog

### 4. Forbedret Offline DMI Sync
Opdateret `lib/offlineTrips.ts`:
- Retry-logik med eksponentiel backoff
- Network state listener via @react-native-community/netinfo
- Synkroniserer automatisk når netværk genetableres
- Synkroniserer når app vender tilbage fra baggrund
- Max 5 forsøg før fallback til gem uden vejr
- Bedre logging for debugging

### 5. Login UI Makeover
Opdateret `(auth)/index.tsx`:
- Animeret logo med fiske-ikon
- Wave animation baggrund
- Ionicons for alle ikoner
- Proper checkmark i stedet for X
- Eye toggle for password visibility
- Error box styling
- Accent farve integration
- Bruger i18n for alle tekster

---

## Tidligere Ændringer (Session 2026-02-09 #1)

### 1. catches/[id].tsx - Komplet UI Makeover
Opdateret til at matche trips/[id].tsx styling:

- **Card Header**: Dato formateret som "mandag 3. februar 2025" + lokation badge
- **Info Grid**: 3-kolonner centreret (Mål, Vægt, Tid) med store tal
- **Detail Section**: Agn/Flue og registreringsdato med ikoner
- **StatGraph**: Moderne sparkline med touch-interaktion
  - Bezier kurver (Catmull-Rom)
  - Gradient fill
  - Touch for at se værdier på tidspunkter
- **Source Section**: Ren visning af DMI datakilder
- **Action Buttons**: Konsistent styling med trips

### 2. spot-weather.tsx - Komplet UI Makeover
- Layer modal, search modal, add spot modal
- Permission modal, spot detail sheet
- Rename modal, delete spot modal
- Location action card, weather bottom sheet
- Sunrise/sunset ikoner med sol, pil og horisont

### 3. _layout.tsx - Navigation Ikoner
- Fisketur: compass/compass-outline
- Midterknap: fish (gul)
- Galleri: image-multiple/image-multiple-outline
- Header: settings cog + weather icon med baggrunde

### 4. index.tsx - Afslut Tur Modal
- Redesignet timeline editor
- Moderne header med ikon og tæller
- Tidsvælger med touch-slider
- Action buttons (tilføj/slet fangst)

### 5. DMI API Fixes
- Fjernet `cloud-cover` parameter (ugyldig for harmonie_dini_sf)
- Opdateret Accept header i Cloud Functions til CoverageJSON
- GeoJSON fallback parsing

## Vigtige Komponenter

### StatGraph (catches/[id].tsx & trips/[id].tsx)
Interaktiv graf med touch:
```typescript
function StatGraph({ series, label, unit }: {
  series: Serie[];  // { ts: number; v: number }[]
  label: string;
  unit: string;
})
```

### Info Component
```typescript
function Info({ label, value, highlight }: {
  label: string;
  value: string;
  highlight?: boolean;  // Gul farve hvis true
})
```

### StatLine Component
Viser min/avg/max med optional vindretning:
```typescript
function StatLine({
  label, stat, fmt, direction
}: {
  label: string;
  stat: { avg: number; min: number; max: number };
  fmt: (v: number) => string;
  direction?: number;  // Viser kompas hvis angivet
})
```

## Firebase Cloud Functions

Deployed til: `us-central1`

- `dmiProxy`: Proxy til DMI API (Climate, EDR, Ocean)
  - Håndterer CORS
  - Sender korrekte Accept headers

## DMI API Endpoints

Via Cloud Function proxy:
- **Climate**: Vejrstationer (temperatur, vind)
- **EDR (harmonie_dini_sf)**: Prognoser (temperature-2m, wind-speed, wind-dir)
- **Ocean**: Havdata (vandstand, bølger, vandtemperatur)

## Kommandoer

```bash
# Start udvikling
cd D:\sea-trout-log
npx expo start --clear

# Deploy Cloud Functions
cd functions
npm run deploy

# Build
npx expo build:android
npx expo build:ios
```

## Næste Skridt / TODO

- [x] Animeret splash screen
- [x] Internationalisering (Dansk/Engelsk)
- [x] Sprogvælger i Settings med flag
- [x] Fix offline DMI fallback
- [x] Login UI makeover
- [ ] Oversæt flere skærme til at bruge i18n
- [ ] Test offline sync på device med dårlig forbindelse
- [ ] Performance optimering af grafer ved mange datapunkter

## Kontekst Tips

- Brug `trips/[id].tsx` som reference for styling
- Alle modals bruger samme dark theme styling
- Grafer bruger `react-native-svg` med LinearGradient
- Kort bruger SDFI ortofoto tiles + Google Maps som fallback
