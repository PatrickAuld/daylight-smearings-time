# Smeared Alarm — Mobile Application Design

**A product of the Institute for Temporal Continuity**
Design dossier · Bulletin No. 14-A · Status: proposed

---

## 0. Mandate

The Institute maintains the authoritative smeared civil timebase. The public has
asked for a single, sanctioned way to be woken by it. This document specifies
**Smeared Alarm**, a mobile application for iOS and Android whose entire purpose
is to schedule alarms in **Daylight Smearings Time (DST)** and to display that
timebase continuously by way of a home-screen widget.

There is one rule from which the rest of the design follows, and it is not
negotiable:

> **Every alarm conforms to Daylight Smearings Time. There is no standard-time mode,
> no toggle, and no opt-out.** A time entered into this application is a *smeared*
> time, and it will be honoured in the smeared timebase.

This is the same posture as the campaign site: the application never winks. It is
an ordinary, competent alarm clock that happens to keep the only correct time.

---

## 1. Why this is not a normal alarm clock

A normal alarm clock and the operating system beneath it agree on what "07:00"
means: the next wall-clock instant whose display reads 07:00. Smeared Alarm cannot
make that assumption, because during a smear window the displayed (smeared) time and
the device's wall-clock time disagree by up to one hour.

The smear model (see the campaign site's `src/scripts/smear.js`, which this app
reuses verbatim) administers the annual one-hour change **linearly over the 14 days
ending at the legacy U.S. transition instant** (2nd Sunday of March, 1st Sunday of
November, 02:00 local). For an instant `r` of real wall-clock time:

```
smeared(r) = r + divergence(r)
divergence(r) = direction × fraction(r) × 3,600,000 ms     (during a smear)
divergence(r) = 0                                           (otherwise)
```

`smeared(r)` is **strictly monotonically increasing** — the smear only ever adds or
removes time at a rate of ±2.98 ms/s, never enough to stall or reverse the clock — so
the function is invertible. That invertibility is the whole engineering premise of the
alarm engine.

### The core problem

The phone's alarm subsystem (`AlarmManager` on Android, `UNUserNotificationCenter` /
`UNCalendarNotificationTrigger` on iOS) fires at **real wall-clock instants**. The
user, however, has expressed a desire in **smeared time**. So for a target smeared
time `T`, the app must schedule the OS alarm at the real instant `r` such that:

```
smeared(r) = T          →          solve r = smeared⁻¹(T)
```

During a fall smear the smeared clock runs *slow* (it is behind real time), so smeared
07:00 occurs at a real instant *later* than 07:00 wall-clock. During a spring smear the
smeared clock runs *fast*, so smeared 07:00 occurs *earlier* than 07:00 wall-clock. The
maximum displacement is one hour, reached at the legacy transition instant where the two
timebases re-converge.

**Naïve implementations get this exactly backwards** by scheduling on wall-clock time and
then "displaying" smeared time cosmetically. Smeared Alarm schedules on the inverse map so
that the bell rings when the smeared clock actually reads the requested time.

---

## 2. The timebase engine (shared core)

The app ships the same model as the website, promoted to the single source of truth. We
add one function — the inverse — and a scheduling resolver.

```ts
// smear-core.ts  (TypeScript port of src/scripts/smear.js, plus the inverse)

const HOUR = 3_600_000, DAY = 86_400_000, SMEAR = 14 * DAY;

// Forward map: real instant -> { active, frac, divergenceMs, next }
function smearState(now: Date): SmearState { /* identical to smear.js */ }

// Inverse map: a desired SMEARED instant -> the REAL instant to schedule.
// Closed-form because the smear is piecewise-linear in r:
//   smeared = r + dir * ((r - start)/SMEAR) * HOUR
//   solve for r:  r = (T - dir*HOUR*(-start/SMEAR)) / (1 + dir*HOUR/SMEAR)
function realInstantForSmeared(targetSmeared: Date): Date {
  // 1. Find which window (stable | spring-smear | fall-smear) T lands in
  //    by evaluating the forward map at the window boundaries (smeared values
  //    of window edges are themselves monotonic, so a window lookup is O(1)).
  // 2. In a stable window, r = T (divergence is zero).
  // 3. In a smear window, apply the closed-form solution above and clamp to
  //    the window so floating-point error never leaks across a boundary.
}
```

Notes that matter:

- The slope factor `1 + dir·HOUR/SMEAR` differs from 1 by only ~2.98×10⁻³, but the
  accumulated offset over 14 days is a full hour, so the inverse must be computed in
  full precision, not approximated.
- **Boundary crossings are real alarms.** If a user sets an alarm for a smeared time that
  falls inside a smear window, the corresponding real instant moves day-by-day relative to
  wall clock. We never trust a precomputed real instant for longer than necessary (see §4).

---

## 3. Information architecture & screens

Five surfaces. Everything is in the smeared timebase; the legacy time is shown only as a
muted secondary readout, never as something you can set.

```
┌─ Alarms (home) ─────────┐  ┌─ Edit alarm ───────────┐  ┌─ Smeared clock ────────┐
│  OFFICIAL SMEARED TIME  │  │  ◷  Smeared time wheel  │  │   analog + digital     │
│       06:58:21          │  │     07 : 00             │  │   divergence readout   │
│  ─────────────────────  │  │  Repeat  M T W T F · ·  │  │   smear progress bar   │
│  ◷ 07:00  Weekdays   ●  │  │  Label   "Wake"         │  │   "SMEAR IN PROGRESS"  │
│  ◷ 09:30  Sat/Sun    ○  │  │  Sound   Dawn Chime     │  │                        │
│  ◷ 14:00  "Standup"  ●  │  │  ─────────────────────  │  │  (mirrors /clock page) │
│                         │  │  Fires in real time at: │  │                        │
│       [ + Add ]         │  │  06:43 wall (−17 min)   │  │                        │
└─────────────────────────┘  └────────────────────────┘  └────────────────────────┘

┌─ Ring screen ───────────┐  ┌─ Settings ─────────────┐
│   SMEARED 07:00         │  │  Timebase ……… Smeared   │  ← read-only. The control
│   ◷  Wake               │  │             (mandatory) │     exists only to state,
│   [ Snooze ]  [ Stop ]  │  │  Show legacy time  ▢    │     deadpan, that there is
│   legacy 06:43          │  │  Widget theme  Ink/Gold │     no other option.
└─────────────────────────┘  └────────────────────────┘
```

### 3.1 Alarms (home)
- Masthead is a live smeared clock (the §02 readout from the site, ticking at 100 ms).
- Each row shows the **smeared** time the alarm will ring, its repeat schedule, label,
  and an enable toggle.
- A subtle per-row annotation appears **only during an active smear**: e.g. `rings 17 min
  early today` (spring) or `17 min late today` (fall), so the user is never surprised that
  the bell and the wall clock disagree. This is the one place we explain the mechanism, and
  we do it factually, without apology.

### 3.2 Edit alarm
- Time is chosen on a wheel labelled **Smeared time**. There is no AM/PM ambiguity beyond
  the platform norm.
- A live helper line resolves the entry through `realInstantForSmeared(...)` and shows the
  real wall-clock instant the OS alarm will be set for, with the signed divergence. During a
  stable window it simply reads `Fires at 07:00 (no divergence today)`.

### 3.3 Smeared clock
- A full instrument view that reuses the `/clock` page design: large monospace digital
  readout, the analog face from §5, plus the `Divergence`, `Smear rate`, `Next smear event`,
  and `Smear progress` readouts. This is the same content the widget renders, full-screen.

### 3.4 Ring screen
- Standard snooze/stop. Snooze is computed in **smeared** minutes and re-resolved to a real
  instant on dismissal (snoozing across a midnight-into-smear edge therefore stays honest).

### 3.5 Settings
- **Timebase: Smeared (mandatory)** — rendered as a disabled control whose caption reads
  *"All alarms conform to Daylight Smearings Time."* It is deadpan, not a bug.
- `Show legacy time` toggles the muted secondary wall-clock readouts.
- Widget theme: **Ink** (paper/navy, matches home) or **Gold** (navy/dawn, matches `/clock`).

---

## 4. Alarm scheduling & lifecycle

The hard requirements: alarms must fire at the correct *smeared* moment, survive reboots,
survive smear-boundary crossings, and survive aggressive battery management.

### 4.1 Scheduling algorithm
For each enabled alarm occurrence:
1. Compute the next **smeared** occurrence `T` from the alarm's local time + repeat rule
   (smeared calendar arithmetic — the date shown to the user is the smeared date).
2. `r = realInstantForSmeared(T)`.
3. Register an exact OS alarm at `r`.
4. Persist `{alarmId, T, r, windowVersion}` so we can detect drift.

### 4.2 Why we re-resolve daily ("the resolver heartbeat")
Inside a smear window the real instant for a fixed smeared time **shifts every day** (the
divergence ramps linearly). A repeating 07:00 alarm therefore needs a *different* `r` each
morning of the 14-day smear. We do **not** schedule 14 days out and forget; instead:

- A daily background tick (Android `WorkManager` periodic worker around local midnight; iOS
  `BGAppRefreshTask` plus opportunistic refresh on app foreground) recomputes `r` for every
  occurrence within the next ~36 hours and rebinds the OS alarms if `r` moved by more than a
  tolerance (1 s).
- We always keep the **next** occurrence scheduled exactly, even if later ones are only
  approximately bound; the heartbeat tightens them as they approach.

### 4.3 Robustness
- **Reboot / time change:** re-run the full scheduler on `BOOT_COMPLETED` (Android) and on
  launch/significant-time-change (iOS). Wall-clock changes by the user or network invalidate
  every cached `r`, so we discard and recompute.
- **Doze / App Standby (Android):** use `setExactAndAllowWhileIdle` (and request
  `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` — an alarm clock is the textbook sanctioned use,
  and `AlarmManager.setAlarmClock` also surfaces the next alarm to the system UI).
- **iOS background limits:** iOS will not run arbitrary code to "fire" an alarm, so the bell
  is a pre-scheduled local notification with a critical/time-sensitive interruption level and
  a custom sound. We pre-schedule the resolved real instant as a `UNCalendarNotificationTrigger`
  and refresh on every foreground and background-refresh opportunity.
- **The legacy transition instant:** at the moment the smear completes, divergence returns to
  zero. Occurrences straddling that instant are resolved on the correct side of the boundary
  by the clamp in `realInstantForSmeared`. We add a unit test fixture per transition.

### 4.4 Correctness tests (non-negotiable)
- Round-trip: `smeared(realInstantForSmeared(T)) == T` to <1 ms across stable windows, both
  smear directions, and both boundaries.
- A 07:00 daily alarm across a full spring smear fires at a monotonically *earlier* wall time
  each day; across a fall smear, monotonically *later*; at ±0 outside the window.
- Snooze of N smeared-minutes lands at `smeared(r') == T + N·60_000`.

---

## 5. The widget (digital **and** analog), iOS and Android

A home-screen widget is a hard requirement and it must show **both** a digital and an analog
clock, both in smeared time, on both platforms.

### 5.1 Shared visual spec
- **Analog face:** the Institute emblem made functional — the existing `ClockMark` dial, with
  three hands. The minute and hour hands are solid ink/gold; the **second hand carries the
  dawn-orange motion-blur trail** from `ClockMark.astro` (three stepped strokes at opacity
  1 / .45 / .22). The trail is not decoration here: it visually encodes that the hand sweeps at
  the smeared rate (1.00298× during a smear), and the trail lengthens slightly while a smear is
  active.
- **Digital readout:** `HH:MM` (and `:SS` on larger sizes) in IBM Plex Mono, tabular figures,
  matching the `/clock` page.
- **Status chip:** a one-line state — `STABLE`, or `SMEAR ·  63%` with the dawn dot — plus the
  signed divergence (`−17:24`) on medium/large sizes.
- **Themes:** *Ink* (paper `#F6F0E2` ground, navy hands) and *Gold* (navy ground, gold dial,
  dawn trail), reusing the tokens in `src/styles/global.css`.

```
 small (analog only)      medium (analog + digital)        large (full instrument)
 ┌───────────┐            ┌───────────────────────┐        ┌───────────────────────┐
 │    ◷       │           │   ◷        06:58       │        │   ◷         06:58:21   │
 │   ·trail·  │           │  ·trail·   SMEAR 63%   │        │  ·trail·    SMEAR 63%  │
 │            │           │            −17:24      │        │  divergence −17:24     │
 └───────────┘            └───────────────────────┘        │  rate 2.98 ms/s        │
                                                            │  [■■■■■■■□□□] 63%      │
                                                            └───────────────────────┘
```

### 5.2 The platform reality of "ticking" widgets
Neither platform lets a home-screen widget run a 1 Hz timeline cheaply, so we lean on the
**native self-updating clock primitives** for smoothness and reserve our own refresh budget
for the *smeared* parts:

**iOS — WidgetKit (SwiftUI), `WidgetKit` + `Text(timeline:)` / `Text(date, style:)`**
- The OS can auto-tick a `Text` date view without waking our process. But it ticks *real*
  time, and we need *smeared* time. Two-layer approach:
  - **Analog hands** are drawn in `Canvas` driven by `TimelineProvider` entries. We emit a
    timeline whose entries are spaced by **smeared** seconds — i.e. we precompute, for the next
    timeline horizon, the real instants at which the smeared display should advance, and hand
    WidgetKit those dates. Because the smear rate is constant within a window, this is a simple
    affine warp of a uniform timeline; entries are cheap and exact.
  - **Digital `HH:MM`** uses a per-minute timeline (smeared-minute boundaries mapped to real
    instants), well within WidgetKit's refresh budget.
  - **Live Activity / `WidgetKit` `.accessoryCircular`** variants supported for Lock Screen and
    StandBy, same engine.
- The widget extension links the shared `smear-core` so it never needs the host app running.

**Android — `AppWidgetProvider` + Glance (Jetpack Compose for widgets), with `AnalogClock`
caveats**
- The legacy `AnalogClock`/`TextClock` system widgets tick automatically but only in device
  time, so they can't show smeared time — we draw our own.
- **Analog face** renders to a `Bitmap`/`RemoteViews` (or Glance `Canvas`), updated by a
  `WorkManager`/`AlarmManager` tick. To stay within the ~30 min default widget update floor *and*
  still appear to move, we update the visible hands on a coarse cadence (per smeared minute for the
  minute hand) and let the second hand animate only while the screen is interactive (a foreground
  `RemoteViews` refresh on `ACTION_SCREEN_ON`, throttled). Battery-honest, not jittery.
- **Digital readout** uses `TextClock` *only* outside smear windows (where smeared == device
  time); inside a smear window we substitute our computed string and refresh per smeared minute.
- The same `smear-core` (shared module / KMP) computes everything; the widget never depends on a
  running activity.

### 5.3 Widget data path
A single `WidgetState` struct — `{ smearedNowMs, divergenceMs, frac, active, nextEventLabel }` —
is computed by `smear-core` and cached in App Group (iOS) / shared `DataStore` (Android) so widget,
app, and alarm scheduler all read one consistent value.

---

## 6. Notifications & copy

In-voice, deadpan, factual. The bell's notification body states the smeared time and, if a smear
is active, why the wall clock disagrees — never apologising for it.

- Ring (stable): **"Smeared 07:00."** · *"Daylight Smearings Time. On schedule."*
- Ring (spring smear): **"Smeared 07:00."** · *"17 minutes ahead of legacy clocks. They will come
  around."* (echoes the site's `/clock` status line)
- Ring (fall smear): **"Smeared 07:00."** · *"17 minutes behind legacy clocks. Administered without
  incident."*
- Pre-smear FYI (optional, once per window): *"A smear begins tonight. Your alarms will continue to
  ring at the times you set. Their position against legacy clocks will drift by design."*

---

## 7. Visual design system

Reuse the campaign tokens directly so the app, widget, and site are visibly one institution.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F6F0E2` | Ink-theme ground |
| `--ink` / `--ink-soft` | `#1E2A38` / `#46566A` | Ink-theme hands, text |
| `--navy` / `--navy-deep` | `#101D2C` / `#0A141F` | Gold-theme ground (the `/clock` sky) |
| `--dawn` / `--dawn-bright` | `#E0662A` / `#F08A3C` | The second-hand trail, the active-smear dot |
| `--gold` | `#C99A3F` | Gold-theme dial, plaque labels |
| `--jump-red` | `#B5472F` | Reserved: the legacy "jump" (never used for smeared UI) |

- **Type:** Fraunces (display), Public Sans (UI), IBM Plex Mono (all time readouts, tabular).
- **Motion:** honour reduced-motion — the trail becomes a static three-stroke fan and the second
  hand steps rather than sweeps (mirrors the site's `prefers-reduced-motion` rule).
- **Iconography:** the `ClockMark` emblem is the app icon, sized per platform; trail always
  dawn-orange regardless of theme, per the component's contract.

---

## 8. Platform & tech recommendation

- **Shared core (`smear-core`):** the timebase + inverse + scheduler resolver. Recommend
  **Kotlin Multiplatform** so iOS, Android, and their widget extensions link one tested module;
  it is small, pure, and deterministic, which is exactly what must not fork between platforms.
- **iOS:** Swift / SwiftUI app, WidgetKit extension, `UNUserNotificationCenter` for the bell,
  App Group for shared state. (If KMP is undesired, port `smear-core` to Swift behind the same
  test vectors.)
- **Android:** Kotlin app, Glance/`AppWidgetProvider` widget, `AlarmManager.setAlarmClock` +
  `setExactAndAllowWhileIdle`, `WorkManager` heartbeat, `DataStore` shared state.
- **Why not cross-platform UI (Flutter/RN):** the make-or-break work is exact background alarms
  and native home-screen widgets with custom drawing — both are deeply platform-native. The logic
  is shared; the surfaces are native.

---

## 9. Privacy, telemetry, non-goals

- **Privacy:** alarms, labels, and timebase math are entirely on-device. No account, no clock
  data leaves the phone. The only network use is optional: fetching the Institute's published
  transition table to confirm the legacy dates (and even that is computed locally by default).
- **Telemetry:** none beyond crash reporting, opt-in.
- **Non-goals:** world clocks, timers, stopwatch, standard-time mode. This application keeps one
  kind of time and rings one kind of bell.

---

## 10. Open questions

1. **Time zones / DST elsewhere:** the smear model is defined against the legacy U.S. transition
   instants. For users in other DST regimes, do we (a) smear against their local legacy transition,
   or (b) hold the U.S. transition as the canonical Institute event? *Recommendation: (a) — smear
   against the user's own legacy transition so re-convergence still lands on their wall clock — but
   this needs a transition table per region.*
2. **Critical-alert entitlement (iOS):** request the critical-notification entitlement so alarms
   sound through silent mode / DND, or accept time-sensitive level? *Recommendation: pursue the
   entitlement; an alarm clock is its intended use.*
3. **Widget second-hand on Android:** accept that the sweeping second hand only animates while the
   screen is on (battery-honest), or ship a "lite" face without a second hand by default?
4. **Snooze across the legacy transition instant** is the one place smeared minutes and the bell
   can land within a sub-second of the convergence; confirm the clamp + test fixture cover it.

---

*This dossier reuses the smear model in `src/scripts/smear.js`, the emblem in
`src/components/ClockMark.astro`, and the tokens in `src/styles/global.css` without modification.
The application keeps the only correct time. It is the Institute's position that it always has.*
