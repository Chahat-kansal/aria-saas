# Aria OS — Desktop App (Tauri 2)

This wraps the live Aria OS web app as a native desktop application using [Tauri 2](https://tauri.app).
Mode: **Remote URL** — the app window loads `https://www.ariaos.site` directly.
No static export required. Every deploy to the web app is reflected immediately in the desktop client.

## Prerequisites

### Rust
Install via rustup:
```
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Platform build tools
- **Windows**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`

## Running locally

```bash
# Install dependencies (first time)
npm install

# Start dev mode (opens a native window pointed at localhost:3000 or the live site)
npm run tauri:dev

# Build installers
npm run tauri:build
```

Installers land in `src-tauri/target/release/bundle/`:
- Windows: `msi/` and `nsis/` subfolders
- macOS: `dmg/`
- Linux: `deb/` and `appimage/`

## Code signing (required before public distribution)

- **macOS**: Requires an Apple Developer certificate. Set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` env vars.
- **Windows**: Requires an EV code-signing certificate. Set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- For internal/beta distribution, signing can be skipped (users will see a security warning).

## Architecture

The desktop app uses **Mode A (Remote URL)**:
- `tauri.conf.json` → `build.frontendDist: "https://www.ariaos.site"`
- The Tauri shell is ~10MB; no Next.js bundling needed
- Web deploys are reflected instantly — no rebuild of the desktop app needed

## POS Kiosk Mode

The `open_pos_kiosk` Tauri command opens a second fullscreen window pointed at `/pos`.
Invoke from JS via: `import { invoke } from '@tauri-apps/api/core'; invoke('open_pos_kiosk')`

## Hardware Roadmap (post-launch)

The Tauri wrapper provides the foundation for future hardware integrations:

| Hardware | Approach |
|---|---|
| Receipt printers (ESC/POS) | Rust crate `escpos` over USB/serial via `tauri-plugin-serialport` |
| Cash drawer | Kick signal via receipt printer port |
| Card readers | `tauri-plugin-usb` or platform SDK FFI |
| Barcode scanners | HID keyboard emulation — handled in web layer already |

These are **not implemented** in this sprint. The wrapper exists; hardware integration is post-launch.
