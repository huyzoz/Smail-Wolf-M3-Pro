# SMAILWOLF M3 Pro — Driver (clean-room remake)

A native Windows desktop driver for the SMAILWOLF M3 Pro mouse (PAW3311,
firmware 2.1.3), rebuilt clean-room from the HID protocol measured on the real
mouse. **Tauri 2 + Rust backend, React frontend.** No kernel driver, no vendor
SDK — the protocol was read out of the official app and reimplemented from
scratch. Windows only.

Design: navy panel `#17172B`, orange `#EA580C` (button `#C2410C`), paper
`#E9E7E2`, Oswald display + Fira Sans body + Fira Code mono, all fonts
self-hosted — the app runs offline.

## Install

Download the latest release from
[duyzoz/Smail-Wolf-M3-Pro](https://github.com/duyzoz/Smail-Wolf-M3-Pro/releases):

- `SMAILWOLF-M3-Pro-Driver_<version>_x64-setup.exe` — NSIS installer.
- `SMAILWOLF-M3-Pro-Driver_<version>_x64.zip` — portable (unzip, run
  `smailwolf-m3-pro-driver.exe`).

The installer is **unsigned** — Windows SmartScreen will warn on first run.
Check the SHA-256 in `SHA256SUMS.txt` before running it. Requires Windows 10/11
(WebView2 ships with Windows 11).

## Run from source

Requires **Node.js 18+** and **Chrome/Edge** (WebHID only exists on Chromium;
the desktop app uses WebView2, which is Chromium-based).

```bash
npm install
npm run dev        # frontend only, http://localhost:5173
npm run tauri dev  # full desktop app
npm run build      # tsc + vite build into dist/
```

Protocol tests (75 tests, using the real mouse's live replies):

```bash
npx tsx tests/hid.test.ts
npx tsx tests/battery.test.ts   # 53 tests, estimated battery model
npx tsx tests/updater.test.ts   # 21 tests, update logic
npx tsx tests/hid-fuzz.test.ts  # 800 fuzz cases, 5 checks
```

## Two modes

| Mode | How to start | What it is for |
|---|---|---|
| **Demo** (simulated, does NOT connect by itself) | "Try Demo" button in the sidebar or the "No mouse connected" card | Test the whole UI without a mouse. The simulated mouse uses Ethan's real live state from 20:59:13 (DPI stage 1 = 1600, polling 125 Hz, sleep 5 minutes, keys Ctrl+V/C) and returns replies in the exact wire format (with real checksums). The app opens in a **Not connected** state — it never pretends to be connected before you grant anything. |
| **Live** (real mouse) | "Connect a real mouse (WebHID)" | Plug in the 2.4G dongle (or the cable), click the button, pick "USB Receiver" in Chrome's dialog. Every write goes to the real mouse and is verified by reading it back. |

## Features (everything here really works)

- **Dashboard** — 4 docks (Current DPI, Polling rate, Battery (estimated),
  Firmware), the mouse stage (click a button on the mouse photo to rebind it),
  67 skins, and the footer ticker.
- **DPI** — edit 6 DPI stages (50–50000, auto-clamped), quick presets
  (Office 1600 / Gaming 3200 / Design 800), pick the current stage, save via
  `setConfig`. Switching a stage glides the slider to it smoothly instead of
  jumping. Preset names are the presets' identity; the stage labels are plain
  Hz numbers.
- **Key Bindings** — remap 6 buttons (mouse / keyboard shortcut with
  Ctrl/Shift/Alt / macro / DPI / empty), save via `setKeys`. The DPI button
  is fixed and cannot be changed — the original app is the same.
- **Performance** — polling 125/250/500/1000 Hz (Hz numbers only, no P1–P4
  tags), sleep 0–100 minutes + Never, scroll direction, line correction.
  Wake-up method has **no switch** because the original app has only one
  option (moving the mouse or clicking wakes it — fixed behavior).
- **Macro** — create/edit macros (record real keys, add wait/click steps),
  stored in localStorage like the original app, written to the mouse via
  `[240,13]` + commit. **Macros cannot be read back from the mouse.**
- **More** — collapsible sections, Battery first, then Firmware, Profiles,
  Settings, Restore, Raw. Battery + Firmware open by default, the rest closed;
  open/closed state persists per section.
  - **Firmware** — shows the app version (`vX.Y.Z-rust`, live, never
    hardcoded), the update block, "View source" (opens the repo) and
    "What's new?" (landscape modal with the full release-notes log).
  - **Settings** — Lite mode (low-end PCs: kills backdrop blur and the
    cursor animations) and autostart on Windows boot (default ON from first
    run; in web dev the switch is locked with a note — it does nothing
    outside the Windows app).
  - **Profiles / Restore / Raw** — save/apply profiles, restore factory
    defaults, export/import JSON, raw reply with checksum.
- **Skins** — 67 skins (Default + 66), real cut-out mouse shapes on a
  virtualized grid (25 cards rendered at rest). The popup preloads all 67
  with a live n/67 counter and a blur-only overlay (never dimmed). Choosing
  a skin is pending until you click Apply.
- **Tray** — closing the main window hides to the tray. Right-click the tray
  icon for the popup: iOS-style battery bar with the % inside, "Open
  interface" / "Quit app".
- **Theme** — dark/light toggle (Uiverse, verbatim CSS). Switching glides
  every color in 0.25s; the toggle disc slides flush to the pill edge, never
  overflowing it.
- **Top bar** — live version tag, three connection-mode icons (Wifi = 2.4G,
  Cable = wired, Bluetooth) with the active one glowing orange, and a bright
  red Disconnect button. In Demo mode a small "DEMO" tag stays visible so a
  simulation is never mistaken for a real mouse.

## Battery (estimated) — v3.1+

The % in the app is an **estimate (simulation), NOT a hardware measurement** —
every battery surface says "estimated". The firmware only reports a raw 100%
until the battery gets low (report 48, byte 7) and the mouse has no fuel-gauge
chip, so the report-48 value is **no longer shown in the UI**; the LED on the
mouse is still the real indicator (steady red = charging, off = full,
flashing = nearly empty).

Model (`src/lib/battery.ts`, pure logic — tested in `tests/battery.test.ts`,
53 tests):

- 500 mAh cell, 400 mAh usable (0.8 efficiency). % = remaining mAh / 400.
- Drain by polling rate: 125 Hz → 3 mA (~133.3 hours), 250 Hz → 5 mA
  (~80 hours), 500 Hz → 8 mA (~50 hours), 1000 Hz → 14 mA (~28.6 hours).
  Ticks every 1 second while connected, using the live polling rate from the
  config; Demo uses the demo rate and assumes drain over 2.4G.
- Charging (cable plugged in, VID 43172): the battery rises at the charge
  current — see the assumption below. **v3.0.9:** the app now detects the
  cable even while connected over the 2.4G dongle — a wired Smailwolf device
  appearing (HID connect event, or in the granted-device list on the 30s
  poll) flips the battery to Charging. The cmd-48 charge_flag byte is
  live-proven always 0, so the cable's presence is the only signal.
- State lives under key `battery-state-v1` (`{ remaining_mah,
  last_polling_rate, updated_at, charging, low_notified, saver }`), saved
  every 10 seconds + on rate/charge change + on app close. **Never resets
  to 100%/0% on restart**: on open, the real time elapsed since
  `updated_at` is applied (drain at the last rate, or charge if the app
  was closed while charging) before showing the %.

**Charge assumption 150 mA (0.3C, full usable charge ~2.7 hours):** the real
charge current was never measured — the firmware does not report charge
current, and the charge flag (report 48 byte 8) stays 0 even while the LED
glows red for charging. 150 mA is a reasonable assumption for a 500 mAh cell
(0.3C); if the real full-charge time is ever measured, change one constant
`CHARGE_MA` in `src/lib/battery.ts`.

**Sleep-aware drain (v3.0.7):** time with the app closed drains at the full
rate only for the first `sleepMinutes` (default 5 — the mouse sleeps after
that), then at 0.05 mA. `sleepMinutes <= 0` (Never) keeps the old behavior.

**Assumption while the app is closed:** if the mouse was charging when the
app closed (`charging: true`), on reopen the app assumes it kept charging at
150 mA the whole closed time (up to 400 mAh). The app cannot know whether
the cable stayed plugged in while it was closed — if it was unplugged, the %
reads high until the drain catches up; that is exactly why everything says
"estimated".

- **Battery saver** (More tab): on = save the current polling + DPI, write
  polling 125 Hz + DPI 1600 to the mouse via `setConfig` (the proven write
  path); off = restore them. While on, the battery bars turn **yellow** (in
  the app + tray popup), like phone battery saver.
- **Low battery:** when the % drops past 20%, a Windows notification fires
  exactly once per discharge cycle — "Your mouse has 20% battery left,
  please charge it". The flag resets when charging starts or the % climbs
  back above 25%.
- **Tray popup** (`?tray=1`, a separate window with no shared store): reads
  the saved state every 1 second and applies elapsed time in memory
  (display only, never writes), so the % keeps moving correctly.

Known limits: this is a simulation, not a measurement — error accumulates
over time (rate changed outside the app, mouse sleeping/background drain,
charging assumption while closed). Absolute accuracy needs a real
charge/discharge current measurement or reading the ADC through custom
firmware (that path is closed — see `../FOT-RE.md`).

## Self-update (silent, in-client) — v3.0.9

When a new version exists, a toast appears on opening the app ("A new update
is available: vX", with the release weekday + time). Clicking **Update**
downloads **silently inside the client** — no CMD window, no curl, no
browser. The Rust backend streams the installer into the
`%LOCALAPPDATA%` cache with reqwest (in-process) and sends progress events
to the frontend, which shows a progress popup with the changelog below the
bar.

When the download finishes, the popup asks: **"Do you want to delete all old
client data?"**

- **Confirm** — the client exits immediately, deletes the old client data
  (settings, battery estimate and saved data), then opens the new installer
  right away.
- **Close** — no update happens; the downloaded installer stays cached in
  `%LOCALAPPDATA%`, so reopening the update later does not re-download it.

If the download fails, the popup shows the error with **Retry** and
**Open on GitHub**. The same flow runs from the toast and from the Update
button in the Firmware section. The installer is unsigned, so SmartScreen
will warn — that is expected.

## Protocol (summary — see `../PROTOCOL.md` for the full spec)

- Transport: WebHID `usagePage 0xFF01, usage 0x10`, 64-byte commands, byte 0
  = Report ID 240, **one command at a time** (serial queue), `readReply`
  timeout 500 ms, `sendReport` timeout 3 s.
- Reads: version `[240,4]`, info `[240,82]`, battery `[240,48,…]` (via the
  status listener), keys `[240,8,…]`, config `[240,14,…]`, status `[240,237]`.
- Write config `[240,15,174,10,47,…]` — **proven live, round-trip matched
  100% (3 runs)**. Write keys `[240,9,165,34,44,…]`. Write macro `[240,13,…]`
  + commit `[240,16,165,34,0,0,0,5]`.
- Reply checksum: byte `[2]` = sum of bytes `[3..63]` mod 256 (correct 9/9
  times live). This app checks it on every read/write.
- Does not exist: LED control (the original app v1.3.2 has no LED control),
  reading macros back from the mouse (report 6 is not writable), firmware
  update.

## Code structure

```
src/
  lib/hid.ts       — protocol port 1:1 (parser, builder, LiveMouse)
  lib/mouse.ts     — DemoMouse (simulated real mouse) + macro/profile localStorage
  lib/battery.ts   — estimated battery: drain by polling, 150 mA charge, loadWithElapsed
  lib/updater.ts   — update check + silent download/finish (v3.0.9)
  lib/tauri.ts     — Tauri bridge: store `battery-state-v1`, autostart, notify, tray
  store.tsx        — 1 backend (demo/live) + shared state, every write verified by re-read
  components/      — TopBar, LeftPanel, MouseStage, SkinPopup, DevicePicker,
                     LoadingScreen, CursorBlob, ThemeToggle, ui primitives
  pages/           — DPI, Keys, Performance, Macro, Others (More)
src-tauri/
  src/main.rs      — window fit, tray, autostart, notifications, silent updater (reqwest)
  src/store.rs     — JSON key/value store (battery-state-v1)
tests/
  hid.test.ts      — 75 protocol tests (npx tsx tests/hid.test.ts)
  battery.test.ts  — 53 estimated-battery tests
  updater.test.ts  — 21 update-logic tests
  hid-fuzz.test.ts — 800 fuzz cases, 5 checks (deterministic seed)
```

## Stack & design sources

- Vite + React 19 + TypeScript + Tailwind CSS v4 + framer-motion + lucide-react.
- Tauri 2 (Rust backend) + WebView2 on Windows.
- Dark glass (glassmorphism) after the Admin Dashboard V2 reference.
- UI/UX rules: `nextlevelbuilder/ui-ux-pro-max-skill` v2.15.0 (119 rules) —
  see `../../design-skills/`.
- Uiverse elements (copied verbatim, only color/size changed): gradient slider
  `bright-swan-54`, glass card `grumpy-mule-23`, spinning border
  `serious-monkey-58` — see `../../design-skills/uiverse-galaxy/INDEX.md`.
  The glass button takes its idea from `modern-bear-96`, but v1.1 dropped its
  2-layer structure (the BG layer offset with z-index:-1 rendered on top of
  the button inside a backdrop-filter card and swallowed clicks) into a
  single-layer button — see "v1.1" below.

## Honest limits (unchanged)

- Key/macro writes to the real mouse are **not proven live yet** (only the
  config write is). Key bindings and macros use the same write path, but
  nobody has pressed the button on the real mouse and confirmed it.
- The battery % is an estimate (see above); the drain test that would
  calibrate it has never been run.
- No LED control. No firmware update (do NOT update to V3.1.2 — the protocol
  was measured on 2.1.3).
- Bluetooth is unreachable through WebHID, so the Bluetooth icon never
  lights up (the original Tauri app is the same — Bluetooth goes through the
  OS Bluetooth stack, not HID).
- Skins only change the mouse picture in the app, not the real mouse shell.
- The update wipe deletes settings and saved data; a few locked WebView2
  profile files may survive it (inert cache — the new install starts with
  fresh settings from the wiped store).

---

## Changelog

## v3.0.13 — View source actually opens the browser (2026-11-20)

Ethan's live verdict on v3.0.12: clicking "View source" showed four error
toasts — "Could not open the browser … Not allowed to open url". That toast
was the v3.0.11 fix working as designed (the old silent failure now reports
its real reason), and the reason pointed straight at the root cause:

1. **Root cause, proven in the plugin source** — `tauri-plugin-opener`
   2.7.3 checks every URL against its scope before opening it
   (`commands.rs:36`, `is_url_allowed`), and returns
   "Not allowed to open url" when nothing matches. The bare
   `opener:allow-open-url` permission carries **no scope of its own**, so
   the allowed list was empty and every URL was denied — including the
   GitHub links from "View source", "What's new?" and the update flow.
2. **Fix** — `src-tauri/capabilities/default.json` now also grants
   `opener:allow-default-urls`, the plugin's own permission whose scope
   allows `mailto:*`, `tel:*`, `http://*` and `https://*` with the default
   application. One line, no code change, no new plugin.

Verified in the sandbox: tsc clean, 154/154 tests. The real open path
proves itself only on Ethan's machine — "View source" should now open
github.com in the default browser instead of showing the toast.

## v3.0.12 — timer audit: one toast exit, sweep pauses when hidden (2026-11-20)

Wave 9 of the 19-wave overhaul — a full audit of every timer in the app,
plus a sweep fix from Ethan's live verdict on v3.0.11 ("xấu", the pill
widened, three labels):

1. **One toast exit** — `addLog` and `pushToast` each carried an identical
   nested timeout pair (4.5s → mark exiting → 250ms → remove), and manual
   dismiss had the second half again. All three now go through one pair of
   helpers (`scheduleToastExit` + `removeToastAfterExit`). Same timings,
   same two-step fade, no duplicated code.
2. **Sweep pauses when hidden** — the connection-cluster sweep cycled
   every ~24s even with the window hidden to tray, re-rendering the top
   bar for a band nobody could see. It now pauses on hide (band back to
   icons) and restarts from the top on show.
3. **Deliberately NOT paused while hidden** — the 1s simulated-battery
   tick and the 30s live-battery poll keep running when the window is
   hidden: the tray popup reads the live battery from them, so stopping
   them would make the tray go stale. The tick's state updates were
   already gated (W5), so its cost while hidden is negligible.
4. **Sweep fixed: one label, frozen frame, 10s chase** — the v3.0.11
   sweep widened the pill (the 3-label row was wider than the icons) and
   showed all three mode names. Now it cycles every 10s, the three bars
   chase each other at constant speed (staggered 0/150/300ms, each 75%
   of the pill), only the active mode shows as one label (blur → sharp),
   and the pill never moves or resizes — the icons stay in flow through
   every phase, the band and label are overlays. (Also fixed while
   here: the cycle timer passed the period as the next start offset, so
   the first repeat landed a full cycle late.)

Verified in the sandbox: tsc clean, 154/154 tests, new hidden-gating
probe 5/5 (no sweep while hidden, resumes on show, mid-sweep hide
resets to idle), sweep probe 7/7 (chase covers all 3 icons, exactly 1
label, pill rect identical in every phase, second cycle ~10s after the
first), W6 probe 13/13, DPI e2e 13/13, reduced-motion probe 3/3.

## v3.0.11 — connection sweep, per-section colours, Firmware last (2026-11-20)

Ethan's order from his v3.0.9 screenshot, in one release:

1. **Connection cluster, alive** — every ~24s the mode pill runs a Color
   Bar Sweep: three trailing bars (violet `#7C3AED` → rose `#F43F5E` →
   orange `#EA580C`, the ui-ux-pro-max gaming palette) glide across and
   cover all three mode icons, then the three modes appear as text —
   "2.4GHz · Ethernet · Bluetooth" — fading in from blur to sharp, the
   active one lit up. Then the band sweeps back the other way and the
   icons return. Transform/opacity only, never blocks a click, static
   under `prefers-reduced-motion`.
2. **More tab, one colour per section** — no longer all the same blue:
   Battery sky, Firmware brand orange, Profiles violet, Settings emerald,
   Restore rose, Raw slate. Same glass look, just a different hue.
3. **Firmware moves to the bottom** of the More tab — but the update
   check still fires the moment the app opens (AppUpdateGate, cached
   promise), so the "a new update is available" toast shows just as fast.
4. **"View source" never fails silently again** — if the system browser
   won't open, the app now shows an error toast carrying the real reason
   and the link, instead of doing nothing. Same for "View on GitHub" and
   the update modal's "Open on GitHub".

Verified in the sandbox: tsc clean, 154/154 tests, sweep probe 5/5
(band covers all 3 icons, 3 labels with the active one highlighted,
reverse sweep returns the icons), reduced-motion probe 3/3 (no sweep,
View-source toast with URL), More-tab probe 20/20 (order, tones,
instant update toast, modal, persistence), screenshots light + dark.

## v3.0.10 — framer-motion removed (2026-11-20)

Wave 6 of the client overhaul: the animation library is gone — it was
~141 kB of the JavaScript bundle and did nothing the browser can't do
natively. **Bundle 520,208 B → 382,238 B (−26.5%).** Every animation it
ran is now native: modal/popup entrances are CSS keyframes, toasts and
the loading screen fade out with a short CSS transition, card hover is a
plain CSS lift, and the key-assign popup still flies into the mouse
button — now via the Web Animations API — and only writes the key when
the flight finishes, exactly like before. `prefers-reduced-motion` is
respected. No behaviour changed; the animations look the same, they just
cost less. Steady-state longtask cost is unchanged from v3.0.9 (same
ballpark run to run) — this wave's win is bundle size, not runtime
speed; the real-machine verdict is still Ethan's.

## v3.0.9 — full-English redesign + silent updater (2026-11-20)

The whole app and this README are now **English only, no Vietnamese**.
Everything Ethan ordered on 2026-11-19, in one release:

1. **More tab reorganized** — single-column stack: Battery → Firmware →
   Profiles → Settings → Restore → Raw, each a collapsible blue-glass
   section. Battery + Firmware open by default. Battery shows the live
   `% · estimated` badge; Firmware shows the live `vX.Y.Z-rust` tag plus
   "View source" and "What's new?" (landscape modal with the full
   release-notes log).
2. **Theme toggle sits flush** — the disc used to rest 17.5px off the pill
   edge (flex-centering nobody had measured); the checked travel is now
   exactly 2.125em, the moon ends 1.8px from the edge, and the wrapper
   clips the SVG filter's paint bleed. No overflow, ever.
3. **Skin popup scroll** — the scroll handler used to re-render the whole
   grid on every scroll event; now rAF-throttled (one update per frame)
   plus `content-visibility: auto` on rows. Headless probe: 135–141ms
   total longtasks (was 147–277ms); the real verdict is Ethan's EliteBook.
   Caught by the probe: hooks placed after `if (!open) return null`
   crash the popup — they must live before the early return.
4. **Battery / charging** — the app now detects the cable while connected
   over 2.4G (see "Battery" above). The drain-rate numbers are still
   uncalibrated assumptions until the drain test runs.
5. **Theme transition** — the dark shim used to flip ~20 selectors
   instantly while the body glided 0.5s (half snap, half glide = laggy).
   Everything now glides at 0.25s together; the light sweep band is
   untouched.
6. **DPI glide** — clicking a preset stage no longer jumps the slider;
   it glides there (150–500ms by distance, easeInOutCubic) and the fill
   color follows along. The mouse itself is still written instantly —
   only the slider UI travels.
7. **Connection cluster** — the 2.4G / Bluetooth / Ethernet texts moved
   into the live frame and the "LIVE" text frame is deleted; only 3
   connection-mode icons remain in one pill, the active one glowing
   orange, bouncing on hover. In Demo mode a tiny "DEMO" tag stays so a
   simulation is never mistaken for a real mouse.
8. **Disconnect button** — bright red (`#dc2626`, hover `#b91c1c`),
   white text, logout/reset style.
9. **Reload with purpose** — clicking reload now shows the same loading
   screen as the first open, for exactly the real re-read duration
   (measured 1.4–1.6s, not the blind 3s timer), and the UI floats up
   again when it lifts.
10. **"M3 Pro" gradient band** — a red-orange gradient slides through
    the text (3s loop, static under prefers-reduced-motion).
11. **Polling / DPI labels cleaned** — polling buttons show Hz numbers
    only (no P1–P4 tags); the "Current DPI" label and the "— stage N"
    slider suffix are gone.
12. **Silent updater** — see "Self-update" above. curl.exe is gone; the
    download runs in-process (reqwest 0.13.5, blocking + rustls), with a
    progress popup + changelog, then Confirm (wipe + installer) or Close
    (cached in %LOCALAPPDATA%).
13. **Top-bar version** — was hardcoded "v3.0.0" while the Firmware card
    showed the real version; now it reads the live version from Tauri.
14. **Toasts** — success popups say plain things like "Config saved."
    (no "read back 100%" claims).

Verified in the sandbox: tsc clean, **154/154 tests** (battery 53 + hid 75
+ updater 21 + fuzz 5), build clean, update-modal probe 5/5, cable-charge
probe 4/4, DPI-glide probe (intermediate value 3150 on the way to 3200),
theme + reload probes. The real-machine checks (skin smoothness, cable
detection, the update end-to-end) are Ethan's — that is what this release
is for.

## v3.0.8 — blur budget + Lite mode (2026-11-19)

- **Blur budget:** the cursor blob went from blur(6px)+saturate to blur(4px)
  only; `html.lite` kills all backdrop blur + the blob animation.
- **Lite mode (low-end PCs):** a toggle in More → Settings, persisted in
  localStorage, for weak machines like the HP EliteBook.
- Setup 17,798,404 B, portable 18,481,524 B. CI green, released.

## v3.0.7 — sleep-aware battery + version-bump script (2026-11-19)

- **Sleep-aware drain:** closed-app time used to drain at the full rate
  forever; now it drains at full rate only for the first `sleepMinutes`
  (default 5), then at 0.05 mA.
- **`scripts/bump-version.mjs`:** bumps all 6 version places at once
  (package.json, package-lock.json ×2, tauri.conf.json, Cargo.toml,
  Cargo.lock, updater.ts fallback) with `--dry-run` and `--check` modes.
- Setup 17,796,514 B, portable 18,480,709 B. CI green, released.

## v3.0.6 — real one-click self-update (2026-11-09)

- v3.0.5 only opened the download link in the browser and left the user to
  download and run it — and on the real machine that link did nothing at
  all. This version fixed it: press **Confirm** → the app downloads the
  newest `.setup` itself (curl bundled with Windows, no browser), checks
  the file is big enough (real setup ~18 MB, an error page is tiny) →
  opens the installer → **quits the old process entirely** so the
  installer can replace the files. While downloading the button shows
  "Downloading…"; on failure it shows the error with **Retry** and
  **Open on GitHub**. Used by both the top-right toast and the Update
  button in the Firmware card.
- **Caveat (honest):** during the update Ethan saw a CMD/curl window —
  that is exactly what v3.0.9 removes (in-process download, no console
  window ever).
- Setup 17,784,941 B, portable 18,449,492 B. CI green, released.

## v3.0.5 — 16:9 frame (2026-11-09)

- The old 1280×1024 (5:4, nearly square) design became **1280×720 (16:9,
  landscape)**. On 1920×1080 the frame sits centered; on a 1366×768 laptop
  it fits at zoom 1.0 (no more shrunken text); smaller screens still scale
  down with min(W/1280, H/720) — never fullscreen, never overflowing.
- The update flow fixed in v3.0.4 activates for the first time here: opening
  installed v3.0.4 shows the toast with v3.0.5 + weekday + time.
- Setup 17,778,993 B, portable 18,444,836 B. Tests: hid 75/75, battery
  48/48, updater 18/18, adaptive 53/53, update-UI 19/19. CI green.

## v3.0.4 — the update check that never worked (2026-11-09)

- **Root cause:** the built app's CSP (`connect-src`) lacked
  `https://api.github.com`, so every update check failed silently and no
  update popup ever appeared. The vite dev server does NOT enforce the
  Tauri CSP, so this only showed up in the real build — never trust a
  dev-server fetch as proof the built app can reach an API.
- Setup 17,780,211 B, portable 18,444,276 B. CI green, released.

## v3.0.3 — adaptive window (2026-11-09)

- v3.0.2 was locked to 1280×1024, so on a smaller laptop (1366×768,
  1280×720, …) the frame was taller than the screen. Now the app measures
  the monitor at startup and sizes the window to fit — 1280×1024 on a big
  screen, scaled down on a small one (e.g. ~880×704 on 1366×768).
- Still NO fullscreen, ever. The window stays a floating rectangle, just a
  smaller one. No maximize, no resize.
- Tauri 2.12.5 has NO `set_inner_size` — `set_size` sizes the OUTER window
  while min/max are INNER sizes; the code measures the decoration delta and
  adds it to the fitted size.
- Setup 17,778,734 B, portable 18,444,687 B. CI green, released.

## v3.0.2 — no console window, no duplicates (2026-11-09)

- **No more console (cmd) window.** The app used to open a black cmd window
  next to the main window — and closing it killed the whole app. The release
  build now runs as a pure Windows GUI app: one window only, no cmd anywhere.
- **No more duplicate windows.** Double-clicking the icon (or the installer
  auto-running while the app was already open) used to open a second copy.
  Now a second launch just brings the running window forward.
- **Smaller tray popup.** 300×240 (was 340×280), tighter layout.
- **Battery % that actually moves.** The old whole-number % sat at 100% for
  the first ~13 hours (3 mA drain at 125 Hz is only 0.75%/hour). It now
  shows **one decimal (99.9%)**, the remaining mAh with one decimal, and the
  live drain/charge rate — same model, just precise enough to watch it drop.
  Still labelled "estimated".
- **Much less lag.** The battery engine used to re-render the whole app
  every second; it now re-renders only when a displayed value changes. The
  cursor blob and device-picker glow also stop animating when idle.
- Setup 17,774,880 B, portable 18,442,953 B. CI green, released.
- Lockfile lesson: package-lock.json's root version must bump with
  package.json (BOTH fields) or `npm ci` fails.

## v3.0.1 — first Rust/Tauri build (2026-11-08)

- The web PWA became a native Windows desktop app: Tauri 2 (Rust backend:
  tray, autostart, notifications, fixed window, persistence, installer) +
  the existing React frontend kept 100% (WebHID works in Tauri's WebView2
  on Windows). GitHub Actions is disabled on the main account, so builds
  run on the fork.
- Setup 17,707,608 B, portable 18,336,396 B. Ethan installed and ran it on
  real Windows — proven.

## v2.8.2 — removed the scroll effect in the Skin popup + anti-lag for weak machines (2026-11-08 15:47–…)

1. **Removed the scroll/stagger effect entirely** (IntersectionObserver +
   row-by-row drift), as requested: the grid renders IMMEDIATELY when the
   popup opens (using load time to finish rendering all 60+ skins), the
   compass loader is only an overlay on top of the grid; when loading
   finishes the grid just appears — no drift, no per-row waiting, no scroll
   effect at all. Hover lift on skin cards stays (same hover language as
   every button in the app).
2. **Anti-lag (no lag on weak machines):** the grid uses 320px thumbnails
   (2.5MB total) instead of 9MB full-res, each image decodes ~9x faster;
   images have `decoding="async"` + `loading="lazy"`; each row has
   `content-visibility:auto` so rows outside the viewport cost no
   layout/paint while scrolling. The Skin button + device card also use
   thumbs. The stage still uses full sharpness.
3. **A bug this round exposed (caught by tests, real users would hit it):**
   wrapping the scroll frame in `<div class="relative min-h-0 flex-1">` and
   giving the child `h-full` — the wrapper's height comes from flex (not
   definite), so `height:100%` fell back to `auto` = 2454px, overflowing
   down over the footer (the `relative` wrapper paints overflowing content
   ABOVE the static footer) and making the Apply button unclickable —
   clicks landed on a skin image (selecting the wrong skin instead of
   applying). Fix: wrapper `flex flex-col` + scroll frame `flex-1 min-h-0`
   (the flex item shrinks to 553px and scrolls correctly). Lesson: **never
   use `h-full` for a scroll area inside a flex item — it must be a direct
   flex item (flex-1 min-h-0) or absolute inset-0.**
4. **Verification:** clean build, 75/75 tests, verify282 **144/144 PASS**
   (142 old + 2 new checks: no more `.skin-row`, grid uses thumbs), scan28
   clean, 0 console errors.

## v2.8.1 — split the MIDDLE/RIGHT BUTTON tags apart (2026-11-08 15:43–…)

1. **Bug from a screenshot (Middle and Right stuck together):** the two
   right-side tags were only ~26px apart center-to-center; minus the ~25px
   tag height that left ~1px of visible gap — they looked glued together.
   Fix: `layout()` in MousePhoto.tsx adds a separation pass for same-side
   tags — minimum 38px center-to-center (~13px visible gap), only pushing
   the LOWER tag down (Right dy 0 → +12), the leader line tilts only ~6°,
   then the whole group is clamped back inside the frame if the last tag
   overflows below. Measured for real: the Middle→Right gap is **12px at
   1366×768, 11px at portrait 1080×1920** (was ~1px). No per-tag hardcoding
   — a general rule, so every same-side tag pair is separated, even when
   button names change (Left·Copy…).
2. **Verification:** clean build, 75/75 tests, verify28 142/142 PASS
   (no regression), 0 console errors.

## v2.8 — big Skin popup (replacing the horizontal strip) + full skin re-audit: F lost its right edge, 0 duplicates (2026-11-08 15:03–…)

1. **Horizontal strip REMOVED — replaced by a Skin layer button + big popup
   (as requested):** below the Battery dock there is now only one `SKIN`
   button (thumbnail of the current skin + name + "67 skins", hover lift +
   orange border like the other buttons). Clicking opens a big popup
   (portal to body, black blurred backdrop over the whole screen): header
   "SKIN · 67 skins · Using: …", grid **5 skins per row, all 5 fully
   visible**, each skin with its name right under the picture, the first
   skin ALWAYS Default. Picking in the grid is only a pending choice
   (orange border + tick); **Apply** really changes it (stage +
   localStorage + toast), **Cancel** closes without changing anything; the
   card of the skin in use has a **"Remove skin"** button — click it and
   it goes back to Default immediately. Esc / clicking the black backdrop /
   the X button also close it.
2. **Loader inside the popup (reusing the page-load effect, with a
   purpose):** opening the popup preloads all 67 skin images, showing the
   ancient-yak-42 compass (NO SMAILWOLF logo — as requested) + "Loading
   skins… n/67" — waiting for the machine to finish rendering all 60+
   skins before the grid drifts up (10s timeout still shows the grid with
   whatever loaded). No pointless loading.
3. **Scroll to a row, the row drifts up:** each row is a `.skin-row`
   (opacity 0 + translateY 14px), IntersectionObserver adds `.in` when the
   row crosses the scroll frame — transform/opacity only, so no lag
   (Intel HD 4400). A real bug caught in testing: scrolling straight to
   the bottom in one jump meant middle rows never crossed the viewport and
   stayed hidden — fix: when one row appears, all rows up to it appear too.
   The first 4 rows stagger 70ms/row on open. Respects
   prefers-reduced-motion (rows appear instantly, no transition).
4. **Re-audited all 66 skins (as requested — duplicates + lost edges/tails):**
   - **Duplicates: 0.** Compared every pair with MAD on RGB 64×64 over
     the intersecting alpha region: the most similar pair had MAD 25.7/255
     (F01–F07), no pair under 12 → all 66 artworks are different, no skin
     deleted. (The 16×16 hash in the first pass reported 6 "duplicate" pairs
     — false positives: same M3 silhouette + similar light/dark structure,
     not the same artwork.)
   - **Lost edge: sheet F (all 10 skins).** Cause: v2.7 cropped F's right
     side by 240px like sheet B, but sheet F has NO right thumbnail — the
     mouse is full-width x25–280, so the crop cut off the right edge (F01
     697px wide vs the original 867px, IoU 0.81). Fix: crop F (0,0,307,450)
     full-width, re-ran all 10 skins — re-audit found no more misaligned F
     skins; F01's magenta composite proves the silhouette is complete on
     both sides + tail. (One batch run died after F06 with no clear error +
     F07.webp 0 bytes was wrongly skipped — deleted the 0-byte file and
     re-ran to finish.)
   - **A02/A10/D09/D10 "70–108px shorter than the original": false
     positives** — looking at the source cells: the mouse is drawn smaller
     in the sheet (bottom ~y440–445, on a 450/452 crop), silhouette
     complete, nothing cut. Not fixed.
5. **Verification:** clean build, **75/75 tests**, **verify28 142/142 PASS**,
   scan28 clean at 4 sizes (1366 scrollH 768, 1920 scrollH 1080, mobile
   scrollW 390, portrait 1080×1920 scrollW 1080; 0 overlapping tags, 0 tags
   outside the stage, 0 console errors; More still scrolls internally
   428px at 1366 / 151px at 1920 like v2.6–v2.7). A flake caught in testing
   (not an app bug): one 1920 scrollH measurement read 1104, re-measured
   1080; measuring a skin row while the cursor sat on the card made the
   hover lift −2px shift y — the test moves the cursor to a corner before
   measuring.

## v2.7 — fixed Never sleep + portrait fit + Skin Grip frame with 67 skins (2026-11-08 13:49–…)

1. **Never sleep bug (reported live — turning it off didn't stick, it
   jumped back on):** the real cause — the sync effect
   `setSleep(config.sleepLight)`: turning Never sleep on set config to 0,
   so `sleep` was overwritten to 0 and the old minute value was lost;
   turning it off wrote back `sleepLight = sleep = 0` → the toggle jumped
   back on. Fix: a separate `lastSleep`, updated ONLY when the value ≠ 0;
   turning it off writes back `lastSleep` (his 5 minutes). Verified: on →
   "Never sleep" → off → "5 minutes", toggle unchecked, stable across 2
   cycles.
2. **Portrait ratio (screenshot at 1080x1920 — the mouse stretched badly):**
   the real cause — the image only had `h-[96%] w-auto`: at a portrait
   viewport (tall, narrow) the image at 96% of the frame height overflowed
   horizontally → both sides cut, looking vertically stretched. Fix:
   compute the fit from the image's real ratio (`naturalWidth /
   naturalHeight`, fallback 944x1667): `fit = min(cw*0.96/iw, ch*0.96/ih)`,
   set explicit width/height + center — never overflows/cuts, keeps the
   true aspect at every ratio (measured: 592x1046, correct aspect 0.566 at
   1080x1920). Also: tags cut 5-9px off the stage edge in portrait (the
   tag-width estimate was ~10px short from uppercase + letter-spacing) —
   raised the estimate 7.2/18 → 8.2/26 and lowered the leader floor 14px →
   4px for the Copy/Paste anchors near the left edge; re-measured, all 6
   tags inside the stage.
3. **SKIN GRIP frame under the Battery dock (12 images sent — 6 sheets of
   10 skins + 6 single mice):** a horizontal strip under the Battery dock,
   67 choices (Default + 66 skins), 56px thumbs + names, click changes the
   mouse picture immediately (UI only, nothing written to the mouse),
   saved to localStorage (persists on reopen), horizontal scroll inside
   the strip, no vertical page scroll. Skins also apply to the device card
   on the device picker screen.
4. **Background removal ("cut the background really carefully"):**
   rembg/u2net (176MB — the default bria-rmbg-2.0 1.02GB model was OOM-killed
   in the sandbox) + largest-component filter (+ components ≥15%) +
   morphology open erosion 2px → label → dilation 2px (cuts thin bridges
   between the label and the mouse). Normalized to a transparent 944x1667
   canvas (same M3 Pro silhouette, so the measured click anchors are
   shared), WebP q85, ~9MB total. Labels/thumbnails were cropped out of
   the INPUT image per sheet (label pill at the bottom, right thumbnail,
   DEMO LED bar, Grip Tape swatch) — leaving them in the mask would never
   come out clean. Verified with checkerboard montages + magenta
   composites per hard skin: A02 black mouse on black background cut clean;
   B02 card cut clean; S1 white background cut clean. Round 1 still had 7
   skins with labels stuck (A02/A10 pill, D04/D05/D09/D10 Grip Tape label +
   swatch, F02 with the neighbor cell's label) + 3 B skins with the right
   thumbnail stuck (B07/B08/B10) — fixed with input crops and a re-run,
   round 2 montage clean.
5. **Verification:** clean build, **75/75 tests**, **verify27 129/129 PASS**
   (Never sleep 2 cycles + portrait fit + tags + skin strip 67 choices +
   changing skin to A03 + localStorage + old checks; re-ran a second time,
   also 129/129 — the earlier run had 1 stray fail from toast/loading
   timing, a re-run passes), scan27 clean at 4 sizes (1366 scrollH 768,
   1920 scrollH 1080, mobile scrollW 390, portrait 1080×1920 scrollW 1080;
   0 overlapping tags, 0 tags outside the stage, 0 console errors; More
   still scrolls internally 428px at 1366 / 151px at 1920 like v2.6,
   unchanged).
6. **Honest limits (unchanged):** setKeys/macro writes to the real mouse
   still NOT verified live; battery smoothness needs a long Live run to
   judge; no LED; no firmware update; Bluetooth unreachable through WebHID
   so the BT icon never lights. Skins only change the picture in the app,
   not the real mouse shell.

## v2.6 — anime mouse + per-button hover glow + real device scan + fullscreen modal + cursor-following background (2026-11-08 12:34–12:5x)

1. **All mouse pictures changed to the anime image sent in (944x1667,
   transparent background, WebP 95KB):** both the main picture in the UI
   and the device card (Demo and Live use exactly this image). Click
   anchors re-measured with PIL/numpy (3px erosion kills thin outline
   strokes, keeping only solid black areas): scroll wheel (0.50, 0.227),
   DPI button (0.50, 0.398), upper side button (0.090, 0.410), lower side
   button (0.102, 0.546), left/right plates (0.27/0.73, 0.22).
2. **Hover glow per mouse part:** hovering a button (its click zone or its
   tag) → that part glows orange (a glow layer shaped to the part: plates =
   big ellipse, wheel/DPI = capsule, side buttons = rounded rectangle) +
   a small press bounce (keyframes partPress: scale 1 → 0.94 → 1.03 → 1,
   translateY 2px, 0.45s) + tag/leader/dot turn cyberpunk (navy background,
   neon orange text, border + `#FF5A1F` halo). Applies to all 6 buttons,
   mouse and keyboard alike (focus also triggers it, per pro-max §1).
3. **Key binding follows the DPI effect:** the "Change binding" button +
   Save / Reset buttons + option buttons in the modal all became
   shy-moth-10 pills (orange when selected, chevron slides on hover).
   **Removed the type text line** ("type 32 · 1,0,0") from the card.
   **Fixed a wrapping bug:** the 3-column card (~152px) made "Left Button"
   and its button wrap twice, skewing the whole grid → back to 2 columns
   (~240px), title + button each fit on one line (verified by measuring
   boundingBox < 26px).
4. **Modal dims the WHOLE screen (bug from a screenshot):** the real cause
   — Shell kept the `.app-enter` class with animation fill `both`, so
   `transform: translateY(0)` still applied; a transform on an ancestor
   makes `fixed inset-0` cover only the Shell frame (max-w 1440, the 2
   outer edges not dimmed). Fix: ConfirmModal + the Macro modal **portal
   to document.body** (react-dom createPortal) — the dim layer now covers
   the full 1366x768 viewport (verified by measuring boundingBox).
5. **DevicePicker does a real scan:** "Add a new device" now calls
   `requestDevice({filters:[{usagePage: 0xFF01, usage: 0x10}]})`, opening
   the browser's device picker dialog (exactly dialog image 4 sent in);
   on open, `getDevices()` lists already-granted devices. The list = every
   Smailwolf device found, cards showing name + mode by VID (43172 wired,
   43173/14391 2.4G) — clicking a card connects to THAT exact device
   (`LiveMouse.connect(device)`, no re-scan / no taking the first device by
   VID anymore). **No more pre-made cards:** nothing found shows an empty
   slot "No devices found yet"; **Demo is separated** into a text link
   under the list. Stated plainly: Bluetooth does not appear in a WebHID
   scan (it goes through the OS Bluetooth stack, the original Tauri app
   too) — the wide scan here is wired + 2.4G over HID.
6. **Logo no longer sinks:** both the device picker screen and the loading
   screen put a white halo aura behind the SMAILWOLF logo (`.logo-aura`:
   white radial-gradient + 6px blur) — the black logo stands out on the
   dark star background.
7. **Device picker background no longer boring:** orange/purple halo
   follows the cursor (smooth lerp) + **square pixels rising on every mouse
   move** (canvas, max ~70 particles, orange/white/cyan/yellow, rising +
   spinning + fading over ~2s) + twinkling stars (3.2s twinkle). Cheap on
   the GPU (2D canvas, no backdrop-filter), respects prefers-reduced-motion
   (fully off).
8. **Verification:** clean build, **75/75 tests**, **verify26 111/111
   PASS** (real scan + device cards + 5s loading + hover glow + binding
   shy + no type text + modal portal covering the full viewport +
   disconnect → back to picker), scan clean at 3 sizes (1366 scrollH 768,
   1920 scrollH 1080, mobile scrollW 390; 0 overlapping tags, 0 tags
   outside the stage, 0 console errors; More still scrolls ~428px at 1366,
   ~151px at 1920). Measurement note: screenshotting loading at click+1500ms
   missed once (caught the main UI instead) — screenshot at click+2500ms to
   be sure (readAll ~300ms + loading fully up).
9. **Honest limits (unchanged):** setKeys/macro writes to the real mouse
   still NOT verified live; battery smoothness needs a long Live run to
   judge; no LED; no firmware update; Bluetooth unreachable through WebHID
   so the BT icon never lights.

## v2.5 — original-app-style device picker + exactly-5s compass loading + all shy-moth-10 buttons + scroll-locking popups + 2-column More (2026-11-08 11:35–12:0x)

1. **Original-app-style device picker (image 3 sent in):** opening the app
   no longer goes straight into the UI — dark star background (`#0b0b26` +
   8 radial-gradient star layers), only the SMAILWOLF wordmark (no "M3 Pro"
   text), an orange "Add a new device" button that re-scans with
   `navigator.hid.getDevices()` ("Found N devices"), 2 cards with real PNG
   mice: **USB Receiver** (real mouse · WebHID → Live, opens the browser's
   HID picker like image 4 sent in) and **Demo** (simulated · no real mouse
   needed). Clicking a card connects. Disconnecting from the main UI (Agree)
   returns to exactly this screen.
2. **Loading exactly 5s on entering the UI:** the `ancient-yak-42` compass
   (Nawsome, verbatim from the uiverse-io/galaxy mirror — blue/cyan ring
   spinning 2s, 8 ticks, red/white compass needle) in the middle of the
   screen, the whole UI behind it blurred
   (`bg-[#0b0b26]/85 backdrop-blur-md`, z-100); after exactly 5000 ms (timer
   in the store) the main UI drifts up (`app-enter`: opacity + translateY
   24px → 0, 0.6s). The "Demo enabled…" toast was moved to the end of the
   5s so it doesn't expire behind the overlay. **Stated plainly: reading
   the real data only takes ~1s; the 5s is a splash screen as requested —
   not a technical need.**
3. **All Polling / Scroll direction / DPI buttons became `shy-moth-10`
   (Li-Deheng):** rounded pills, orange `#EA580C` background when selected
   (dim gray when not), 3 chevrons sliding right + changing color on hover,
   a 1s outline pulse on hover/focus. Verbatim from the galaxy mirror, only
   changed: pink `#ff135a` → orange `#EA580C`, font 30px → 13px, padding
   5px 30px → 6px 12px, slide 25px → 6px, **SVG id → class** (12 buttons on
   one page, duplicate ids are a trap). The old `serious-monkey-58` effect
   (`.uiv-seg-spin` / `.spin-border`) was **DELETED ENTIRELY** as ordered.
4. **Popup scroll lock (`useScrollLock`):** any modal that opens (create
   macro, confirm disconnect, restore…) locks scrolling on both the body
   and the left panel — the background can't drift anywhere, the popup stays
   centered for full viewing/interaction; long content inside the modal
   itself still scrolls; closing restores scrolling as before. Verified by
   test (overflow = hidden while open, back to '' when closed).
5. **Removed 2 subtitles:** "Remap 6 buttons via setKeys." (Key Bindings)
   and "6 DPI stages — click a stage or drag the slider, applies
   instantly." (DPI). PageHead now takes an optional subtitle.
6. **Task presets (filling the gap under the DPI slider):** Office ·
   1,600 / Gaming · 3,200 / Design · 800 — click applies instantly like a
   DPI stage. Why those numbers: Office 1,600 = the mouse's default stage;
   Gaming 3,200 = a common gaming DPI; Design 800 = the lowest stage, for
   pixel-precise work. Say the word if the numbers don't feel right.
7. **More reorganized into 2 even columns:** left = Device & battery
   (battery donut + history + info, a compact one-line "Read now" button) +
   Profile; right = Firmware + Restore defaults + Raw reply (collapsed by
   default, click to open 2 hex dumps). Cut extra text (the "Not connected"
   card, the dead "Check for updates" button, the long firmware paragraph).
   Scroll is now **~430px at 1366x768** (from 968px) and **~138px at
   1920x1080** (from 689px) — under one screen; DPI and Performance still
   scroll **0px**.
8. **Fixed the mock test (not the app):** assigning `navigator.hid = {...}`
   directly does NOTHING because `navigator.hid` is getter-only on
   Navigator.prototype (sloppy mode silently ignores it) — DevicePicker
   scanned 0 devices even though the mock returned 1. Changed to
   `Object.defineProperty` (both `gen-mock.ts` and the regenerated
   `mock-init.js`, builder still byte-identical, checksum 196). Lesson:
   stub browser APIs with defineProperty, never direct assignment.
9. **Verification:** clean build (bundle 467 kB, gzip 146 kB), **75/75
   tests**, **verify25 100/100 PASS** (device picker, 5s loading,
   shy-moth-10, removed subtitles, presets, scroll lock, 2-column More,
   disconnect → back to picker), scan clean at 3 sizes (1366 scrollH 768,
   1920 scrollH 1080, mobile scrollW 390; 0 overlapping tags, 0 tags
   outside the stage, 0 console errors). Measurement note: a 1920 scrollH
   number read while the `app-enter` animation was still running wrongly
   reads 1080+24 (translateY 24px) — measure after the animation finishes.
10. **Honest limits (unchanged):** setKeys/macro writes to the real mouse
    still NOT verified live; battery smoothness needs a long Live run to
    judge; no LED; no firmware update (don't go to V3.1.2); Bluetooth
    unreachable through WebHID so the BT icon never lights.

## v2.4 — DPI exactly like the screenshot sent in + every button applies instantly + toasts replace Activity Log + smooth (2026-11-08 10:10–10:5x)

1. **DPI redesigned exactly like image 1 sent in:** 6 colored stages (800
   red / 1,600 green / 2,400 blue / 3,200 purple / 6,400 yellow / 12,000
   cyan), round radio above each stage, the selected stage shows "Current
   DPI" + blue border + glow; a Slow↔Fast slider with 200–12000 ticks and
   a "Restore default settings" button at the top right. **Dragging the
   slider:** the fill changes color gradually (hue green→red by DPI) and
   the "Current DPI" stage jumps to the nearest stage while dragging;
   release (or after 250ms) writes once to the mouse (no ~50 commands per
   drag). Clicking a stage writes immediately. No more Save / Undo buttons
   on the DPI page.
2. **Every button applies instantly, no undo — across the whole app:**
   Performance (polling, sleep, scroll direction, line correction), DPI,
   key bindings all write directly through the live-proven setConfig/setKeys;
   a failed write restores the old value in the UI. The sleep slider writes
   after a 250ms debounce; the DPI slider writes once on release.
3. **Performance compact, less text, fits without scrolling:** 4 compact
   cards (polling 4 buttons in one row; "Never sleep" tucked into the Sleep
   title row; no more "Byte 51 = ..." lines or long explanations) — measured
   scrollHeight = clientHeight = 513px at 1366x768, **no scroll**.
   GlassCard/PageHead/Toggle gained a `compact` prop.
4. **Macro compact + blurred-background popup:** short buttons ("+ Create
   macro" / "Write to mouse" — no more line drops), no more `[240, 13, …]`
   command explanations; clicking Create macro opens a centered modal with
   the background blurred (`backdrop-blur-sm` + 60% black), with macro name
   / step list / Record key / + Wait X ms / + Left click.
5. **Activity Log DELETED ENTIRELY — replaced by short toasts at the TOP of
   the page:** every action shows one short banner (max 3, auto-dismiss
   4.5s) using exactly the CSS effect from Uiverse **empty-wolverine-58**
   (Cybercom682) that was linked — verbatim from uiverse.io (the galaxy
   mirror repo does NOT have this element, verified with git ls-tree + raw
   404): `border-l-4`, pastel background, bold text, SVG icon, hover
   scale-105. Differences from verbatim: dropped the `dark:` variant (the
   app doesn't use Tailwind's `dark` class); the ok/err icons became a
   check / warning triangle in the same stroke style (the original uses one
   shared "i" icon for all 4 types). Bug found while verifying v2.4: every
   write showed **2 duplicate toasts** (the backend `onLog` feeding Activity
   Log + the store's `pushToast`) — fix: `backend.onLog` no longer feeds
   toasts (it defaults to no-op).
6. **TopBar:** removed the 2 FW + Battery pills (already in the docks
   below); added the mode icon cluster: **Wifi = 2.4G**, **Cable = wired**,
   **Bluetooth** — the icon of the mode in use glows orange, the rest dim.
   Honest note: the app only reaches the mouse via wired/2.4G (WebHID vendor
   filter), so the Bluetooth icon exists but never lights — no Bluetooth path
   yet. The **Disconnect** button now asks for confirmation: "Do you want to
   disconnect from this device?" — **Agree** / **Cancel** buttons.
7. **Smooth (lag complaints):** the main culprit was `backdrop-filter`
   blur on ALWAYS-VISIBLE elements — 4 docks blur(18px) saturate(1.2),
   ghost buttons blur(8px), stripe blur(12px), blue-glass blur(10.5px on
   a SOLID background = cost for no visual change) — **all removed,
   replaced by slightly more solid backgrounds** (dock rgba(255,255,255,0.82)).
   backdrop-blur stays ONLY on modal overlays (briefly visible, blur
   requested there). Mouse PNG 634KB → **WebP 36KB** (transparency kept).
   `will-change: transform` for the marquee + spinning border. MORE effects
   now, but only transform/opacity (GPU) — nothing left that costs paint.
8. **Bug found while verifying v2.4 (serious):** after opening/closing the
   macro modal, clicking the **More tab didn't change the content** (state
   had changed — `aria-current="page"` was on the More button — but the old
   content never unmounted and the new content piled up below it). Cause:
   `AnimatePresence mode="wait"` stuck on exit. Fix: dropped AnimatePresence
   on tab content, replaced with `key={tab}` + pure CSS animation (`tabIn`,
   opacity/transform only) — no more exit tracking to get stuck, and
   smoother. The More tab passed again in the full sequence.
9. **Verification (stateful mock HID, uitest/):** clean build, **75/75
   tests**, **75/75 checks** (DPI 6 stages + color-changing slider +
   instant write, Performance fits without scrolling, macro modal + short
   buttons, Activity Log gone + top toasts, TopBar without FW/Battery +
   mode icons + Disconnect asking Agree/Cancel, binding Copy→Cut, full tour
   sequence through the More tab, 0 console errors), scan at 3 sizes:
   1366x768 scroll=768, 1920x1080 scroll=1080, mobile 390 scrollW=390
   (mobile scrollH 2603 — shorter than v2.3 thanks to removing Activity Log
   + compact pages), 0 overlapping tags, 0 tags outside the stage, 0 console
   errors.
10. **Honest limits:** key/macro writes still unproven on the real mouse;
    battery granularity still needs a long Live run; no LED; no firmware
    update; Bluetooth unreachable through WebHID.

## v2.3 — real photo replaces the 3D model + removed extra text + polling with effects (2026-11-08 09:20–09:3x)

All 4 complaints were correct:

1. **The rebuilt 3D model was "too dumb" — removed entirely, replaced by
   the REAL PHOTO.** The M3 Pro product photo (707×1373, transparent
   background) IS the "model" now: `public/mouse-m3pro.png`. Button
   positions = real measurements from the photo (PIL/numpy, no guessing):
   scroll wheel center (0.49, 0.19), DPI button (0.49, 0.36), upper side
   button (0.033, 0.40), lower side button (0.048, 0.54), left/right plates
   (0.28, 0.20)/(0.72, 0.20). Thin-bordered labels + diagonal leaders +
   dots on the buttons keep the image-2 style; clicking a button on the
   photo (invisible 44×44 click zone centered on the measured anchor)
   opens the key-binding popup as before. Three.js REMOVED from the package
   (bundle 461KB, ~150KB lighter), `Mouse3D.tsx` deleted.
2. **Removed wasted text:** 2 stage-header lines ("[MOUSE // M3 PRO]
   PAW3311 · 12000 DPI..." + the hint line "Click a button on the
   mouse...") — DELETED; the caption "3D model rebuilt from measurements...
   not a photo" — DELETED (it's a real photo now, so that caption was
   wrong); the long footer "SMAILWOLF M3 Pro — Driver remake..." — DELETED
   (the honest limits are still written in the right places in each tab).
   Panel: **Create / Import / Onboard configuration REMOVED from the panel
   top** — the 4-item menu sits RIGHT UNDER the M3 header; profile
   functions (save/import) already exist in full under More → Profile.
3. **Polling rate buttons MUST have an effect, no plain defaults allowed.**
   Picked from the Uiverse/galaxy repo sent in: **animated-border-radio
   serious-monkey-58** (spinning gradient border) — verbatim mechanism (2
   conic bands spinning behind an inset-2px inner layer, leaving only a 2px
   spinning border around the button), changed to orange/yellow. Selected
   button = solid orange background + spinning border; unselected = dim
   border. Applied to polling rate and scroll direction alike. The glitch
   radio (lucky-bobcat-25) was deleted in v2.2, not reused.
4. **Logo:** the orange mouse icon in image 3 was just a lucide glyph I
   picked myself — NOT the real logo. The real logo is the **SMAILWOLF**
   wordmark from the original app (`public/logo.png`, the original app's
   header uses exactly this file). WARNING: `svgs/logo.svg` in the original
   frontend is the **MCHOSE 迈从** logo (a different brand) — almost used by
   mistake, caught by grepping chunk 515 before committing.
5. **Bug found while verifying v2.3:** the 186px wordmark + 257px subtitle
   made the topbar logo cluster 453px wide → 79px horizontal overflow at
   mobile 390. Fix: the logo cluster got `min-w-0` (dropped `shrink-0`) so
   the subtitle wraps on mobile.
6. **Verification (stateful mock HID, uitest/):** clean build, **75/75
   tests**, **45/45 checks** (real photo shown + no more 3D canvas, menu
   right under the header, Create/Import/Onboard removed, Profile in More,
   spin-border on the selected button, 2 header lines + hint + footer +
   caption removed, binding Copy→Cut end-to-end, fixed DPI button, 0 console
   errors), scan at 3 sizes: 1366x768 scroll=768, 1920x1080 scroll=1080,
   mobile 390 scrollW=390, 0 overlapping tags, 0 tags outside the stage, 0
   console errors.
7. **Honest limits:** the photo is a product photo (not a scan of his mouse —
   but the correct M3 Pro model); key/macro writes still unproven on the
   real mouse.

## v2.2 — new layout as requested + polling without the glitch bug (2026-11-08 08:52–09:0x)

All 4 complaints were correct:

1. **Panel pushed right up under SMAILWOLF M3 PRO.** The top nav was
   DELETED entirely ([Dashboard][DPI][Key Bindings][Performance][Macro]
   [More] no longer on the topbar). The left panel now starts at y=60,
   right under the header. **All 4 docks DPI / Polling / Battery / Firmware
   moved to the right column, 2 cells per row (2x2)**, the 3D mouse below
   them.
2. **6 tabs merged into 4 panel items, Vietnamese, each with an icon after
   the label:** Key Bindings ⌨ (Keys + Macro merged — Macro sits right under
   the key list), DPI ◐, Performance ⚡, More ⚙ (Dashboard "Device & battery"
   + Others merged). Default tab is Key Bindings. Clicking the Onboard line
   goes to More.
3. **Polling rate effect was broken.** The cyberpunk glitch radio (Uiverse
   lucky-bobcat-25) was DELETED ENTIRELY (component + all `.uiv-g-*` CSS):
   its selected state was one solid red bar across the whole row and the
   glitch effect was barely visible — exactly the "only shows a little bit"
   complaint. Replaced by a **clean segmented control**: selected item =
   solid orange background + white text, unselected = dim border on a dark
   background. Scroll direction switched to segmented controls too.
4. **Bug found while verifying v2.2:** raising the mouse fill ratio 0.82 →
   0.88 (to compensate for the shorter canvas from the 2x2 docks) cut the 2
   top tags (LEFT/MIDDLE BUTTON, negative dy) off the top edge of the canvas
   — the old scan did NOT catch it because it only measured overlapping tags,
   not tags outside the stage. Added a `tagsOutsideStage` check to the scan.
   Fix: keep fill 0.82 + reduce the 2 top tags' dy (−24→−12, −32→−20). The
   mouse at 1366x768 is slightly smaller than v2.1 — the price of the 2x2
   dock layout chosen (canvas shortened 402→302px).
5. **Verification (stateful mock HID rebuilt, moved into `uitest/` in the
   workspace so a VM replacement doesn't delete it):** clean build, **75/75
   tests**, **36/36 checks** (nav removed, panel y=60, 2x2 docks in the
   right column, segmented 125→250 Hz + save + log, binding Copy→Cut
   end-to-end, fixed DPI button, More has Device & battery + firmware, 0
   console errors), scan at 3 sizes: 1366x768 scroll=768, 1920x1080
   scroll=1080, mobile 390 scrollW=390, 0 overlapping tags, **0 tags
   outside the stage**, 0 console errors.
6. **Honest limits:** the 3D model was still rebuilt from measurements +
   image 2, not a scan; key/macro writes still unproven on the real mouse.

## v2.1 — fits one viewport + 3D model matching image 2 (2026-11-07 23:4x–00:0x)

Three complaints, all three because the 1366x768 screen wasn't measured:

1. **Page overflowed the viewport, scrolling inside the frame.** Measured:
   page scrollHeight 1156 vs viewport 768 (panel sticking out 258px below
   the screen), the panel also had its own scroll inside the tab. Root cause:
   panel `max-h: calc(100vh-2rem)` but the grid started 242px down the page
   → the panel always stuck out; fixed blocks inside the panel got squeezed
   by `flex-shrink` (the Onboard line only 38px left, text cut — exactly the
   "sticking out" seen). **Fix:** shell `h-dvh + overflow-hidden` on desktop,
   compact topbar/docks, main `flex-1`, panel `h-full` with every fixed block
   `shrink-0`, only tab content scrolls, Activity Log collapsible (1 latest
   line by default, click to expand). The annotation strip only shows at
   ≥1536px screens.
2. **The v2.0 mouse model looked like an egg.** Re-measured from image 2
   (the real mouse from above): slimmer body (width/length 0.49), sides
   nearly parallel, smaller bevel; the 2 button plates have a real groove
   between them (0.30 gap — v2.1's first attempt at 0.16 was filled in by
   the bevel so the middle line was invisible) + a horizontal groove at the
   plates' back edge; the scroll wheel **has ribs** (16 ribs around the
   cylinder, visible as horizontal lines from above like image 2); the DPI
   button became a black capsule; side buttons became slightly-raised
   vertical capsules; tags switched to the image-2 style (thin border,
   transparent background, ink text) + light diagonal leaders (staggered
   tags dy ±24/±32 because the 3 right-side dots are only ~20px apart).
3. **Mobile overflowed 132px horizontally.** Cause: a 1-column `auto` grid
   got pushed to 488px by the max-content of the Reset button/caption,
   stretching panel + stage with it. **Fix:** columns `minmax(0,1fr)` +
   `min-w-0` + leaders shortened to the frame width (tags never overflow).
4. **Bug found while verifying v2.1:** scaling the mouse by frame height
   (`h/640`) shrank it to 162px inside a 381px frame → labels piled up and
   overlapped; the correct scale fills ~82% of the frame height, with an
   extra width limit. The old side-button anchor (x=3.5) sat outside the new
   capsule (ends at 3.35) so click tests missed — moved to 3.15.
5. **Verification (machine-measured scan, 3 sizes):** 1366x768 page scroll =
   768 (NO scroll), 1920x1080 = 1080, mobile 390px scrollW = 390 (no more
   horizontal overflow), 0 overlapping labels at all 3 sizes, 0 console/page
   errors, clean build, **75/75 tests**, **27/27 checks** (binding Copy→Cut
   end-to-end still works). Screenshots attached: 1366x768 + 1920x1080 +
   2x mouse crop.
6. **Applied the ui-ux-pro-max skill this time:** design-system density
   query 9 → Data-Dense Dashboard (minimum padding, maximum data per
   screen); §5 Layout (no horizontal scroll, fits the viewport), §2 touch
   44px kept, §1 contrast 4.5:1.
7. **Honest limits:** the 3D model was still rebuilt from measurements +
   image 2, not a scan; key/macro writes still unproven on the real mouse.

## v2.0 — the big "TRANSISTOR" UI overhaul (2026-11-07 22:51–23:2x)

Following exactly the 4 images sent in:

1. **Paper background + technical grid (image 1):** paper beige #E9E7E2 +
   faint 56px grid, Oswald headlines, Fira Code mono captions — the
   chip/transistor was REMOVED, replaced by a **white 3D mouse model**
   (Three.js, built from real measurements: extruded body, 2 button plates,
   scroll wheel, DPI button, 2 side buttons). The mouse **stands still**
   (no auto-rotate — as requested); clicking a button on the mouse (or its
   label) opens the key-binding popup.
2. **Rounded navy frame on the left (image 3):** panel #17172B, header
   "● M3", an orange **+ Create** button + **Import** (export/import JSON
   config), an "Onboard configuration" line with an orange rule, holding
   all 6 tabs + Activity Log at the bottom.
3. **Key-binding popup (image 4):** dark panel, 4 tabs **System / Keyboard /
   Instruction / Macro**, the full action catalog of the original app
   (Mouse 8, Edit 3, Media 8, System 12 — see `../PROTOCOL.md` §8.7).
   Clicking an action → the popup **flies into the left config frame**
   (framer-motion) and only then writes to the mouse via `saveKeys` + reads
   back to verify. The DPI button is fixed and cannot be rebound (the
   original app too).
4. **4 frosted-glass docks on top (not copied from image 1):** Current DPI /
   Polling / Battery / Firmware — light glass `backdrop-filter` on the paper
   background, Oswald 30px values.
5. **Old effects (teal glass v1.x) removed entirely.** Galaxy round 2:
   glitch radio (polling + scroll direction), neon power switch (Line
   correction), sliding toast, square-snake loader, striped card (macro),
   blue glass card (firmware), blob button (secondary buttons in the dark
   panel). Fonts **self-hosted** in `public/fonts/` (Oswald + Fira Code +
   Fira Sans, SIL OFL) — the app runs offline, no Google Fonts needed.
6. **Bug found while verifying v2.0 (fixed):** the 3D canvas click handler
   kept a stale `onPartClick` closure from mount (`connected=false`), so
   clicking a 3D button after connecting still showed "Not connected" — fix:
   a ref always pointing at the latest version; 3D labels stop pointer-event
   bubbling so one click doesn't fire twice. 3D labels now have leader lines
   in the image-2 style, tags outside the mouse body, not overlapping each
   other (measured with Playwright: 0 collisions).
7. **Verification (Chrome headless + a fake HID mouse speaking the real
   protocol, with remembered writes):** clean build, **75/75 tests** (61 old
   + 14 new: keyName scroll/consumer + catalog), **27/27 headless checks
   PASS** (real WebGL render, 4 docks showing the live numbers
   1,600/125Hz/100%/2.1.3, clicking the side button Copy → popup opens →
   rebind Cut → log "Bound Forward → Keyboard: Ctrl+X" + the 3D label
   changes to Cut, clicking DPI shows the fixed note, all 6 tabs, **0 console
   /page errors**). Screenshots in the test folder.
8. **Honest limits:** the 3D model was rebuilt from measurements, not a scan
   of the real mouse; key/macro writes through the popup still use the
   `saveKeys`/`writeMacros` path — the config write is proven live, **key /
   macro writes are not proven on the real mouse** (needs a Live click);
   battery still only as smooth as the mouse's own reported byte; no LED, no
   firmware update (by design).

## v1.2 — battery measured correctly over real time (2026-11-07 22:2x)

1. **Why the v1.0/v1.1 battery "lied":** the original app only asks for the
   battery once at startup and never asks again — the remake copied that
   exactly, so the real battery dropped while the screen still said 100%.
   The fault was **stale data**, not a wrong measurement.
2. **Fix:** in Live mode the app asks for the battery itself every 30 seconds
   (report 48 through the serial queue) + records history with timestamps
   (only when the % changes, max 120 entries) + a "Read battery now" button.
   A sleeping mouse that doesn't answer keeps the old % and logs once. Demo
   does NOT poll the battery — it keeps the sample value, no invented drain
   curve.
3. **Honest limits:** the only source is byte 7 of report 48; the original
   app shows that number directly, no voltage, no smoother hardware
   measurement. The real granularity of the battery byte (per-% or in steps)
   was unknown — every live read so far was 100%; a long Live run will show
   the real drop steps in the history.
4. **Proven with a fake HID mouse speaking the real protocol:** polls at
   30/60/90 seconds returned exactly 99/98/97%, log "Battery: 100% → 99%"
   etc., "Read battery now" returned 96%, Demo history stayed at 1 entry
   after 12 seconds, 0 console/page errors.

## v1.1 — fixing 2 bugs reported live (2026-11-07 22:06)

1. **A liquid-glass layer over the button, clicks didn't land.** Cause: the
   v1.0 button used Uiverse `modern-bear-96`'s 2-layer structure (glass text
   + BG gradient offset 6px, `z-index:-1`). Inside a card with
   `backdrop-filter`, the 2 layers split apart: the bright glass layer floated
   above the button, the gradient layer sank below it — looking like liquid
   glass pressed over the button; the gradient strip sticking out 6px below
   the button didn't click (it fell through to the card). Reproduced with
   Chrome headless (Playwright): captured exactly the misaligned glass layer
   from the screenshot sent in; clicking the strip below the button died,
   clicking the middle of the button worked. **Fix:** dropped the BG layer
   entirely, the button is now a single layer only (gradient/glass painted
   straight onto the button) — what you see is what you click. Re-verified
   with Chrome headless: clicking 5 points on the button (4 corners + center)
   all worked, DPI changed stage correctly, `elementFromPoint` at the button
   center returned the button itself; click-through across all 6 tabs (DPI
   preset + save, key-binding modal, line-correction toggle + save, create
   macro + record key A + save, Others checksum OK) — **0 console/page
   errors**.
2. **The app claimed "Connected" without any permission granted — it looked
   made up.** v1.0 auto-enabled Demo on open. **Fix v1.1:** the app opens in
   a **Not connected** state, and the choice is explicit: "Try Demo
   (simulated)" or "Connect a real mouse (WebHID)" (Live opens the browser's
   permission dialog to pick a device). In Demo, everything says clearly
   "Demo (simulated) — not a real mouse, no permission requested": a
   `DEMO · SIMULATED` badge, sidebar "Demo running (simulated)", log/toast
   all prefixed `Demo (simulated):`, no line left saying "writing to the
   mouse" while in Demo.

## Moving to the real app — done in v3.0.1

This frontend moved as-is to **Tauri 2 + WebHID** (the original app's exact
stack, lighter than Electron): `LiveMouse` uses WebView2's WebHID, the
protocol code unchanged. See "v3.0.1" above.
