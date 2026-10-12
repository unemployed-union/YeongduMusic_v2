# Open-source notices

`notices.json` is bundled into the app and readable offline at Settings → Information → Open-source licenses. License texts are kept verbatim (apart from line-ending normalization) with copyright notices, disclaimers, and third-party NOTICE files. Repeated texts share an ID to reduce bundle size. Android-only and iOS-only works are shown on their respective platforms.

## Scope of the audit

- Production Android/iOS Metro source maps identify JavaScript and bundled assets, including Expo Router's vendored React Navigation, vector-icons, Ionicons, and Material Symbols. Compiler/linter/build-time dependencies are excluded unless some of their code is actually present in the bundle.
- Autolinked native npm modules are included even if the application imports only their TypeScript types.
- Android's resolved `releaseRuntimeClasspath` identifies Maven artifacts. License and NOTICE resources are extracted from the exact cached JAR/AAR versions, including nested `classes.jar`. Google Play services' embedded `third_party_licenses.json` byte offsets identify its open-source works; the proprietary SDK itself is excluded.
- React Native 0.86.3's C++ dependency specifications and Hermes 0.17.0's third-party license files supply notices for libraries inside native binaries. LLVM's historical NCSA and Support notices are retained together with its current license.
- No iOS `Podfile.lock` is present. iOS-only entries follow the installed podspecs: GoogleSignIn ~> 9.0 → AppCheckCore ~> 11.0, AppAuth ~> 2.0, GTMAppAuth ~> 5.0, GTMSessionFetcher/Core ~> 3.3. The CocoaPods specifications for AppCheckCore 11.0.0 and GTMAppAuth 5.0.0 confirm AppCheckCore's additional GoogleUtilities ~> 8.0 and PromisesObjC ~> 2.4 dependencies. These ranges are identified as such; resolved iOS pod versions must be reconciled with the notices when producing the first iOS release. Upstream license files and their source URLs are recorded in `upstream.json`.
- SQLite/public-domain works, CC0/Unlicense works, Boost's compiled-object exception, and SwiftDraw's zlib license have no binary attribution requirement and are excluded. Empty Maven conflict-avoidance artifacts and development/test-only dependencies are excluded. Android SDK software is not classified as open source.
- The covered OkHttp public-suffix data has its MPL-2.0 license and source retrieval location in the app. Its original NOTICE is retained on each OkHttp entry. Dependency code is unmodified except the registered `expo-audio` patch; the Expo copyright/license remains included.

## Update procedure

Use the installed Expo CLI and current Node version. Do not scan all installed packages: that would incorrectly include build tools and packages unused by the app.

1. Export fresh release bundles with source maps:
   `pnpm exec expo export --platform all --source-maps --output-dir .expo/license-audit --no-bytecode`
2. In `android/`, set `JAVA_HOME`/`GRADLE_USER_HOME` as appropriate, then capture the current dependency report:
   `./gradlew.bat :app:dependencies --configuration releaseRuntimeClasspath --offline --console plain > ../.expo/license-gradle-dependencies.txt`
   PowerShell UTF-16 output is supported by the audit script.
3. At the repository root, run `node scripts/audit-open-source-dependencies.cjs`, then `./scripts/extract-native-notices.ps1`.
4. Review newly introduced licenses and notices, adding the official missing texts to `assets/legal/upstream/` and provenance to `upstream.json`. Do not invent a copyright holder or silently use a generic MIT text. Check native binaries' additional source dependencies and resolved iOS pods. Any newly introduced license or missing text stops generation for review.
5. Run `node scripts/generate-open-source-notices.cjs`, `node scripts/check-open-source-notices.cjs`, `pnpm lint`, and `pnpm check-types`. Commit the generated `notices.json`, audit metadata, and upstream sources together.

`audit.json` records included/excluded works and package/lockfile hashes. The checker fails after dependency changes until the notices are regenerated. Generated source maps and the local Gradle cache inventory stay in ignored `.expo/`; no private paths, music files, server addresses, or credentials are shipped in the notices.
