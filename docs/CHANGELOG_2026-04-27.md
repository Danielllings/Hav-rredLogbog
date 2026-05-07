# Changelog — 26.-27. april 2026

## Website
- **Landing page** oprettet (`website/`) med appens nero-tema (#0D0D0F, #F59E0B)
- Phone mockup med app UI (tracking card, tab bar, GPS-rute animation)
- Particle baggrund, scroll reveals, counter animation, 3D card tilt, magnetic buttons
- **Privatlivspolitik** (`privacy.html`) med fuldt DA/EN indhold
- **Slet konto** (`delete-account.html`) med trin-for-trin guide DA/EN
- **DA/EN sprogskift** med localStorage persistering
- Responsive design (mobil, tablet, desktop)
- Assets kopieret (icon.png, favicon.png)

## Vejrkort overlays — bugfixes

### Bølge-overlay (fixed)
- `openMeteoGrid.ts`: `fetchWaveGrid()` bevarer nu `wave_height` og `wave_direction` i ranges (var overskrevet med kun `wave-u`/`wave-v`)
- `WaveSwellOverlay.tsx`: Parser tjekker nu `wave_height` (underscore) som første key

### Vandstands-overlay (fixed)
- `WaterLevelOverlay.tsx`: Parser tjekker nu `sea_level_height_msl` som første key (Open-Meteo nøgle)

### Salinitet-overlay
- Uændret — bruger stadig direkte DMI EDR API (Open-Meteo har ikke salinitet)

### Vindretnings-pil (fixed)
- `WindOverlay.tsx`: Grid-data itereres nu nord-til-syd (`j = ny-1` → `j = 0`) så leaflet-velocity matcher kompassets interpolation
- Partikelanimation og kompaspil peger nu samme retning

### Vindstød
- `openMeteoGrid.ts`: `wind_gusts_10m` tilføjet til API-kald og `wind-gusts` range
- `WindOverlay.tsx`: Nyt info-panel under kompasset med Vind (m/s), Stød (m/s) og retning (kardinal + grader)
- Ren hvid pil i stedet for farvet — info-panel viser data separat

## Forecast slider (nu funktionel)
- `openMeteoGrid.ts`: Ny `datetime` parameter — bruger `&hourly=` med `&start_hour`/`&end_hour` for forecast, `&current=` for live data
- Alle overlay fetch-funktioner accepterer nu `datetime` parameter
- Alle 5 overlays sender slider-timestamp til API (`hourIndex > 0` = forecast, `0` = live)
- `ForecastSlider.tsx`: Hardcoded DA/EN weekday arrays (Hermes-safe), korrekt locale

## i18n — fuld DA/EN oversættelse

### Statistik
- `statistics.tsx`: Sæsoner, vindtyper, skydække, tryktendens, månefaser, sol-offset — alle bruger nu `t()`
- `CatchRateHero.tsx`: "Fangstrate" → `t("catchRate")`, "fisk" → `t("fish")`, "ture" → `t("trips")`
- `ActivityRings.tsx`: "Fangst"/"Tempo"/"Fangstrate" → language ternary
- Duration suffix: hardcoded "t" → `t("hourShort")`

### Mønsteranalyse
- `patternAnalysis.ts`: ~50+ danske strenge oversat via `t()` og language ternaries
- Alle label-funktioner (vandstand, sæson, tidspunkt, vindstyrke, kystvind, vindretning, varighed, bevægelse) accepterer nu `t` parameter
- `buildWeatherSummary()` genererer tekst baseret på `language` parameter

### Vejrkort overlays
- `WindOverlay.tsx`: 13 strenge — `i18n` objekt injiceret i WebView
- `WaveSwellOverlay.tsx`: 10 strenge oversat
- `CurrentVelocityOverlay.tsx`: 16 strenge oversat (inkl. kompasretninger NØ→NE)
- `WaterLevelOverlay.tsx`: 13 strenge oversat
- `SalinityHeatmapOverlay.tsx`: 13 strenge oversat
- `ForecastSlider.tsx`: "Nu"→"Now", "I dag"→"Today", "+48t"→"+48h"
- `ScrollableGraph.tsx`: "Nu"→"Now"
- `BentoTrackingDashboard.tsx`: "fangst"→"catch", "vand"→"water"
- `SunMoonAnimation.tsx`: "Solopgang"→"Sunrise", "Solnedgang"→"Sunset", "NU"→"NOW", "NAT"→"NIGHT"

### Translations.ts
- Tilføjet: `pressureTrend`, `pressure` (DA+EN)
- Tilføjet: `weakWind`, `mildWind`, `freshWind`, `hardWind`, `lessThan2Hours`, `hours2to4`, `hours4to6`, `hours6plus`
- Tilføjet: `standingLightMovement`, `fishingTheWater`, `calmPace`
- Tilføjet: `lowWater`, `highWater`, `midWater`, `unknown`
- Tilføjet: `theMorning`, `theLateMorning`, `theAfternoon`, `theEvening`, `theNight`
- Alle 47 keys verificeret i både DA og EN

## Tracking-kort
- Fjernet vandstands-chip (dråbe-ikon) fra tracking-kortets vejr-overlay

## Demo-konto
- `scripts/seedDemoData.ts` oprettet — seeder Firebase med:
  - 5 spots (Stevns Klint, Møns Klint, Gilleleje, Kerteminde, Hornbæk)
  - 8 ture (marts-april 2026) med fulde vejrserier til grafer
  - 12 fangster (35-72cm, 0.5-4.5kg)
- Kørt med Firebase Admin SDK — data live i demo-konto

## App Store Connect
- App Information: Subtitle, Category (Sports/Weather), Age Rating 4+, Content Rights
- Tax forms: W-8BEN (Article 12, 0%) + Certificate of Foreign Status — begge active
- DSA trader status bekræftet
- App Privacy: 5 data types konfigureret (Email, Location, Photos, User Content, User ID)
- Screenshots resized til 1284×2778px (6 stk.)

## Filer oprettet
- `website/index.html`
- `website/style.css`
- `website/script.js`
- `website/privacy.html`
- `website/delete-account.html`
- `website/assets/icon.png`, `favicon.png`
- `scripts/seedDemoData.ts`
- `docs/CHANGELOG_2026-04-27.md`
