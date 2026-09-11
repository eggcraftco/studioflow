#!/usr/bin/env bash
# Deterministic checks for the workspace-resolution decision the Mac/iPhone app
# takes after sign-in (EGGcraft/WorkspaceResolution.swift): a read that did not
# reach the server never becomes "switch to the personal workspace" and is never
# written back. Same shape as check-finance-vectors-swift.sh.
#
#   scripts/check-workspace-resolution-swift.sh
set -euo pipefail
cd "$(dirname "$0")/.."

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

swiftc -O \
  EGGcraft/WorkspaceResolution.swift \
  scripts/workspace-resolution/main.swift \
  -o "$out/check-workspace-resolution"

"$out/check-workspace-resolution"
