# Lunaris

Lunaris is a Tauri desktop app that clarifies project prompts, selects relevant skills and tools, and prepares execution plans for local or hosted models.

## Development

- Install Node.js 22 and Rust stable.
- Run `npm ci` and `npm run tauri dev`.
- Build Windows installers with `npm run tauri build`.
- Build Pop!_OS, Ubuntu, and Debian packages with `npm run tauri:linux` on Ubuntu 22.04 or WSL.

## Signed app updates

Lunaris checks the GitHub Releases feed on startup and prompts before installing an available signed update. Release builds run when a `v*` tag is pushed. Before publishing, configure the repository Actions secret `TAURI_SIGNING_PRIVATE_KEY` with the private Minisign key used to produce the update signatures. Keep that key private and backed up; `src-tauri/tauri.conf.json` contains the public verification key.

To publish a release, bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, then push the matching tag (for example, `v0.1.1`). GitHub Actions builds Windows NSIS/MSI and Linux AppImage/DEB assets and publishes the release with the updater manifest.
