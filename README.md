# Havørred Logbog

En React Native/Expo app til at logge havørredfiskeri med GPS-tracking, vejrdata og fangststatistik.

## Features

- **GPS Tracking**: Optager din fisketur med høj præcision (5m afstand, 4s interval)
- **Vejrdata fra DMI**: Automatisk hentning af temperatur, vind, havtemperatur og vandstand
- **Offline Support**: Ture gemmes lokalt og synkroniseres når der er forbindelse
- **Spot Management**: Gem og administrer dine favoritfiskepladser
- **Fangstregistrering**: Log dine fangster med billeder og detaljer
- **Flersproget**: Dansk og engelsk understøttet (i18n)

## Tech Stack

- **Framework**: React Native med Expo Router
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Maps**: Google Maps (react-native-maps)
- **Location**: expo-location med baggrundstracking
- **Vejr API**: DMI Climate, Ocean og EDR API'er

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
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
MAPS_API_KEY=...
EXPO_PUBLIC_MAPS_API_KEY=...
DMI_CLIMATE_URL=...
DMI_EDR_URL=...
DMI_OCEAN_URL=...
STAC_URL=...
```

---

## Udviklingslog

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
- DMI vejr integration (Climate, Ocean, EDR)
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
│   │   └── trips/         # Ture
│   └── _layout.tsx        # Root layout
├── components/            # Genbrugelige komponenter
├── lib/                   # Utilities og services
│   ├── dmi.ts            # DMI integration
│   ├── dmiClimate.ts     # Climate API
│   ├── dmiOcean.ts       # Ocean API
│   ├── dmiEdr.ts         # EDR API
│   ├── firebase.ts       # Firebase config
│   ├── offlineSync.ts    # Offline queue
│   └── i18n/             # Oversættelser
├── functions/             # Firebase Cloud Functions
└── eas.json              # EAS Build config
```

## GPS Tracking Indstillinger

- Accuracy: High (GPS + WiFi + Cell)
- Distance interval: 5m
- Time interval: 4000ms
- Waypoint filtrering: min 10m, max 150m
- Max hastighed: 8 m/s (for at filtrere køretøjsbevægelser)
