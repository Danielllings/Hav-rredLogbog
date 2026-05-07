# Changelog v1.1.0

## Nye features

### Saeson maal
- Saet personlige maal for saesonen: antal fisk, stoerrelse, vaegt, antal ture, timer fisket, spot diversitet, fangstrate
- Progressionsring per maal med procentvisning
- Celebration-animation naar et maal naas
- Placeret mellem QuickStatsGrid og Spot Performance paa statistikskermen
- Hold nede for at slette et maal
- Duplikat-forebyggelse (kun et maal af hver type per saeson)

### PDF-rapport med saeson maal
- Saeson maal vises i PDF-rapporten med SVG progress-ring per maal
- Viser type, progress-tekst og "Maal naaet!" for completed goals
- Baade dansk og engelsk

### Fisketegn
- Koeb fisketegn-knap (link til fisketegn.dk)
- Udloebsdato med custom dato-vaelger (dag/maaned/aar scroll-kolonner)
- Live preview af valgt dato
- Status med farvekode: groen (gyldigt), guld (<30 dage), roed (udloebet)
- Viser "X dage tilbage" eller "Udloebet"
- Diskret reminder paa tracking-siden naar fisketegn er udloebet
- Data gemt i Firestore (synkroniserer paa tvaers af enheder)

### Tryk under fiskeri
- Live lufttryk (hPa) med trend-pil tilgaengelig via vejrdata under tracking
- Tryktendens beregnet: sammenligner nuvaerende tryk med 1 time siden
- Tryk-analyse i fiskemonster: 4 ranges (Lavtryk, Lavt, Normalt, Hoejtryk) i stedet for individuelle hPa-vaerdier

## Forbedringer

### Fredningsbaelter redesign
- getPeriodeType() bruger nu API'ets numeriske kode (0/1/2) direkte
- Nyt status-banner: roed "Fiskeri forbudt" / groen "Fiskeri tilladt"
- Periode + boede-kort side-by-side
- Viser tilladte redskaber, daglig kvote, bemaerkninger, kontaktkontor
- Opdateret link til lfst.dk
- Filtrerer tomme/"0" felter fra

### Stroem overlay
- Forbedret bilinear interpolation ved kystomraader (bruger gyldige hjoerner i stedet for at returnere null)
- Kraever nu mindst 3 af 4 hjoerner med data
- Justerede partikelparametre for bedre visualisering

### SpotMarker fix
- Fjernet pulserende glow-animation der foraarsagede clipping-glitch ved zoom
- tracksViewChanges sat til false permanent
- Statisk rendering i stedet for reanimated (eliminerer (0,0) snap)

### CatchRateHero
- Renere glassy design uden ekstra shadows
- Subtil track-ring (rgba 8% hvid)
- Baggrunden skinner igennem

### App navn i PDF
- Engelsk PDF bruger nu ogsaa "Havoerred Logbog" som appnavn

## Teknisk
- Version: 1.0.1 -> 1.1.0
- FishEventCondition type tilfojet i tripUtils.ts (forberedt til fremtidig brug)
- saveTrip() understotter nu condition-data i fish_events_json
- Tryk-ranges i statistik med i18n nogler (pressureVeryLow/Low/Normal/High)
- Fisketegn gemt i Firestore: users/{userId}/settings/fishingLicense
- 10 nye i18n nogler for fisketegn (DA + EN)
- 4 nye i18n nogler for trykranges (DA + EN)
- 0 TypeScript-fejl
