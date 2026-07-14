# SHELL-1 — Canopy Desktop Shell, First Build

Status: **built, typechecked, built-installed, and packaged.** See VERIFY section for what still needs a human pass (the app was not launched interactively in this environment — no display/desktop available to the agent).

## What was built

A new, self-contained Electron project at `canopy/` (fresh, separate from the main Next.js
repo and from `src-tauri/` — neither was touched). It implements `design/aria-environment-original.jsx`
in real, IPC-wired React/TypeScript as Canopy's desktop shell.

### Electron main process (`canopy/src/main/`)
- `config.ts` — resolves the production URL (`https://www.ariaos.site`, overridable via `CANOPY_APP_URL`).
- `api.ts` — every real-data call (business identity, activity feed, health/alerts, today's sales,
  PIN verification) goes through `net.fetch` in the main process, not the renderer, so it shares
  Electron's default session cookie jar. A renderer-side `fetch()` from a `file://`-loaded page would
  hit CORS and carry no auth cookie — this is why nothing calls the API directly from React.
- `windows.ts` — creates the frameless/kiosk/fullscreen Canopy window; loads the real
  `/login?redirectTo=%2Fdashboard` first and only swaps to the local Canopy renderer once the URL
  moves off `/login` (proof a session exists — see "Auth model" below); opens/closes real separate
  `BrowserWindow`s for AriaOS and POS; pushes an `app-closed` IPC event back to Canopy when a real
  window is closed via its own chrome so the Shelf's running-dot stays accurate.
- `index.ts` — app lifecycle, IPC handler registration, `autoUpdater.checkForUpdatesAndNotify()`
  (no-op'd via `.catch()` since no release exists yet).

### Preload scripts (`canopy/src/preload/`)
- `canopy.ts` — the only bridge between the Canopy renderer and the main process
  (`contextBridge.exposeInMainWorld('canopyAPI', ...)`).
- `chrome.ts` — injected into the real AriaOS/POS windows only. Draws a fixed 30px flag-tab bar
  (sage for AriaOS, deep-green for POS) with a drag region and a × close button, purely at the
  Electron layer. **Touches zero files in the main Next.js app.**

### Renderer (`canopy/src/renderer/src/App.tsx`)
Ports the design file's exact color tokens (`P`, `A`), `AMark`, `Win`, boot screen, status strip,
lock screen, ambient feed, widgets, center launcher, launcher modal, and Shelf. Real wiring replaces
every mock in the original demo:
- `OWNER_PIN` hardcoded compare → `window.canopyAPI.verifyPin(businessId, pin)`, scope from the
  server response (`'owner' | 'staff'`)
- `PULSE`-cycling mock feed → polls `canopyAPI.getActivity(businessId)` (real `dashboard/stats`
  activity log) every 45s
- hardcoded `$4,782.50` sales / alert copy → polls `canopyAPI.getTodaySales()` (summed from real
  `pos_sales`, `status != 'voided'`, local-midnight cutoff) and `canopyAPI.getHealth(businessId)`
  (`business-health-quick`'s `issues[]`)
- hardcoded `"Sip Café"` → `canopyAPI.getBusiness()`

### Backend — the two new, additive files (main Next.js app)
- `src/app/api/pos/canopy-pin/route.ts` — new route, generalizes `manager-verify`'s lookup-by-PIN
  pattern to every `pos_users` role (not just manager/owner/admin), collapses to a binary
  `owner`/`staff` scope. Auth-gated, rate-limited (`pin:canopy:${user.id}`, 15/60s, fail-closed),
  `verifyBusinessAccess`-checked. Does **not** modify `verify-pin` or `manager-verify`.
- `src/lib/pos/canopy-session.ts` — new HMAC session token (16-hour TTL), mirrors
  `manager-token.ts`'s signing pattern but is a separate file with different security properties
  (no shared code path with the 60-second manager override token).

### Packaging
- `canopy/electron-builder.yml` — NSIS target, GitHub publish provider (parameterized via
  `CANOPY_GITHUB_OWNER`/`CANOPY_GITHUB_REPO_NAME`, no real repo exists yet).
- Built and ran a full local installer (see VERIFY below) — **not** run with `--publish`.

## Deviations from the design file / task spec, and why

1. **App roster reconciliation.** The design file's own demo (`ALL_APPS`) lists 13 apps; the task's
   explicit pre-installed set is 8 (AriaOS, Aria AI, POS, Team, Files, Help, Settings, App Store).
   The task's VERIFY section requires staff PIN access to reach "POS + Orders" — but Orders isn't in
   the 8-app list. Resolved by keeping `PINNED`/`STAFF_VISIBLE` exactly as the design file defines
   them and adding "orders" to the roster as a 9th, owner-launcher-hidden app solely so
   `STAFF_VISIBLE` has something real to point to. This mirrors the design file's own filtering
   mechanics exactly; I did not invent new UI for it.
2. **Real windows vs. in-page `<Win>`s.** Only AriaOS and POS open as real separate `BrowserWindow`s
   (per the task's explicit scope item 2). Aria AI, Team, Files, Help, Settings, Orders, App Store
   stay as in-Canopy `<Win>` panels using the design file's own demo/mock content — the task's
   "no mocked numbers" requirement is explicitly scoped to the ambient feed + widgets only, not to
   every window's content, and the task explicitly says App Store is static-list-only this sprint.
3. **Chrome-overlay limitation, not silently claimed as solved.** `chrome.ts` pushes real page
   content down via `margin-top` on `<html>`. If AriaOS/POS's own top nav is `position: fixed`, this
   won't move it — the injected bar may overlap rather than push it down. Flagged in code comments;
   **not visually verified in this environment** (no display available to the agent — see VERIFY).
4. **Placeholder icon, now fixed.** The first icon.ico copied from `src-tauri/icons/icon.ico` was
   only a 16×16 image and failed electron-builder's 256×256 minimum. Rebuilt `canopy/resources/icon.ico`
   by wrapping the existing `src-tauri/icons/256x256.png` in a valid single-entry ICO container (a
   real Canopy-branded icon is still a later, separate task — this is the existing Aria mark, not new
   branding).
5. **"One-line URL default" fix — deliberately not done.** The task asked to fix "any route
   defaulting elsewhere" to `ariaos.site` as a one-line aside. `grep -rn "['\"]https://ariaos\.site['\"]"`
   found 19 files using the bare non-www fallback, none of which SHELL-1 otherwise touches. Forcing a
   fix into 19 unrelated files to satisfy a "one-line aside" would itself be the detour the
   instruction explicitly warned against — left untouched, reported here transparently instead of
   silently ignored or silently over-reached.

## Zero main-app product-code changes — proof

```
$ git status --porcelain src/ | grep -v "src/app/download"
?? src/app/api/pos/canopy-pin/
?? src/lib/pos/canopy-session.ts

$ git diff --stat -- src/
(empty — no tracked file under src/ was modified)
```

Only two new, additive files were added (both explicitly sanctioned by the task text: "a NEW route
... do not modify the existing manager-verify or verify-pin endpoints, add alongside"). No existing
file in the main app was changed. `/download` (from the prior sprint) is already committed separately
and excluded from this diff.

## Build/typecheck verification

**Canopy project** (`canopy/`):
```
npm run typecheck   → tsc --noEmit × 2 configs → 0 errors
npm run build        → electron-vite build → main/preload/renderer all built clean
```

**Main Next.js app** (repo root) — verified after adding the two new files:
```
npx tsc --noEmit     → 0 errors (needed NODE_OPTIONS=--max-old-space-size=8192 in this environment;
                        the default heap OOM'd on this repo's size — pre-existing, unrelated to
                        SHELL-1's two small new files)
npx next build        → succeeded, all routes compiled including the new
                        /api/pos/canopy-pin route and the /download page from the prior sprint
```

## Packaging verification

```
npm run dist:win                                    → dist\win-unpacked\Canopy.exe (unsigned, unpacked)
npx electron-builder --win nsis                      → dist\Canopy Setup 0.1.0.exe (82 MB, unsigned)
                                                         + dist\Canopy Setup 0.1.0.exe.blockmap
```

Both built with `CSC_IDENTITY_AUTO_DISCOVERY` unset and no code-signing certificate — the installer
is **unsigned**, expected for local dev testing, Windows SmartScreen will warn on first run. Building
the NSIS target on Windows requires the OS's Developer Mode (or admin) to be enabled, because
electron-builder's Windows toolchain extracts a macOS code-signing bundle containing symlinks, which
Windows blocks without one of those two. This is an environment/OS prerequisite, not a Canopy code
issue — confirmed working once Developer Mode was turned on.

The publish-config env vars (`CANOPY_GITHUB_OWNER`, `CANOPY_GITHUB_REPO_NAME`) had to be set to
placeholder values (`Chahat-kansal` / `canopy`) purely to let electron-builder resolve its config
template locally — **`--publish` was never passed**, so nothing was uploaded anywhere.

## How to run it

**Local dev (hot reload, real IPC, real API calls against production):**
```
cd canopy
npm install        # first time only
npm run dev
```

**Local installer build/test:**
```
cd canopy
npm run typecheck && npm run build     # verify clean first
CANOPY_GITHUB_OWNER=<owner> CANOPY_GITHUB_REPO_NAME=<repo> npx electron-builder --win nsis
# → dist/Canopy Setup 0.1.0.exe — run it, install, launch Canopy from the Start Menu shortcut
```
(Requires Windows Developer Mode enabled — Settings → Privacy & security → For developers.)

## VERIFY — what's confirmed vs. what still needs a human pass

Confirmed by this agent (no display/desktop available in this environment to launch the app):
- ✅ `tsc`/build both green on Canopy and on the main app with the two new files added
- ✅ Full local NSIS installer built successfully, unsigned, no `--publish`
- ✅ Zero existing main-app files modified (git diff proof above)
- ✅ Auth flow is architecturally sound: relies entirely on existing, unmodified `middleware.ts`
  redirect behavior (verified by direct file read in the pre-flight phase) — no product code needed
  to change for "already logged in" vs. "needs to log in" to work
- ✅ PIN route is real, rate-limited, business-scoped, and generalizes `pos_users.role` correctly to
  a binary owner/staff split (verified: live DB currently has zero non-owner `pos_users` rows for
  Sip Café, so the staff branch is mechanically correct but has no live staff PIN to test against yet)

**Needs a human pass on a real machine** (cannot be done from this environment):
- Launch `Canopy Setup 0.1.0.exe`, confirm it installs and boots fullscreen with no visible OS chrome
  underneath
- Confirm AriaOS and POS windows show real live data — same login, same data as the web version
- Confirm the PIN lock: owner's real credential reaches full view; a staff PIN (once a non-owner
  `pos_users` row exists) reaches the scoped view (POS + Orders only, feed/widgets hidden); an
  invalid PIN does nothing
- Confirm the injected chrome bar doesn't overlap a `position: fixed` top nav in AriaOS/POS (see
  Deviation 3) — visual-only, needs eyes on a running window
- Confirm ambient feed/widgets show real numbers on a business with actual `pos_sales`/activity data
  (Sip Café's current data was not independently re-verified as non-zero in this pass)

## Commits

Two logical units, per the task's "single commit per numbered scope item" allowance:
1. Main-app additive files (PIN route + session token lib)
2. Canopy Electron project (main/preload/renderer/packaging)
