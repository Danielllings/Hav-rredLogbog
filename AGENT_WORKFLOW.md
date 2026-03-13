# Feature Udvikling Workflow

3-agent workflow til feature udvikling i Havørred Logbog.

---

## Agent 1: Planlægger (Plan Agent)

**Rolle:** Analyse og arkitektur

**Opgaver:**
- Læser og forstår den eksisterende kodebase
- Identificerer hvilke filer der skal ændres/oprettes
- Definerer interfaces og datastrukturer
- Skriver en detaljeret implementeringsplan
- Opdaterer `CLAUDE.md` med nye konventioner

**Output:** Plan dokument med:
- Liste over filer der skal ændres
- Pseudokode / API design
- Afhængigheder og rækkefølge

---

## Agent 2: Udvikler (Code Agent)

**Rolle:** Implementation

**Opgaver:**
- Følger planen fra Agent 1
- Skriver den faktiske kode
- Sørger for TypeScript types
- Følger eksisterende konventioner (THEME, i18n, etc.)
- Holder sig til scope - ingen over-engineering

**Output:** Fungerende kode klar til review

---

## Agent 3: Reviewer (Review Agent)

**Rolle:** Kvalitetssikring

**Opgaver:**
- Gennemgår koden fra Agent 2
- Tjekker for fejl, mangler, sikkerhedsproblemer
- Verificerer at planen er fulgt
- Kører tests hvis relevant
- Foreslår forbedringer

**Output:** Review rapport + eventuelle rettelser

---

## Flow

```
Bruger request
     ↓
[Agent 1: Plan] → Plan dokument
     ↓
[Agent 2: Code] → Implementation
     ↓
[Agent 3: Review] → Godkendt / Feedback loop
     ↓
Færdig feature
```

---

## Brug

Start workflow med en feature request:

```
"Implementer [feature] med 3-agent workflow"
```

Agents kører sekventielt og bygger på hinandens output.
