# Havørred Logbog

En React Native/Expo app til at logge havørredfiskeri med GPS-tracking, vejrdata og fangststatistik.

## Features

- **GPS Tracking**: Optager din fisketur med høj præcision (20m afstand, 5s interval, 30m accuracy filter)
- **Vejrdata fra Open-Meteo**: Automatisk hentning af temperatur, vind, havtemperatur og vandstand (DMI HARMONIE-model, 2km opløsning)
- **Offline Support**: Ture gemmes lokalt og synkroniseres når der er forbindelse
- **Spot Management**: Gem og administrer dine favoritfiskepladser
- **Fangstregistrering**: Log dine fangster med billeder og detaljer
- **Flersproget**: Dansk og engelsk understøttet (i18n)
- **Kystretning**: Beregn om vinden er på-/fralands-/sidevind baseret på kystens retning
- **Fiskemønster-analyse**: Se under hvilke forhold du fanger flest fisk
- **Trip Replay**: Animeret afspilning af fisketure med GPS-rute og fangster
- **DMI Stationer**: Vis havstationer med vandtemperatur og vandstand på kortet
- **PDF-rapporter**: Eksporter statistik som blækvenlig PDF (oversat til DA/EN)
- **Smart Weather Alerts**: Få besked når vejret matcher dit fiskemønster

## Tech Stack

- **Framework**: React Native med Expo Router
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Maps**: Google Maps (react-native-maps)
- **Location**: expo-location med baggrundstracking
- **Vejr API**: Open-Meteo API (DMI HARMONIE-model) + DMI EDR (kun salinitet)

## Installation

```bash
npm install
```

## Udvikling

```bash
npx expo start
```

## Build

```bash
# Build til begge platforme
eas build --platform all --profile production

# Kun Android
eas build --platform android --profile production

# Kun iOS
eas build --platform ios --profile production
```

## Miljøvariabler

Opret `.env` fil med:

```
# Firebase
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID_IOS=1:xxx:ios:xxx      # iOS-specifik App ID
FIREBASE_APP_ID_ANDROID=1:xxx:android:xxx  # Android-specifik App ID

# Google Maps
MAPS_API_KEY=...

# DMI Backend URLs (kun brugt til salinitet via Cloud Functions)
DMI_EDR_URL=...
STAC_URL=...
```

### EAS Secrets (til production builds)

```bash
# Firebase
eas secret:create --scope project --name FIREBASE_API_KEY --value "..."
eas secret:create --scope project --name FIREBASE_AUTH_DOMAIN --value "..."
eas secret:create --scope project --name FIREBASE_PROJECT_ID --value "..."
eas secret:create --scope project --name FIREBASE_STORAGE_BUCKET --value "..."
eas secret:create --scope project --name FIREBASE_MESSAGING_SENDER_ID --value "..."
eas secret:create --scope project --name FIREBASE_APP_ID_IOS --value "1:xxx:ios:xxx"
eas secret:create --scope project --name FIREBASE_APP_ID_ANDROID --value "1:xxx:android:xxx"

# Google Maps
eas secret:create --scope project --name MAPS_API_KEY --value "..."

# DMI URLs (kun brugt til salinitet)
eas secret:create --scope project --name DMI_EDR_URL --value "..."
eas secret:create --scope project --name STAC_URL --value "..."

# Google Services filer (base64 encoded)
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
eas secret:create --scope project --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist
```

---

## Udviklingslog

### 2026-02-21 - DMI Stationer, Fiskemønster-forbedringer & Spot-redigering

**Nye features:**
- **DMI Ocean Stationer**: Vis ~80+ DMI havstationer på kortet (vandtemp + vandstand)
  - Blå markører med samme stil som spots (iOS custom, Android native)
  - Toggle i lag-modalen under "DMI Stationer"
  - Ny komponent: `shared/components/DmiStationMarker.tsx`

- **Trip Replay**: Animeret afspilning af fisketure på kortet
  - GPS-rute afspilles over tid med catch-events
  - Playback controls: play/pause, hastighed (1x-16x), progress bar
  - Kamera follow-mode
  - Ny side: `app/(tabs)/trip-replay/[id].tsx`

**Fiskemønster-analyse forbedringer:**
- **Sol-tidspunkt afrunding**: Nu rundes til 30-min intervaller eller timer
  - < 45 min → nærmeste 30 min (0, 30)
  - 45-89 min → "1 time"
  - 90+ min → hele timer
  - 0 min → "ved solopgang/solnedgang"

- **Vindretning ift. kyst**: Beregnes nu fra spotets `coastDirection` + vindretning
  - Slår kystretning op fra spot-data
  - Bruger `getWindType()` til at beregne på-/fra-/sidevind
  - Fallback til gammel metode hvis spot mangler kystretning

**UI forbedringer:**
- **Spot-redigering på iOS**: Edit-knap nu synlig på begge platforme (før kun Android)
- **Redigeringsmodal**: Viser koordinater-badge, navn-felt, kystretning-vælger
- **Transparent header** på spot-weather (settings-knap bevares)

**Nye oversættelser (DA/EN):**
- `dmiStations`, `dmiStationsDesc` - DMI stationer toggle
- `coastDirectionQuestion` - Kystretning spørgsmål
- `hour`, `before`, `after`, `at` - Tidsbeskrivelser
- `waterTemp`, `waterLevel` - DMI station beskrivelser

**Filer oprettet/ændret:**
- `shared/components/DmiStationMarker.tsx` (ny)
- `app/(tabs)/trip-replay/[id].tsx` (ny)
- `app/(tabs)/spot-weather.tsx` - DMI stationer, edit-knap fix
- `app/(tabs)/index.tsx` - Fiskemønster med spots lookup
- `lib/patternAnalysis.ts` - Sol-afrunding, vindretning beregning
- `lib/i18n/translations.ts` - Nye oversættelser

---

### 2026-02-21 - Platform-specifik Firebase & PDF oversættelser

**Udført:**
- Splittet Firebase App ID til iOS og Android (FIREBASE_APP_ID_IOS / FIREBASE_APP_ID_ANDROID)
- Opdateret app.config.ts og firebase.ts til at vælge App ID baseret på Platform.OS
- Tilføjet fuld engelsk oversættelse af PDF-rapporten:
  - Gruppe-titler (Årstid → Season, Vandstand → Water level, etc.)
  - Labels (Foråret → Spring, Morgenen → Morning, etc.)
  - Fiskemønster-linjer (Ved fralandsvind → With offshore wind, etc.)
- Kystretning feature (coast direction) til spots
- Forbedret GPS tracking stabilitet:
  - Øget MIN_WAYPOINT_DISTANCE fra 10m til 25m
  - Tilføjet MIN_GPS_ACCURACY filter (30m)
  - Øget distanceInterval til 20m, timeInterval til 5s
- Hint-box UI med to bullet points (tryk på kort / hold på spot)
- Slow loading indikator efter 5 sekunder
- Warning når ocean data mangler fra Open-Meteo

### 2026-02-09 - Release Build

**Udført:**
- Bygget produktion til iOS (buildNumber 26) og Android (versionCode 13)
- Opdateret eas.json med alle DMI API-nøgler til production profil
- Uploadet Google Services filer som EAS secrets (GOOGLE_SERVICES_JSON, GOOGLE_SERVICE_INFO_PLIST)
- Opdateret app.config.ts til at bruge environment variables for Google Services filer
- Opsat Google Play Service Account til automatisk upload
- Aktiveret Google Play Android Developer API

**Build Artifacts (færdige til upload):**
- Android AAB: https://expo.dev/artifacts/eas/vqSdHFNay8dpFDGMZpDknv.aab
- iOS IPA: https://expo.dev/artifacts/eas/cionGtfFP9EePRNxz1CxzT.ipa

**Build Logs:**
- Android: https://expo.dev/accounts/daniich/projects/havoerred-logbog/builds/ee51d202-d622-4d54-8aa6-131a7d0c27a3
- iOS: https://expo.dev/accounts/daniich/projects/havoerred-logbog/builds/5b81f537-85c9-4c24-9559-fecff4d91609

**TODO - Google Play Console (før upload):**
1. Angiv privatlivspolitik URL
2. Appadgang - vælg om appen kræver login
3. Annoncer - vælg "Nej, ingen annoncer"
4. Indholdsklassificering - besvar spørgeskema
5. Målgruppe - vælg 18+ (ikke til børn)
6. Datasikkerhed - beskriv hvilke data appen indsamler
7. Vælg appkategori - Sport / Udendørs
8. Opret butiksside - screenshots, beskrivelse, ikon

**TODO - iOS App Store:**
- Konfigurer App Store Connect med ascAppId i eas.json
- Eller upload IPA manuelt via Transporter app

### 2026-02-09 - Release Forberedelse

**Udført:**
- Komplet i18n oversættelse af spot-weather.tsx (alle modals, knapper, hints)
- Tilføjet offline trip failsafe med catch block og queue fallback i index.tsx
- Tilføjet "Sync vejr" knap ved "Source DMI" i trip detaljer (trips/[id].tsx)
- Ændret minimum vejrdata vindue til 2 timer (i stedet for 6 timer for korte ture)
- Ændret GPS tracking linje fra gul til rød
- Fjernet alle console.log statements fra kodebasen
- Fjernet boilerplate filer (modal.tsx)
- Sikret .env filer i .gitignore

**Nye translation keys:**
- editSpot, saveName, renameSpotDesc, deleteSpot, deleteSpotConfirmation
- locationRequired, locationPermissionDesc, getWeather
- searchPlace, searchPlaceholder, nameRequired
- standardMap, orthoMap, showYourSpots
- selectedLocation, weatherAndSea, loadingForecasts
- noDataAvailable, tapMapHint, syncWeather

**Rettede fejl:**
- Duplikerede translation keys (search, sunrise, sunset)
- Broken multi-line console.logs der forårsagede syntax errors
- .env fil fjernet fra git tracking

### Tidligere arbejde

- Splash screen implementering
- Login UI med Firebase Auth
- Offline sync system med AsyncStorage queue
- Open-Meteo vejr integration (DMI HARMONIE-model) + DMI salinitet
- GPS baggrundstracking med expo-location
- Fangstregistrering med billeder
- Spot management med kort

## Projektstruktur

```
sea-trout-log/
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Hjem/tracking
│   │   ├── spot-weather.tsx # Spots og vejr
│   │   ├── trip-replay/[id].tsx # Trip replay animation
│   │   ├── trips/[id].tsx # Tur detaljer
│   │   └── catch/[id].tsx # Fangst detaljer
│   └── _layout.tsx        # Root layout
├── shared/
│   └── components/        # Delte komponenter
│       ├── SpotMarker.tsx # Spot-markør (iOS/Android)
│       ├── DmiStationMarker.tsx # DMI station-markør
│       └── ScrollableGraph.tsx # Vejrgraf
├── lib/                   # Utilities og services
│   ├── dmi.ts            # Vejr orchestration (Open-Meteo + DMI)
│   ├── openMeteoGrid.ts  # Open-Meteo grid fetch til overlays
│   ├── dmiOcean.ts       # DMI Ocean stationsliste
│   ├── dmiGridData.ts    # DMI EDR grid data (salinitet)
│   ├── patternAnalysis.ts # Fiskemønster-analyse
│   ├── spots.ts          # Spot management + getWindType
│   ├── firebase.ts       # Firebase config
│   ├── offlineSync.ts    # Offline queue
│   └── i18n/             # Oversættelser
├── functions/             # Firebase Cloud Functions
└── eas.json              # EAS Build config
```

## GPS Tracking Indstillinger

- Accuracy: High (GPS + WiFi + Cell)
- Distance interval: 20m
- Time interval: 5000ms
- Min GPS accuracy: 30m (readings med dårligere nøjagtighed ignoreres)
- Waypoint filtrering: min 25m, max 150m
- Max hastighed: 8 m/s (~30 km/t - filtrerer GPS-spikes)
