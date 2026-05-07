# Performance Optimeringer: Vejrdata Fetching

## Problem

Vejrdata-hentning tog 3-5 sekunder fra bruger trykkede "Hent vejr" til data var synlig på skærmen.

## Årsager

### 1. Cloud Function Proxy (største synder)
Hvert API-kald gik gennem en Firebase Cloud Function i `us-central1` (Iowa, USA):
- **Cold start:** 2-5 sekunder hvis funktionen var inaktiv
- **Ekstra netværksrute:** Danmark → USA → Danmark (DMI API) → USA → Danmark (~16.000 km ekstra)
- **Per-request overhead:** ~200-400ms

### 2. Lange Timeouts
- EDR requests: 8 sekunder timeout
- Ocean/Grid requests: 6 sekunder timeout
- Brugeren ventede op til 8s på et enkelt fejlet kald

### 3. Sekventiel Best-Spot Beregning
```javascript
// GAMMELT: Sekventiel - 5 spots = 5 × API latency
for (const s of spots) {
  const c = await getFishCountForSpot(s.id); // VENTER
}
```

### 4. Stale Cache Ignoreret
Cached data der var lidt for gammel blev kastet væk, og brugeren ventede på frisk API-respons — selvom den gamle data var fin at vise mens ny hentedes.

## Løsninger

### Fix 1: Direkte DMI-kald (ingen proxy)
DMI fjernede API key-kravet dec 2025. Nu kalder appen `opendataapi.dmi.dk` direkte.

**Besparelse:** 200-400ms + eliminerer cold starts (2-5s)

### Fix 2: Reducerede Timeouts
| API | Før | Efter |
|-----|-----|-------|
| EDR Forecast | 8000ms | 4000ms |
| Ocean Obs | 6000ms | 4000ms |
| Grid Data | 6000ms | 4000ms |

**Besparelse:** Fail-fast ved langsom DMI, vis cached/partial data hurtigere

### Fix 3: Stale-While-Revalidate
```javascript
// NYT: Returner stale data NU, refresh i baggrunden
if (sqliteCached) {
  if (!sqliteCached.isStale) return parsedData; // Frisk cache
  fetchWeatherFromApi(lat, lon, cacheKey).catch(() => {}); // Baggrund-refresh
  return parsedData; // Returner stale data øjeblikkeligt
}
```

**Besparelse:** ~0ms for gentagne opslag (data vises øjeblikkeligt)

### Fix 4: Parallel Best-Spot Beregning
```javascript
// NYT: Parallel - alle spots beregnes samtidig
const counts = await Promise.all(
  spots.map((s) => getFishCountForSpot(s.id).catch(() => 0))
);
```

**Besparelse:** N × latency → 1 × latency

### Fix 5: Cloud Functions Region (fallback)
Ændret fra `us-central1` (USA) til `europe-west1` (Belgien) for de tilfælde hvor proxy stadig bruges.

## Forventet Resultat

| Scenarie | Før | Efter |
|----------|-----|-------|
| Første opslag (cold) | 3-5s | 0.5-1.5s |
| Gentaget opslag (cached) | 0.5-1s | <50ms |
| Stale cache | 3-5s (ventede på API) | <50ms (viser cached) |
| Best-spot (5 spots) | 5 × latency | 1 × latency |

## Ændrede Filer

| Fil | Ændring |
|-----|---------|
| `lib/dmi.ts` | Direkte DMI-kald, stale-while-revalidate, timeout 4s |
| `lib/dmiClimate.ts` | Direkte DMI URL |
| `lib/dmiOcean.ts` | Direkte DMI URL, timeout 4s |
| `lib/dmiGridData.ts` | Direkte DMI URL, timeout 4s |
| `app/(tabs)/spot-weather.tsx` | `Promise.all()` for best-spot |
| `functions/src/index.ts` | Region `europe-west1` |
