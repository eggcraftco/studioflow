#!/usr/bin/env bash
# Verify every store metadata file is within its store's character limit.
# Counts Unicode characters (not bytes), matching how the stores count.
# Usage: bash scripts/check-limits.sh   (run from the store-metadata folder)
set -euo pipefail
cd "$(dirname "$0")/.."

PYTHONUTF8=1 python3 - <<'PY'
# -*- coding: utf-8 -*-
import os, sys
limits = {
    # Apple App Store Connect
    "app-store/*/name.txt": 30,
    "app-store/*/subtitle.txt": 30,
    "app-store/*/promotional_text.txt": 170,
    "app-store/*/keywords.txt": 100,
    "app-store/*/description.txt": 4000,
    "app-store/*/release_notes.txt": 4000,
    # Google Play Console
    "google-play/*/title.txt": 30,
    "google-play/*/short_description.txt": 80,
    "google-play/*/full_description.txt": 4000,
}
import fnmatch
bad = 0
for root, _, files in os.walk("."):
    for f in sorted(files):
        p = os.path.join(root, f).lstrip("./")
        for pat, lim in limits.items():
            if fnmatch.fnmatch(p, pat):
                n = len(open(p, encoding="utf-8").read())
                status = "OK  " if n <= lim else "OVER"
                if n > lim:
                    bad += 1
                print(f"[{status}] {n:5d}/{lim:<5d}  {p}")
                break
sys.exit(1 if bad else 0)
PY
