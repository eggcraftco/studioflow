#!/usr/bin/env bash
# The full-stack tier: 19 suites that drive real callables through the emulator
# runtime, signed in as a real emulator user, against seeded data.
#
# These existed and nothing ran them. `npm test` globs *.test.js and silently
# skipped every one — banking-core alone carries 45 assertions about money.
# They are not unit tests and they are not the Firestore-only e2e tier; they
# need Auth (9099) and Functions (5001) as well, plus a seed step that mints a
# custom token the suites sign in with.
#
#   Terminal 1:  firebase emulators:start
#                (all of them — firestore, auth, functions)
#   Terminal 2:  functions/test/run-integration.sh
#
# Java is required by the emulators and is NOT on the PATH on this machine;
# Android Studio's JBR is the one that works:
#   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
set -uo pipefail
cd "$(dirname "$0")/.."

export GCLOUD_PROJECT="${GCLOUD_PROJECT:-eggcraft-studio}"
export FIREBASE_CONFIG="${FIREBASE_CONFIG:-{\"projectId\":\"$GCLOUD_PROJECT\"}}"
export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"
export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:9099}"

missing=""
curl -sf -m 3 -o /dev/null "http://$FIRESTORE_EMULATOR_HOST/" || missing="$missing firestore($FIRESTORE_EMULATOR_HOST)"
curl -sf -m 3 -o /dev/null "http://$FIREBASE_AUTH_EMULATOR_HOST/" || missing="$missing auth($FIREBASE_AUTH_EMULATOR_HOST)"
curl -s  -m 3 -o /dev/null "http://127.0.0.1:5001/" || missing="$missing functions(5001)"
if [ -n "$missing" ]; then
  echo "Emulators not reachable:$missing"
  echo "Start them with:  firebase emulators:start"
  exit 1
fi

# Each suite gets its own world. They were written to be run alone against a
# fresh seed, and back to back they count each other's data — see
# test/reset-emulator.js for the failure that made this necessary.
#
# The two directories seed differently and each reads a seed-out.json beside
# itself: test/qa builds the QA-report workspace (a Team plan, a repair order,
# the report's money), test/inventory builds a stock workspace. Running an
# inventory suite against the QA seed just says "Workspace not found".
seed_for() {
  case "$1" in
    test/inventory/*) echo "test/inventory/seed-emulator.js test/inventory/seed-out.json" ;;
    *)                echo "test/qa/seed-qa.js test/qa/seed-out.json" ;;
  esac
}

status=0
for file in test/qa/*.mjs test/inventory/*.mjs; do
  [ -f "$file" ] || continue
  case "$(basename "$file")" in seed-*) continue ;; esac
  read -r seeder seedout <<< "$(seed_for "$file")"
  node test/reset-emulator.js || { echo "reset failed"; exit 1; }
  node "$seeder" > "$seedout" 2> test/qa/seed-err.txt || {
    echo "seed failed ($seeder):"; cat test/qa/seed-err.txt; exit 1;
  }
  echo "── $(basename "$file")"
  node "$file" || { status=1; echo "   ^ suite exited non-zero"; }
done
exit $status
