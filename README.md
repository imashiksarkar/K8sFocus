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

The macOS builds are not signed yet. After installing, run `xattr -dr com.apple.quarantine /Applications/K8sFocus.app` or right-click the app → **Open**.
