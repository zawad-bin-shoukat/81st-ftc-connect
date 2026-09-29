#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$FTC_ROOT/apps/mobile"
exec flutter "$@"
