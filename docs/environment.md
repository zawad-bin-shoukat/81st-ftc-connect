# Local development environment

Checked on 2026-09-29, macOS 26.5.2, Apple Silicon (arm64).

| Tool | Status |
| --- | --- |
| Git | Existing 2.50.0; repository initialized on main |
| Node.js | Project-local 24.21.0 LTS installed; system 24.2.0 unchanged |
| npm | Project-local 11.19.0 |
| NestJS | CLI 12.0.8 used to scaffold; local CLI/runtime resolved in package-lock.json |
| Prisma | 7.10.0 pinned; schema validates; client generation passes |
| PostgreSQL | Existing Homebrew 16.13 selected by project scripts; existing 14 and separate 5432 server untouched |
| Flutter | 3.47.5 stable installed in work/tooling/flutter |
| Dart | 3.13.4, official arm64 SDK matching Flutter's engine |
| Android | SDK 35.0.1 exists; command-line tools missing, licenses unverified, no emulator detected |
| Java | JDK 21 folder exists; Android build not verified |
| Xcode | Command Line Tools only; full Xcode missing |
| CocoaPods | Missing |
| Chrome | Available for Flutter's browser preview |

The automated environment blocks the CPU query used by Flutter's Mac architecture detection, so `flutter doctor` incorrectly reports Intel/x64. The host is Apple Silicon. The official matching arm64 Dart SDK was installed after the auto-selected x64 SDK failed. No Flutter source was modified. Run doctor in a normal Terminal for accurate host detection.

## Finish native iOS setup

1. Install full Xcode from the Mac App Store or Apple's developer site, then open it and complete its setup.
2. In Terminal, select Xcode and initialize its tools:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
sudo xcodebuild -license
xcodebuild -downloadPlatform iOS
```

Review and accept Apple's license yourself. Install CocoaPods for native plugins if required (`brew install cocoapods`). Open the simulator through Xcode; on Xcode 26 use `open -a Simulator` (the app is named Device Hub in Xcode 27). Then run from the project root:

```bash
./scripts/flutter.sh doctor -v
./scripts/flutter.sh devices
./scripts/flutter.sh run -d YOUR_SIMULATOR_ID
```

The generated bundle identifier uses `com.example` as a development placeholder. Choose an organization-owned identifier before distribution. No Apple account, signing identity, or paid developer membership was configured.

## Finish Android setup

Install Android Studio from Google's official site. In its SDK Manager, keep the existing SDK location at `~/Library/Android/sdk`, and install the current Flutter-required platform/build tools plus Android SDK Command-line Tools (latest), Platform-Tools, and Android Emulator. Use Device Manager to create an ARM64 virtual device, or connect an Android phone with USB debugging enabled.

From the project root:

```bash
./scripts/flutter.sh doctor --android-licenses
./scripts/flutter.sh doctor -v
./scripts/flutter.sh devices
./scripts/flutter.sh run -d YOUR_ANDROID_DEVICE_ID
```

Review the Android licenses yourself. SDK downloads and native builds remain unverified. The existing JDK 21 can be selected if Flutter reports a Java problem; Android Studio also includes a supported Java runtime.

## PostgreSQL restriction

The sandbox denies `shmget`, which PostgreSQL needs during initialization. Therefore the separate cluster could not be initialized here, and live Prisma-to-PostgreSQL connectivity is **not verified**. No credentials for the already running port-5432 server were available or changed.

In normal Terminal, run `./scripts/db.sh start` and `./scripts/backend.sh db:check`. Stop with `./scripts/db.sh stop`. If you move to another Mac, install PostgreSQL 16 (`brew install postgresql@16`) first. The scripts intentionally do not register a background login service.

## Dependency notes

Both app dependency lockfiles are committed. Prisma has no models yet; generation is supported, and generated code is ignored. The Nest app does not yet construct a Prisma client or connect to a database. `db:check` verifies connectivity through Prisma's CLI once PostgreSQL is running.

The installation audit reports four high-severity package findings involving Prisma's dependency chain (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). npm's proposed automatic fix downgrades Prisma to a different major, so it was not applied. This skeleton has no public deployment or database feature routes. Re-evaluate these dependencies before implementing or deploying the backend; do not use `npm audit fix --force` blindly.

## Official setup references

- Flutter installation: https://docs.flutter.dev/install/manual
- iOS setup: https://docs.flutter.dev/platform-integration/ios/setup
- Android setup: https://docs.flutter.dev/platform-integration/android/setup
- Android Studio: https://developer.android.com/studio
- NestJS: https://docs.nestjs.com/first-steps
- Prisma 7 / NestJS: https://www.prisma.io/docs/guides/v7/frameworks/nestjs
- Node.js downloads: https://nodejs.org/en/download

## Verification results

- Backend: build, lint, generated unit test and generated HTTP end-to-end test passed. Running server returned HTTP 200 with `Hello World!` at port 3000.
- Prisma: empty schema validation and client generation passed. Live database connection remains blocked as described above.
- Flutter: static analysis passed with no issues. Debug web compilation succeeded, and the browser visibly displayed `Hello World!` at port 8080. The `--empty` Flutter template has no test directory; no mobile automated tests are claimed.
- Android/iOS: project files generated, but no native build or device launch has been verified.
- Git: SDKs, caches, database files, credentials, generated Prisma code, and Android local settings are ignored.
