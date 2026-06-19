# RIBA Desktop · Release Guide

This document explains how to ship a new desktop version of RIBA across
**Windows (.exe + .msi)**, **macOS (.dmg)** and **Linux (.deb + .AppImage)**
using the GitHub Actions pipeline shipped in `.github/workflows/release.yml`.

---

## 1. Prerequisites (one-time)

### 1.1 Push the repository to GitHub
The Emergent chat input has a **"Save to GitHub"** action — use it to push the
entire `/app` tree (including `.github/workflows/`) to your GitHub repo.

### 1.2 Configure secrets
In the GitHub UI, open **Settings → Secrets and variables → Actions** and add :

| Secret name            | Required | Notes                                                 |
| ---------------------- | -------- | ----------------------------------------------------- |
| `REACT_APP_BACKEND_URL`| ✅       | The production API URL embedded at build time.        |
| `APPLE_CERTIFICATE`    | optional | Base64 `.p12` Apple Developer cert. Enables notarization. |
| `APPLE_CERTIFICATE_PASSWORD` | optional | Password for the `.p12`.                        |
| `APPLE_SIGNING_IDENTITY` | optional | e.g. `Developer ID Application: Emergent Labs (XXXXXXXXXX)`. |
| `APPLE_ID`             | optional | Apple-ID email used for notarization.                 |
| `APPLE_PASSWORD`       | optional | App-specific password generated on appleid.apple.com. |
| `APPLE_TEAM_ID`        | optional | 10-char team identifier.                              |
| `TAURI_SIGNING_PRIVATE_KEY` | optional | For Tauri's built-in updater signing.           |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | optional |                                          |

Without the Apple secrets, macOS builds succeed but are **unsigned** — users
will see a Gatekeeper warning on first launch (right-click → Open to bypass).

---

## 2. Triggering a release

Cut a tag locally and push it :

```bash
git tag v3.4.0
git push origin v3.4.0
```

This triggers the **`release-desktop`** workflow. It will :

1. Spin up 4 runners in parallel : `macos-latest × (aarch64 + x86_64)`,
   `windows-latest`, `ubuntu-22.04`.
2. Install Node 20, Rust + the platform target, OS-specific deps (WebKit,
   libgtk, libsoup3, etc. on Linux).
3. Regenerate the Phoenix icons via `backend/setup_icons.py`.
4. `yarn install && yarn build` in `frontend/`.
5. `tauri build --target <triple>` → outputs the platform bundle.
6. Publish a **draft GitHub Release** with the installers attached.

Total wall time : ~15-25 min for the full matrix on first run (caches make
subsequent runs much faster — the `swatinem/rust-cache` step keeps the
`src-tauri/target/` artifacts).

---

## 3. Output artifacts

| Platform | Files                                                              |
| -------- | ------------------------------------------------------------------ |
| Windows  | `RIBA_3.4.0_x64-setup.exe` (NSIS) · `RIBA_3.4.0_x64_en-US.msi`     |
| macOS    | `RIBA_3.4.0_aarch64.dmg` · `RIBA_3.4.0_x64.dmg`                    |
| Linux    | `RIBA_3.4.0_amd64.deb` · `RIBA_3.4.0_amd64.AppImage`               |

Each filename ends with the OS-native bundle extension recognised by the
respective platforms. The MSI is useful for enterprise-managed Windows
deployments via Group Policy.

---

## 4. Manual local builds (debug)

If you want to build locally on your own machine instead of CI :

```bash
# install rust once
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# project deps
cd frontend && yarn install
cd ..

# build the bundle for your host OS
yarn --cwd frontend desktop:build
```

The output lives in `src-tauri/target/release/bundle/`.

> **Note on this Kubernetes container.** The Emergent sandbox is Linux ARM64
> (`aarch64`), so a local build here would only produce an ARM64 Linux
> `.deb` — useful for QA but **not** for distribution to Windows/Mac users.
> Always use the GitHub Actions matrix for official releases.

---

## 5. Updating later

1. Bump `src-tauri/tauri.conf.json:version` AND `src-tauri/Cargo.toml:version`.
2. Update `/app/memory/CHANGELOG.md`.
3. Tag and push : `git tag v3.4.1 && git push --tags`.

That's it — RIBA Desktop ships itself. 🔥
