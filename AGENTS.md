# AGENTS.md

K8sFocus is a desktop Kubernetes client that aims for feature parity with Lens. The main target is macOS. It also ships for Linux (Ubuntu) and Windows.

## Stack
- **Backend:** Tauri 2 (Rust), in `src-tauri/`. All Kubernetes access goes through `kube-rs` in Rust and is exposed to the UI as Tauri commands and events.
- **Frontend:** React 19 + TypeScript + Vite, in `src/`.
- **UI:** Tailwind CSS v4 + shadcn/ui (new-york style).
  - Add components with `bunx shadcn@latest add <name>`.
  - Use the `@/` path alias.
- **Theme:** dark mode by default (`class="dark"` on `<html>`) with a yellow primary color.
  - Theme tokens live in `src/index.css`.
  - Use the semantic classes (`bg-primary`, `text-muted-foreground`, …) and never hard-coded colors.
- **Package manager:** bun.

## Commands
- `bun install`: install the dependencies.
- `bun run tauri dev`: run the app with hot reload.
- `bun run build`: type-check and build the frontend.
- `bun run tauri build`: build the release installer for the current OS.
- `cd src-tauri && cargo fmt && cargo clippy`: format and lint the Rust code.
- `bun run tauri icon assets/icon.svg && rm -rf src-tauri/icons/android src-tauri/icons/ios`: regenerate all app icons from the source SVG.

## Rules
- **Never run anything against a Kubernetes cluster.** Give the user the commands and the user runs them.
- Work through [ROADMAP.md](ROADMAP.md) one task at a time. Tick the box only after the user has tested the task.
- The frontend never calls kubectl or the cluster directly. Everything goes through Rust commands.
- CI is manual only (`workflow_dispatch`). Installers are uploaded as artifacts of the workflow run.
