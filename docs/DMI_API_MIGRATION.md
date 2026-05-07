# DMI API Migration: Proxy → Direkte Kald

## Baggrund

DMI (Danmarks Meteorologiske Institut) fjernede kravet om API keys den **2. december 2025**. Alle data er nu frit tilgængelige på `opendataapi.dmi.dk` uden autentificering.

**Deadline:** Det gamle endpoint `dmigw.govcloud.dk` lukkes **30. juni 2026**.

## Før (gammel arkitektur)

```
Telefon (DK) → Cloud Function (us-central1, USA) → dmigw.govcloud.dk (DK) → Cloud Function → Telefon
```

- Cloud Function proxy i `functions/src/index.ts` tilføjede API keys og videresendte requests
- Cold start: 2-5 sekunder ved inaktive functions
- Ekstra netværkshop: ~200-400ms per request
- API keys gemt som Firebase Functions params

## Nu (ny arkitektur)

```
Telefon (DK) → opendataapi.dmi.dk (DK) → Telefon
```

- Direkte kald fra React Native (ingen CORS-begrænsning i native apps)
- Ingen API keys nødvendige
- Ingen Cloud Function overhead
- Ingen cold starts

## Nye Endpoints

| API | Gammel URL | Ny URL |
|-----|-----------|--------|
| **EDR Forecast** | `https://dmigw.govcloud.dk/v1/forecastedr` | `https://opendataapi.dmi.dk/v1/forecastedr` |
| **Climate** | `https://dmigw.govcloud.dk/v2/climateData/collections/stationValue/items` | `https://opendataapi.dmi.dk/v2/climateData/collections/stationValue/items` |
| **Ocean** | `https://dmigw.govcloud.dk/v2/oceanObs/collections/observation/items` | `https://opendataapi.dmi.dk/v2/oceanObs/collections/observation/items` |

## Rate Limiting

Fair use: **500 requests per 5 sekunder**. Returnerer HTTP 429 ved overskridelse.

## Ændrede Filer

| Fil | Ændring |
|-----|---------|
| `lib/dmi.ts` | `fetchEdrData()` kalder `opendataapi.dmi.dk` direkte |
| `lib/dmiGridData.ts` | Grid/overlay kald direkte via `buildEdrUrl()` |
| `lib/dmiClimate.ts` | Hardcoded `DMI_CLIMATE_DIRECT_URL` med fallback til proxy |
| `lib/dmiOcean.ts` | Hardcoded `DMI_OCEAN_DIRECT_URL` med fallback til proxy |
| `lib/dmiConfig.ts` | API key exports fjernet |
| `app.config.ts` | API key env vars fjernet |
| `.env` | API key placeholders fjernet |

## Cloud Functions Status

Cloud Functions i `functions/src/index.ts` eksisterer stadig og bruges til:
- **Weather Alerts** (`checkWeatherAlerts`, `triggerWeatherCheck`) — server-side push notifications kræver stadig en backend
- **Fallback proxy** — hvis direkte kald fejler (ikke aktivt brugt)

Proxy-funktionerne (`getDmiClimate`, `getDmiOcean`, `getDmiEdr`, `getStac`) kan fjernes når direkte kald er verificeret stabile.

## Kilder

- [DMI Fri Data](https://www.dmi.dk/friedata/)
- [DMI API Dokumentation](https://www.dmi.dk/friedata/dokumentation/basics)
- [DMI Autentificering](https://www.dmi.dk/friedata/dokumentation/authentication)
