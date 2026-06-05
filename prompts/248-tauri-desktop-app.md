# CLAUDE CODE PROMPT — 248: Tauri Desktop App (POS terminal + Aria OS)

Autonomous mode, no permission prompts. This sprint adds a Tauri desktop wrapper. NOTE: Tauri requires the Rust toolchain and runs build steps that need a real terminal — flag to the user that the final `tauri build` (producing .exe/.dmg) must run on their machine, not in the browser-only Claude Code flow. This sprint sets up all the config + scaffolding and commits it; the user runs the native build locally.

## GOAL
Wrap the existing Next.js Aria OS as a lightweight native desktop app (Windows .exe, macOS .dmg, Linux .deb) using Tauri 2. Far lighter than Electron (~10MB vs ~150MB) because it uses the OS webview. Priority use case: the in-store POS terminal running fullscreen with future hardware access (receipt printers, cash drawers, card readers).

## VERIFIED CONTEXT
- Next.js 14.2 App Router. Deployed web app at www.ariaos.site.
- Two viable Tauri modes:
  (A) **Remote URL mode** — Tauri shell loads the live https://www.ariaos.site (or a self-hosted build). Simplest; the desktop app is a native window around the deployed site. Best for launch — POS always reflects latest deploy, no static-export headaches.
  (B) **Bundled static export** — `next export` the app into Tauri. Requires the app to work without a Node server (hard, since Aria has API routes + SSR). NOT recommended given Aria's server-side routes.
- Use MODE A (remote URL). It sidesteps the static-export problem entirely and keeps one source of truth.

## PHASE 1 — Scaffold Tauri (config files only; user runs install locally)
Create the Tauri project structure under `src-tauri/`:
- `src-tauri/tauri.conf.json` — MODE A config:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Aria OS",
  "version": "0.1.0",
  "identifier": "site.ariaos.desktop",
  "build": { "frontendDist": "https://www.ariaos.site" },
  "app": {
    "windows": [{
      "title": "Aria OS",
      "width": 1440, "height": 900,
      "minWidth": 1024, "minHeight": 700,
      "resizable": true, "fullscreen": false,
      "center": true
    }],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis", "dmg", "deb", "appimage"],
    "icon": ["icons/32x32.png","icons/128x128.png","icons/128x128@2x.png","icons/icon.icns","icons/icon.ico"]
  }
}
```
- `src-tauri/Cargo.toml` — standard Tauri 2 Rust manifest (tauri, tauri-build, serde, serde_json deps)
- `src-tauri/build.rs` — `fn main() { tauri_build::build() }`
- `src-tauri/src/main.rs` — minimal Tauri 2 entry:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running Aria OS");
}
```
- `src-tauri/capabilities/default.json` — Tauri 2 capabilities (window + future printer/usb access placeholder)
- `src-tauri/icons/` — generate from the same Aria brand mark as the PWA icons (Tauri needs .ico, .icns, and PNG sizes). Reuse the PWA icon art.

## PHASE 2 — A dedicated POS terminal window mode
The POS should be able to launch fullscreen kiosk-style. Add a second window config OR a runtime command that opens `https://www.ariaos.site/pos` fullscreen. Add to tauri.conf.json a comment/doc and a `src-tauri/src/main.rs` command `open_pos_kiosk` that creates a fullscreen window pointed at /pos. Keep it simple — one extra Rust command.

## PHASE 3 — package.json scripts (user runs these locally)
Add to root package.json scripts (do not remove existing):
```json
"tauri": "tauri",
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```
Add `@tauri-apps/cli` to devDependencies (version ^2). Note in the commit message that the user must run `npm install` then `npm run tauri:build` LOCALLY (needs Rust + platform toolchain).

## PHASE 4 — README for the desktop build
Create `src-tauri/README.md` documenting: prerequisites (Rust via rustup, platform build tools — Visual Studio Build Tools on Windows, Xcode CLT on Mac), how to run `npm run tauri:dev` and `npm run tauri:build`, where the installers land (`src-tauri/target/release/bundle/`), and that MODE A means the app loads the live site so deploys are reflected automatically.

## PHASE 5 — Hardware roadmap note (don't build yet)
In the README, document the future hardware path: Tauri plugins / Rust crates for receipt printers (ESC/POS over USB/serial), cash drawer (kick via printer), and card readers. Flag these as post-launch — the wrapper is built now so the hardware integration has a home later. Do NOT implement hardware in this sprint.

## VERIFICATION (what can be checked in browser-only flow)
1. All `src-tauri/` config files are valid JSON/TOML/Rust syntax
2. package.json scripts added, `@tauri-apps/cli` in devDependencies
3. tauri.conf.json points frontendDist at the live site (MODE A)
4. Icons generated and referenced correctly
5. README documents the local build steps
6. The main Next.js `npm run build` still passes (we added nothing that affects the web build)

## WHAT THE USER DOES LOCALLY (flag clearly in final message)
- Install Rust: https://rustup.rs
- Windows: install Visual Studio Build Tools (C++ workload). Mac: `xcode-select --install`
- `npm install`
- `npm run tauri:dev` to test, `npm run tauri:build` to produce installers
- Code-signing (Apple Developer cert / Windows EV cert) needed before distributing — document but don't block

## HARD RULES
- MODE A only (remote URL) — do not attempt next export / static bundling (breaks on API routes)
- Do not modify the Next.js app itself — Tauri wraps it externally
- Everything for Tauri lives under `src-tauri/`
- Don't claim the desktop app is "built" — this sprint scaffolds it; the native binary builds on the user's machine
- Build gate the WEB app (npm run build) to confirm nothing broke
