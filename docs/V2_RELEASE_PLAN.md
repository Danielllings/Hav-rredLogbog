# v2.0 Release Plan — Havørred Logbog

## Implementation Order

**Feature 4 (Season Goals) → Feature 2 (Catch Heatmap) → Feature 1 (Home Screen Widget) → Feature 3 (Apple Watch)**

Rationale:
1. **Feature 4** is purely in-app, no native modules, lowest risk, highest polish-per-effort.
2. **Feature 2** is in-app, leverages existing `Heatmap` in react-native-maps 1.20.1. Moderate complexity.
3. **Feature 1** requires native modules (iOS WidgetKit + Android widget). Higher complexity but self-contained.
4. **Feature 3** requires a native Swift watchOS target with WatchConnectivity bridge. Most complex.

No cross-dependencies between features except: Feature 3 extends `fish_events_json` with condition data.

---

## FEATURE 4: Season Goals

### Data Model

**New Firestore collection**: `users/{userId}/goals/{goalId}`

```typescript
// types/goals.ts

export type GoalType =
  | "fish_count"       // Total fish count
  | "fish_size"        // Catch a fish over X cm
  | "fish_weight"      // Catch a fish over X kg
  | "trip_count"       // Number of trips
  | "hours_fished"     // Total hours fished
  | "spot_diversity"   // Fish from X different spots
  | "catch_rate";      // Maintain catch rate above X%

export type GoalStatus = "active" | "completed" | "expired";

export type SeasonGoal = {
  id: string;
  userId: string;
  type: GoalType;
  targetValue: number;
  currentValue: number;         // Cached, computed on read
  seasonYear: number;           // e.g. 2026
  seasonStart: string;          // ISO date, default Jan 1
  seasonEnd: string;            // ISO date, default Dec 31
  status: GoalStatus;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Progress computed live from existing trips/catches/spots data. No new queries needed — reuse data already loaded on statistics screen.

### Files to Create

1. **`types/goals.ts`** — Type definitions as above.

2. **`lib/goals.ts`** — Firestore CRUD + progress computation.
   - `createGoal(input)`: Follow `getUserCollectionRef("goals")` pattern from `lib/trips.ts`.
   - `updateGoal(id, patch)`: Partial update.
   - `deleteGoal(id)`: Delete document.
   - `listGoals(seasonYear?)`: Query by seasonYear field.
   - `computeGoalProgress(goal, stats, trips, catches, spots): number` — Pure function:
     - `fish_count`: `stats.total_fish`
     - `fish_size`: max `length_cm` across catches in year, show as percentage of target
     - `fish_weight`: max `weight_kg` across catches in year
     - `trip_count`: `stats.trips`
     - `hours_fished`: `stats.total_sec / 3600`
     - `spot_diversity`: count unique `spot_id` values across trips in year
     - `catch_rate`: `stats.fangstrate`
   - `getGoalLabel(goal, t)`: Localized label e.g. "50 fisk i 2026".
   - `getGoalProgressLabel(goal, t)`: e.g. "23/50 fisk".
   - Validate no duplicate goal types per season in `createGoal`.

3. **`components/statistics/SeasonGoalsSection.tsx`** — Main display component.
   - Props: `{ goals, onAddGoal, onEditGoal, onDeleteGoal, year, t, language }`
   - **Empty state**: "Du har ikke sat nogen mål for den nuværende sæson" + "Sæt mål" button.
   - **With goals**: Each goal in a GlassCard with icon (based on type), label, MiniActivityRing or linear progress bar, current/target values.
   - Celebration animation: `withSequence(withSpring(1.1), withSpring(1))` scale + ring color -> green (#22C55E) when `status === "completed"` and `completedAt` is within last 5 seconds.
   - Use `FadeInDown` entering animation like existing `PatternCell`.

4. **`components/statistics/GoalEditorModal.tsx`** — Create/edit modal.
   - Goal type picker: horizontal ScrollView of chips (follow pattern in statistics.tsx line 946-970).
   - Target value input: numeric TextInput.
   - Season year selector.
   - Save/Cancel buttons.
   - Dark styling from APPLE theme constants.

### Files to Modify

1. **`app/(tabs)/statistics.tsx`**
   - Add imports for new components and `lib/goals.ts`.
   - Add state: `goals`, `showGoalEditor`, `editingGoal`.
   - In `loadData()`: add `listGoals(year)` to Promise.all at line 633.
   - After loading: compute progress for each goal via `computeGoalProgress`.
   - **Insert `<SeasonGoalsSection>`** between QuickStatsGrid (ends ~line 820) and Spot Performance (starts ~line 823).
   - Add `<GoalEditorModal>` at end of ScrollView.
   - On goal completion: if `currentValue >= targetValue && status !== "completed"`, call `updateGoal(id, { status: "completed", completedAt: new Date().toISOString() })`.

2. **`components/statistics/index.ts`** — Add export for `SeasonGoalsSection`.

3. **`lib/i18n/translations.ts`** — Add keys (both da and en):
   - `seasonGoals` / "Sæsonmål" / "Season Goals"
   - `noGoalsSet` / "Du har ikke sat nogen mål for den nuværende sæson" / "You haven't set any goals for the current season"
   - `setGoals` / "Sæt mål" / "Set Goals"
   - `addGoal` / "Tilføj mål" / "Add Goal"
   - `editGoal` / "Rediger mål" / "Edit Goal"
   - `deleteGoal` / "Slet mål" / "Delete Goal"
   - `goalFishCount` / "Antal fisk" / "Fish Count"
   - `goalFishSize` / "Fiskestørrelse" / "Fish Size"
   - `goalFishWeight` / "Fiskevægt" / "Fish Weight"
   - `goalTripCount` / "Antal ture" / "Trip Count"
   - `goalHoursFished` / "Timer fisket" / "Hours Fished"
   - `goalSpotDiversity` / "Spot diversitet" / "Spot Diversity"
   - `goalCatchRate` / "Fangstrate" / "Catch Rate"
   - `goalCompleted` / "Mål nået!" / "Goal Reached!"
   - `goalTarget` / "Mål" / "Target"
   - `goalProgress` / "Fremskridt" / "Progress"
   - `fishInYear` / "fisk i {year}" / "fish in {year}"
   - `fishOverCm` / "Fang en fisk over {value} cm" / "Catch a fish over {value} cm"
   - `fishOverKg` / "Fang en fisk over {value} kg" / "Catch a fish over {value} kg"
   - `tripsTarget` / "Tag på {value} ture" / "Go on {value} trips"
   - `hoursTarget` / "Fisk {value} timer" / "Fish {value} hours"
   - `spotsTarget` / "Fisk fra {value} spots" / "Fish from {value} spots"
   - `catchRateTarget` / "Hold fangstrate over {value}%" / "Keep catch rate above {value}%"

### Dependencies

None required. All libraries already present.

### Edge Cases

- Empty goals list → show empty state, not crash
- Season boundary: filter goals by `seasonYear` matching selected year in statistics
- Progress is read-heavy: `computeGoalProgress` receives pre-loaded data, no own queries
- Catch rate goal: completed once it hits target, stays "completed" even if rate drops
- Duplicate prevention: validate no two goals of same type per season
- Size/weight goals (binary): show best-so-far as percentage (e.g. "42/60 cm" = 70%)

### Testing

- Unit test `computeGoalProgress` for each goal type in `lib/__tests__/goals.test.ts`
- Unit test `getGoalLabel` and `getGoalProgressLabel` for DA/EN
- Snapshot test for empty state and with goals

---

## FEATURE 2: Personal Catch Heatmap

### Data Model

**No Firestore changes.** Uses existing `catches` (lat/lng) and `trips` (fish_events_json + path_json).

**New utility function** in `lib/tripUtils.ts`:
```typescript
export function getFishEventPositions(trip: {
  fish_events_json?: string | null;
  path_json?: string | null;
}): { lat: number; lng: number; ts: number }[]
```
Correlates fish event timestamps with closest GPS point in path_json (within 5 min tolerance).

### Files to Create

1. **`lib/heatmapData.ts`** — Data preparation.
   - `buildHeatmapPoints(trips, catches, filter): WeightedLatLng[]`
   - `type HeatmapFilter = { dateRange: "season" | "allTime" | "custom"; startDate?: string; endDate?: string; year?: number }`
   - Merges catches (direct lat/lng) + trips (fish event positions via `getFishEventPositions`).
   - Dedup: if catch has `trip_id` matching a trip and times overlap within 60s, skip trip event.
   - Each point gets `weight: 1`, natural clustering handles intensity.

### Files to Modify

1. **`lib/tripUtils.ts`** — Add `getFishEventPositions()`:
   - Parse `fish_events_json` for timestamps.
   - Parse `path_json` for `[{lat, lng, t}]` (handle field name variants: `lat`/`latitude`, `lng`/`longitude`, `t`/`timestamp`/`time`).
   - For each fish event, find closest path point by timestamp. Accept only if within 5 min.

2. **`app/(tabs)/spot-weather.tsx`** — Primary modification target:
   - Add imports: `Heatmap` from `react-native-maps`, `buildHeatmapPoints` from `lib/heatmapData`, `listCatches` from `lib/catches`, `listTrips` from `lib/trips`.
   - Add state (~line 480 alongside existing overlay states):
     - `showCatchHeatmap: boolean` (default false)
     - `heatmapPoints: WeightedLatLng[]` (default [])
     - `heatmapFilter: "season" | "allTime"` (default "allTime")
   - **Lazy load**: only fetch data when heatmap toggled on.
   - **Layers dropdown** (~line 1297-1311): Add new `<Pressable>` row with fire icon, label "Fangster" / "Catches".
   - **Render heatmap** inside `<MapView>` after markers (~line 1187):
     ```tsx
     {showCatchHeatmap && heatmapPoints.length > 0 && (
       <Heatmap
         points={heatmapPoints}
         radius={30}
         opacity={0.7}
         gradient={{
           colors: ["#3B82F6", "#F59E0B", "#EF4444"],
           startPoints: [0.1, 0.5, 1.0],
           colorMapSize: 256,
         }}
       />
     )}
     ```
   - Add filter chip row (season/all time) below layers dropdown when heatmap active.

3. **`lib/i18n/translations.ts`** — Add keys:
   - `catchHeatmap` / "Fangstkort" / "Catch Heatmap"
   - `heatmapThisSeason` / "Denne sæson" / "This Season"
   - `heatmapAllTime` / "Al tid" / "All Time"
   - `heatmapLoading` / "Indlæser fangstdata..." / "Loading catch data..."

### Dependencies

None. `react-native-maps` 1.20.1 includes `Heatmap` support (confirmed: `MapHeatmap.d.ts` exists). Works with `PROVIDER_GOOGLE` only — already configured in app.

### Edge Cases

- **Catches without GPS**: Filter out `lat: null, lng: null` silently
- **Fish events without path_json**: Skip, no way to geo-locate
- **Performance**: Large datasets (hundreds of catches) — cache with `useMemo`, `Heatmap` component handles native viewport clipping
- **Privacy**: Only current user's data via `getUserCollectionRef`
- **Date filtering**: "This season" = current calendar year

### Testing

- Unit test `getFishEventPositions` with mock trip data
- Unit test `buildHeatmapPoints` including edge cases (no GPS, no path, overlaps)
- Manual visual test on iOS + Android with real data

---

## FEATURE 1: iOS & Android Home Screen Widget

### Data Model

**New Firestore document**: `users/{userId}/settings/widgetConfig`

```typescript
// types/widget.ts

export type WidgetConfig = {
  favoriteSpotId: string;
  favoriteSpotName: string;
  favoriteSpotLat: number;
  favoriteSpotLng: number;
  updatedAt: string;
};

export type WidgetData = {
  spotName: string;
  waterTempC: number | null;
  windSpeedMS: number | null;
  windDirDeg: number | null;
  windDirLabel: string | null;
  waterLevelCM: number | null;
  catchForecastScore: number;  // 0-100 from forecastMatcher
  updatedAt: string;
};
```

### Architecture: Data Flow

**iOS (WidgetKit)**:
- Expo Config Plugin adds WidgetKit extension target
- Widget extension in Swift/SwiftUI
- App Group (`group.dk.havoerred.logbog`) for data sharing (shared UserDefaults)
- Main app writes weather data → shared container → widget reads it
- `TimelineProvider` with 30-min refresh

**Android (react-native-android-widget)**:
- React Native bridge for Android App Widgets
- Widget UI defined in React Native, rendered natively
- Data via SharedPreferences

### Files to Create

1. **`types/widget.ts`** — Type definitions.

2. **`lib/widgetData.ts`** — Widget data management.
   - `saveWidgetConfig(config)`: Saves to Firestore + local shared storage.
   - `getWidgetConfig()`: Reads config.
   - `updateWidgetWeatherData()`: Fetches weather for favorite spot using `getSpotForecastEdr()` from `lib/dmi.ts`, computes forecast score via `findBestForecastMatches` from `lib/forecastMatcher.ts`, writes to shared storage.
   - `writeToSharedStorage(data)`: Platform-specific — iOS App Group UserDefaults, Android SharedPreferences.

3. **`plugins/withIOSWidget.js`** — Expo Config Plugin:
   - Adds widget extension target to Xcode project
   - Configures App Groups entitlement on both main app and widget
   - Copies Swift source files into extension target
   - Adds to build phases

4. **`ios/widget/`** — Native iOS widget extension:
   - `FishingWidget.swift` — Main widget struct
   - `FishingWidgetProvider.swift` — TimelineProvider reading from App Group UserDefaults
   - `FishingWidgetView.swift` — SwiftUI view: dark bg (#121212), amber accent (#F59E0B), 2x2 grid showing water temp, wind, tide, forecast score
   - `WidgetBundle.swift` — Entry point
   - `Assets.xcassets/` — Widget icons

5. **`components/widget/FishingWidget.tsx`** — Android widget component (if using react-native-android-widget).

6. **`components/WidgetConfigScreen.tsx`** — UI for favorite spot selection.

### Files to Modify

1. **`app.config.ts`** — Add widget plugin to plugins array, App Groups entitlement for iOS.

2. **`app/(tabs)/settings.tsx`** — Add "Widget" section with "Vælg favoritspot" row. Shows spot picker, saves via `saveWidgetConfig()`.

3. **`app/_layout.tsx`** — In `init()` (~line 93-158) after auth ready, call `updateWidgetWeatherData()` on each app launch.

4. **`lib/weatherAlertScheduler.ts`** — In background fetch, add `updateWidgetWeatherData()` to keep widget data fresh.

5. **`lib/i18n/translations.ts`** — Add keys:
   - `widgetSettings` / "Widget" / "Widget"
   - `chooseFavoriteSpot` / "Vælg favoritspot" / "Choose Favorite Spot"
   - `widgetDescription` / "Vis vejrforhold på din startskærm" / "Show weather conditions on your home screen"
   - `noFavoriteSpot` / "Intet spot valgt" / "No spot selected"

### Dependencies to Install

- `react-native-android-widget` — Android widget support
- For iOS shared storage: custom native module via Config Plugin exposing `UserDefaults(suiteName: "group.dk.havoerred.logbog")`

### Edge Cases

- **No favorite spot**: Widget shows "Tap to configure"
- **No internet**: Show last cached data with "Updated X min ago"
- **App not launched**: iOS WidgetKit has own refresh budget (40-70/day). Timeline provides multiple entries.
- **Expo managed workflow**: Widget requires dev builds, not Expo Go
- **EAS Build**: Config Plugin must correctly add extension. Test with `eas build --platform ios --profile development` first.
- **DMI API rate limiting**: Rate-limit `getSpotForecastEdr()` calls from widget updates.

### Testing

- Manual test on physical iOS device (WidgetKit)
- Android emulator with `react-native-android-widget` preview
- Unit test `updateWidgetWeatherData()` with mocked DMI responses
- Verify App Group data sharing between main app and widget extension

---

## FEATURE 3: Apple Watch Companion App

### Data Model Changes

**Extend fish_events_json** — backward-compatible:

```typescript
// Add to lib/tripUtils.ts

export type FishEventCondition = {
  color?: "blank" | "farvet";              // Silver / Colored
  seaLice?: "ingen" | "faa" | "mange";     // None / Few / Many
  released?: boolean;                       // Catch & release
};

export type FishEvent = {
  ts: number;
  length_cm?: number;
  condition?: FishEventCondition;  // NEW
};
```

Existing events without `condition` remain valid. No migration needed.

### Architecture: Watch-Phone Communication

- Watch app: **native Swift/SwiftUI** watchOS target (no React Native on watchOS)
- Communication: **WatchConnectivity** (`WCSession`)
- Phone → Watch: trip status (duration, distance, catch count, weather)
- Watch → Phone: fish event marks (timestamp + condition data)
- Bridge: native module `WatchConnectivityModule` exposed to React Native

### Files to Create

**watchOS App:**

1. **`ios/watch/HavorredWatch/`** directory:
   - `HavorredWatchApp.swift` — App entry point
   - `ContentView.swift` — Main view: "Ingen aktiv tur" or ActiveTripView
   - `ActiveTripView.swift` — Duration, distance, catch count + big amber "FISK!" button + weather strip
   - `ConditionPickerView.swift` — After "FISK!" tap:
     - Farve: "Blank" / "Farvet" (2 buttons)
     - Havlus: "Ingen" / "Få" / "Mange" (3 buttons)
     - Genudsætning: "Ja" / "Nej" (2 buttons)
     - "Gem" button → sends to phone via WCSession
   - `WeatherView.swift` — Water temp + wind from phone
   - `WatchSessionManager.swift` — WCSession delegate
   - `Models.swift` — Data models matching phone types
   - `Assets.xcassets/` — Watch icon

**Native Bridge (Phone side):**

2. **`ios/Modules/WatchConnectivityModule.swift`** — Native module:
   - `startSession()` — Activates WCSession
   - `sendTripStatus(data)` — Sends to watch
   - `sendWeatherData(data)` — Sends weather
   - `stopTrip()` — Signals trip end
   - Emits events to RN when watch sends fish events

3. **`ios/Modules/WatchConnectivityModule.m`** — ObjC bridge header

**React Native:**

4. **`lib/watchBridge.ts`** — TypeScript wrapper:
   - `startWatchSession(): void`
   - `sendTripStatusToWatch(status): void`
   - `sendWeatherToWatch(weather): void`
   - `onWatchFishEvent(callback): () => void` — Returns unsubscribe
   - `isWatchConnected(): Promise<boolean>`
   - Platform check: no-op on Android

5. **`types/watch.ts`** — TypeScript types for watch communication.

6. **`plugins/withWatchApp.js`** — Expo Config Plugin:
   - Add watchOS app target to Xcode project
   - Bundle ID: `dk.havoerred.logbog.watchkitapp`
   - Add WatchConnectivity.framework to both targets
   - Copy Swift sources into watch target
   - Configure "Embed Watch Content" build phase

### Files to Modify

1. **`lib/tripUtils.ts`**:
   - Add `FishEventCondition` type
   - Extend `FishEvent` type with `condition?`
   - Update `parseFishEvents` to preserve `condition` field

2. **`lib/trips.ts`**:
   - In `saveTrip()` (~line 186-195): extend fish_events_json serialization to include condition:
     ```typescript
     const ev: any = { ts: new Date(ms).toISOString() };
     if (length != null) ev.length_cm = length;
     if (cond) ev.condition = cond;
     ```
   - `saveTrip` input type gets `catch_conditions?: { ts: number; condition: FishEventCondition }[]`

3. **`app/(tabs)/index.tsx`**:
   - Import `watchBridge`
   - Trip start: call `sendTripStatusToWatch()`, subscribe to `onWatchFishEvent()`
   - Tracking timer: periodically `sendTripStatusToWatch()` with updated stats
   - On watch fish event: process as `markCatchNow()` with condition data
   - Trip stop: call `stopTrip()` on watch bridge
   - Weather fetched: call `sendWeatherToWatch()`
   - **Also add condition picker to phone app** after length modal in `markCatchNow()` (~line 1289)

4. **`shared/components/BentoTrackingDashboard.tsx`**:
   - Add watch connection indicator (watch icon + green/red dot)

5. **`app.config.ts`** — Add watch plugin to plugins array.

6. **`lib/i18n/translations.ts`** — Add keys:
   - `blank` / "Blank" / "Silver"
   - `farvet` / "Farvet" / "Colored"
   - `seaLice` / "Havlus" / "Sea Lice"
   - `seaLiceNone` / "Ingen" / "None"
   - `seaLiceFew` / "Få" / "Few"
   - `seaLiceMany` / "Mange" / "Many"
   - `released` / "Genudsætning" / "Released"
   - `releasedYes` / "Ja" / "Yes"
   - `releasedNo` / "Nej" / "No"
   - `fishCondition` / "Tilstand" / "Condition"
   - `watchConnected` / "Ur tilsluttet" / "Watch Connected"
   - `watchDisconnected` / "Ur ikke tilsluttet" / "Watch Disconnected"

### Dependencies

None. Watch app is native Swift. Bridge uses built-in `NativeModules`.

### Edge Cases

- **No Apple Watch**: `WCSession.isSupported() == false` → graceful no-op. `isWatchConnected()` returns false.
- **Android**: `NativeModules.WatchConnectivityModule` will be null. TypeScript wrapper checks platform.
- **Watch out of range**: `sendMessage` fails → use `transferUserInfo` as queue-based fallback.
- **Watch background**: watchOS apps background aggressively → use extended runtime session.
- **Phone in background**: `WCSessionDelegate.session(_:didReceiveMessage:)` wakes the app.
- **Condition is optional**: All downstream code handles `condition` being `undefined`.
- **Bundle ID**: Must be child of main: `dk.havoerred.logbog.watchkitapp`.
- **Config Plugin complexity**: Consider `expo-apple-targets` package as reference.

### Condition Integration with Fiskemønster

After condition data is collected, extend pattern analysis:

- **`lib/patternAnalysis.ts`**: Add analysis by fish condition:
  - % blank vs farvet by season/month
  - Sea lice frequency by water temp
  - Release rate over time
  - New pattern groups: "Condition" section showing distribution

- **`app/(tabs)/statistics.tsx`**: Add condition stats section:
  - Pie/donut chart: Blank vs Farvet distribution
  - Sea lice trend (ingen/få/mange over months)
  - Release rate bar

### Testing

- Real Apple Watch hardware required
- Unit test `parseFishEvents` with condition data
- Unit test `saveTrip` with condition-enriched events
- Manual full flow: start trip → mark catch on watch → verify condition in fish_events_json
- Edge: watch disconnect mid-trip → reconnect → queued events delivered

---

## Cross-Feature Considerations

### Firestore Security Rules

Add to existing rules:
```
match /goals/{goalId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
match /settings/widgetConfig {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### EAS Build

- iOS: New entitlements (App Groups for widget), new targets (widget extension, watch app)
- Android: Widget configuration
- Test with `eas build --profile development` first for each feature

### Performance

- Feature 4: Minimal — one extra Firestore query
- Feature 2: Lazy load heatmap data only when toggled on
- Feature 1: Rate-limit background refresh calls
- Feature 3: Lightweight JSON payloads via WatchConnectivity

### Critical Files (Modified by Multiple Features)

| File | Features |
|------|----------|
| `lib/tripUtils.ts` | Feature 2 + Feature 3 |
| `lib/i18n/translations.ts` | All 4 features |
| `app.config.ts` | Feature 1 + Feature 3 |
| `app/(tabs)/statistics.tsx` | Feature 4 (+ Feature 3 condition stats) |
| `app/(tabs)/spot-weather.tsx` | Feature 2 |
| `app/(tabs)/index.tsx` | Feature 3 |
| `app/(tabs)/settings.tsx` | Feature 1 |
