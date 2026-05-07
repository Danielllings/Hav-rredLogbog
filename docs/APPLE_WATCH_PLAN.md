# Apple Watch Implementation Plan

## Strategi

Config plugins virker ikke med EAS cloud builds for native extension targets (bevist med widget-fejl). 
I stedet: **prebuild lokalt → tilføj watch target i Xcode → commit ios/ → byg via EAS**.

---

## Fase 0: Forberedelse (Skift til committed ios/)

### 0.1 Generer Xcode-projekt lokalt
```bash
npx expo prebuild --platform ios --clean
```
Dette genererer den fulde `ios/` mappe med `.xcodeproj`, `Podfile`, osv.

### 0.2 Opdater .gitignore
Fjern `/ios` fra `.gitignore` (linje ~43). Tilføj i stedet:
```gitignore
# iOS - commit projekt, ignorer build artifacts
ios/Pods/
ios/build/
ios/.xcode.env.local
ios/*.xcworkspace/xcuserdata/
```

### 0.3 Fjern widget plugin fra app.config.ts
`withIOSWidget` pluginet skal fjernes permanent — vi håndterer native targets manuelt nu.
Widget Swift-filer i `ios/widget/` kan slettes hvis vi ikke bruger dem.

### 0.4 Opdater eas.json
Fjern `"image": "latest"` fra iOS profiler — EAS skal bruge det committede ios/-projekt:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

### 0.5 Test build UDEN watch
Byg production iOS for at bekræfte det virker med committed ios/:
```bash
npx eas build --platform ios --profile production
```

---

## Fase 1: TypeScript-lag (React Native side)

### 1.1 Udvid FishEvent med condition data
**Fil: `lib/tripUtils.ts`**

Tilføj:
```typescript
export type FishEventCondition = {
  color?: "blank" | "farvet";        // Sølvblank / farvet
  seaLice?: "ingen" | "faa" | "mange"; // Havlus
  released?: boolean;                 // Genudsætning
};

// Udvid eksisterende FishEvent:
export type FishEvent = {
  ts: number;
  length_cm?: number;
  condition?: FishEventCondition;  // NY
};
```

Opdater `parseFishEvents()` til at bevare `condition` feltet.

### 1.2 Opret watchBridge.ts
**Ny fil: `lib/watchBridge.ts`**

TypeScript wrapper omkring `react-native-watch-connectivity`:
```typescript
import { Platform } from "react-native";

// Kun importér på iOS
const WatchModule = Platform.OS === "ios"
  ? require("react-native-watch-connectivity")
  : null;

export type WatchTripStatus = {
  running: boolean;
  elapsedSec: number;
  distanceM: number;
  catchCount: number;
  spotName?: string;
  waterTemp?: number;
  windSpeed?: number;
};

export function sendTripStatusToWatch(status: WatchTripStatus): void {
  if (!WatchModule) return;
  try {
    WatchModule.updateApplicationContext(status);
  } catch {}
}

export function onWatchFishEvent(
  callback: (event: { ts: number; condition?: FishEventCondition }) => void
): () => void {
  if (!WatchModule) return () => {};
  const sub = WatchModule.watchEvents.on("message", (msg: any) => {
    if (msg?.type === "fish_caught") {
      callback({
        ts: msg.ts || Date.now(),
        condition: msg.condition,
      });
    }
  });
  return () => sub?.remove?.();
}

export function isWatchConnected(): Promise<boolean> {
  if (!WatchModule) return Promise.resolve(false);
  return WatchModule.getReachability().catch(() => false);
}
```

### 1.3 Tilføj condition picker til telefon-appen
**Fil: `app/(tabs)/index.tsx`**

Efter `markCatchNow()` (længde-modal), tilføj en condition-picker modal:
- Farve: "Blank" / "Farvet" (2 knapper)
- Havlus: "Ingen" / "Få" / "Mange" (3 knapper)
- Genudsætning: "Ja" / "Nej" (2 knapper)
- "Gem" knap

Gem condition i `catchMarks` state sammen med `ts` og `length_cm`.

### 1.4 Integrer watch-kommunikation i tracking
**Fil: `app/(tabs)/index.tsx`**

- Ved trip start: `sendTripStatusToWatch({ running: true, ... })`
- I timer-interval (hvert 5. sekund): `sendTripStatusToWatch({ elapsedSec, distanceM, catchCount })`
- Subscribe til `onWatchFishEvent()` — process som `markCatchNow()` med condition data
- Ved trip stop: `sendTripStatusToWatch({ running: false, ... })`

### 1.5 Tilføj watch-indikator i BentoTrackingDashboard
**Fil: `shared/components/BentoTrackingDashboard.tsx`**

Lille ur-ikon med grøn/grå prik der viser om watch er forbundet.

### 1.6 i18n oversættelser
**Fil: `lib/i18n/translations.ts`**

Tilføj (DA + EN):
```
blank / "Blank" / "Silver"
farvet / "Farvet" / "Colored"
seaLice / "Havlus" / "Sea Lice"
seaLiceNone / "Ingen" / "None"
seaLiceFew / "Få" / "Few"
seaLiceMany / "Mange" / "Many"
released / "Genudsætning" / "Released"
fishCondition / "Tilstand" / "Condition"
watchConnected / "Ur tilsluttet" / "Watch Connected"
```

### 1.7 Installer dependency
```bash
npm install react-native-watch-connectivity
```

---

## Fase 2: watchOS App (Native Swift)

### 2.1 Mappestruktur
```
ios/HavorredWatch Watch App/
├── HavorredWatchApp.swift          # Entry point
├── ContentView.swift               # Router: idle vs active trip
├── ActiveTripView.swift            # Live trip dashboard + FISK! knap
├── ConditionPickerView.swift       # Blank/farvet, havlus, genudsætning
├── WatchSessionManager.swift       # WCSession delegate, singleton
├── Assets.xcassets/                # App ikon
│   └── AppIcon.appiconset/
│       └── Contents.json
└── Info.plist
```

### 2.2 HavorredWatchApp.swift
```swift
import SwiftUI

@main
struct HavorredWatchApp: App {
    @StateObject private var session = WatchSessionManager.shared
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
        }
    }
}
```

### 2.3 WatchSessionManager.swift
```swift
import Foundation
import WatchConnectivity

class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSessionManager()
    
    @Published var isRunning = false
    @Published var elapsedSec = 0
    @Published var distanceM: Double = 0
    @Published var catchCount = 0
    @Published var spotName = ""
    @Published var waterTemp: Double? = nil
    @Published var windSpeed: Double? = nil
    @Published var isReachable = false
    
    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }
    
    // Modtag trip status fra iPhone (updateApplicationContext)
    func session(_ session: WCSession, didReceiveApplicationContext ctx: [String: Any]) {
        DispatchQueue.main.async {
            self.isRunning = ctx["running"] as? Bool ?? false
            self.elapsedSec = ctx["elapsedSec"] as? Int ?? 0
            self.distanceM = ctx["distanceM"] as? Double ?? 0
            self.catchCount = ctx["catchCount"] as? Int ?? 0
            self.spotName = ctx["spotName"] as? String ?? ""
            self.waterTemp = ctx["waterTemp"] as? Double
            self.windSpeed = ctx["windSpeed"] as? Double
        }
    }
    
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    func session(_ s: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    
    // Send fangst-event til iPhone
    func sendCatchEvent(condition: CatchCondition?) {
        let msg: [String: Any] = [
            "type": "fish_caught",
            "ts": Date().timeIntervalSince1970 * 1000,
            "condition": [
                "color": condition?.color ?? "",
                "seaLice": condition?.seaLice ?? "",
                "released": condition?.released ?? false,
            ] as [String: Any]
        ]
        
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(msg, replyHandler: nil) { _ in
                // Fallback til baggrunds-kø
                WCSession.default.transferUserInfo(msg)
            }
        } else {
            WCSession.default.transferUserInfo(msg)
        }
        
        DispatchQueue.main.async {
            self.catchCount += 1
        }
    }
}

struct CatchCondition {
    var color: String?     // "blank" | "farvet"
    var seaLice: String?   // "ingen" | "faa" | "mange"
    var released: Bool?
}
```

### 2.4 ContentView.swift
```swift
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var session: WatchSessionManager
    
    let bg = Color(red: 0.071, green: 0.071, blue: 0.075)
    let accent = Color(red: 0.961, green: 0.620, blue: 0.043)
    
    var body: some View {
        Group {
            if session.isRunning {
                ActiveTripView()
            } else {
                // Idle state
                VStack(spacing: 12) {
                    Image(systemName: "figure.fishing")
                        .font(.system(size: 36))
                        .foregroundColor(accent)
                    Text("Ingen aktiv tur")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                    Text("Start en tur i appen")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.3))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(bg)
    }
}
```

### 2.5 ActiveTripView.swift
```swift
import SwiftUI
import WatchKit

struct ActiveTripView: View {
    @EnvironmentObject var session: WatchSessionManager
    @State private var showConditionPicker = false
    
    let bg = Color(red: 0.071, green: 0.071, blue: 0.075)
    let card = Color(red: 0.110, green: 0.110, blue: 0.118)
    let accent = Color(red: 0.961, green: 0.620, blue: 0.043)
    
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                // Spot name
                if !session.spotName.isEmpty {
                    Text(session.spotName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.6))
                }
                
                // Timer
                Text(formatTime(session.elapsedSec))
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                
                // Stats row
                HStack(spacing: 12) {
                    statPill(
                        icon: "arrow.triangle.swap",
                        value: String(format: "%.1f", session.distanceM / 1000),
                        unit: "km"
                    )
                    statPill(
                        icon: "fish",
                        value: "\(session.catchCount)",
                        unit: ""
                    )
                }
                
                // Weather row (if available)
                if session.waterTemp != nil || session.windSpeed != nil {
                    HStack(spacing: 12) {
                        if let temp = session.waterTemp {
                            statPill(
                                icon: "thermometer.medium",
                                value: String(format: "%.0f°", temp),
                                unit: ""
                            )
                        }
                        if let wind = session.windSpeed {
                            statPill(
                                icon: "wind",
                                value: String(format: "%.0f", wind),
                                unit: "m/s"
                            )
                        }
                    }
                }
                
                // BIG catch button
                Button(action: {
                    WKInterfaceDevice.current().play(.success)
                    showConditionPicker = true
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "fish.fill")
                            .font(.system(size: 18))
                        Text("FISK!")
                            .font(.system(size: 18, weight: .bold))
                    }
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(accent)
                    .cornerRadius(16)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 4)
        }
        .background(bg)
        .sheet(isPresented: $showConditionPicker) {
            ConditionPickerView()
        }
    }
    
    private func statPill(icon: String, value: String, unit: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundColor(accent)
            Text(value)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
            if !unit.isEmpty {
                Text(unit)
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(card)
        .cornerRadius(10)
    }
    
    private func formatTime(_ totalSec: Int) -> String {
        let h = totalSec / 3600
        let m = (totalSec % 3600) / 60
        let s = totalSec % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%02d:%02d", m, s)
    }
}
```

### 2.6 ConditionPickerView.swift
```swift
import SwiftUI
import WatchKit

struct ConditionPickerView: View {
    @EnvironmentObject var session: WatchSessionManager
    @Environment(\.dismiss) var dismiss
    
    @State private var color: String? = nil        // "blank" | "farvet"
    @State private var seaLice: String? = nil      // "ingen" | "faa" | "mange"
    @State private var released: Bool? = nil
    
    let bg = Color(red: 0.071, green: 0.071, blue: 0.075)
    let card = Color(red: 0.110, green: 0.110, blue: 0.118)
    let accent = Color(red: 0.961, green: 0.620, blue: 0.043)
    
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("Tilstand")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                
                // Farve
                Text("FARVE")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.white.opacity(0.4))
                HStack(spacing: 6) {
                    choiceBtn("Blank", selected: color == "blank") { color = "blank" }
                    choiceBtn("Farvet", selected: color == "farvet") { color = "farvet" }
                }
                
                // Havlus
                Text("HAVLUS")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.white.opacity(0.4))
                HStack(spacing: 6) {
                    choiceBtn("Ingen", selected: seaLice == "ingen") { seaLice = "ingen" }
                    choiceBtn("Få", selected: seaLice == "faa") { seaLice = "faa" }
                    choiceBtn("Mange", selected: seaLice == "mange") { seaLice = "mange" }
                }
                
                // Genudsætning
                Text("GENUDSÆTNING")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.white.opacity(0.4))
                HStack(spacing: 6) {
                    choiceBtn("Ja", selected: released == true) { released = true }
                    choiceBtn("Nej", selected: released == false) { released = false }
                }
                
                // Gem
                Button(action: {
                    let condition = CatchCondition(
                        color: color,
                        seaLice: seaLice,
                        released: released
                    )
                    session.sendCatchEvent(condition: condition)
                    WKInterfaceDevice.current().play(.success)
                    dismiss()
                }) {
                    Text("Gem")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(accent)
                        .cornerRadius(14)
                }
                .buttonStyle(.plain)
                
                // Spring over
                Button("Spring over") {
                    session.sendCatchEvent(condition: nil)
                    dismiss()
                }
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.4))
            }
            .padding(.horizontal, 4)
        }
        .background(bg)
    }
    
    private func choiceBtn(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(selected ? .black : .white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(selected ? accent : card)
                .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }
}
```

---

## Fase 3: Tilføj Watch Target i Xcode

### 3.1 Åbn Xcode-projektet
```bash
cd ios && open SeaTroutLog.xcworkspace
```

### 3.2 Tilføj watch target
1. File → New → Target
2. Vælg **watchOS** → **App**
3. Product Name: `HavorredWatch`
4. Bundle Identifier: `dk.havoerred.logbog.watchkitapp`
5. Language: Swift
6. User Interface: SwiftUI
7. Klik **Finish**
8. Når Xcode spørger "Activate scheme?": Ja

### 3.3 Erstat genererede filer
Slet de auto-genererede Swift-filer i `HavorredWatch Watch App/` og kopier vores filer ind:
```bash
# Fra projektrod:
cp ios/watch-source/*.swift "ios/HavorredWatch Watch App/"
```
(watch-source filerne er dem fra Fase 2)

### 3.4 Konfigurer build settings i Xcode
1. Vælg `HavorredWatch Watch App` target
2. **General**:
   - Display Name: `Havørred Logbog`
   - Bundle ID: `dk.havoerred.logbog.watchkitapp`
   - Deployment Target: watchOS 10.0
3. **Signing & Capabilities**:
   - Team: (dit Apple Developer team)
   - Signing: Automatic
4. **Build Settings**:
   - `SWIFT_VERSION`: 5.0
   - `SKIP_INSTALL`: YES

### 3.5 Verificer embed
1. Vælg hovedapp-target (`SeaTroutLog`)
2. **General** → **Frameworks, Libraries, and Embedded Content**
3. Bekræft at `HavorredWatch Watch App` er listet med "Embed & Sign"

### 3.6 Byg og test lokalt
1. Vælg `HavorredWatch Watch App` scheme
2. Vælg Apple Watch simulator
3. Cmd+R for at bygge og køre

---

## Fase 4: Commit og EAS Build

### 4.1 Commit ændringer
```bash
git add ios/
git add lib/watchBridge.ts
git add lib/tripUtils.ts  # FishEventCondition udvidelse
git add lib/i18n/translations.ts
git add app/(tabs)/index.tsx
git commit -m "Add Apple Watch companion app"
```

### 4.2 Byg via EAS
```bash
npx eas build --platform ios --profile production
```

EAS bruger det committede Xcode-projekt inkl. watch target.

---

## Fase 5: Condition Data i Statistik

### 5.1 Udvid patternAnalysis.ts
Tilføj analyse af fisk-condition data:
- % blank vs farvet per sæson/måned
- Havlus-frekvens vs vandtemperatur
- Genudsætningsrate over tid

### 5.2 Tilføj condition-sektion i statistics.tsx
Donut/pie chart: Blank vs Farvet fordeling
Bar chart: Havlus (ingen/få/mange) per måned
Genudsætningsrate

---

## Implementeringsrækkefølge

```
Fase 0: Prebuild + commit ios/          (~30 min)
Fase 1: TypeScript-lag                   (~2-3 timer)
  1.1 FishEventCondition type
  1.2 watchBridge.ts
  1.3 Condition picker modal
  1.4 Watch-integration i tracking
  1.5 Watch-indikator i dashboard
  1.6 i18n
  1.7 npm install
Fase 2: Swift watchOS app filer         (~1-2 timer, jeg skriver dem)
Fase 3: Xcode target setup              (~15 min, du gør det manuelt i Xcode)
Fase 4: Commit + build                  (~15 min)
Fase 5: Condition statistik             (~1-2 timer)
```

## Dependencies

```bash
npm install react-native-watch-connectivity
```

## Filer der oprettes
| Fil | Formål |
|-----|--------|
| `lib/watchBridge.ts` | TS wrapper for watch-kommunikation |
| `types/watch.ts` | WatchTripStatus type |
| `ios/HavorredWatch Watch App/HavorredWatchApp.swift` | Watch app entry |
| `ios/HavorredWatch Watch App/ContentView.swift` | Idle/active router |
| `ios/HavorredWatch Watch App/ActiveTripView.swift` | Trip dashboard + FISK! |
| `ios/HavorredWatch Watch App/ConditionPickerView.swift` | Blank/farvet/havlus |
| `ios/HavorredWatch Watch App/WatchSessionManager.swift` | WCSession singleton |

## Filer der modificeres
| Fil | Ændring |
|-----|---------|
| `lib/tripUtils.ts` | FishEventCondition type, parseFishEvents udvidelse |
| `lib/trips.ts` | saveTrip med condition data |
| `app/(tabs)/index.tsx` | Watch-integration, condition picker |
| `shared/components/BentoTrackingDashboard.tsx` | Watch-indikator |
| `lib/i18n/translations.ts` | Watch + condition nøgler |
| `.gitignore` | Tillad ios/ commit |
| `package.json` | react-native-watch-connectivity dependency |

## Kritisk: Hvad DU skal gøre manuelt
1. `npx expo prebuild --platform ios --clean` (generér Xcode-projekt)
2. Åbn Xcode → File → New → Target → watchOS App (opretter target med korrekt signing)
3. Kopier Swift-filer ind i watch target
4. Test på simulator
5. Commit og byg

Alt andet (TypeScript, Swift-filer, i18n) skriver jeg.
