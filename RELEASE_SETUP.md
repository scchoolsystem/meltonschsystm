# SmartDev ERP — Release Pipeline Setup

This package contains everything needed to publish SmartDev ERP across all platforms from a single `git tag`.

---

## What Gets Built & Released

| Platform | File | Trigger |
|---|---|---|
| **Website** | Deployed to smartdev.co.ke | Push to `main` |
| **Android APK** | `SmartDev-v1.0.0.apk` | Push a `v*` tag |
| **Android AAB** | `SmartDev-v1.0.0.aab` (for Play Store) | Push a `v*` tag |
| **Windows** | `SmartDev_x64-setup.exe` + `.msi` | Push a `v*` tag |
| **macOS (Apple Silicon)** | `SmartDev_aarch64.dmg` | Push a `v*` tag |
| **macOS (Intel)** | `SmartDev_x64.dmg` | Push a `v*` tag |
| **Linux** | `smartdev_amd64.AppImage` + `.deb` | Push a `v*` tag |

---

## Step 1 — Copy Files Into Your Repo

Copy these files into your `meltonschsystm-main` repo, replacing/adding as listed:

```
src-tauri/
  Cargo.toml          ← NEW
  build.rs            ← NEW
  tauri.conf.json     ← NEW
  capabilities/
    default.json      ← NEW
  src/
    main.rs           ← NEW
    lib.rs            ← NEW
  (keep existing Cargo.lock and gen/ folder)

.github/workflows/
  deploy.yml          ← already exists (website deploy — keep it)
  release-desktop.yml ← NEW
  release-android.yml ← NEW

scripts/
  setup-signing.sh    ← NEW
  build-android.sh    ← already exists (keep it)
```

---

## Step 2 — Generate Icons for Tauri

Run this once in your Codespace after installing deps:

```bash
pnpm tauri icon public/favicon.png
```

This auto-generates all required icon sizes into `src-tauri/icons/`.

---

## Step 3 — Set Up Android Signing

Run in your Codespace:

```bash
chmod +x scripts/setup-signing.sh
bash scripts/setup-signing.sh
```

This will:
1. Generate your release keystore (one time only — **save the passwords!**)
2. Print the base64-encoded keystore to copy into GitHub Secrets
3. Tell you exactly which secrets to add

---

## Step 4 — Add GitHub Secrets

Go to: **GitHub → Your Repo → Settings → Secrets and variables → Actions**

Add all of these:

| Secret Name | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project settings |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase project settings (anon key) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → API Tokens |
| `ANDROID_KEYSTORE_BASE64` | Output of `setup-signing.sh` |
| `ANDROID_STORE_PASSWORD` | Password you entered when generating keystore |
| `ANDROID_KEY_ALIAS` | `smartdev` |
| `ANDROID_KEY_PASSWORD` | Key password you entered |
| `TAURI_SIGNING_PRIVATE_KEY` | Optional — for Tauri updater (skip for now) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Optional — for Tauri updater (skip for now) |

---

## Step 5 — Add @tauri-apps/cli to devDependencies

```bash
pnpm add -D @tauri-apps/cli@^2
```

Then update `package.json` scripts section to add:

```json
"tauri": "tauri",
"build:desktop": "tauri build",
"dev:desktop": "tauri dev"
```

---

## Step 6 — Release Everything

```bash
git add .
git commit -m "chore: add full release pipeline"
git tag v1.0.0
git push origin main --tags
```

GitHub Actions will automatically:
- ✅ Deploy the website to Cloudflare Workers
- ✅ Build signed Android APK + AAB
- ✅ Build Windows installer (.exe + .msi)
- ✅ Build macOS app (.dmg for Intel + Apple Silicon)
- ✅ Build Linux app (.AppImage + .deb)
- ✅ Create a public GitHub Release with all download links

---

## Sharing the App Publicly

After the release workflow finishes (~20 min), go to:
**GitHub → Your Repo → Releases**

You'll see a public release page with direct download links for every platform. Share that URL with anyone.

For Play Store submission, use the `.aab` file from the release assets.

---

## Local Desktop Dev (Optional)

```bash
pnpm tauri dev
```

This opens a native desktop window loading your local dev server.

---

## Troubleshooting

**Tauri build fails on Linux in CI** → Make sure `release-desktop.yml` is present with the `libwebkit2gtk-4.1-dev` apt install step (already included).

**Android build fails: keystore not found** → Check that `ANDROID_KEYSTORE_BASE64` secret is set correctly and is the full base64 output (no newlines).

**`pnpm tauri icon` fails** → Make sure `public/favicon.png` exists and is at least 1024×1024px. Use any square PNG as input.
