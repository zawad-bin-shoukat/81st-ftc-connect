#!/usr/bin/env bash
# Source this from the other scripts; no shell profile changes are needed.
FTC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$FTC_ROOT/.local/node/bin:$FTC_ROOT/.local/flutter/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
export npm_config_cache="$FTC_ROOT/.local/npm-cache"
export FLUTTER_SUPPRESS_ANALYTICS=true
