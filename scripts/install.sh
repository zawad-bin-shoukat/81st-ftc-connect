#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$FTC_ROOT/apps/backend"
npm ci
cd "$FTC_ROOT/apps/mobile"
flutter pub get
