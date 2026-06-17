# RIBA Desktop · Tauri v2 build guide

This document explains how to package RIBA as a native desktop app for
Windows (`.exe`/`.msi`) and macOS (`.dmg`) using **Tauri v2**.

The skeleton is committed under `/app/src-tauri/`. The actual native build
must run on a machine with the Rust toolchain installed (it does not run
inside the preview container).

## 1. Prerequisites (one-time setup, on your local machine)

| Tool | Install command | Notes |
|------|-----------------|-------|
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | <https://rustup.rs/> |
| Node 18+ | already installed in this project | |
| Yarn | already installed | |
| OS build tools | macOS: `xcode-select --install` · Windows: VS Build Tools 2022 · Linux: `apt install libwebkit2gtk-4.1-dev build-essential libssl-dev pkg-config` | required by Tauri |
| Tauri CLI | `cd /app/frontend && yarn add -D @tauri-apps/cli@latest` | already declared in `package.json` scripts |

## 2. Project layout

```
/app
├── frontend/          # React + CRA app (the UI)
│   └── package.json   # adds "homepage": "./", "desktop:dev", "desktop:build"
├── backend/           # FastAPI app (cloud or sidecar)
└── src-tauri/         # Tauri shell (this scaffold)
    ├── tauri.conf.json
    ├── Cargo.toml
    ├── build.rs
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs    # binary entry point
        └── lib.rs     # Builder setup (shared with mobile)
```

## 3. Run the desktop dev shell

```bash
cd /app/frontend
yarn desktop:dev
```

What happens:
1. `yarn start` boots CRA on `http://localhost:3000` (hot reload).
2. Tauri compiles Rust → launches a native window pointing at `localhost:3000`.
3. DevTools open automatically in debug builds.

## 4. Produce installers

```bash
cd /app/frontend
yarn desktop:build
```

Output artifacts land in `/app/src-tauri/target/release/bundle/`:

| OS | File | Format |
|----|------|--------|
| macOS | `dmg/RIBA_1.6.0_aarch64.dmg` | drag-to-install |
| macOS | `macos/RIBA.app` | unbundled app |
| Windows | `msi/RIBA_1.6.0_x64_en-US.msi` | MSI installer |
| Windows | `nsis/RIBA_1.6.0_x64-setup.exe` | NSIS installer |
| Linux | `deb/riba_1.6.0_amd64.deb` | Debian/Ubuntu |
| Linux | `appimage/riba_1.6.0_amd64.AppImage` | universal Linux |

> ⚠️ macOS `.icns` placeholder: regenerate proper macOS icons on a Mac via
> `npx @tauri-apps/cli icon icons/icon.png`.

## 5. Optional FastAPI sidecar (offline / on-prem)

By default the desktop app calls the cloud backend at `REACT_APP_BACKEND_URL`.
To embed FastAPI directly:

1. Bundle the backend into a single binary:
   ```bash
   cd /app/backend
   pip install pyinstaller
   pyinstaller --onefile --name riba-api server.py
   ```
2. Copy the resulting executable into `/app/src-tauri/binaries/` and rename
   it with the Rust target triple (Tauri requirement):
   - Windows: `riba-api-x86_64-pc-windows-msvc.exe`
   - macOS Apple Silicon: `riba-api-aarch64-apple-darwin`
   - macOS Intel: `riba-api-x86_64-apple-darwin`
3. Uncomment the `externalBin` line in `tauri.conf.json` `bundle` block:
   ```json
   "externalBin": ["binaries/riba-api"]
   ```
4. Uncomment the sidecar block in `src-tauri/src/lib.rs`.
5. Rebuild — RIBA will now boot its own FastAPI on `127.0.0.1:8001`.
   The frontend will automatically prefer the local sidecar (see
   `frontend/src/lib/runtime.js`).

## 6. CI/CD recommendation

Use GitHub Actions matrix builds (`tauri-apps/tauri-action`) to produce
all platform installers from a single tag push. Sample workflow:

```yaml
on: { push: { tags: ['v*'] } }
jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-22.04, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          projectPath: src-tauri
          tagName: v__VERSION__
```

## 7. Known caveats

| Issue | Fix |
|-------|-----|
| White screen in prod | `"homepage": "./"` is set in `frontend/package.json` (assets become relative). |
| Service worker errors | `serviceWorkerRegistration.js` skips registration when `window.__TAURI_INTERNALS__` is detected. |
| CORS to cloud backend | Add `tauri://localhost` and `http://tauri.localhost` to the FastAPI CORS allowlist before shipping. |
| Code signing | Required on macOS (Notarization) and recommended on Windows. See <https://tauri.app/v2/guides/distribution/> |
