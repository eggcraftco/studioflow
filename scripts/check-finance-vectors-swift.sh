#!/usr/bin/env bash
# Runs the Finance Engine's golden vectors through the Swift mirror.
#
# Mac and iPhone show the block the server stamped, but they also compute the
# same figures while somebody is typing. Two implementations of the same
# arithmetic drift, and the drift shows up as a number that jumps when the
# server's answer lands. This is what stops that: the SAME vector file the
# server test uses, compiled against EGGcraft/FinanceEngine.swift.
#
#   scripts/check-finance-vectors-swift.sh
set -euo pipefail
cd "$(dirname "$0")/.."

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

swiftc -O \
  EGGcraft/FinanceEngine.swift \
  scripts/finance-vectors/main.swift \
  -o "$out/check-finance"

"$out/check-finance" functions/finance/vectors.json
