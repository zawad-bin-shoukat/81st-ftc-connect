#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$FTC_ROOT/apps/backend"
if [[ $# -eq 0 ]]; then set -- start:dev; fi
exec npm run "$@"
