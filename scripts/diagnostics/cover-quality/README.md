# Album artwork diagnostics

These optional tools inspect artwork quality. The application and its builds do not depend on them.

- `Probe.java` and `AndroidManifest.xml`: read the active player's artwork URI and compare the dimensions returned by NAS cover requests. URLs and session credentials are not printed. Playback and application data are not changed.
- `run.ps1`: compile the probe using Android SDK Platform 36, installed build-tools, and `JAVA_HOME` (or `javac` on PATH). Generated classes, dex, and APKs go into a unique directory under the system temporary directory.
- `source.cjs`: optionally inspect the NAS's public Audio Station JavaScript, using `EXPO_PUBLIC_NAS_EXTERNAL_URL` from the project's local environment file. It writes no files.

Compile without installing or contacting a phone:

```powershell
./scripts/diagnostics/cover-quality/run.ps1 -BuildOnly
```

Run against a connected Android phone with a NAS track selected:

```powershell
./scripts/diagnostics/cover-quality/run.ps1 -Keystore path/to/debug.keystore
adb uninstall xyz.yeongdu.coverprobe
```

The diagnostic APK uses the standard Android debug keystore alias/password. It is separate from the music application.

The artwork implementation lives in `src/services/artwork/image-url.ts`, `src/components/artwork.tsx`, and `src/app/player.tsx`. Its regression checks live in `scripts/check-player-options.cjs`. No manually maintained application or diagnostic source belongs in `.expo/`.

To verify the application independently of existing Expo-generated files, run `node scripts/check-clean-export.cjs` from the project root. This copies Git-visible source into a new system temporary directory, installs dependencies offline from the frozen lockfile (including registered patches), and exports Android/iOS production bundles followed by a typecheck. Source maps must contain the current application screen source; a successful export of an empty Router context is rejected. It does not copy the project's `.expo/`, generated native projects, or local environment files, and it does not compile/sign APKs or IPAs. The local pnpm store must already contain the required packages; pass `--online` to permit downloading missing packages. Existing project dependencies are not modified.
