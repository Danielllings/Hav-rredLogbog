# Changelog - 12. Marts 2026

## Oversigt
Denne opdatering introducerer flere vigtige UX-forbedringer og sikkerhedsfunktioner til Havørred Logbog.

---

## Nye Funktioner

### 1. Nero Tema med Guld Accent
Hele appen er opdateret til det nye "Nero" design med en elegant guld accent-farve.

**Farvepalet:**
| Farve | Hex | Anvendelse |
|-------|-----|------------|
| Background | `#0D0D0F` | Hovedbaggrund |
| Card | `#161618` | Kort-baggrund |
| Elevated | `#1E1E21` | Hævede elementer, inputs |
| Accent | `#F59E0B` | Primær accent (guld) |
| Accent Muted | `#F59E0B20` | Dæmpet accent |
| Text | `#FFFFFF` | Primær tekst |
| Text Secondary | `#A0A0A8` | Sekundær tekst |
| Text Tertiary | `#606068` | Tertiær tekst |
| Danger | `#FF3B30` | Fejl/slet handlinger |

**Opdaterede filer:**
- `constants/theme.ts` - Global tema-definition
- `app/(tabs)/settings.tsx`
- `app/(tabs)/spot-weather.tsx`
- `app/(tabs)/new-catch.tsx`
- `app/(tabs)/catch/[id].tsx`
- `app/(tabs)/catches.tsx`
- `app/(tabs)/trips/[id].tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/statistics.tsx`
- `shared/components/BentoTrackingDashboard.tsx`

**Design-principper:**
- Knapper: 56px højde, 16px borderRadius
- Kort: 20-24px borderRadius, ingen borders
- Font weights: 200-300 for store tal, 600 for labels
- Inputs: Elevated baggrund uden synlige borders

---

### 2. 2km Spot-Radius Check ved Tracking Start
Når brugeren starter tracking, tjekker appen nu om der er et spot inden for 2km af brugerens position.

**Funktionalitet:**
1. Ved tryk på "Start Tur" hentes brugerens GPS-position
2. Alle gemte spots scannes med haversine-afstandsberegning
3. Hvis ingen spots er inden for 2km radius:
   - Modal vises med besked om manglende nærliggende spot
   - Brugerens koordinater vises
   - Mulighed for at oprette nyt spot direkte

**Brugerflow:**
```
Start Tur → Hent GPS → Scan spots (2km radius)
                              ↓
                    Spots fundet? → Start tracking
                              ↓
                    Ingen spots → Vis modal
                              ↓
                    "Opret spot her" → Åbn spot-weather med koordinater
```

**Teknisk implementering:**
- `index.tsx`: Tilføjet `noNearbySpots` og `pendingStartLocation` state
- `spot-weather.tsx`: Håndterer `createSpotLat` og `createSpotLng` URL-parametre
- Bruger eksisterende `haversine()` funktion fra `shared/utils/geo.ts`

**Konstanter:**
```typescript
const NEARBY_RADIUS_M = 2000; // 2 km radius
```

---

### 3. Fail-Safe: Automatisk Stop ved Kørsel
En sikkerhedsfunktion der detekterer når brugeren kører væk fra fiskestedet og glemmer at stoppe tracking.

**Funktionalitet:**
1. Overvåger GPS-hastighed under tracking
2. Hvis hastighed > 43 km/h i 4+ consecutive målinger → vis advarsel
3. Brugeren kan vælge:
   - "Stop tur" - stopper tracking med det samme
   - "Fortsæt tracking" - lukker modal og fortsætter

**Konstanter:**
```typescript
const CAR_SPEED_THRESHOLD = 12;      // m/s (~43 km/h)
const HIGH_SPEED_TRIGGER_COUNT = 4;  // Antal consecutive readings
```

**Modal UI:**
- Rød bil-ikon
- Titel: "Kører du væk?"
- Forklaring om høj hastighed
- Rød "Stop tur" knap
- Grå "Fortsæt tracking" knap

**Reset-betingelser:**
- Hastighed falder under grænsen
- Brugeren står stille (< 25m bevægelse)
- Tracking starter
- Tracking stopper
- Brugeren vælger "Fortsæt tracking"

---

### 4. Credits Modal i Indstillinger
En ny credits-sektion i indstillinger der anerkender udviklere og testere.

**Placering:** Indstillinger → Om app → Credits

**Indhold:**
- "Udviklet af Daniel Lings" med kode-ikon
- "Tak til de hjælpende medvirkende" sektion
- Liste over beta-testere med:
  - Avatar (første bogstav i navn)
  - Navn
  - Rolle
  - Stjerne-ikon

**Nuværende testere:**
| Navn | Rolle |
|------|-------|
| Sergio JB | Beta Tester |

**Tilføj flere testere:**
```typescript
// I settings.tsx, omkring linje 80
const TESTERS = [
  { name: "Sergio JB", role: "Beta Tester" },
  { name: "Ny Person", role: "Beta Tester" },
];
```

---

## Filændringer

### Nye filer
- `docs/CHANGELOG_2026-03-12.md` - Denne fil

### Modificerede filer
| Fil | Ændringer |
|-----|-----------|
| `constants/theme.ts` | Nero tema med guld accent |
| `app/(tabs)/index.tsx` | 2km check, fail-safe, Nero styling |
| `app/(tabs)/spot-weather.tsx` | URL-param håndtering for spot-oprettelse |
| `app/(tabs)/settings.tsx` | Credits modal, Nero styling |
| `app/(tabs)/catches.tsx` | Nero styling |
| `app/(tabs)/catch/[id].tsx` | Nero styling |
| `app/(tabs)/new-catch.tsx` | Nero styling |
| `app/(tabs)/trips/[id].tsx` | Nero styling |
| `app/(tabs)/statistics.tsx` | Nero styling |
| `shared/components/BentoTrackingDashboard.tsx` | Nero styling |

---

## Tekniske Noter

### Haversine Afstandsberegning
Bruges til at beregne afstand mellem bruger og spots:
```typescript
// Fra shared/utils/geo.ts
function haversine(a: Pt, b: Pt): number {
  const R = 6371000; // Earth radius in meters
  // ... beregning
  return distance; // i meter
}
```

### GPS Hastigheds-beregning
```typescript
const dtMs = Math.max(1, p.t - last.t);  // Tid mellem punkter
const speed = step / (dtMs / 1000);       // m/s
```

---

## Test-instruktioner

### Test 2km Spot-Check
1. Slet alle spots eller gå til en lokation uden spots inden for 2km
2. Tryk "Start Tur"
3. Verificer at modal vises med "Intet spot i nærheden"
4. Tryk "Opret spot her"
5. Verificer at spot-weather åbner med korrekte koordinater

### Test Fail-Safe
1. Start en tur
2. Simuler høj hastighed (kræver faktisk kørsel eller mock GPS)
3. Verificer at advarsel vises efter ~20-30 sekunder ved >43 km/h
4. Test begge knapper: "Stop tur" og "Fortsæt tracking"

### Test Credits
1. Åbn Indstillinger
2. Scroll til "Om app" sektion
3. Tryk på "Credits"
4. Verificer at modal vises med korrekt indhold
