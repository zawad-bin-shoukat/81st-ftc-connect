# 81st FTC Connect

A local starter repository for Flutter + NestJS + Prisma + PostgreSQL. No product features or member data yet.

```text
apps/mobile/     Flutter app: Android, iOS, optional browser preview
apps/backend/    NestJS starter, Prisma configuration
scripts/         Short commands for local development
docs/           Architecture and environment notes
.local/          Ignored local tools, database and caches
```

## Open the project

In Terminal:

```bash
cd "/Users/zawadtasin/Desktop/81st FTC Connect/81st-ftc-connect"
```

All commands below run from this folder. The scripts select the downloaded Node and Flutter tools automatically, without changing your shell settings. `.local/node` and `.local/flutter` point to SDKs at `/Users/zawadtasin/Documents/Codex/toolchains/ftc-connect`; keep that tools folder. They no longer depend on the original chat folder. On another Mac, install the versions in `docs/environment.md` on PATH or recreate those links. The repository itself contains no SDK binaries.

## Run the backend

```bash
./scripts/backend.sh
```

Open <http://127.0.0.1:3000>. The generated starter returns `Hello World!`. Stop it with Control-C. This starter does not yet require a running database.

## Run Flutter

For the browser preview:

```bash
./scripts/flutter.sh run -d chrome
```

For a connected phone or running simulator, after native tooling is installed:

```bash
./scripts/flutter.sh devices
./scripts/flutter.sh run -d DEVICE_ID
```

Use the actual ID printed by `devices`. While running, `r` hot-reloads and `q` quits. Android/iOS launch is not yet verified; see `docs/environment.md` for missing tooling.

## Start the project database

Run this in your normal Mac Terminal; the agent sandbox blocks PostgreSQL shared-memory initialization:

```bash
./scripts/db.sh start
./scripts/backend.sh db:validate
./scripts/backend.sh db:check
```

The script creates a separate local PostgreSQL 16 cluster and empty `ftc_connect` database at `127.0.0.1:55432`, with a random password stored in ignored local files. It does not touch your existing PostgreSQL server on port 5432. The generated `apps/backend/.env` is for development only. No application tables are created. `db:check` runs `SELECT 1` through Prisma's CLI; it does not modify data.

```bash
./scripts/db.sh status
./scripts/db.sh stop
```

The database does not auto-start at login. Keep `.local` and `.env` private. The local cluster's owner role is only for development.

## Install dependencies and check changes

Dependencies are already downloaded on this Mac. On a fresh checkout with the SDKs installed:

```bash
./scripts/install.sh
./scripts/backend.sh build
./scripts/backend.sh test
./scripts/backend.sh test:e2e
./scripts/backend.sh lint
./scripts/flutter.sh analyze
```

Nest CLI is installed inside the backend, so no global Nest installation is needed. Run it with `npx nest` from `apps/backend` using the pinned Node version, or use the scripts above.

See `docs/architecture.md` for the agreed schema and `docs/environment.md` for verified versions and remaining setup. The scripts calculate the project location automatically and support the spaces in this Desktop path.

## Moving the project again

Move the whole `81st-ftc-connect` folder, including its hidden `.git` and `.local` folders. Keep the SDK tools folder in place. From the new project root, run:

```bash
./scripts/flutter.sh clean
./scripts/flutter.sh pub get
```

These regenerate Flutter settings; no member data or source files are removed. Update the example `cd` command above. Stop running apps and the local database before moving the folder. The participant spreadsheet next to this repository is not part of Git.
