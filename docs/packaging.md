# Lunaris desktop packages

## Pop!_OS, Ubuntu, and Debian

Lunaris uses Tauri v2's Linux WebKitGTK runtime. Build on Ubuntu 22.04 or a compatible Pop!_OS/Debian base so the generated package does not require a newer glibc than its users have.

Install the Linux build prerequisites:

```sh
sudo apt update
sudo apt install -y build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf libwebkit2gtk-4.1-dev libfuse2
```

Install the Node and Rust toolchains used by the project, then run:

```sh
npm ci
npm run tauri:linux
```

The Linux configuration creates `.deb` and AppImage packages under `src-tauri/target/release/bundle/`. On Pop!_OS, install the `.deb` with `sudo apt install ./Lunaris_*.deb`. The package declares its WebKitGTK and GTK runtime dependencies; Pop!_OS's Ubuntu base resolves them through APT.

The AppImage can be run directly on Pop!_OS after marking it executable (`chmod +x Lunaris_*.AppImage`). Install `libfuse2` if the system reports that FUSE support is unavailable. The Ubuntu 22.04 build baseline is selected to improve compatibility with Pop!_OS, Ubuntu, and Debian systems.

## Windows

On Windows with the Tauri prerequisites installed:

```powershell
npm ci
npm run tauri build
```

This creates the executable and, when the NSIS and WiX bundlers are available, the NSIS setup executable and MSI under `src-tauri/target/release/bundle/`.

## Automated package builds

The `Build desktop installers` GitHub Actions workflow builds Windows NSIS/MSI packages and Linux `.deb`/AppImage packages on an Ubuntu 22.04 runner. It runs on version tags or when manually dispatched. It stores the installers as workflow artifacts and does not publish a release.
