# K8sFocus

A fast desktop Kubernetes client that aims for feature parity with Lens. It is built with Tauri 2, React, Tailwind and shadcn/ui.

See [ROADMAP.md](ROADMAP.md) for the features and the task list.

## Development (macOS)

```sh
# one-time setup
xcode-select --install                                           # Xcode command line tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust
bun install

bun run tauri dev      # run the app
bun run tauri build    # build the .app and .dmg (written to src-tauri/target/release/bundle/)
```

## Installers from CI

Go to GitHub → **Actions** → **Build installers** → **Run workflow**, then choose the platforms. When the run finishes, download the files from its **Artifacts** section:

| Platform | Installers |
|---|---|
| macOS | `.dmg` for Apple Silicon and for Intel |
| Linux | `.deb`, `.AppImage` and `.rpm` |
| Windows | `.exe` (NSIS) and `.msi` |

These are test builds. See **Installing** below for opening the app the first time on macOS.

## Installing (for users)

Download the installer for your platform from the [latest release](https://github.com/imashiksarkar/K8sFocus/releases/latest).

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `K8sFocus_<version>_aarch64.dmg` |
| macOS (Intel) | `K8sFocus_<version>_x64.dmg` |
| Windows | `K8sFocus_<version>_x64-setup.exe` (or `.msi`) |
| Ubuntu / Debian | `K8sFocus_<version>_amd64.deb` |
| Other Linux | `K8sFocus_<version>_amd64.AppImage` |

**First launch on macOS.** K8sFocus is open source and isn't notarized by Apple, so macOS warns that it can't verify the developer the first time you open it.
1. Open the `.dmg` and drag **K8sFocus** to **Applications**.
2. Open it once. When macOS blocks it, go to **System Settings → Privacy & Security** and click **Open Anyway**. On older macOS versions you can right-click the app → **Open** instead.

If macOS says the app "is damaged", run this once in Terminal:
```sh
xattr -dr com.apple.quarantine /Applications/K8sFocus.app
```

**Windows SmartScreen:** click **More info → Run anyway**.

After that, K8sFocus updates itself. It checks for new versions on startup, and you can also use **K8sFocus → Check for Updates…**.

## Releasing (for maintainers)

### One-time setup
1. Generate the updater signing key. Keep the private key safe; if it's lost, existing installs can't verify new updates.
   ```sh
   bun run tauri signer generate -w ~/.tauri/k8sfocus.key
   ```
2. Copy the **public** key from `~/.tauri/k8sfocus.key.pub` into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`, and commit the change.
3. Add these secrets in the GitHub repo (**Settings → Secrets and variables → Actions**):
   - `TAURI_SIGNING_PRIVATE_KEY`: the contents of `~/.tauri/k8sfocus.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password you chose (may be empty)

### Each release
1. Bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, and commit.
2. Go to GitHub → **Actions → Release → Run workflow** and enter the release notes. The workflow builds every platform and creates a **draft** release `v<version>` with the installers and `latest.json`.
3. Check the draft and click **Publish**. Installed apps pick up the update on their next check.

The download links on your website can always point at the latest release:
`https://github.com/imashiksarkar/K8sFocus/releases/latest`
